"""
01_problems の OCR 問題文と Notion「問題文」「選択肢1〜4」を照合し、不一致があれば Notion を修正する。

使い方:
  python tools/compare_problems_notion.py --dry-run
  python tools/compare_problems_notion.py --fix
  python tools/compare_problems_notion.py --year R7 --subject 2_kankyo --fix
  python tools/compare_problems_notion.py --use-cache --fix
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path

import anthropic
import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ocr_to_notion import (  # noqa: E402
    ANTHROPIC_API_KEY,
    ANTHROPIC_INTERVAL_SEC,
    NOTION_DATABASE_ID,
    NOTION_INTERVAL_SEC,
    NOTION_TOKEN,
    PROBLEMS_DIR,
    SONNET_MODEL,
    SUBJECT_MAP,
    YEAR_MAP,
    _join_lines,
    iter_subject_dirs,
    list_subject_images,
    notion_headers,
    update_notion_fields,
)

load_dotenv()

REPORT_PATH = Path(__file__).resolve().parent / "_problems_notion_compare_report.json"
MISMATCH_THRESHOLD = 0.995
QUESTION_FIELDS = ("問題文", "選択肢1", "選択肢2", "選択肢3", "選択肢4")

PROBLEM_OCR_PROMPT = """\
この画像は一級建築士学科試験の問題ページです。
ページに書かれているテキストを、以下のルールに従って正確に文字起こししてください。

【出力ルール】
1. 「No.X」という問題番号ヘッダーは必ずそのまま出力する
2. 問題文（選択肢より前の本文）を改行を保ったまま出力する
3. 各選択肢の番号（1. 2. 3. 4.）とその本文をそのまま出力する
4. 図・表が含まれる場合は「[図]」または「[図：キャプション]」とだけ出力する
5. ページ番号・年度・科目名のヘッダー行は出力しない
6. ルビ（ふりがな）は省略してよい

【出力形式】
プレーンテキストのみ。マークダウン・記号・装飾は一切不要。
"""

# OCR画像側の既知誤植 → 正しい文字（Notion更新時に適用）
OCR_FIELD_CORRECTIONS: dict[tuple[str, str, int, str], list[tuple[str, str]]] = {
    ("R7", "2_kankyo", 10, "選択肢4"): [("聞", "間")],
}

PROBLEM_HEADER_PATTERN = re.compile(r"No\.(\d+)")


def ocr_problem_page(image_path: Path, client: anthropic.Anthropic) -> str:
    import base64

    suffix = image_path.suffix.lower()
    media_type = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/png"
    data = base64.standard_b64encode(image_path.read_bytes()).decode("utf-8")
    response = client.messages.create(
        model=SONNET_MODEL,
        max_tokens=8192,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        },
                    },
                    {"type": "text", "text": PROBLEM_OCR_PROMPT},
                ],
            }
        ],
    )
    return response.content[0].text.strip()


def normalize_for_compare(text: str) -> str:
    if not text:
        return ""
    t = text.replace("\r\n", "\n").strip()
    t = re.sub(r"\[図[^\]]*\]", "", t)
    t = re.sub(r"[ \t\n\u3000]+", "", t)
    t = t.replace("．", ".").replace("，", ",").replace("（", "(").replace("）", ")")
    t = t.replace("≒", "≈").replace("×", "x").replace("○", "〇")
    t = re.sub(r"[～〜~－—–−]", "-", t)
    return t


def similarity(a: str, b: str) -> float:
    na, nb = normalize_for_compare(a), normalize_for_compare(b)
    if not na and not nb:
        return 1.0
    if not na or not nb:
        return 0.0
    return difflib.SequenceMatcher(None, na, nb).ratio()


def split_by_problem(full_text: str) -> dict[int, str]:
    matches = list(PROBLEM_HEADER_PATTERN.finditer(full_text))
    result: dict[int, str] = {}
    for i, match in enumerate(matches):
        q_no = int(match.group(1))
        start = match.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        result[q_no] = full_text[start:end].strip()
    return result


def parse_problem_block(text: str) -> dict[str, str]:
    """問題ブロックから 問題文・選択肢1〜4 を抽出"""
    choice_pattern = re.compile(r"(?:^|\n)([1-4])[．.]\s*", re.MULTILINE)
    matches = list(choice_pattern.finditer(text))

    body = text[: matches[0].start()].strip() if matches else text.strip()
    body = re.sub(r"\[図[^\]]*\]", "", body)
    body = re.sub(r"^[★☆\s]+", "", body)
    body = re.sub(r"\n{2,}", "\n", body).strip()
    body_lines = [line.strip() for line in body.split("\n") if line.strip()]
    mondai = _join_lines(body_lines) if body_lines else ""

    choices: dict[int, str] = {}
    for idx, match in enumerate(matches):
        num = int(match.group(1))
        start = match.end()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        chunk = text[start:end].strip()
        chunk_lines = [line.strip() for line in chunk.split("\n") if line.strip()]
        choices[num] = _join_lines(chunk_lines) if chunk_lines else chunk.strip()

    return {
        "問題文": mondai,
        "選択肢1": choices.get(1, ""),
        "選択肢2": choices.get(2, ""),
        "選択肢3": choices.get(3, ""),
        "選択肢4": choices.get(4, ""),
    }


def apply_field_corrections(
    fields: dict[str, str],
    year_folder: str,
    subject_folder: str,
    q_no: int,
) -> dict[str, str]:
    corrected = dict(fields)
    for field in QUESTION_FIELDS:
        replacements = OCR_FIELD_CORRECTIONS.get((year_folder, subject_folder, q_no, field), [])
        value = corrected.get(field, "")
        for wrong, right in replacements:
            value = value.replace(wrong, right)
        corrected[field] = value
    return corrected


def _notion_key(year: str, subject: str, question_no: int) -> tuple[str, str, int]:
    return (year, subject, question_no)


def load_all_notion_questions() -> dict[tuple[str, str, int], tuple[str, dict[str, str]]]:
    result: dict[tuple[str, str, int], tuple[str, dict[str, str]]] = {}
    cursor = None
    while True:
        body: dict = {}
        if cursor:
            body["start_cursor"] = cursor
        resp = httpx.post(
            f"https://api.notion.com/v1/databases/{NOTION_DATABASE_ID}/query",
            headers=notion_headers(),
            json=body,
            timeout=60,
        )
        resp.raise_for_status()
        data = resp.json()
        for page in data.get("results", []):
            props = page["properties"]

            def get_select(key: str) -> str:
                sel = props.get(key, {}).get("select")
                return sel["name"] if sel else ""

            def get_number(key: str):
                return props.get(key, {}).get("number")

            def get_text(key: str) -> str:
                rich = props.get(key, {}).get("rich_text", [])
                return "".join(block.get("plain_text", "") for block in rich)

            year = get_select("年度")
            subject = get_select("科目")
            q_no = get_number("問題番号")
            if not year or not subject or q_no is None:
                continue
            fields = {name: get_text(name) for name in QUESTION_FIELDS}
            result[_notion_key(year, subject, int(q_no))] = (page["id"], fields)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return result


def load_or_ocr_subject(
    year_folder: str,
    subject_folder: str,
    subject_dir: Path,
    use_cache: bool,
    force_ocr: bool,
    ocr_fn,
    ocr_interval_sec: float,
) -> dict[int, dict[str, str]]:
    cache_file = subject_dir / "_ocr_result.txt"

    if use_cache and cache_file.exists() and not force_ocr:
        full_text = cache_file.read_text(encoding="utf-8")
        print(f"  [CACHE] {cache_file.name}")
    else:
        pages = list_subject_images(subject_dir)
        if not pages:
            return {}
        if ocr_fn is None:
            raise RuntimeError("OCR API が必要です（--use-cache で OCR をスキップ可）")
        all_parts = []
        for page in pages:
            print(f"  OCR: {page.name} ...", end="", flush=True)
            try:
                text = ocr_fn(page)
                all_parts.append(text)
                print(f" OK ({len(text)}文字)")
            except Exception as e:
                print(f" ERR {e}")
                all_parts.append("")
            time.sleep(ocr_interval_sec)
        full_text = "\n".join(all_parts)
        cache_file.write_text(full_text, encoding="utf-8")
        print(f"  [SAVE] OCR -> {cache_file}")

    parsed: dict[int, dict[str, str]] = {}
    for q_no, block in split_by_problem(full_text).items():
        fields = parse_problem_block(block)
        parsed[q_no] = apply_field_corrections(fields, year_folder, subject_folder, q_no)
    return parsed


def compare_fields(ocr_fields: dict[str, str], notion_fields: dict[str, str]) -> dict[str, float]:
    return {field: similarity(ocr_fields.get(field, ""), notion_fields.get(field, "")) for field in QUESTION_FIELDS}


def fields_need_update(
    scores: dict[str, float],
    ocr_fields: dict[str, str],
    notion_fields: dict[str, str],
) -> list[str]:
    diff: list[str] = []
    for field, score in scores.items():
        if score >= MISMATCH_THRESHOLD:
            continue
        ocr_val = (ocr_fields.get(field) or "").strip()
        notion_val = (notion_fields.get(field) or "").strip()
        if not ocr_val and notion_val:
            continue
        diff.append(field)
    return diff


def process_subject(
    year_folder: str,
    subject_folder: str,
    subject_dir: Path,
    *,
    dry_run: bool,
    fix: bool,
    use_cache: bool,
    force_ocr: bool,
    ocr_fn,
    ocr_interval_sec: float,
    notion_map: dict[tuple[str, str, int], tuple[str, dict[str, str]]],
    report: dict,
) -> None:
    notion_subject = SUBJECT_MAP.get(subject_folder)
    notion_year = YEAR_MAP.get(year_folder.upper())
    if not notion_subject or not notion_year:
        return

    print(f"\n{'='*60}")
    print(f"[DIR] {year_folder}/{subject_folder} ({notion_year} / {notion_subject})")

    ocr_questions = load_or_ocr_subject(
        year_folder,
        subject_folder,
        subject_dir,
        use_cache,
        force_ocr,
        ocr_fn,
        ocr_interval_sec,
    )
    if not ocr_questions:
        print("  [WARN] OCR から問題を検出できませんでした")
        return

    key = f"{year_folder}/{subject_folder}"
    report[key] = {"year": notion_year, "subject": notion_subject, "items": []}

    match_count = mismatch_count = fixed_count = missing_notion = missing_ocr = 0

    for q_no in sorted(ocr_questions.keys()):
        ocr_fields = ocr_questions[q_no]
        entry = notion_map.get(_notion_key(notion_year, notion_subject, q_no))
        if entry is None:
            missing_notion += 1
            report[key]["items"].append({"q_no": q_no, "status": "missing_notion"})
            continue

        page_id, notion_fields = entry
        if not any(ocr_fields.values()):
            missing_ocr += 1
            report[key]["items"].append({"q_no": q_no, "status": "missing_ocr"})
            continue

        scores = compare_fields(ocr_fields, notion_fields)
        diff_fields = fields_need_update(scores, ocr_fields, notion_fields)
        if not diff_fields:
            match_count += 1
            continue

        mismatch_count += 1
        item = {
            "q_no": q_no,
            "status": "mismatch",
            "fields": {
                field: {
                    "similarity": round(scores[field], 4),
                    "ocr_preview": (ocr_fields.get(field, "")[:80]).replace("\n", " "),
                    "notion_preview": (notion_fields.get(field, "")[:80]).replace("\n", " "),
                }
                for field in diff_fields
            },
        }
        report[key]["items"].append(item)

        action = "DRY" if dry_run or not fix else "FIX"
        field_summary = ", ".join(f"{f}({scores[f]:.1%})" for f in diff_fields)
        print(f"  [{action}] No.{q_no:02d}: 不一致 — {field_summary}")

        if fix and not dry_run:
            updates = {field: ocr_fields[field] for field in diff_fields}
            try:
                update_notion_fields(page_id, updates)
                fixed_count += 1
                item["fixed"] = True
                item["updated_fields"] = list(updates.keys())
                print(f"         → Notion 更新完了 ({', '.join(updates.keys())})")
            except Exception as e:
                item["fixed"] = False
                item["error"] = str(e)
                print(f"         → 更新失敗: {e}")
            time.sleep(NOTION_INTERVAL_SEC)

    report[key]["summary"] = {
        "match": match_count,
        "mismatch": mismatch_count,
        "fixed": fixed_count,
        "missing_notion": missing_notion,
        "missing_ocr": missing_ocr,
        "ocr_questions": len(ocr_questions),
    }
    print(
        f"  集計: 一致={match_count} 不一致={mismatch_count} "
        f"修正={fixed_count} Notionなし={missing_notion} OCR空={missing_ocr}"
    )


def main():
    parser = argparse.ArgumentParser(description="01_problems OCR と Notion 問題文の照合・修正")
    parser.add_argument("--dry-run", action="store_true", help="Notion を更新しない")
    parser.add_argument("--fix", action="store_true", help="不一致を Notion に反映")
    parser.add_argument("--use-cache", action="store_true", help="_ocr_result.txt があれば OCR をスキップ")
    parser.add_argument("--force-ocr", action="store_true", help="キャッシュを無視して再 OCR")
    parser.add_argument("--year", metavar="YEAR")
    parser.add_argument("--subject", metavar="SUBJECT")
    args = parser.parse_args()

    if not args.dry_run and not args.fix:
        print("[INFO] --dry-run または --fix を指定してください（デフォルトは --dry-run 相当）")
        args.dry_run = True

    ocr_fn = None
    ocr_interval_sec = ANTHROPIC_INTERVAL_SEC
    if not args.use_cache or args.force_ocr:
        if not ANTHROPIC_API_KEY:
            print("[ERROR] ANTHROPIC_API_KEY が .env にありません")
            return 1
        anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        ocr_fn = lambda p: ocr_problem_page(p, anthropic_client)
        print(f"[OCR] Claude Sonnet ({SONNET_MODEL})")

    if not args.dry_run and not NOTION_TOKEN:
        print("[ERROR] NOTION_TOKEN が .env にありません")
        return 1

    if not PROBLEMS_DIR.exists():
        print(f"[ERROR] {PROBLEMS_DIR} が見つかりません")
        return 1

    report = {
        "generated_at": datetime.now().isoformat(),
        "threshold": MISMATCH_THRESHOLD,
        "mode": "fix" if args.fix and not args.dry_run else "dry-run",
    }

    print("[Notion] 全問題を一括取得中...")
    notion_map = load_all_notion_questions()
    print(f"[Notion] {len(notion_map)} 件読み込み")
    print(f"[DIR] {PROBLEMS_DIR}")

    for year_folder, subject_folder, subject_dir in iter_subject_dirs(
        PROBLEMS_DIR, year=args.year, subject=args.subject
    ):
        process_subject(
            year_folder,
            subject_folder,
            subject_dir,
            dry_run=args.dry_run,
            fix=args.fix,
            use_cache=args.use_cache,
            force_ocr=args.force_ocr,
            ocr_fn=ocr_fn,
            ocr_interval_sec=ocr_interval_sec,
            notion_map=notion_map,
            report=report,
        )

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[REPORT] {REPORT_PATH}")

    total_mismatch = sum(
        s.get("summary", {}).get("mismatch", 0)
        for k, s in report.items()
        if isinstance(s, dict) and "summary" in s
    )
    total_fixed = sum(
        s.get("summary", {}).get("fixed", 0)
        for k, s in report.items()
        if isinstance(s, dict) and "summary" in s
    )
    print(f"[DONE] mismatch={total_mismatch} fixed={total_fixed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
