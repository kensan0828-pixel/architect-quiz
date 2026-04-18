from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os
import httpx

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
