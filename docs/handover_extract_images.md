# 引継ぎ資料：PDF図表抽出スクリプト改善

## 作業目的

`extract_images.py`（一級建築士試験PDFから図表を抽出するスクリプト）の **切り出し領域の精度改善**。
問題文・選択肢・次問題マーカーを自動検出し、「図の部分だけ」を過不足なく抽出できるようにする。

---

## 作業ファイル

- **スクリプト本体**：`C:\Users\Kentaro Oiwa\OneDrive\Desktop\architect-quiz\tools\extract_images.py`
- **GUIツール**：`C:\Users\Kentaro Oiwa\OneDrive\Desktop\architect-quiz\tools\extract_gui.py`
- **PDF入力**：`1k-2025-1st-gakka3.pdf`（学科Ⅲ／令和7年）
- **画像出力先**：`C:\Users\Kentaro Oiwa\OneDrive\Desktop\architect-quiz\public\images`
- **ターミナル実行**：`python extract_images.py 1k-2025-1st-gakka3.pdf 3`
- **GUI起動**：`python extract_gui.py`

---

## これまでの改修内容

### 1. 上端の動的検出（`find_question_text_end`）

問題文（`〔Ｎｏ．X〕……ものとする。`）のすぐ下から図を切り出す。

**判定基準**（すべて満たすブロックを問題文と認識）：
- 幅がページ幅の50%以上
- ページ左端近くから始まる（x0 < ページ幅の20%）
- `。` を含む
- `※` で始まらない

複数段落の問題文にも対応（最下端の一致ブロックを採用）。

### 2. 下端の動的検出（`find_bottom_boundary`）

図の下にある「次のコンテンツ」を3種類検出し、最も上のものを境界とする。

1. **`〔Ｎｏ．X〕` 次問題マーカー**（p04 の表パターン対策）
2. **選択肢パターン（ブロック単位）**：行頭が `1.`〜`4.` / `１．`〜`４．`
3. **選択肢列パターン（ワード単位）**：表形式レイアウト（`1.  26.25 m` のような構造）で、`1` `2` `3` `4` が x座標ほぼ同じ・y座標昇順で並ぶ組み合わせを検出

### 3. 下端採用ロジック（`crop_and_save`）

最終版の優先順位：

```python
bottom = rect.y1 + MARGIN_V_BOTTOM      # 基本：図の下端+10pt
if boundary_y is not None:
    bottom = min(bottom, boundary_y - BOUNDARY_MARGIN)  # 境界が近ければ手前
bottom = max(bottom, rect.y1)           # 図が切れないガード
bottom = min(bottom, page_rect.y1)      # ページ範囲内
```

これにより：
- **表パターン（p04）**：表の下端+10pt で切る（`〔No.6〕` までの大きな空白を含まない）✅ 検証済み
- **図+選択肢パターン（p10）**：選択肢除外は未対応（対応見送り・選択肢込みで許容）
- **選択肢が図内にあるパターン（p09）**：図の下端+10pt で切る ✅ 検証済み

---

## 定数（調整可能）

```python
MARGIN_V_TOP    = 10   # 上部余白フォールバック
MARGIN_V_BOTTOM = 10   # 下部余白（通常はこれで切る）
BOUNDARY_MARGIN = 8    # 境界からの距離
```

---

## GUIツール（extract_gui.py）

### 概要

ターミナル操作不要で抽出・リネームが行えるPythonデスクトップアプリ。
`extract_images.py` と同じ `tools/` フォルダに置いて使用する。

### 起動方法

```bash
cd C:\Users\Kentaro Oiwa\OneDrive\Desktop\architect-quiz\tools
python extract_gui.py
```

終了は `Ctrl+C`（ターミナルから起動した場合）またはウィンドウを閉じる。

### 依存パッケージ

```bash
pip install pymupdf Pillow
```

### 機能

| Step | 内容 |
|------|------|
| 1. 設定 | PDF選択・出力先・年度/科目/DPI/余白を設定して「抽出実行」 |
| 2. ログ | 処理結果をリアルタイム表示。拡張検索で自動推定できた場合は「（推定）」と表示 |
| 3. リネーム | 番号未検出が残った場合のみ表示。ページサムネイルを見ながら番号入力→個別または一括リネーム |

### リネーム自動推定ロジック（`find_question_number_extended`）

既存の `find_question_number` が失敗した場合にページ全文を対象として再検索する。
検索順序：
1. `〔Ｎｏ．X〕` 全角パターン
2. `No.X` 半角パターン
3. 行頭の 1〜30 の数字

---

## Notion 図表URL の登録

### URLフォーマット

```
https://raw.githubusercontent.com/kensan0828-pixel/architect-quiz/main/public/images/{filename}
```

### ファイル命名規則

```
{年度コード}_{科目番号}_no{問題番号}.png
例: r7_3_no5.png（令和7年・学科Ⅲ・No.5）
```

### 登録済み科目（図表URL入力済み）

| 科目 | 問題番号 | 状態 |
|------|----------|------|
| 学科Ⅱ | No.11 | ✅ |
| 学科Ⅲ | No.5, No.16, No.17 | ✅（2026-04-20 更新） |

---

## 本日の作業ログ（2026-04-20）

- p04（表パターン）：修正済み確認 ✅
- p10（図＋選択肢）：選択肢込みのまま許容、対応見送り
- 学科Ⅲ 要リネーム3件をリネーム（No.5 / No.16 / No.17）
- Notion の `図表URL` を3件更新（MCP経由） ✅
- 学科Ⅲ 画像を GitHub に push ✅
- `extract_gui.py` 作成・push ✅

---

## 次回やること

### 優先度：高

1. **`extract_gui.py` の動作確認**
   - GUIで学科Ⅲを再抽出して問題ないか確認
   - リネームUIのサムネイル表示・番号入力・リネーム処理を検証

### 優先度：中

2. **学科Ⅰ・Ⅳ・Ⅴ のPDFで通し抽出・登録**
   - 科目ごとのレイアウト差異の有無を確認
   - 要リネームが出た場合はGUIでリネーム
   - GitHubにpush → Notionの `図表URL` を更新

### 優先度：低

3. **ワード単位の選択肢検出が効かないケースの調査**
   - `find_bottom_boundary` 内の検出3（ワード単位）に debug print を追加
   - PyMuPDF の words 抽出が PDF ごとに挙動が違う可能性あり

---

## 既知の注意点

### デバッグ print の位置

`find_question_text_end` にデバッグ出力を追加する場合、`block_width = x1 - x0` の**下**に配置すること。上に置くと `UnboundLocalError` になる。

### OneDrive オンデマンド

出力フォルダが OneDrive 配下のため、新規生成ファイルが「クラウドのみ」状態になるとサムネイルが出ない。
対策：`public/images` フォルダを右クリック → 「このデバイス上で常に保持する」。

---

## 再開時のプロンプト例

```
extract_images.py の改修続きです。
引継ぎ資料（handover_extract_images.md）と最新版スクリプトを添付します。
学科Ⅰ（科目コード1）のPDFで通し抽出して結果を確認したいです。
```

添付すべきファイル：
- 最新版 `extract_images.py`
- 最新版 `extract_gui.py`
- この引継ぎ資料
- （必要に応じて）生成した画像ファイル
