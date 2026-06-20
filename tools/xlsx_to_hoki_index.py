"""
法規インデックス.xlsx → src/data/hoki_law_index.json
A: 法令名, B: インデックス, C: 条文番号
"""
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path.home() / "Downloads" / "法規インデックス.xlsx"
OUT = ROOT / "src" / "data" / "hoki_law_index.json"


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        raise SystemExit(f"not found: {xlsx}")

    wb = openpyxl.load_workbook(xlsx, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    data = []
    for r in rows[1:]:
        if not r or not r[0]:
            continue
        law = str(r[0]).strip()
        index = str(r[1] or "").replace("\n", " / ").strip()
        article = str(r[2] or "").strip() if len(r) >= 3 else ""
        data.append({"law": law, "index": index, "article": article})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(data)} rows -> {OUT}")


if __name__ == "__main__":
    main()
