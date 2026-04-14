// ① オブジェクトのパースと修復
export function tryParseObject(str) {
  try { return JSON.parse(str); } catch {}
  const last = str.lastIndexOf("}");
  if (last >= 0) { try { return JSON.parse(str.slice(0, last + 1)); } catch {} }
  return null;
}

// ② プロパティタグからの抽出
export function extractFromProperties(text) {
  const propMatch = text.match(/<properties>([\s\S]*?)<\/properties>/);
  if (!propMatch) return null;

  const trimmed = propMatch[1].trim();
  const start = trimmed.indexOf("{");
  if (start < 0) return null;

  const q = tryParseObject(trimmed.slice(start));
  if (q && (q["問題文"] || q["問題番号"])) return normalizeQuestion(q);
  return null;
}

// ③ データの正規化
export function normalizeQuestion(props) {
  return {
    問題番号:    props["問題番号"]  ?? props["No"]    ?? "",
    問題タイトル: props["問題タイトル"] ?? props["title"] ?? "",
    問題文:      props["問題文"]    ?? "",
    選択肢1:     String(props["選択肢1"] ?? ""),
    選択肢2:     String(props["選択肢2"] ?? ""),
    選択肢3:     String(props["選択肢3"] ?? ""),
    選択肢4:     String(props["選択肢4"] ?? ""),
    正答:        String(props["正答"]    ?? props["答え"] ?? ""),
    科目:        props["科目"] ?? "",
    年度:        props["年度"] ?? "",
  };
}

// ④ JSON配列のパースと修復
function tryRepairArray(partial) {
  for (const suffix of ["},", "}"]) {
    const i = partial.lastIndexOf(suffix);
    if (i > 0) {
      try { return JSON.parse(partial.slice(0, i + 1) + "]"); } catch {}
    }
  }
  return null;
}

export function parseJsonArray(text) {
  const clean = text.replace(/```[a-z]*/g, "").replace(/```/g, "").trim();
  const a = clean.indexOf("["), b = clean.lastIndexOf("]");
  if (a >= 0 && b > a) {
    try { return JSON.parse(clean.slice(a, b + 1)); } catch {
      const repaired = tryRepairArray(clean.slice(a));
      if (repaired) return repaired;
    }
  }
  const c = clean.indexOf("{"), d = clean.lastIndexOf("}");
  if (c >= 0 && d > c) { try { return [JSON.parse(clean.slice(c, d + 1))]; } catch {} }
  return [];
}

// ⑤ ID抽出
export function extractIds(text) {
  const ids = [];

  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  for (const m of text.matchAll(re)) {
    if (!ids.includes(m[0])) ids.push(m[0]);
  }

  const re2 = /\b([0-9a-f]{32})\b/gi;
  for (const m of text.matchAll(re2)) {
    const raw = m[1];
    const uuid = raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
    if (!ids.includes(uuid) && !ids.includes(raw)) ids.push(uuid);
  }

  return ids;
}