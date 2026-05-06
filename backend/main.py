from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import httpx
import re
import anthropic

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "null", "https://architect-quiz-mocha.vercel.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_ID = os.getenv("NOTION_DATABASE_ID")
NOTION_API = "https://api.notion.com/v1"
HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

anthropic_client = anthropic.Anthropic()


@app.get("/api/questions")
def get_questions():
    results = []
    cursor = None

    while True:
        body = {}
        if cursor:
            body["start_cursor"] = cursor

        response = httpx.post(
            f"{NOTION_API}/databases/{DATABASE_ID}/query",
            headers=HEADERS,
            json=body,
        )
        data = response.json()
        results.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")

    questions = []
    for page in results:
        props = page["properties"]

        def get_text(key):
            val = props.get(key, {})
            rich = val.get("rich_text", [])
            return rich[0]["plain_text"] if rich else ""

        def get_select(key):
            val = props.get(key, {})
            sel = val.get("select")
            return sel["name"] if sel else ""

        def get_number(key):
            val = props.get(key, {})
            return val.get("number")

        num = get_number("問題番号")
        questions.append({
            "問題番号": f"No.{int(num)}" if num else "",
            "科目": get_select("科目"),
            "年度": get_select("年度"),
            "問題文": get_text("問題文"),
            "選択肢1": get_text("選択肢1"),
            "選択肢2": get_text("選択肢2"),
            "選択肢3": get_text("選択肢3"),
            "選択肢4": get_text("選択肢4"),
            "正答": get_select("正答"),
            "解説": get_text("解説"),
            "図表URL": get_text("図表URL"),
        })

    return questions

@app.post("/api/register")
def register_questions(questions: list = Body(...)):
    results = []
    for q in questions:
        num = q.get("問題番号", "")
        subject = q.get("科目", "")
        year = q.get("年度", "")

        # ── 重複チェック：同じ年度・科目・問題番号が既に存在するか確認
        check = httpx.post(
            f"{NOTION_API}/databases/{DATABASE_ID}/query",
            headers=HEADERS,
            json={
                "filter": {
                    "and": [
                        {"property": "年度",   "select": {"equals": year}},
                        {"property": "科目",   "select": {"equals": subject}},
                        {"property": "問題番号", "number": {"equals": int(num) if num else 0}},
                    ]
                }
            },
            timeout=30.0,
        )
        existing = check.json().get("results", [])
        if existing:
            results.append({"番号": num, "status": 200, "ok": True, "skipped": True})
            continue  # 重複はスキップ

        # ── 新規登録
        title = f"{year}-{subject}-No.{num}"
        page = {
            "parent": {"database_id": DATABASE_ID},
            "properties": {
                "問題タイトル": {"title": [{"text": {"content": title}}]},
                "問題番号": {"number": int(num) if num else None},
                "科目":    {"select": {"name": subject}},
                "年度":    {"select": {"name": year}},
                "問題文":  {"rich_text": [{"text": {"content": q.get("問題文", "")}}]},
                "選択肢1": {"rich_text": [{"text": {"content": q.get("選択肢1", "")}}]},
                "選択肢2": {"rich_text": [{"text": {"content": q.get("選択肢2", "")}}]},
                "選択肢3": {"rich_text": [{"text": {"content": q.get("選択肢3", "")}}]},
                "選択肢4": {"rich_text": [{"text": {"content": q.get("選択肢4", "")}}]},
                "正答":    {"select": {"name": str(q.get("正答", ""))}},
                "解説":    {"rich_text": [{"text": {"content": q.get("解説", "")}}]},
                "図表URL": {"rich_text": [{"text": {"content": q.get("図表URL", "")}}]},
            }
        }
        res = httpx.post(
            f"{NOTION_API}/pages",
            headers=HEADERS,
            json=page,
            timeout=30.0,
        )
        results.append({"番号": num, "status": res.status_code, "ok": res.status_code == 200, "skipped": False})

    return results


class ExplainRequest(BaseModel):
    question: str
    choices: list[str]
    correct_answer: str
    user_answer: str
    subject: str
    year: str
    question_no: str
    static_explanation: str = ""
    is_correct: bool = False


@app.post("/api/explain")
def explain(req: ExplainRequest):
    choices_text = "\n".join(
        [f"{i+1}. {c}" for i, c in enumerate(req.choices) if c]
    )

    if req.is_correct:
        prompt = f"""あなたは一級建築士試験の専門家です。
以下の問題について、正解の理由をわかりやすく解説してください。

【科目】{req.subject}（{req.year} {req.question_no}）
【問題文】{req.question}

【選択肢】
{choices_text}

【正解】{req.correct_answer}番

受験者は{req.correct_answer}番を選んで正解しました。
「なぜ{req.correct_answer}番が正しいのか」を建築士試験の観点から200〜300字で解説してください。
他の選択肢が誤りである理由も1〜2行で添えると理解が深まります。"""
    else:
        prompt = f"""あなたは一級建築士試験の専門家です。
以下の問題について、誤答の理由と正解の解説をしてください。

【科目】{req.subject}（{req.year} {req.question_no}）
【問題文】{req.question}

【選択肢】
{choices_text}

【正解】{req.correct_answer}番
【受験者の回答】{req.user_answer}番（不正解）
{f'【参考解説】{req.static_explanation}' if req.static_explanation else ''}

「なぜ{req.user_answer}番が誤りで、{req.correct_answer}番が正しいのか」を
建築士試験の観点から200〜300字で解説してください。"""

    response = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    return {"explanation": response.content[0].text}


# ── e-Gov 法令 ID マッピング ──
LAW_EGOV = {
    "建築基準法":           "325AC0000000201",
    "建築基準法施行令":     "325CO0000000338",
    "建築基準法施行規則":   "325M50000000040",
    "建築士法":             "325AC0000000202",
    "建築士法施行令":       "325CO0000000350",
    "建築士法施行規則":     "325M50000000004",
    "都市計画法":           "343AC0000000100",
    "都市計画法施行令":     "343CO0000000158",
    "消防法":               "323AC0000000186",
    "消防法施行令":         "336CO0000000037",
    "消防法施行規則":       "336M50000000006",
    "バリアフリー法":       "418AC0000000091",
    "長期優良住宅法":       "421AC0000000087",
    "住宅品確法":           "411AC0000000081",
    "建設業法":             "324AC0000000100",
    "建設業法施行令":       "324CO0000000273",
    "宅地造成等規制法":     "336AC0000000191",
    "土地区画整理法":       "329AC0000000119",
}


class ArticleRequest(BaseModel):
    question: str
    choices: list[str]
    year: str
    question_no: str


@app.post("/api/articles")
def get_articles(req: ArticleRequest):
    choices_text = "\n".join(
        [f"{i+1}. {c}" for i, c in enumerate(req.choices) if c]
    )

    prompt = f"""あなたは一級建築士試験（学科Ⅲ法規）の専門家です。
以下の問題に関連する法令条文を特定してください。

【問題文】{req.question}

【選択肢】
{choices_text}

この問題を解くために参照すべき条文を3〜5件、以下のJSON形式で返してください。
URLや説明文は不要です。JSONのみを返してください。マークダウン記法（```）は使わないでください。

[
  {{"law": "建築基準法", "article": "第28条", "title": "居室の採光及び換気"}},
  {{"law": "建築基準法施行令", "article": "第19条", "title": "採光に有効な部分の面積"}}
]

lawには正式な法令名（例：建築基準法、建築基準法施行令、建築士法、都市計画法、消防法 など）を使用してください。"""

    response = anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=400,
        messages=[{"role": "user", "content": prompt}],
    )

    import json as json_module
    raw = response.content[0].text.strip()
    try:
        articles = json_module.loads(raw)
    except Exception:
        # JSON パース失敗時は空リストを返す
        return {"articles": []}

    # e-Gov URL を付与
    for a in articles:
        law_id = LAW_EGOV.get(a.get("law", ""))
        a["url"] = f"https://elaws.e-gov.go.jp/document?lawid={law_id}" if law_id else ""

    return {"articles": articles}
