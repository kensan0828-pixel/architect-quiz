"""
sogo_image の OCR 解説と Notion「解説」を照合し、不一致があれば Notion を画像側で修正する。

使い方:
  # 照合のみ（Notion 更新なし）
  python tools/compare_ocr_notion.py --dry-run

  # 不一致を Notion に反映
  python tools/compare_ocr_notion.py --fix

  # 特定年度・科目のみ
  python tools/compare_ocr_notion.py --year R3 --subject 5_sekko --fix

  # キャッシュ済み _ocr_result.txt を使い OCR をスキップ
  python tools/compare_ocr_notion.py --use-cache --fix
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

import httpx
from dotenv import load_dotenv

# ocr_to_notion から共通処理を再利用
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ocr_to_notion import (  # noqa: E402
    ANTHROPIC_API_KEY,
    ANTHROPIC_INTERVAL_SEC,
    BASE_DIR,
    NOTION_INTERVAL_SEC,
    SONNET_MODEL,
    SUBJECT_MAP,
    YEAR_MAP,
    clean_explanation,
    find_notion_page,
    iter_subject_dirs,
    list_subject_images,
    notion_headers,
    ocr_page,
    split_by_question,
    update_notion_explanation,
)
import anthropic

load_dotenv()

NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")
REPORT_PATH = Path(__file__).resolve().parent / "_ocr_notion_compare_report.json"

# 正規化後の一致率がこの値未満なら「不一致」とみなす
MISMATCH_THRESHOLD = 0.995


def normalize_for_compare(text: str) -> str:
    if not text:
        return ""
    t = text.replace("\r\n", "\n").strip()
    # 図表キャプションは位置が OCR で前後することがあるため除外
    t = re.sub(r"\[図：[^\]]*\]", "", t)
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


def count_choice_markers(text: str) -> int:
    """解説内の記述区切り（1. 〜 4.）の数を数える"""
    if not text:
        return 0
    return len(re.findall(r"(?:^|[\n\r\s])[1-4][\.．]", text.strip()))


def _notion_key(year: str, subject: str, question_no: int) -> tuple[str, str, int]:
    return (year, subject, question_no)


def load_all_notion_explanations() -> dict[tuple[str, str, int], tuple[str, str]]:
    """Notion DB を一括取得 → {(年度, 科目, 問題番号): (page_id, 解説)}"""
    result: dict[tuple[str, str, int], tuple[str, str]] = {}
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

            year = get_select("年度")
            subject = get_select("科目")
            q_no = get_number("問題番号")
            if not year or not subject or q_no is None:
                continue
            rich = props.get("解説", {}).get("rich_text", [])
            text = "".join(block.get("plain_text", "") for block in rich)
            result[_notion_key(year, subject, int(q_no))] = (page["id"], text)
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return result


def load_or_ocr_subject(
    year_folder: str,
    subject_folder: str,
    use_cache: bool,
    force_ocr: bool,
    ocr_fn,
    ocr_interval_sec: float,
) -> dict[int, str]:
    subject_dir = BASE_DIR / year_folder / subject_folder
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

    return split_by_question(full_text)


def process_subject(
    year_folder: str,
    subject_folder: str,
    *,
    dry_run: bool,
    fix: bool,
    use_cache: bool,
    force_ocr: bool,
    ocr_fn,
    ocr_interval_sec: float,
    notion_map: dict[tuple[str, str, int], tuple[str, str]],
    report: dict,
) -> None:
    notion_subject = SUBJECT_MAP.get(subject_folder)
    notion_year = YEAR_MAP.get(year_folder.upper())
    subject_dir = BASE_DIR / year_folder / subject_folder
    if not subject_dir.exists() or not notion_subject or not notion_year:
        return

    print(f"\n{'='*60}")
    print(f"[DIR] {year_folder}/{subject_folder} ({notion_year} / {notion_subject})")

    ocr_questions = load_or_ocr_subject(
        year_folder, subject_folder, use_cache, force_ocr, ocr_fn, ocr_interval_sec
    )
    if not ocr_questions:
        print("  [WARN] OCR から問題を検出できませんでした")
        return

    key = f"{year_folder}/{subject_folder}"
    report[key] = {"year": notion_year, "subject": notion_subject, "items": []}

    match_count = mismatch_count = fixed_count = missing_notion = missing_ocr = 0

    all_q_nos = sorted(set(ocr_questions.keys()))
    for q_no in all_q_nos:
        ocr_text = clean_explanation(ocr_questions.get(q_no, ""))
        entry = notion_map.get(_notion_key(notion_year, notion_subject, q_no))
        if entry is None:
            page_id, notion_text = None, ""
        else:
            page_id, notion_text = entry

        if not page_id:
            missing_notion += 1
            report[key]["items"].append({"q_no": q_no, "status": "missing_notion"})
            continue

        notion_text = notion_text or ""
        if not ocr_text:
            missing_ocr += 1
            report[key]["items"].append({"q_no": q_no, "status": "missing_ocr"})
            continue

        sim = similarity(ocr_text, notion_text)
        if sim >= MISMATCH_THRESHOLD:
            match_count += 1
            continue

        mismatch_count += 1
        diff_preview = ""
        if len(normalize_for_compare(notion_text)) < len(normalize_for_compare(ocr_text)) * 0.5:
            diff_preview = "notion_shorter"
        elif len(normalize_for_compare(notion_text)) > len(normalize_for_compare(ocr_text)) * 1.5:
            diff_preview = "notion_longer"

        item = {
            "q_no": q_no,
            "status": "mismatch",
            "similarity": round(sim, 4),
            "ocr_len": len(ocr_text),
            "notion_len": len(notion_text),
            "hint": diff_preview,
            "ocr_preview": ocr_text[:120].replace("\n", " "),
            "notion_preview": notion_text[:120].replace("\n", " "),
        }
        report[key]["items"].append(item)

        action = "DRY" if dry_run or not fix else "FIX"
        print(
            f"  [{action}] No.{q_no:02d}: 一致率 {sim:.1%} "
            f"(OCR {len(ocr_text)}字 / Notion {len(notion_text)}字) {diff_preview}"
        )

        if fix and not dry_run:
            ocr_markers = count_choice_markers(ocr_text)
            notion_markers = count_choice_markers(notion_text)
            if diff_preview == "notion_longer" and notion_markers > ocr_markers:
                item["skipped"] = "notion_has_more_choice_paragraphs"
                print(
                    f"         → スキップ（Notion {notion_markers}記述 / OCR {ocr_markers}記述。"
                    " OCR側が欠落している可能性）",
                )
                time.sleep(0)
            else:
                try:
                    update_notion_explanation(page_id, ocr_text)
                    fixed_count += 1
                    item["fixed"] = True
                    print(f"         → Notion 更新完了")
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
    parser = argparse.ArgumentParser(description="sogo_image OCR と Notion 解説の照合・修正")
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
        ocr_fn = lambda p: ocr_page(p, anthropic_client)
        print(f"[OCR] Claude Sonnet ({SONNET_MODEL})")

    if not args.dry_run and not os.getenv("NOTION_TOKEN"):
        print("[ERROR] NOTION_TOKEN が .env にありません")
        return 1

    if not BASE_DIR.exists():
        print(f"[ERROR] {BASE_DIR} が見つかりません")
        return 1

    report = {
        "generated_at": datetime.now().isoformat(),
        "threshold": MISMATCH_THRESHOLD,
        "mode": "fix" if args.fix and not args.dry_run else "dry-run",
    }

    print("[Notion] 全問題を一括取得中...")
    notion_map = load_all_notion_explanations()
    print(f"[Notion] {len(notion_map)} 件読み込み")

    for year_folder, subject_folder, _ in iter_subject_dirs(
        BASE_DIR, year=args.year, subject=args.subject
    ):
        process_subject(
            year_folder,
            subject_folder,
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
