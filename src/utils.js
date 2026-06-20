import hokiLawIndexData from "./data/hoki_law_index.json";

/** e-Gov 法令ID（法規ヒント・一問一答条文表示で共通） */
export const LAW_EGOV = {
  "建築基準法": "325AC0000000201",
  "建築基準法施行令": "325CO0000000338",
  "建築基準法施行規則": "325M50000000040",
  "建築士法": "325AC0000000202",
  "建築士法施行令": "325CO0000000350",
  "建築士法施行規則": "325M50000000004",
  "都市計画法": "343AC0000000100",
  "都市計画法施行令": "343CO0000000158",
  "消防法": "323AC0000000186",
  "消防法施行令": "336CO0000000037",
  "消防法施行規則": "336M50000000006",
  "バリアフリー法": "418AC0000000091",
  "長期優良住宅法": "421AC0000000087",
  "住宅品確法": "411AC0000000081",
  "建設業法": "324AC0000000100",
  "建設業法施行令": "324CO0000000273",
  "宅地造成等規制法": "336AC0000000191",
  "土地区画整理法": "329AC0000000119",
};

const HOKI_LAW_NAMES = [
  "建築基準法施行規則",
  "建築基準法施行令",
  "建築基準法",
  "建築士法施行規則",
  "建築士法施行令",
  "建築士法",
  "都市計画法施行令",
  "都市計画法",
  "消防法施行規則",
  "消防法施行令",
  "消防法",
  "建築物のエネルギー消費性能の向上等に関する法律",
  "建築物省エネ法",
  "バリアフリー法",
  "長期優良住宅法",
  "住宅品確法",
  "建設業法施行令",
  "建設業法",
  "宅地造成等規制法",
  "土地区画整理法",
  "騒音規制法",
  "道路法",
  "国土交通省告示",
];

const HOKI_ARTICLE_SUFFIX = "第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?";

/** Excelインデックスの法令名（略称→正式名称） */
const HOKI_LAW_ALIASES = {
  "建築物省エネ法": "建築物エネルギー消費性能向上法",
  "建築物のエネルギー消費性能の向上等に関する法律": "建築物エネルギー消費性能向上法",
  "建築基準法施行規則": "建築基準法施行規則／指定資格検定機関等に関する省令",
  "住宅品確法": "住宅品質確保促進法",
  "長期優良住宅法": "長期優良住宅普及促進法",
  "宅地造成等規制法": "宅地造成盛土規制法",
};

const HOKI_LAW_PREFIX = {
  "建築基準法": "法",
  "建築基準法施行令": "令",
  "建築基準法施行規則／指定資格検定機関等に関する省令": "規",
};

function normalizeHokiLawName(name) {
  if (!name) return "";
  const n = zenNumToHan(name).trim();
  return HOKI_LAW_ALIASES[n] || n;
}

function defaultHokiPrefix(law) {
  return HOKI_LAW_PREFIX[normalizeHokiLawName(law)] || "法";
}

function parseExcelArticleToken(token, defaultPrefix) {
  let t = zenNumToHan(token).replace(/\s+/g, "").replace(/～|〜$/g, "");
  if (!t) return null;
  let prefix = defaultPrefix;
  const pm = t.match(/^(法|令|規|省令)/);
  if (pm) {
    prefix = pm[1];
    t = t.slice(pm[1].length);
  }
  const m = t.match(/^(\d+)条(?:の(\d+))?/);
  if (!m) return null;
  return { prefix, base: parseInt(m[1], 10), no2: m[2] ? parseInt(m[2], 10) : null };
}

function parseExcelArticleField(law, field) {
  if (!field) return [];
  const defaultPrefix = defaultHokiPrefix(law);
  const parts = field.split(/[、・，,]/).map((s) => s.trim()).filter(Boolean);
  const specs = [];
  let lastPrefix = defaultPrefix;
  for (const part of parts) {
    const tok = parseExcelArticleToken(part, lastPrefix);
    if (!tok) continue;
    lastPrefix = tok.prefix;
    specs.push(tok);
  }
  return specs;
}

const HOKI_INDEX_ROWS = hokiLawIndexData.map((row) => ({
  law: normalizeHokiLawName(row.law),
  index: row.index,
  specs: parseExcelArticleField(row.law, row.article),
}));

const LAW_CANDIDATES_SORTED = [
  ...new Set([
    ...HOKI_INDEX_ROWS.map((r) => r.law),
    ...HOKI_LAW_NAMES.map(normalizeHokiLawName),
    ...Object.keys(HOKI_LAW_ALIASES),
  ]),
].sort((a, b) => b.length - a.length);

function articleSpecMatches(spec, base, no2) {
  if (spec.base !== base) return false;
  if (spec.no2 != null) return spec.no2 === no2;
  return no2 == null;
}

/** 法令名＋条文番号からインデックス名を検索 */
export function lookupHokiIndex(lawName, base, no2) {
  if (!lawName || base == null) return null;
  const law = normalizeHokiLawName(lawName);
  let exactMatch = null;
  for (const row of HOKI_INDEX_ROWS) {
    if (row.law !== law || row.specs.length === 0) continue;
    for (const spec of row.specs) {
      if (!articleSpecMatches(spec, base, no2)) continue;
      if (spec.no2 != null) return row.index;
      if (!exactMatch) exactMatch = row.index;
    }
  }
  return exactMatch;
}

export function parseLawArticleLabel(label) {
  const normalized = zenNumToHan(label).replace(/\s+/g, "");

  let law = null;
  for (const name of LAW_CANDIDATES_SORTED) {
    const canon = normalizeHokiLawName(name);
    if (normalized.startsWith(canon) || normalized.startsWith(name)) {
      law = canon;
      break;
    }
  }
  if (!law) {
    if (/^法第/.test(normalized)) law = "建築基準法";
    else if (/^令第/.test(normalized)) law = "建築基準法施行令";
    else if (/^規則第/.test(normalized)) {
      law = "建築基準法施行規則／指定資格検定機関等に関する省令";
    }
  }

  const m = normalized.match(/第(\d+)条(?:の(\d+))?(?:第(\d+)項)?(?:第(\d+)号)?/);
  if (!m) return { law, base: null, no2: null };
  return {
    law,
    base: parseInt(m[1], 10),
    no2: m[2] ? parseInt(m[2], 10) : null,
  };
}

function enrichHokiRef(label) {
  try {
    const { law, base, no2 } = parseLawArticleLabel(label);
    const index = lookupHokiIndex(law, base, no2);
    return index ? { label, index } : { label };
  } catch {
    return { label };
  }
}

function zenNumToHan(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function pushHokiRef(seen, out, label) {
  const normalized = zenNumToHan(label).replace(/\s+/g, "");
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  out.push(enrichHokiRef(normalized));
}

/** Notion解説テキストから条文番号らしき表記を抽出（学科Ⅲ一問一答用） */
export function extractHokiArticleRefs(text) {
  if (!text || !String(text).trim()) return [];
  // 記述1件分の解説を想定（全文フォールバック等の長文で固まらないよう上限）
  const raw = String(text);
  const t = zenNumToHan(raw.length > 2500 ? raw.slice(0, 2500) : raw);
  const seen = new Set();
  const out = [];
  const MAX_REFS = 20;

  const push = (label) => {
    if (out.length >= MAX_REFS) return;
    pushHokiRef(seen, out, label);
  };

  const escaped = HOKI_LAW_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const fullRe = new RegExp(`(?:${escaped})${HOKI_ARTICLE_SUFFIX}`, "g");
  for (const m of t.matchAll(fullRe)) push(m[0]);

  if (out.length < MAX_REFS && t.length <= 1500) {
    for (const m of t.matchAll(new RegExp(`\\(([^)]{0,80}${HOKI_ARTICLE_SUFFIX}[^)]{0,40})\\)`, "g"))) {
      push(m[1]);
      if (out.length >= MAX_REFS) break;
    }
  }

  const abbrev = [
    { re: /法第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?/g, prefix: "建築基準法" },
    { re: /令第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?/g, prefix: "建築基準法施行令" },
    { re: /規則第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?/g, prefix: "建築基準法施行規則" },
  ];
  for (const { re, prefix } of abbrev) {
    if (out.length >= MAX_REFS) break;
    for (const m of t.matchAll(re)) push(prefix + m[0].slice(1));
  }

  if (out.length < MAX_REFS) {
    for (const m of t.matchAll(new RegExp(`同法施行令${HOKI_ARTICLE_SUFFIX}`, "g"))) {
      push("建築基準法施行令" + m[0].replace(/^同法施行令/, ""));
    }
  }
  if (out.length < MAX_REFS) {
    for (const m of t.matchAll(new RegExp(`同法${HOKI_ARTICLE_SUFFIX}`, "g"))) {
      push("建築基準法" + m[0].replace(/^同法/, ""));
    }
  }

  // 【法第56条第1項…】形式
  if (out.length < MAX_REFS) {
    for (const m of t.matchAll(/【([^】]{0,120})】/g)) {
      const inner = m[1];
      if (!/(?:法|令|規則|第[0-9]+条)/.test(inner)) continue;
      for (const sub of inner.matchAll(new RegExp(`(?:${escaped}|法|令|規則)${HOKI_ARTICLE_SUFFIX}`, "g"))) {
        let label = sub[0];
        if (/^法第/.test(label)) label = "建築基準法" + label.slice(1);
        else if (/^令第/.test(label)) label = "建築基準法施行令" + label.slice(1);
        else if (/^規則第/.test(label)) label = "建築基準法施行規則" + label.slice(1);
        push(label);
        if (out.length >= MAX_REFS) break;
      }
    }
  }

  return out;
}

const KATA_TO_NUM = { イ: 1, ロ: 2, ハ: 3, ニ: 4 };

function markerTokenToNum(token) {
  if (!token) return 0;
  if (KATA_TO_NUM[token]) return KATA_TO_NUM[token];
  const d = zenNumToHan(token);
  const n = parseInt(d, 10);
  return n >= 1 && n <= 4 ? n : 0;
}

/** 解説テキスト内の記述区切り（1. / （１） / イ. 等）を1パスで走査 */
function scanChoiceMarkers(text) {
  const t = text.length > 12000 ? text.slice(0, 12000) : text;
  const markers = [];
  const re = /(?:^|[\n\r\s])(?:（\s*([１-４])\s*）|\(\s*([1-4])\s*\)|([1-4１-４]|[イロハニ])[\.．])/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const num = markerTokenToNum(m[1] || m[2] || m[3]);
    if (num < 1 || num > 4) continue;
    const lead = m[0].length - m[0].trimStart().length;
    const index = m.index + lead;
    if (markers.length === 0 || markers[markers.length - 1].index !== index) {
      markers.push({ num, index });
    }
  }
  const byNum = {};
  for (const mk of markers) {
    if (byNum[mk.num] === undefined || mk.index < byNum[mk.num]) {
      byNum[mk.num] = mk.index;
    }
  }
  return { text: t, byNum };
}

/**
 * Notion「解説」全文から、choiceIndex（1〜4）に対応する段落を切り出す。
 */
export function extractKaisetsuForChoice(full, choiceIndex) {
  if (!full || !String(full).trim()) return null;
  const n = choiceIndex;
  if (n < 1 || n > 4) return null;

  const { text: t, byNum } = scanChoiceMarkers(String(full));
  const start = byNum[n];
  if (start === undefined) return null;

  let end = t.length;
  for (let next = n + 1; next <= 4; next++) {
    if (byNum[next] !== undefined) {
      end = byNum[next];
      break;
    }
  }
  const slice = t.slice(start, end).trim();
  return slice || null;
}

/** 記述別切り出し。失敗時は空（全文返却でUIが固まるのを防ぐ） */
export function resolveKaisetsuForChoice(full, choiceIndex) {
  const perChoice = extractKaisetsuForChoice(full, choiceIndex);
  if (perChoice) return { text: perChoice, fallback: false };
  return { text: "", fallback: true };
}

export function lawEgovUrl(label) {
  const keys = Object.keys(LAW_EGOV).sort((a, b) => b.length - a.length);
  for (const name of keys) {
    if (label.startsWith(name)) {
      return `https://elaws.e-gov.go.jp/document?lawid=${LAW_EGOV[name]}`;
    }
  }
  return "";
}

/** 学習履歴・設問統計のキー（年度×科目×問題番号で一意） */
export function questionHistKey(q) {
  return `${q.年度}_${q.科目}_${q.問題番号}`;
}

/** 旧形式（科目なし） */
export function legacyQuestionHistKey(q) {
  return `${q.年度}_${q.問題番号}`;
}

/** 履歴キーを分解（新形式・旧形式両対応） */
export function parseQuestionHistKey(key) {
  const subjMatch = key.match(/^(.+)_(学科[ⅠⅡⅢⅣⅤ]（[^）]+）)_(No\.\d+)$/);
  if (subjMatch) {
    return { year: subjMatch[1], subject: subjMatch[2], problemNo: subjMatch[3] };
  }
  const legacy = key.match(/^(.+)_(No\.\d+)$/);
  if (legacy) {
    return { year: legacy[1], subject: null, problemNo: legacy[2] };
  }
  return null;
}

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