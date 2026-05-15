# CLAUDE.md — architect-quiz

一級建築士学科試験の学習アプリ。問題はNotionで管理し、FastAPIバックエンド経由でReactフロントに配信する。

---

## プロジェクト基本情報

| 項目 | 内容 |
|------|------|
| GitHub | https://github.com/kensan0828-pixel/architect-quiz |
| 本番URL | https://architect-quiz-mocha.vercel.app/ |
| バックエンドURL | https://architect-quiz.onrender.com |
| Notion DB ID | `9858dacb9817466eab49e512e9a8e9e7` |

---

## スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19 + Vite |
| バックエンド | FastAPI + uvicorn |
| データ管理 | Notion DB |
| 画像配信 | GitHub Pages |
| AI機能 | Anthropic API（claude-haiku-4-5-20251001） |
| OCR | Gemini API（gemini-2.5-flash） |

---

## ファイル構成

```
architect-quiz/
├── src/
│   ├── App.jsx                 # クイズ本体（年度・科目選択、履歴、足切り判定）
│   ├── utils.js                # JSONパース・ID抽出ユーティリティ
│   └── components/
│       ├── Dashboard.jsx       # 学習進捗ダッシュボード
│       └── MockExam.jsx        # 模擬試験モード（タイマー付き）
├── backend/
│   ├── main.py                 # FastAPI（Notionプロキシ・AI API中継）
│   └── requirements.txt
└── tools/
    ├── ocr_to_notion.py        # Gemini OCR → Notion 解説一括登録
    ├── update_images.py        # 図表URL一括登録
    ├── rename_pages.py         # スキャン画像の連番リネーム
    ├── check_questions.html    # Notion入力チェックツール（年度・科目セレクター動的生成、localStorageでチェック状態保持）
    └── sogo_image/             # スキャン画像（.gitignore除外）
```

---

## 起動方法

### 本番（通常）
https://architect-quiz-mocha.vercel.app/ を開くだけ。

### ローカル開発
`start_quiz.bat` をダブルクリック（バックエンドとフロントを同時起動）。
- フロント: http://localhost:5173/
- バックエンド: http://localhost:8000/

---

## デプロイ

### フロントエンド（Vercel）
`main` ブランチへ push すると自動デプロイ。

### バックエンド（Render）
- Auto-Deploy ON 済み。`main` ブランチへ push すると自動デプロイ（手動デプロイ不要）。
- Free プランのため15分無操作でスリープ。初回アクセスは30〜60秒待ち。

---

## 環境変数

### ローカル `.env`
```
VITE_API_URL=http://localhost:8000
NOTION_TOKEN=ntn_xxxxx...
NOTION_DATABASE_ID=9858dacb9817466eab49e512e9a8e9e7
ANTHROPIC_API_KEY=sk-ant-xxxxx...
GEMINI_API_KEY=xxxxx...
```

### Vercel
- `VITE_API_URL=https://architect-quiz.onrender.com`

### Render
- `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `ANTHROPIC_API_KEY`

---

## バックエンド API

| メソッド | パス | 役割 |
|---------|------|------|
| GET | `/api/questions` | Notionから全問題取得（ヒントフィールド含む） |
| POST | `/api/register` | Notionへ問題一括登録（重複スキップ） |
| POST | `/api/explain` | AI解説生成 |
| POST | `/api/articles` | ヒント生成（法規のみe-Govリンク付き） |
| PATCH | `/api/question/{page_id}` | 指定フィールドをNotionに上書き保存 |

---

## Notion DB スキーマ

| フィールド | 型 | 備考 |
|-----------|-----|------|
| 問題タイトル | title | `{年度}-{科目略称}-No.{番号}` |
| 問題番号 | number | |
| 年度 | select | H28〜R7 |
| 科目 | select | 学科Ⅰ〜Ⅴ |
| 問題文 | text | |
| 選択肢1〜4 | text | |
| 正答 | select | "1"〜"4" |
| 解説 | text | 総合資格OCRテキスト（R1〜R7登録済み） |
| 図表URL | text | GitHub Pages の PNG URL |
| ヒント | text | JSON文字列（後述） |
| 習得状態 | select | 未学習 / 学習中 / 正解 / 不正解 |

---

## 主要システムの仕様

### AI解説（/api/explain）
```
Notionの「解説」フィールドが空でない（R1〜R7）
  → 解説テキストを一次ソースとして200〜300字に要約
空（H28〜H30）
  → AI知識から生成
```
- プロンプトに「前置き・出典言及不要」を明示済み。再発したらプロンプトを強化する。
- AIレスポンス中の `**太字**` は `renderWithBold()` でインライン `<strong>` にレンダリング。

### ヒントシステム（/api/articles）
```
q.ヒント が空でない → JSON.parse して即時表示（APIコールなし）
空 → /api/articles を呼ぶ
     → kaisetsu（解説）が空でない（R1〜R7）→ 解説からキーポイント抽出
     → 空（H28〜H30） → 科目別プロンプトでAI生成
```

ヒントのJSON形式:
```json
[
  {"label": "用語・基準名", "detail": "内容・数値", "url": ""},
  {"label": "建築基準法 第39条", "detail": "特定天井の脱落防止", "url": "https://elaws.e-gov.go.jp/..."}
]
```

### 模擬試験モード（MockExam.jsx）

#### セクション間結果画面（transition フェーズ）
各セクション（計画・環境 / 法規 / 構造・施工）終了時にフル結果画面を表示してから次へ進む。
- セクション合計点・正答率・足切り判定バナー
- 科目別：進捗バー＋足切り基準点との合否
- 問題別：✅/❌ 一覧
- 「次のセクションへ」ボタン

#### 不正解時のAI解説（自動表示）
```
不正解を選択した瞬間に /api/explain を自動コール（ボタン不要）
  → R1〜R7: q.解説（OCRテキスト）を一次ソースに要約
  → H28〜H30: AI知識から生成
正解時は表示しない
次の問題へ移動時に aiExplanation / loadingAI をリセット
```
- `renderWithBold()` を MockExam.jsx に定義済み（`**太字**` → `<strong>`）

### 学習履歴（localStorage）
```json
{ "令和7年_No.01": { "attempts": 3, "correctCount": 2 } }
```
- キー: `${年度}_${問題番号}`
- ストレージ名: `architect_quiz_history`

---

## データ登録状況

| 年度 | 問題 | 図表URL | 解説（OCR） |
|------|------|---------|------------|
| R1〜R7 | ✅ | ✅ | ✅ 全科目完了 |
| H28〜H30 | ✅ | ✅ | ❌ 未実施（解説書未購入） |

R1〜R7 合計875問の解説を総合資格の解答解説書からGemini OCRで登録済み。

---

## 足切り基準点（CUTOFF_SCORES）

| 年度 | Ⅰ計画 | Ⅱ環境 | Ⅲ法規 | Ⅳ構造 | Ⅴ施工 | 総得点 |
|------|-------|-------|-------|-------|-------|--------|
| H28 | 11 | 11 | 16 | 16 | 13 | 90 |
| H29 | 11 | 11 | 16 | 16 | 13 | 87 |
| H30 | 11 | 11 | 16 | 16 | 13 | 91 |
| R1  | 11 | 11 | 16 | 16 | 13 | 97 |
| R2  | 11 | 10 | 16 | 16 | 13 | 88 |
| R3  | 10 | 11 | 16 | 16 | 13 | 87 |
| R4  | 11 | 11 | 16 | 16 | 13 | 91 |
| R5  | 11 | 11 | 16 | 16 | 13 | 88 |
| R6  | 11 | 11 | 16 | 16 | 13 | 92 |
| R7  | 11 | 11 | 16 | 16 | 13 | 88 |

---

## OCRパイプライン（tools/ocr_to_notion.py）

総合資格の解答解説書スキャンJPGをGemini APIでOCRし、Notionの「解説」フィールドに一括登録する。

### sogo_image フォルダ構成
```
tools/sogo_image/
├── R1/
│   ├── 1_keikaku/  page_001.jpg ...
│   ├── 2_kankyo/
│   ├── 3_hoki/
│   ├── 4_kozo/
│   └── 5_sekko/
└── R2〜R7/
```

### 科目フォルダ → Notion値
| フォルダ | Notion値 |
|---------|---------|
| 1_keikaku | 学科Ⅰ（計画） |
| 2_kankyo | 学科Ⅱ（環境・設備） |
| 3_hoki | 学科Ⅲ（法規） |
| 4_kozo | 学科Ⅳ（構造） |
| 5_sekko | 学科Ⅴ（施工） |

### 実行コマンド
```powershell
# ドライラン
python tools/ocr_to_notion.py --dry-run --save-ocr --year R1 --subject 1_keikaku

# 特定年度・科目
python tools/ocr_to_notion.py --year R1 --subject 1_keikaku

# 全件
python tools/ocr_to_notion.py
```

### H28〜H30 を追加する場合
1. `tools/sogo_image/H28/`〜`H30/` を同じ構成で作成
2. `ocr_to_notion.py` の `YEAR_MAP` に `"H28": "H28"` 等を追記
3. `python tools/ocr_to_notion.py --year H28` で実行

---

## 注意点・教訓

- **AIレスポンスのJSONパース**: `re.sub(r"```(?:json)?\s*", "", raw)` でコードブロックを除去してからパース
- **`/api/articles` の `max_tokens`**: 800以上を維持すること
- **苦手順モード**: 起動時点で `shuffledOrder` を固定する（途中再ソートすると問題が飛ぶ）
- **Windowsのgit操作**: `git add`・`git commit`・`git push` は個別に実行（`&&` で連結するとエラーになる場合あり）
- **LF/CRLF警告**: `git add` 時に出るが無視してよい
- **`_` ファイル生成**: `echo >> .gitignore` コマンドで `_` ファイルが生成されることがある。`.gitignore` に `_` を追記済み
- **RenderのAuto-Deploy**: `main` push で自動デプロイ。手動デプロイ不要（Auto-Deploy ON に変更済み）
- **CORS**: `allow_origins=["*"]` に設定済み（全オリジン許可）

---

## 次のタスク

### 優先度：高
- **Notionヒントの継続的な手動登録**
  - AIが誤った数値を出す問題が判明したら随時登録
  - R7計画で未登録の問題: Q1・Q3・Q5・Q7・Q8・Q10・Q11・Q12・Q13・Q15・Q17・Q18

### 優先度：低
1. **タイマーモード** — 1問あたりの制限時間設定
2. **選択肢シャッフル** — 同じ問題でも選択肢の順番をランダムに
3. **メモ機能** — 問題ごとに自分のメモ・解説を書き込める
