"""
public/images の h28_*.png を Notion DB の 図表URL に一括登録するスクリプト。
ファイル名形式: h{year}_{subject}_{no}{number}.png
例: h28_1_no19.png → 平成28年 / 学科Ⅰ（計画）/ No.19
"""
import re
import sys
import httpx
from pathlib import Path

NOTION_TOKEN = "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"
DATABASE_ID = "9858dacb9817466eab49e512e9a8e9e7"
NOTION_API = "https://api.notion.com/v1"
HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}
BASE_URL = "https://raw.githubusercontent.com/kensan0828-pixel/architect-quiz/main/public/images/"

YEAR_MAP = {
    28: "平成28年",
    29: "平成29年",
    30: "平成30年",
    31: "平成31年",
}

SUBJECT_MAP = {
    1: "学科Ⅰ（計画）",
    2: "学科Ⅱ（環境・設備）",
    3: "学科Ⅲ（法規）",
    4: "学科Ⅳ（構造）",
    5: "学科Ⅴ（施工）",
}


def parse_filename(name: str):
    m = re.match(r"h(\d+)_(\d+)_no(\d+)\.png$", name, re.IGNORECASE)
    if not m:
        return None
    year_num, subj_num, q_num = int(m.group(1)), int(m.group(2)), int(m.group(3))
    year = YEAR_MAP.get(year_num)
    subject = SUBJECT_MAP.get(subj_num)
    if not year or not subject:
        return None
    return year, subject, q_num


def find_page(year: str, subject: str, question_no: int):
    resp = httpx.post(
        f"{NOTION_API}/databases/{DATABASE_ID}/query",
        headers=HEADERS,
        json={
            "filter": {
                "and": [
                    {"property": "年度",   "select": {"equals": year}},
                    {"property": "科目",   "select": {"equals": subject}},
                    {"property": "問題番号", "number": {"equals": question_no}},
                ]
            }
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    results = resp.json().get("results", [])
    return results[0]["id"] if results else None


def update_page(page_id: str, url: str):
    resp = httpx.patch(
        f"{NOTION_API}/pages/{page_id}",
        headers=HEADERS,
        json={
            "properties": {
                "図表URL": {"rich_text": [{"text": {"content": url}}]}
            }
        },
        timeout=30.0,
    )
    resp.raise_for_status()
    return resp.status_code


def main():
    image_dir = Path(__file__).parent.parent / "public" / "images"
    pattern = sys.argv[1] if len(sys.argv) > 1 else "h28_*.png"
    files = sorted(image_dir.glob(pattern))

    print(f"対象ファイル数: {len(files)}")
    ok = skip = error = 0

    for f in files:
        parsed = parse_filename(f.name)
        if not parsed:
            print(f"  [SKIP] パース失敗: {f.name}")
            skip += 1
            continue

        year, subject, q_no = parsed
        url = BASE_URL + f.name

        page_id = find_page(year, subject, q_no)
        if not page_id:
            print(f"  [NOT FOUND] {f.name} → {year} / {subject} / No.{q_no}")
            skip += 1
            continue

        status = update_page(page_id, url)
        print(f"  [OK] {f.name} → {year} / {subject} / No.{q_no}  (HTTP {status})")
        ok += 1

    print(f"\n完了: 成功={ok}, スキップ={skip}, エラー={error}")


if __name__ == "__main__":
    main()
