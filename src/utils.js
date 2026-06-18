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

function zenNumToHan(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function pushHokiRef(seen, out, label) {
  const normalized = zenNumToHan(label).replace(/\s+/g, "");
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  out.push({ label: normalized });
}

/** Notion解説テキストから条文番号らしき表記を抽出（学科Ⅲ一問一答用） */
export function extractHokiArticleRefs(text) {
  if (!text || !String(text).trim()) return [];
  const t = zenNumToHan(String(text));
  const seen = new Set();
  const out = [];

  const escaped = HOKI_LAW_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const fullRe = new RegExp(`(?:${escaped})${HOKI_ARTICLE_SUFFIX}`, "g");
  for (const m of t.matchAll(fullRe)) pushHokiRef(seen, out, m[0]);

  for (const m of t.matchAll(new RegExp(`\\(([^)]*?${HOKI_ARTICLE_SUFFIX}[^)]*)\\)`, "g"))) {
    pushHokiRef(seen, out, m[1]);
  }

  const abbrev = [
    { re: /法第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?/g, prefix: "建築基準法" },
    { re: /令第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?/g, prefix: "建築基準法施行令" },
    { re: /規則第[0-9]+条(?:の[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+号)?/g, prefix: "建築基準法施行規則" },
  ];
  for (const { re, prefix } of abbrev) {
    for (const m of t.matchAll(re)) pushHokiRef(seen, out, prefix + m[0].slice(1));
  }

  for (const m of t.matchAll(new RegExp(`同法施行令${HOKI_ARTICLE_SUFFIX}`, "g"))) {
    pushHokiRef(seen, out, "建築基準法施行令" + m[0].replace(/^同法施行令/, ""));
  }
  for (const m of t.matchAll(new RegExp(`同法${HOKI_ARTICLE_SUFFIX}`, "g"))) {
    pushHokiRef(seen, out, "建築基準法" + m[0].replace(/^同法/, ""));
  }

  // 【法第56条第1項…】形式
  for (const m of t.matchAll(/【([^】]*(?:法|令|規則|第[0-9]+条)[^】]*)】/g)) {
    const inner = m[1];
    for (const sub of inner.matchAll(new RegExp(`(?:${escaped}|法|令|規則)${HOKI_ARTICLE_SUFFIX}`, "g"))) {
      let label = sub[0];
      if (/^法第/.test(label)) label = "建築基準法" + label.slice(1);
      else if (/^令第/.test(label)) label = "建築基準法施行令" + label.slice(1);
      else if (/^規則第/.test(label)) label = "建築基準法施行規則" + label.slice(1);
      pushHokiRef(seen, out, label);
    }
  }

  return out;
}

const KATA_CHOICE = { 1: "イ", 2: "ロ", 3: "ハ", 4: "ニ" };

/** 選択肢番号 n（1〜4）の解説区切り位置を検索する正規表現一覧 */
function kaisetsuMarkerPatterns(n) {
  const wn = ["１", "２", "３", "４"][n - 1];
  const an = String(n);
  const kata = KATA_CHOICE[n];
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*（\\s*${wn}\\s*）`, "gm"),
    new RegExp(`(?:^|\\n)\\s*\\(\\s*${an}\\s*\\)`, "gm"),
    new RegExp(`(?:^|\\n)\\s*${wn}\\s*[．.]`, "gm"),
    new RegExp(`(?:^|\\n)\\s*${an}\\s*[．.]`, "gm"),
    new RegExp(`(?:^|\\n)\\s*【\\s*${wn}\\s*】`, "gm"),
    new RegExp(`(?:^|\\n)\\s*【\\s*${an}\\s*】`, "gm"),
    new RegExp(`(?:^|\\n|\\s)${kata}\\s*[．.]`, "gm"),
    new RegExp(`(?:^|\\n|\\s)(?:選択肢|解答|解説|設問)\\s*${wn}`, "gm"),
    new RegExp(`(?:^|\\n|\\s)(?:選択肢|解答|解説|設問)\\s*${an}`, "gm"),
  ];
  // 1番目は行頭、2〜4番目は同一行内「 2. 」形式にも対応
  if (n === 1) {
    patterns.unshift(new RegExp(`^\\s*${an}\\s*[．.]`, "m"));
  } else {
    patterns.unshift(new RegExp(`(?<=\\s)${an}\\s*[．.]`, "gm"));
  }
  return patterns;
}

function findKaisetsuBoundaries(t) {
  const byNum = {};
  for (let n = 1; n <= 4; n++) {
    for (const re of kaisetsuMarkerPatterns(n)) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(t)) !== null) {
        const idx = m.index;
        if (byNum[n] === undefined || idx < byNum[n]) byNum[n] = idx;
      }
    }
  }
  return byNum;
}

/**
 * Notion「解説」全文から、choiceIndex（1〜4）に対応する段落を切り出す。
 * （１）形式・1. / 1．・同一行内の 2. ・イ. 形式などに対応。
 */
export function extractKaisetsuForChoice(full, choiceIndex) {
  if (!full || !String(full).trim()) return null;
  const t = String(full);
  const n = choiceIndex;
  if (n < 1 || n > 4) return null;

  const bounds = findKaisetsuBoundaries(t);
  const start = bounds[n];
  if (start === undefined) return null;

  let end = t.length;
  for (let next = n + 1; next <= 4; next++) {
    if (bounds[next] !== undefined) {
      end = bounds[next];
      break;
    }
  }
  const slice = t.slice(start, end).trim();
  return slice || null;
}

/** 記述別切り出し。失敗時は解説全文をフォールバックとして返す */
export function resolveKaisetsuForChoice(full, choiceIndex) {
  const perChoice = extractKaisetsuForChoice(full, choiceIndex);
  if (perChoice) return { text: perChoice, fallback: false };
  const trimmed = (full || "").trim();
  if (trimmed) return { text: trimmed, fallback: true };
  return { text: "", fallback: false };
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