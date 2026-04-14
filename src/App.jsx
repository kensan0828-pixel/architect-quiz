import { useState, useEffect } from "react";
import * as Utils from "./utils";

const DB_COLLECTION = "collection://a7404e5f-b310-4629-b3e9-498c173c0bf6";
const MCP = [{ type: "url", url: "https://mcp.notion.com/mcp", name: "notion-mcp" }];
const SUBJECTS = ["すべて", "学科Ⅰ（計画）", "学科Ⅱ（環境・設備）", "学科Ⅲ（法規）", "学科Ⅳ（構造）", "学科Ⅴ（施工）"];
const YEARS    = ["すべて", "令和7年", "令和6年", "令和5年", "令和4年"];
const SUBJECT_COLORS = {
  "学科Ⅰ（計画）":    { bg: "#ede9fe", color: "#7c3aed" },
  "学科Ⅱ（環境・設備）": { bg: "#fce7f3", color: "#9d174d" },
  "学科Ⅲ（法規）":    { bg: "#fee2e2", color: "#991b1b" },
  "学科Ⅳ（構造）":    { bg: "#fef3c7", color: "#92400e" },
  "学科Ⅴ（施工）":    { bg: "#f3f4f6", color: "#374151" },
};

const SYSTEM_PROMPT =
  "あなたは建築士試験問題のパーサーです。" +
  "必ずJSON形式のみで返答してください。前置き・コードブロック記法（```）は不要です。";

async function api(messages, useMcp = false) {
  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages,
  };
  if (useMcp) body.mcp_servers = MCP;

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`${r.status}: ${t.slice(0, 200)}`);
  }

  const json = await r.json();
  return (json.content || []).flatMap(b => {
    if (b.type === "text") return [b.text];
    if (b.type === "mcp_tool_result") {
      const c = b.content;
      return Array.isArray(c)
        ? c.map(x => (typeof x === "string" ? x : (x.text || "")))
        : [String(c)];
    }
    if (b.type === "tool_use") return [];
    return [];
  }).filter(Boolean).join("\n");
}

export default function App() {
  // useState 各種はここに追加していく

  async function extractQuestionFromPage(raw, pageNum, addLog) {
    const direct = Utils.extractFromProperties(raw);
    if (direct?.問題文) {
      addLog(`  ✅ Page${pageNum}: 直接パース成功`);
      return direct;
    }

    addLog(`  🤖 Page${pageNum}: AI変換を試みます...`);
    try {
      const raw3 = await api([{ role: "user", content: `(プロンプト略)... ${raw.slice(0, 2000)}` }]);
      const qs = Utils.parseJsonArray(raw3).filter(q => q.問題文);
      if (qs.length) {
        addLog(`  ✅ Page${pageNum}: AI変換成功`);
        return Utils.normalizeQuestion(qs[0]);
      }
    } catch (e) {
      addLog(`  ❌ Page${pageNum}: エラー — ${e.message}`);
      console.error(`extractQuestionFromPage [Page${pageNum}]`, e);
    }
    return null;
  }

  return (
    <div>
      <h1>建築士試験 問題アプリ</h1>
    </div>
  );
}
// 練習用コメント