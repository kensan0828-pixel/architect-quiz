"""
ocr_to_notion.py
================
sogo_image/ 以下のページ画像を Gemini API でOCRし、
Notion DBの「解説」フィールドに上書き登録する。

【必要パッケージ】
  pip install google-genai httpx python-dotenv Pillow

【.env に追加する環境変数】
  GEMINI_API_KEY=your_key_here
  （NOTION_TOKEN・NOTION_DATABASE_IDは既存のものを使用）

【使い方】
  # OCR結果をファイルに保存して確認（Notion書き込みなし・推奨最初のステップ）
  python tools/ocr_to_notion.py --dry-run --year R1 --subject 1_keikaku

  # 特定年度・科目のみ本番実行
  python tools/ocr_to_notion.py --year R1 --subject 1_keikaku

  # 全年度・全科目を一括処理
  python tools/ocr_to_notion.py
"""

import os
import re
import time
import argparse
from pathlib import Path

import httpx
from dotenv import load_dotenv
from PIL import Image
from google import genai
from google.genai import types

load_dotenv()

# ============================================================
# 設定
# ============================================================

BASE_DIR = Path(r"C:\Users\Kentaro Oiwa\OneDrive\Desktop\architect-quiz\tools\sogo_image")

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
NOTION_DATABASE_ID = os.getenv("NOTION_DATABASE_ID")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# 科目フォルダ名 → Notion 科目 select 値
SUBJECT_MAP = {
    "1_keikaku": "学科Ⅰ（計画）",
    "2_kankyo":  "学科Ⅱ（環境・設備）",
    "3_hoki":    "学科Ⅲ（法規）",
    "4_kozo":    "学科Ⅳ（構造）",
    "5_sekko":   "学科Ⅴ（施工）",
}

# 年度フォルダ名 → Notion 年度 select 値
YEAR_MAP = {
    "R1": "令和元年",
    "R2": "令和2年",
    "R3": "令和3年",
    "R4": "令和4年",
    "R5": "令和5年",
    "R6": "令和6年",
    "R7": "令和7年",
}

# Gemini API レート制限対策（1リクエストあたりの待機秒数）
GEMINI_INTERVAL_SEC = 4   # 無料枠: 15 req/min → 4秒間隔で安全圏
NOTION_INTERVAL_SEC = 0.4  # Notion API: ~3 req/sec まで

# ============================================================
# Gemini OCR
# ============================================================

GEMINI_PROMPT = """\
この画像は一級建築士試験の解答解説書のページです。
ページに書かれているテキストを、以下のルールに従って正確に文字起こしをしてください。

【出力ルール】
1. 「No.X　答　Y」という問題ヘッダーは必ず「No.X 答 Y」の形式でそのまま出力する
2. 各選択肢の番号（1. 2. 3. 4.）とその解説テキストをそのまま出力する
3. 図・グラフが含まれる場合は「[図：キャプション名]」とだけ出力し、図の内容は省略する
4. 数式は読み取れる範囲でテキストとして出力する（例: OT≒(ti+MRT)/2）
5. ページ番号・年度・科目のヘッダー行は出力しない
6. ルビ（ふりがな）は省略してよい
7. 下線が引かれた文字もそのままテキストとして出力する（記号不要）

【出力形式】
プレーンテキストのみ。マークダウン・記号・装飾は一切不要。
"""


def ocr_page(image_path: Path, client: genai.Client) -> str:
    """1ページをGemini Vision でOCRし、テキストを返す"""
    image = Image.open(image_path)
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[GEMINI_PROMPT, image],
    )
    return response.text.strip()


# ============================================================
# テキスト解析
# ============================================================

# "No.X 答 Y" にマッチするパターン（全角・半角スペース両対応）
QUESTION_HEADER_PATTERN = re.compile(
    r'No\.(\d+)\s*[　 ]+答\s*[　 ]+\d+'
)


def split_by_question(full_text: str) -> dict[int, str]:
    """
    全ページ結合テキストを問題番号で分割する。
    ページをまたぐ問題も正しく結合される。

    Returns:
        {問題番号(int): 解説テキスト(str)}
    """
    parts = QUESTION_HEADER_PATTERN.split(full_text)
    # split の結果: [ヘッダー前テキスト, q_no1, q_no2(答の数字), テキスト1, ...]
    # ※ キャプチャグループが1つなので: [前, no, text, no, text, ...]

    result = {}
    # parts[0] はヘッダー等なのでスキップ
    i = 1
    while i < len(parts):
        q_no_str = parts[i]
        text = parts[i + 1] if i + 1 < len(parts) else ""
        try:
            q_no = int(q_no_str)
            result[q_no] = clean_explanation(text)
        except ValueError:
            pass
        i += 2

    return result


def clean_explanation(text: str) -> str:
    """
    解説テキストの前処理。
    選択肢（1. 2. 3. 4.）ごとに1行にまとめ、
    スキャン由来の途中改行を除去する。
    """
    lines = [line.strip() for line in text.split('\n')]

    result = []
    current_lines: list[str] = []

    for line in lines:
        if not line:
            if current_lines:
                result.append(_join_lines(current_lines))
                current_lines = []
            continue

        # 選択肢の先頭行：「1. 」「2. 」…にマッチ
        if re.match(r'^[1-4][．.]\s*\S', line):
            if current_lines:
                result.append(_join_lines(current_lines))
            current_lines = [line]
        else:
            current_lines.append(line)

    if current_lines:
        result.append(_join_lines(current_lines))

    return '\n'.join(result).strip()


def _join_lines(lines: list[str]) -> str:
    """複数行を1行に結合し、連続スペースを整理する"""
    joined = ' '.join(lines)
    return re.sub(r'  +', ' ', joined)


# ============================================================
# Notion 操作
# ============================================================

def notion_headers() -> dict:
    return {
        "Authorization": f"Bearer {NOTION_TOKEN}",
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
    }


def find_notion_page(year: str, subject: str, question_no: int) -> str | None:
    """Notion DBから該当ページIDを取得"""
    url = f"https://api.notion.com/v1/databases/{NOTION_DATABASE_ID}/query"
    payload = {
        "filter": {
            "and": [
                {"property": "年度",   "select": {"equals": year}},
                {"property": "科目",   "select": {"equals": subject}},
                {"property": "問題番号", "number": {"equals": question_no}},
            ]
        }
    }
    resp = httpx.post(url, headers=notion_headers(), json=payload, timeout=30)
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return results[0]["id"] if results else None


def update_notion_explanation(page_id: str, explanation: str) -> None:
    """
    Notionの解説フィールドを上書き更新。
    Notion rich_text は1要素あたり2000文字制限のため分割して送信。
    """
    url = f"https://api.notion.com/v1/pages/{page_id}"

    # 2000文字ごとに分割
    chunks = [explanation[i:i + 2000] for i in range(0, len(explanation), 2000)]
    rich_text = [{"text": {"content": chunk}} for chunk in chunks]

    payload = {
        "properties": {
            "解説": {"rich_text": rich_text}
        }
    }
    resp = httpx.patch(url, headers=notion_headers(), json=payload, timeout=30)
    resp.raise_for_status()


# ============================================================
# メイン処理
# ============================================================

def process_subject(
    year_folder: str,
    subject_folder: str,
    dry_run: bool,
    save_ocr: bool,
    client: genai.Client,
) -> None:
    subject_dir = BASE_DIR / year_folder / subject_folder
    notion_subject = SUBJECT_MAP.get(subject_folder)
    notion_year = YEAR_MAP.get(year_folder.upper())

    if not subject_dir.exists() or notion_subject is None or notion_year is None:
        return

    pages = sorted(subject_dir.glob("page_*.jpg"))
    if not pages:
        print(f"  ⚠️  画像が見つかりません: {subject_dir}")
        return

    print(f"\n{'='*60}")
    print(f"📁 {year_folder}/{subject_folder}  ({notion_subject})")
    print(f"   {len(pages)}ページを処理します")

    # ── Step 1: 全ページOCR ──────────────────────────────
    all_text_parts = []
    for page in pages:
        print(f"  OCR: {page.name} ...", end="", flush=True)
        try:
            text = ocr_page(page, client)
            all_text_parts.append(text)
            print(f" ✓ ({len(text)}文字)")
        except Exception as e:
            print(f" ❌ エラー: {e}")
            all_text_parts.append("")  # エラーページは空文字で継続
        time.sleep(GEMINI_INTERVAL_SEC)

    full_text = "\n".join(all_text_parts)

    # OCR結果をファイルに保存（確認用）
    if save_ocr:
        ocr_out = subject_dir / "_ocr_result.txt"
        ocr_out.write_text(full_text, encoding="utf-8")
        print(f"  💾 OCR結果保存: {ocr_out}")

    # ── Step 2: 問題ごとに分割 ───────────────────────────
    questions = split_by_question(full_text)
    if not questions:
        print("  ⚠️  問題を検出できませんでした。OCR結果を確認してください。")
        return

    q_range = f"No.{min(questions.keys())}〜No.{max(questions.keys())}"
    print(f"  → {len(questions)}問を検出: {q_range}")

    # ── Step 3: Notionへ登録 ────────────────────────────
    ok_count = miss_count = err_count = skip_count = 0

    for q_no, explanation in sorted(questions.items()):
        if not explanation:
            print(f"  [SKIP] No.{q_no:02d}: 解説テキストが空")
            skip_count += 1
            continue

        if dry_run:
            preview = explanation[:60].replace('\n', ' ')
            print(f"  [DRY]  No.{q_no:02d}: {preview}…")
            continue

        # Notion 検索
        try:
            page_id = find_notion_page(notion_year, notion_subject, q_no)
        except Exception as e:
            print(f"  [ERR]  No.{q_no:02d}: Notion検索エラー — {e}")
            err_count += 1
            continue

        if not page_id:
            print(f"  [MISS] No.{q_no:02d}: Notionにレコードなし")
            miss_count += 1
            continue

        # Notion 更新
        try:
            update_notion_explanation(page_id, explanation)
            print(f"  [OK]   No.{q_no:02d}: 更新完了（{len(explanation)}文字）")
            ok_count += 1
        except Exception as e:
            print(f"  [ERR]  No.{q_no:02d}: Notion更新エラー — {e}")
            err_count += 1

        time.sleep(NOTION_INTERVAL_SEC)

    if not dry_run:
        print(f"\n  集計: OK={ok_count} / MISS={miss_count} / ERR={err_count} / SKIP={skip_count}")


def main():
    parser = argparse.ArgumentParser(description="Gemini OCR → Notion 解説登録ツール")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Notionへの書き込みを行わず、OCRと解析結果のみ確認する"
    )
    parser.add_argument(
        "--save-ocr", action="store_true",
        help="各科目フォルダに _ocr_result.txt としてOCR結果を保存する"
    )
    parser.add_argument(
        "--year", metavar="YEAR",
        help="特定年度のみ処理（例: R7）"
    )
    parser.add_argument(
        "--subject", metavar="SUBJECT",
        help="特定科目のみ処理（例: 1_keikaku）"
    )
    args = parser.parse_args()

    # 初期チェック
    if not GEMINI_API_KEY:
        print("[ERROR] GEMINI_API_KEY が .env に設定されていません")
        return
    if not args.dry_run and not NOTION_TOKEN:
        print("[ERROR] NOTION_TOKEN が .env に設定されていません")
        return

    client = genai.Client(api_key=GEMINI_API_KEY)

    mode = "【ドライラン + OCR確認】" if args.dry_run else "【本番実行】"
    print(f"\n{mode} Gemini OCR → Notion 解説登録")
    print(f"対象: {BASE_DIR}")

    if not BASE_DIR.exists():
        print(f"[ERROR] sogo_image フォルダが見つかりません: {BASE_DIR}")
        return

    for year_dir in sorted(BASE_DIR.iterdir()):
        if not year_dir.is_dir():
            continue
        if args.year and year_dir.name.upper() != args.year.upper():
            continue

        for subject_dir in sorted(year_dir.iterdir()):
            if not subject_dir.is_dir():
                continue
            if args.subject and subject_dir.name != args.subject:
                continue
            if subject_dir.name not in SUBJECT_MAP:
                continue

            process_subject(
                year_folder=year_dir.name,
                subject_folder=subject_dir.name,
                dry_run=args.dry_run,
                save_ocr=args.save_ocr,
                client=client,
            )

    print("\n✅ 全処理完了")


if __name__ == "__main__":
    main()
