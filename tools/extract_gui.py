"""
一級建築士試験 PDF図表抽出 & リネーム GUI ツール
extract_images.py と同じ tools/ フォルダに置いて使用する

起動方法:
    python extract_gui.py
"""

import sys
import re
import io
import threading
from pathlib import Path

import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext, messagebox

# ── 依存チェック ─────────────────────────────────────────────────────────────
try:
    import fitz
    FITZ_OK = True
except ImportError:
    FITZ_OK = False

try:
    from PIL import Image, ImageTk
    PIL_OK = True
except ImportError:
    PIL_OK = False

# extract_images.py を同一フォルダからインポート
script_dir = Path(__file__).parent
sys.path.insert(0, str(script_dir))
try:
    from extract_images import (
        is_cover_page, is_blank_page,
        get_figure_rects, find_question_number, crop_and_save,
    )
    EXTRACT_OK = True
except ImportError:
    EXTRACT_OK = False


# ── 拡張：ページ全体から問題番号を推定 ─────────────────────────────────────
def find_question_number_extended(page):
    """
    既存の find_question_number より広い範囲で番号を探す。
    ページ全文テキストを対象とする。
    """
    text = page.get_text("text")

    # 〔No.X〕〔Ｎｏ．X〕など
    m = re.search(
        r'[〔\[]\s*[NnＮｎ]\s*[OoＯｏ]\s*[．\.]?\s*([\d０-９]+)\s*[〕\]]',
        text
    )
    if m:
        raw = m.group(1)
        return str(int(raw.translate(str.maketrans('０１２３４５６７８９', '0123456789'))))

    # 半角 No.X
    m = re.search(r'No[.\s]?(\d+)', text)
    if m:
        return m.group(1)

    # 行頭の 1〜30 の数字
    for line in text.strip().splitlines():
        m = re.match(r'^(\d{1,2})[.\s。　]', line.strip())
        if m:
            num = int(m.group(1))
            if 1 <= num <= 30:
                return str(num)

    return None


# ── カラーパレット ────────────────────────────────────────────────────────────
BG       = "#f5f4f0"
SURFACE  = "#ffffff"
BORDER   = "#e2e0da"
TEXT     = "#1a1916"
MUTED    = "#7a7870"
ACCENT   = "#2d5be3"
SUCCESS  = "#16a34a"
ERROR    = "#dc2626"
MONO     = "Consolas"
SANS     = "Meiryo UI"


def card(parent, title, pady_bottom=12):
    """タイトル付きカード（白背景・枠線）を返す"""
    outer = tk.Frame(parent, bg=BORDER, bd=1, relief="flat")
    outer.pack(fill="x", pady=(0, pady_bottom))
    inner = tk.Frame(outer, bg=SURFACE, padx=20, pady=16)
    inner.pack(fill="x", padx=1, pady=1)
    tk.Label(inner, text=title, font=(SANS, 12, "bold"),
             bg=SURFACE, fg=TEXT).pack(anchor="w", pady=(0, 12))
    return inner


def label(parent, text, size=9, bold=False, color=MUTED):
    style = "bold" if bold else ""
    tk.Label(parent, text=text, font=(SANS, size, style),
             bg=parent["bg"], fg=color).pack(anchor="w")


def entry_row(parent, var, browse_cmd=None):
    row = tk.Frame(parent, bg=SURFACE)
    row.pack(fill="x", pady=(4, 12))
    e = tk.Entry(row, textvariable=var, font=(MONO, 11),
                 bg=BG, fg=TEXT, relief="flat", bd=4, insertbackground=TEXT)
    e.pack(side="left", fill="x", expand=True)
    if browse_cmd:
        tk.Button(row, text="参照", font=(SANS, 9),
                  bg=BG, fg=TEXT, relief="flat", padx=10, pady=4,
                  activebackground=BORDER, command=browse_cmd).pack(side="right", padx=(6, 0))
    return e


# ── メインアプリ ──────────────────────────────────────────────────────────────
class ExtractApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("📐 一建 PDF図表抽出ツール")
        self.geometry("820x720")
        self.minsize(600, 480)
        self.configure(bg=BG)

        # 設定変数
        self._pdf_path   = tk.StringVar()
        self._out_dir    = tk.StringVar()
        self._year       = tk.StringVar(value="r7")
        self._subject    = tk.StringVar(value="3")
        self._dpi        = tk.StringVar(value="200")
        self._hmargin    = tk.StringVar(value="40")

        self._rename_items = []   # (Path, tk.StringVar for input, status_var)

        self._build_scrollable_ui()
        self._check_deps()

    # ── スクロール可能コンテナ ────────────────────────────────────────────────
    def _build_scrollable_ui(self):
        self._canvas = tk.Canvas(self, bg=BG, highlightthickness=0)
        sb = ttk.Scrollbar(self, orient="vertical", command=self._canvas.yview)
        self._canvas.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self._canvas.pack(side="left", fill="both", expand=True)

        self._main = tk.Frame(self._canvas, bg=BG, padx=24, pady=20)
        self._win_id = self._canvas.create_window((0, 0), window=self._main, anchor="nw")

        self._main.bind("<Configure>", self._on_frame_cfg)
        self._canvas.bind("<Configure>", self._on_canvas_cfg)
        self._canvas.bind_all("<MouseWheel>",
            lambda e: self._canvas.yview_scroll(-1 * (e.delta // 120), "units"))

        self._build_content()

    def _on_frame_cfg(self, _):
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    def _on_canvas_cfg(self, e):
        self._canvas.itemconfig(self._win_id, width=e.width)

    def _refresh_scroll(self):
        self._main.update_idletasks()
        self._canvas.configure(scrollregion=self._canvas.bbox("all"))

    # ── コンテンツ構築 ────────────────────────────────────────────────────────
    def _build_content(self):
        # ヘッダー
        tk.Label(self._main, text="📐 一級建築士試験 PDF図表抽出ツール",
                 font=(SANS, 16, "bold"), bg=BG, fg=TEXT).pack(anchor="w")
        tk.Label(self._main, text="PDFから図表を抽出し、問題番号で自動リネームします",
                 font=(SANS, 10), bg=BG, fg=MUTED).pack(anchor="w", pady=(2, 18))

        self._build_settings()
        self._build_log()

        # リネームセクション（動的）
        self._rename_outer = tk.Frame(self._main, bg=BG)
        self._rename_outer.pack(fill="x")

    def _build_settings(self):
        c = card(self._main, "1  設定")

        label(c, "PDF ファイル", bold=True)
        entry_row(c, self._pdf_path, self._browse_pdf)

        label(c, "出力先フォルダ（空欄 → スクリプトの ../public/images）", bold=True)
        entry_row(c, self._out_dir, self._browse_out)

        # 小設定を横並び
        row = tk.Frame(c, bg=SURFACE)
        row.pack(fill="x", pady=(0, 12))
        for lbl, var, w in [
            ("年度コード", self._year, 8),
            ("科目番号",  self._subject, 8),
            ("DPI",       self._dpi, 8),
            ("左右余白 (pt)", self._hmargin, 10),
        ]:
            col = tk.Frame(row, bg=SURFACE)
            col.pack(side="left", padx=(0, 20))
            tk.Label(col, text=lbl, font=(SANS, 9, "bold"),
                     bg=SURFACE, fg=MUTED).pack(anchor="w")
            tk.Entry(col, textvariable=var, width=w,
                     font=(MONO, 11), bg=BG, fg=TEXT,
                     relief="flat", bd=4, insertbackground=TEXT).pack()

        self._run_btn = tk.Button(
            c, text="✨  抽出実行",
            font=(SANS, 11, "bold"),
            bg=ACCENT, fg="white",
            activebackground="#1e45c5", activeforeground="white",
            relief="flat", padx=20, pady=8,
            cursor="hand2",
            command=self._run
        )
        self._run_btn.pack(anchor="w", pady=(4, 0))

    def _build_log(self):
        c = card(self._main, "2  実行ログ")
        self._log = scrolledtext.ScrolledText(
            c, height=11,
            font=(MONO, 10), bg="#1a1916", fg="#a3e635",
            relief="flat", bd=0, wrap="word",
            insertbackground="#a3e635"
        )
        self._log.pack(fill="x")

    # ── ファイル選択 ──────────────────────────────────────────────────────────
    def _browse_pdf(self):
        p = filedialog.askopenfilename(
            title="PDFを選択", filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")])
        if p:
            self._pdf_path.set(p)

    def _browse_out(self):
        p = filedialog.askdirectory(title="出力先フォルダを選択")
        if p:
            self._out_dir.set(p)

    # ── 依存チェック ─────────────────────────────────────────────────────────
    def _check_deps(self):
        issues = []
        if not FITZ_OK:
            issues.append("PyMuPDF が未インストール: pip install pymupdf")
        if not PIL_OK:
            issues.append("Pillow が未インストール: pip install Pillow")
        if not EXTRACT_OK:
            issues.append("extract_images.py が見つかりません（同じフォルダに置いてください）")
        if issues:
            messagebox.showwarning("依存関係の問題", "\n\n".join(issues))

    # ── 抽出実行 ──────────────────────────────────────────────────────────────
    def _log_write(self, msg):
        self._log.insert("end", msg + "\n")
        self._log.see("end")

    def _run(self):
        if not self._pdf_path.get():
            messagebox.showerror("エラー", "PDFファイルを選択してください")
            return
        if not (FITZ_OK and EXTRACT_OK):
            messagebox.showerror("エラー", "依存関係が不足しています（ログ参照）")
            return

        # リネームUIをリセット
        for w in self._rename_outer.winfo_children():
            w.destroy()
        self._rename_items.clear()

        self._run_btn.config(state="disabled", text="処理中...")
        self._log.delete("1.0", "end")
        threading.Thread(target=self._extract_thread, daemon=True).start()

    def _extract_thread(self):
        pdf_path = Path(self._pdf_path.get())
        year     = self._year.get().strip()
        subject  = self._subject.get().strip()
        dpi      = int(self._dpi.get())
        hmargin  = int(self._hmargin.get())

        if self._out_dir.get():
            output_dir = Path(self._out_dir.get())
        else:
            output_dir = script_dir.parent / "public" / "images"
        output_dir.mkdir(parents=True, exist_ok=True)

        self.after(0, self._log_write, "=" * 52)
        self.after(0, self._log_write, f"PDF     : {pdf_path.name}")
        self.after(0, self._log_write, f"科目    : {subject}  年度: {year}")
        self.after(0, self._log_write, f"出力先  : {output_dir}")
        self.after(0, self._log_write, "=" * 52)

        doc = fitz.open(str(pdf_path))
        total_saved  = 0
        skipped      = 0
        unknown_list = []   # (filepath, page_num, page_idx)

        for page_num, page in enumerate(doc, start=1):
            if is_cover_page(page):
                self.after(0, self._log_write, f"p{page_num:02d} : [スキップ] 表紙/注意事項")
                skipped += 1
                continue
            if is_blank_page(page):
                self.after(0, self._log_write, f"p{page_num:02d} : [スキップ] 白紙")
                skipped += 1
                continue

            rects = get_figure_rects(page)
            if not rects:
                continue

            for i, rect in enumerate(rects, start=1):
                q_num = find_question_number(page, rect)
                estimated = False

                if not q_num:
                    q_num = find_question_number_extended(page)
                    if q_num:
                        estimated = True

                if q_num:
                    filename = f"{year}_{subject}_no{q_num}.png"
                    tag = f"No.{q_num}" + ("（推定）" if estimated else "")
                else:
                    filename = f"{year}_{subject}_p{page_num:02d}_{i:02d}_要リネーム.png"
                    tag = f"【番号未検出 p{page_num}】"

                filepath = output_dir / filename
                crop_and_save(page, rect, filepath, dpi, hmargin)
                self.after(0, self._log_write, f"p{page_num:02d} → {tag:22s}  {filename}")
                total_saved += 1

                if "要リネーム" in filename:
                    unknown_list.append((filepath, page_num, page_num - 1))

        doc.close()

        unknown_count = len(unknown_list)
        self.after(0, self._log_write, "=" * 52)
        self.after(0, self._log_write,
                   f"完了！ {total_saved}件保存  スキップ: {skipped}ページ  番号未検出: {unknown_count}件")

        if unknown_list:
            self.after(0, self._build_rename_ui, unknown_list,
                       pdf_path, year, subject, output_dir)

        self.after(0, lambda: self._run_btn.config(state="normal", text="✨  抽出実行"))

    # ── リネームUI ────────────────────────────────────────────────────────────
    def _build_rename_ui(self, unknown_list, pdf_path, year, subject, output_dir):
        c = card(self._rename_outer,
                 f"3  番号未検出ファイルのリネーム（{len(unknown_list)}件）")

        tk.Label(c, text="問題番号を入力して「リネーム」ボタンを押してください",
                 font=(SANS, 10), bg=SURFACE, fg=MUTED).pack(anchor="w", pady=(0, 12))

        if not FITZ_OK or not PIL_OK:
            tk.Label(c, text="⚠️ PyMuPDF / Pillow が必要です（サムネイル表示不可）",
                     fg=ERROR, bg=SURFACE, font=(SANS, 10)).pack(anchor="w")
            return

        doc = fitz.open(str(pdf_path))

        for filepath, page_num, page_idx in unknown_list:
            self._build_rename_row(c, doc, filepath, page_num, page_idx,
                                   year, subject, output_dir)

        doc.close()
        self._refresh_scroll()

        # 一括リネームボタン
        sep = tk.Frame(c, bg=BORDER, height=1)
        sep.pack(fill="x", pady=12)
        tk.Button(
            c, text="✅  未リネームをまとめて適用",
            font=(SANS, 10, "bold"),
            bg=SUCCESS, fg="white",
            activebackground="#15803d", activeforeground="white",
            relief="flat", padx=16, pady=6,
            cursor="hand2",
            command=self._bulk_rename
        ).pack(anchor="w")

    def _build_rename_row(self, parent, doc, filepath, page_num, page_idx,
                          year, subject, output_dir):
        row = tk.Frame(parent, bg=BG, bd=1, relief="flat", padx=12, pady=10)
        row.pack(fill="x", pady=(0, 8))

        # サムネイル
        thumb = tk.Label(row, bg=BG, width=14, height=7)
        thumb.pack(side="left", padx=(0, 14))

        if page_idx < len(doc):
            try:
                page = doc[page_idx]
                mat  = fitz.Matrix(0.28, 0.28)
                pix  = page.get_pixmap(matrix=mat)
                img  = Image.open(io.BytesIO(pix.tobytes("png")))
                img.thumbnail((130, 160))
                photo = ImageTk.PhotoImage(img)
                thumb.configure(image=photo, width=0, height=0)
                thumb.image = photo   # 参照保持
            except Exception:
                thumb.configure(text="(表示不可)", fg=MUTED)

        # 右側
        info = tk.Frame(row, bg=BG)
        info.pack(side="left", fill="both", expand=True)

        tk.Label(info, text=filepath.name, font=(MONO, 10),
                 bg=BG, fg=TEXT).pack(anchor="w")
        tk.Label(info, text=f"ページ: {page_num}", font=(SANS, 9),
                 bg=BG, fg=MUTED).pack(anchor="w", pady=(2, 8))

        # 番号入力行
        input_row = tk.Frame(info, bg=BG)
        input_row.pack(anchor="w")

        tk.Label(input_row, text="No.", font=(SANS, 11, "bold"),
                 bg=BG, fg=TEXT).pack(side="left")

        num_var = tk.StringVar()
        tk.Entry(input_row, textvariable=num_var, width=5,
                 font=(MONO, 14), bg=SURFACE, fg=TEXT,
                 relief="flat", bd=3, insertbackground=TEXT).pack(side="left", padx=(4, 12))

        status_var = tk.StringVar(value="")
        btn = tk.Button(input_row, text="リネーム",
                        font=(SANS, 10, "bold"),
                        bg=SUCCESS, fg="white",
                        activebackground="#15803d",
                        relief="flat", padx=12, pady=4,
                        cursor="hand2")
        btn.pack(side="left")

        tk.Label(info, textvariable=status_var, font=(SANS, 9),
                 bg=BG).pack(anchor="w", pady=(4, 0))

        # クロージャでリネーム実行
        def do_rename(fp=filepath, v=num_var, sv=status_var, b=btn,
                      yr=year, subj=subject, od=output_dir):
            n = v.get().strip()
            if not n.isdigit():
                sv.set("❌ 数字を入力してください")
                return
            new_path = od / f"{yr}_{subj}_no{n}.png"
            try:
                fp.rename(new_path)
                sv.set(f"✅ → {new_path.name}")
                b.config(state="disabled", bg="#9ca3af")
                # リストの filepath を更新
                for item in self._rename_items:
                    if item[0] == fp:
                        item[0] = new_path
            except FileNotFoundError:
                sv.set("⚠️ ファイルが既にリネーム済みです")
            except Exception as e:
                sv.set(f"❌ {e}")

        btn.config(command=do_rename)
        self._rename_items.append([filepath, num_var, status_var])

    def _bulk_rename(self):
        done, skipped = 0, 0
        for item in self._rename_items:
            filepath, num_var, status_var = item
            n = num_var.get().strip()
            if not n or not n.isdigit():
                skipped += 1
                continue
            year    = self._year.get().strip()
            subject = self._subject.get().strip()
            output_dir = (Path(self._out_dir.get()) if self._out_dir.get()
                          else script_dir.parent / "public" / "images")
            new_path = output_dir / f"{year}_{subject}_no{n}.png"
            try:
                filepath.rename(new_path)
                status_var.set(f"✅ → {new_path.name}")
                item[0] = new_path
                done += 1
            except FileNotFoundError:
                status_var.set("⚠️ リネーム済み")
            except Exception as e:
                status_var.set(f"❌ {e}")

        messagebox.showinfo("一括リネーム完了",
                            f"{done}件リネーム完了\n{skipped}件は番号未入力のためスキップ")


if __name__ == "__main__":
    app = ExtractApp()
    app.mainloop()
