"""
rename_pages.py
===============
sogo_image/01_problems または 02_explanations 以下の年度×科目フォルダ内のJPGファイルを
日時順（ファイル名昇順）に page_001.jpg 形式へ一括リネームする。

使い方:
  # まず確認（ファイルは変更しない）
  python tools/rename_pages.py --dry-run

  # 問題画像のみ
  python tools/rename_pages.py --category problems

  # 解説画像のみ
  python tools/rename_pages.py --category explanations
"""

import argparse
import sys
from pathlib import Path

from ocr_to_notion import (
    EXPLANATIONS_DIR,
    IMAGE_EXTENSIONS,
    PROBLEMS_DIR,
    SOGO_IMAGE_DIR,
    iter_subject_dirs,
)

# ============================================================
# メイン処理
# ============================================================

def rename_in_folder(folder: Path, dry_run: bool) -> tuple[int, int]:
    """
    フォルダ内の画像ファイルを日時順にソートして page_XXX.jpg にリネーム。
    Returns: (処理件数, スキップ件数)
    """
    files = sorted(
        [f for f in folder.iterdir()
         if f.is_file() and f.suffix.lower() in IMAGE_EXTENSIONS],
        key=lambda f: f.name
    )

    if not files:
        return 0, 0

    processed = 0
    skipped = 0

    for i, src in enumerate(files, start=1):
        dest = folder / f"page_{i:03d}.jpg"

        if src == dest:
            print(f"  [SKIP] {src.name} （すでに正しい名前）")
            skipped += 1
            continue

        if dry_run:
            print(f"  [DRY]  {src.name}  →  {dest.name}")
        else:
            src.rename(dest)
            print(f"  [OK]   {src.name}  →  {dest.name}")

        processed += 1

    return processed, skipped


def category_dirs(category: str) -> list[Path]:
    if category == "problems":
        return [PROBLEMS_DIR]
    if category == "explanations":
        return [EXPLANATIONS_DIR]
    return [PROBLEMS_DIR, EXPLANATIONS_DIR]


def main():
    parser = argparse.ArgumentParser(description="sogo_image ページ連番リネームツール")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="ファイルを実際には変更せず確認のみ行う"
    )
    parser.add_argument(
        "--category", choices=["problems", "explanations", "both"], default="both",
        help="対象カテゴリ（default: both）"
    )
    args = parser.parse_args()

    if not SOGO_IMAGE_DIR.exists():
        print(f"[ERROR] フォルダが見つかりません: {SOGO_IMAGE_DIR}")
        sys.exit(1)

    cat = "both" if args.category == "both" else args.category
    targets = category_dirs(cat)

    mode = "【ドライラン】" if args.dry_run else "【本番実行】"
    print(f"\n{mode} リネーム処理を開始します")
    print(f"対象: {', '.join(str(d) for d in targets)}\n")
    print("=" * 60)

    total_processed = 0
    total_skipped = 0
    folder_count = 0

    for base_dir in targets:
        if not base_dir.exists():
            print(f"[WARN] スキップ（存在しません）: {base_dir}")
            continue
        print(f"\n## {base_dir.name}")
        for year_folder, subject_folder, subject_dir in iter_subject_dirs(base_dir):
            label = f"{base_dir.name}/{year_folder}/{subject_folder}"
            print(f"\n📁 {label}")

            p, s = rename_in_folder(subject_dir, dry_run=args.dry_run)
            total_processed += p
            total_skipped += s
            folder_count += 1

    print("\n" + "=" * 60)
    if args.dry_run:
        print(f"✅ ドライラン完了 — {folder_count}フォルダ / {total_processed}件をリネーム予定")
        print("   問題なければ --dry-run を外して本番実行してください")
    else:
        print(f"✅ 完了 — {folder_count}フォルダ / {total_processed}件をリネーム")
        if total_skipped:
            print(f"   スキップ: {total_skipped}件（すでに正しい名前）")


if __name__ == "__main__":
    main()
