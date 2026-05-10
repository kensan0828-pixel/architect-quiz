"""利用可能な Gemini モデルを一覧表示する"""
import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("利用可能なモデル一覧:\n")
for model in client.models.list():
    # generateContent をサポートするモデルのみ表示
    if hasattr(model, 'supported_actions') and 'generateContent' in (model.supported_actions or []):
        print(f"  {model.name}")
    elif 'gemini' in (model.name or '').lower():
        print(f"  {model.name}")
