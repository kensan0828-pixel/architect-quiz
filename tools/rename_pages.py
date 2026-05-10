"""
rename_pages.py
===============
sogo_image/ 以下の年度×科目フォルダ内のJPGファイルを
日時順（ファイル名昇順）に page_001.jpg 形式へ一括リネームする。

使い方:
  # まず確認（ファイルは変更しない）
  python rename_pages.py --dry-run

  # 問題なければ本番実行
  python rename_pages.py
"""

import os
import sys
import argparse
from pathlib import Path

# ============================================================
# 設定
# ============================================================

# sogo_image フォルダのパス（環境に合わせて変更）
BASE_DIR = Path(r"C:\Users\Kentaro Oiwa\OneDrive\Desktop\architect-quiz\tools\sogo_image")

# 対象拡張子（小文字・大文字両対応）
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}

# ============================================================
# メイン処理
# ============================================================

def rename_in_folder(folder: Path, dry_run: bool) -> tuple[int, int]:
    """
    フォルダ内の画像ファイルを日時順にソートして page_XXX.jpg にリネーム。
    Returns: (処理件数, スキップ件数)
    """
    # 対象ファイルを取得してファイル名昇順でソート
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


def main():
    parser = argparse.ArgumentParser(description="sogo_image ページ連番リネームツール")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="ファイルを実際には変更せず確認のみ行う"
    )
    args = parser.parse_args()

    if not BASE_DIR.exists():
        print(f"[ERROR] フォルダが見つかりません: {BASE_DIR}")
        sys.exit(1)

    mode = "【ドライラン】" if args.dry_run else "【本番実行】"
    print(f"\n{mode} リネーム処理を開始します")
    print(f"対象フォルダ: {BASE_DIR}\n")
    print("=" * 60)

    total_processed = 0
    total_skipped = 0
    folder_count = 0

    # 年度フォルダ（R1〜R7 など）を昇順で走査
    for year_dir in sorted(BASE_DIR.iterdir()):
        if not year_dir.is_dir():
            continue

        # 科目フォルダ（1_keikaku など）を昇順で走査
        for subject_dir in sorted(year_dir.iterdir()):
            if not subject_dir.is_dir():
                continue

            label = f"{year_dir.name}/{subject_dir.name}"
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
