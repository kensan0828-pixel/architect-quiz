import { useState, useEffect, useRef, useMemo } from "react";
import Dashboard from "./components/Dashboard";
import MockExam from "./components/MockExam";

// **text** をインライン <strong> にレンダリングするヘルパー
function renderWithBold(text) {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

/** 解説テキストの冒頭を要約代わりに使う（API失敗時など） */
function truncateExplanation(text, maxLen = 420) {
  if (!text || !String(text).trim()) return null;
  const t = String(text).trim().replace(/\s+/g, " ");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…`;
}

const ZEN_CHOICE = { "１": "1", "２": "2", "３": "3", "４": "4" };

/** Notion「正答」を 1〜4 の半角数字に正規化（全角・数値型・文中の数字・selectオブジェクトに対応） */
function normalizeChoiceAnswer(ans) {
  if (ans == null || ans === "") return "";
  if (typeof ans === "object" && ans !== null && "name" in ans) {
    return normalizeChoiceAnswer(ans.name);
  }
  if (typeof ans === "number" && ans >= 1 && ans <= 4) return String(Math.floor(ans));
  const s = String(ans).trim();
  if (ZEN_CHOICE[s]) return ZEN_CHOICE[s];
  const all = s.match(/[1-4]/g);
  if (all?.length) return all[all.length - 1];
  return "";
}

/** 「誤り／不適当…を選べ」系で、正答の肢は記述として不適切＝マークは「誤」が正しい */
function isNegativeAnswerChoiceQuestion(problemText) {
  const t = problemText || "";
  return /(?:誤って|誤り|誤っている|不正確|不適切|不適当|正しくない|妥当でない|当てはまらない|適当でない)(?:もの|のは|を|に)/i.test(t)
    || /不適当なもの|不適切なもの|誤っているもの|正しくないもの|妥当でないもの/i.test(t);
}

const LS_RQ_RESUME = "architect_quiz_rq_resume";
const LS_RQ_INTERRUPT = "architect_quiz_rq_interrupt";
const LS_RQ_STEP = "architect_quiz_rq_step_stats";
const LS_RQ_RECALL = "architect_quiz_rq_recall";
const LS_RQ_WRONG_STREAK = "architect_quiz_rq_wrong_streak";
const LS_MCQ_RECALL = "architect_quiz_mcq_recall";
const LS_MCQ_WRONG_STREAK = "architect_quiz_mcq_wrong_streak";
/** 一問一答×苦手順：この回数以上かつ正答率以上なら出題除外 */
const RQ_MASTERED_MIN_ATTEMPTS = 7;
const RQ_MASTERED_RATE = 0.85;
const RQ_RECALL_WRONG_STREAK = 2;
/** 4択×苦手順：この回数以上かつ正答率以上なら出題除外 */
const MCQ_MASTERED_MIN_ATTEMPTS = 5;
const MCQ_MASTERED_RATE = 0.8;
const MCQ_RECALL_WRONG_STREAK = 2;

function rqStepRecallId(histKey, step) {
  return `${histKey}|${step}`;
}

function getRqStepCell(rqStepStats, histKey, step) {
  const row = rqStepStats[histKey];
  const cell = Array.isArray(row) && row[step] ? row[step] : null;
  return cell && cell.attempts > 0
    ? { attempts: cell.attempts, correctCount: cell.correctCount }
    : { attempts: 0, correctCount: 0 };
}

/** 設問単位：7回以上かつ正答率85%以上 */
function isRqStepMastered(rqStepStats, histKey, step) {
  const cell = getRqStepCell(rqStepStats, histKey, step);
  if (cell.attempts < RQ_MASTERED_MIN_ATTEMPTS) return false;
  return cell.correctCount / cell.attempts >= RQ_MASTERED_RATE;
}

function loadRqRecallSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_RQ_RECALL) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function saveRqRecallSet(set) {
  try {
    localStorage.setItem(LS_RQ_RECALL, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

function loadRqWrongStreaks() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_RQ_WRONG_STREAK) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveRqWrongStreaks(obj) {
  try {
    localStorage.setItem(LS_RQ_WRONG_STREAK, JSON.stringify(obj));
  } catch { /* ignore */ }
}

function questionHistKey(q) {
  return `${q.年度}_${q.問題番号}`;
}

function getMcqHistoryRec(history, q) {
  const rec = history[questionHistKey(q)];
  if (!rec || !("attempts" in rec) || rec.attempts === 0) return null;
  return { attempts: rec.attempts, correctCount: rec.correctCount };
}

/** 4択問題：5回以上かつ正答率80%以上 */
function isMcqQuestionMastered(history, q) {
  const rec = getMcqHistoryRec(history, q);
  if (!rec || rec.attempts < MCQ_MASTERED_MIN_ATTEMPTS) return false;
  return rec.correctCount / rec.attempts >= MCQ_MASTERED_RATE;
}

function loadMcqRecallSet() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_MCQ_RECALL) || "[]");
    return new Set(Array.isArray(raw) ? raw.filter((s) => typeof s === "string") : []);
  } catch {
    return new Set();
  }
}

function saveMcqRecallSet(set) {
  try {
    localStorage.setItem(LS_MCQ_RECALL, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

function loadMcqWrongStreaks() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_MCQ_WRONG_STREAK) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function saveMcqWrongStreaks(obj) {
  try {
    localStorage.setItem(LS_MCQ_WRONG_STREAK, JSON.stringify(obj));
  } catch { /* ignore */ }
}

/** 一問一答：設問 i（0〜3）で「正」が正しいマークか */
function getOfficialSeiExpectedForQuestion(q, i) {
  const officialNum = normalizeChoiceAnswer(q.正答);
  const negativeAnswerPick = isNegativeAnswerChoiceQuestion(q.問題文);
  const isDesignated = String(i + 1) === officialNum;
  return negativeAnswerPick ? !isDesignated : isDesignated;
}

function emptyRqMarks() {
  return [null, null, null, null];
}

function emptyRqExplList() {
  return ["", "", "", ""];
}

function loadRqStepStatsObject() {
  try {
    return JSON.parse(localStorage.getItem(LS_RQ_STEP) || "{}");
  } catch {
    return {};
  }
}

function clearRqResumeStorage() {
  try {
    localStorage.removeItem(LS_RQ_RESUME);
  } catch { /* ignore */ }
}

function clearRqInterruptStorage() {
  try {
    localStorage.removeItem(LS_RQ_INTERRUPT);
  } catch { /* ignore */ }
}

function readRqInterruptPayload() {
  try {
    const raw = localStorage.getItem(LS_RQ_INTERRUPT);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}

/**
 * 4択×苦手順：累計正答率の低い順。5回以上・正答率80%以上は除外（recallSet は先頭付近で再出題）。
 * 未回答は末尾。同率・未回答群内は defaultSortFn で並べる。
 */
function buildWeakOrderIndices(filtered, history, defaultSortFn, recallSet) {
  const getRate = (q) => {
    const rec = getMcqHistoryRec(history, q);
    if (!rec) return null;
    return rec.correctCount / rec.attempts;
  };
  const indexed = filtered.map((q, i) => ({ q, i, histKey: questionHistKey(q) }));
  const recallItems = indexed
    .filter(({ histKey }) => recallSet.has(histKey))
    .sort((a, b) => {
      const ra = getRate(a.q);
      const rb = getRate(b.q);
      if (ra === null && rb !== null) return 1;
      if (ra !== null && rb === null) return -1;
      if (ra !== null && rb !== null && ra !== rb) return ra - rb;
      return defaultSortFn(a.q, b.q);
    });
  const pool = indexed.filter(({ q, histKey }) => {
    if (recallSet.has(histKey)) return false;
    return !isMcqQuestionMastered(history, q);
  });
  const answered = pool
    .filter(({ q }) => getRate(q) !== null)
    .sort((a, b) => {
      const ra = getRate(a.q);
      const rb = getRate(b.q);
      if (ra !== rb) return ra - rb;
      return defaultSortFn(a.q, b.q);
    });
  const unanswered = pool
    .filter(({ q }) => getRate(q) === null)
    .sort((a, b) => defaultSortFn(a.q, b.q));
  return [...recallItems, ...answered, ...unanswered].map(({ i }) => i);
}

/**
 * 一問一答の苦手順：各設問（記述1〜4）を単位に、rqStepStats の正答率が低い順。
 * 7回以上かつ正答率85%以上の設問は除外（recallSet にある設問は再出題）。
 * 未回答（0回）の設問は末尾。同率・未回答群内は問題の defaultSortFn、同一問題内は（１）→（４）。
 */
function buildRqStepWeakFlatOrder(baseQuestionList, rqStepStats, defaultSortFn, recallSet) {
  const getStepRate = (histKey, step) => {
    const cell = getRqStepCell(rqStepStats, histKey, step);
    if (cell.attempts === 0) return null;
    return cell.correctCount / cell.attempts;
  };
  const cells = [];
  for (const q of baseQuestionList) {
    const histKey = `${q.年度}_${q.問題番号}`;
    for (let step = 0; step < 4; step++) {
      const rid = rqStepRecallId(histKey, step);
      const isRecall = recallSet.has(rid);
      if (!isRecall && isRqStepMastered(rqStepStats, histKey, step)) continue;
      cells.push({ q, histKey, step, isRecall });
    }
  }
  return cells.sort((a, b) => {
    if (a.isRecall !== b.isRecall) return a.isRecall ? -1 : 1;
    const ra = getStepRate(a.histKey, a.step);
    const rb = getStepRate(b.histKey, b.step);
    if (ra === null && rb !== null) return 1;
    if (ra !== null && rb === null) return -1;
    if (ra !== null && rb !== null && ra !== rb) return ra - rb;
    const qcmp = defaultSortFn(a.q, b.q);
    if (qcmp !== 0) return qcmp;
    return a.step - b.step;
  });
}

/**
 * Notion「解説」全文から、choiceIndex（1〜4）に対応する段落を切り出す。
 */
function findKaisetsuSectionStart(t, choiceNum, fromIdx) {
  if (choiceNum < 1 || choiceNum > 4) return -1;
  const wn = ["１", "２", "３", "４"][choiceNum - 1];
  const an = String(choiceNum);
  const patterns = [
    new RegExp(`(?:^|\\n)\\s*（\\s*${wn}\\s*）`, "gm"),
    new RegExp(`(?:^|\\n)\\s*\\(\\s*${an}\\s*\\)`, "gm"),
    new RegExp(`(?:^|\\n)\\s*${wn}\\s*[．.]`, "gm"),
    new RegExp(`(?:^|\\n)\\s*${an}\\s*[\\.．]`, "gm"),
    new RegExp(`(?:^|\\n)\\s*【\\s*${wn}\\s*】`, "gm"),
    new RegExp(`(?:^|\\n)\\s*【\\s*${an}\\s*】`, "gm"),
    new RegExp(`(?:^|\\n)\\s*(?:選択肢|解答|解説|設問)\\s*${wn}`, "gm"),
    new RegExp(`(?:^|\\n)\\s*(?:選択肢|解答|解説|設問)\\s*${an}`, "gm"),
  ];
  let best = -1;
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (m.index >= fromIdx && (best < 0 || m.index < best)) best = m.index;
    }
  }
  return best;
}

function extractKaisetsuForChoice(full, choiceIndex) {
  if (!full || !String(full).trim()) return null;
  const t = String(full);
  const n = choiceIndex;
  if (n < 1 || n > 4) return null;
  const start = findKaisetsuSectionStart(t, n, 0);
  if (start < 0) return null;
  let end = t.length;
  for (let next = n + 1; next <= 4; next++) {
    const ns = findKaisetsuSectionStart(t, next, start + 1);
    if (ns >= 0) {
      end = ns;
      break;
    }
  }
  const slice = t.slice(start, end).trim();
  return slice || null;
}

const HINT_CONFIG = {
  "学科Ⅰ（計画）":      { icon: "💡", label: "用語・基準を確認",   color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", heading: "💡 用語・基準（ヒント）" },
  "学科Ⅱ（環境・設備）": { icon: "💡", label: "公式・基準を確認",   color: "#9d174d", bg: "#fdf4ff", border: "#f5d0fe", heading: "💡 公式・基準（ヒント）" },
  "学科Ⅲ（法規）":      { icon: "📖", label: "関連条文を見る",     color: "#0891b2", bg: "#f0f9ff", border: "#bae6fd", heading: "📖 関連条文（ヒント）" },
  "学科Ⅳ（構造）":      { icon: "💡", label: "公式・理論を確認",   color: "#92400e", bg: "#fffbeb", border: "#fde68a", heading: "💡 公式・理論（ヒント）" },
  "学科Ⅴ（施工）":      { icon: "💡", label: "工法・基準を確認",   color: "#374151", bg: "#f9fafb", border: "#e5e7eb", heading: "💡 工法・基準（ヒント）" },
};

function QuestionFigure({ url }) {
  if (!url) return null;
  return (
    <div style={{ marginBottom: 24, textAlign: "center" }}>
      <img src={url} alt="図表"
        style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />
    </div>
  );
}

function HintBlock({ q, articleLinks, setArticleLinks, loadingArticles, setLoadingArticles }) {
  const cfg = HINT_CONFIG[q.科目];
  if (!cfg) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      {!articleLinks && !loadingArticles && (
        <button type="button" onClick={() => {
          if (q.ヒント && q.ヒント.trim() !== "") {
            try {
              setArticleLinks(JSON.parse(q.ヒント));
            } catch {
              setArticleLinks([]);
            }
            return;
          }
          setLoadingArticles(true);
          const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";
          fetch(`${apiBase}/api/articles`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              question: q.問題文,
              choices: [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4],
              subject: q.科目,
              year: q.年度,
              question_no: q.問題番号,
              kaisetsu: q.解説 || "",
            }),
          })
            .then(r => r.json())
            .then(data => { setArticleLinks(data.items); setLoadingArticles(false); })
            .catch(() => { setArticleLinks([]); setLoadingArticles(false); });
        }} style={{
          padding: "6px 14px", borderRadius: 8,
          border: `1.5px solid ${cfg.color}`, background: "#fff",
          color: cfg.color, fontSize: 13, fontWeight: "bold", cursor: "pointer",
        }}>
          {cfg.icon} {cfg.label}
        </button>
      )}
      {loadingArticles && (
        <div style={{ fontSize: 13, color: "#6b7280" }}>{cfg.icon} 検索中...</div>
      )}
      {articleLinks && articleLinks.length > 0 && (
        <div style={{
          padding: "12px 14px", borderRadius: 8,
          background: cfg.bg, border: `1px solid ${cfg.border}`,
          textAlign: "left",
        }}>
          <div style={{ fontSize: 12, fontWeight: "bold", color: cfg.color, marginBottom: 8 }}>
            {cfg.heading}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {articleLinks.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#1e293b", fontWeight: "bold" }}>
                  {a.label}
                </span>
                {a.detail && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>（{a.detail}）</span>
                )}
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 11, color: "#0891b2", textDecoration: "underline",
                  }}>
                    e-Gov 🔗
                  </a>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setArticleLinks(null)} style={{
            marginTop: 8, fontSize: 11, color: "#9ca3af", background: "none",
            border: "none", cursor: "pointer", padding: 0,
          }}>
            閉じる
          </button>
        </div>
      )}
      {articleLinks && articleLinks.length === 0 && (
        <div style={{ fontSize: 13, color: "#9ca3af" }}>ヒントが見つかりませんでした。</div>
      )}
    </div>
  );
}

const SUBJECT_COLORS = {
  "学科Ⅰ（計画）":      { bg: "#ede9fe", color: "#7c3aed" },
  "学科Ⅱ（環境・設備）": { bg: "#fce7f3", color: "#9d174d" },
  "学科Ⅲ（法規）":      { bg: "#fee2e2", color: "#991b1b" },
  "学科Ⅳ（構造）":      { bg: "#fef3c7", color: "#92400e" },
  "学科Ⅴ（施工）":      { bg: "#f3f4f6", color: "#374151" },
};

// 年度×科目の足切り基準点（総得点は全科目合算時のみ使用）
const CUTOFF_SCORES = {
  "平成28年": { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 90 },
  "平成29年": { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 87 },
  "平成30年": { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 91 },
  "令和元年":  { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 97 },
  "令和2年":  { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 10, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 88 },
  "令和3年":  { "学科Ⅰ（計画）": 10, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 87 },
  "令和4年":  { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 91 },
  "令和5年":  { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 88 },
  "令和6年":  { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 92 },
  "令和7年":  { "学科Ⅰ（計画）": 11, "学科Ⅱ（環境・設備）": 11, "学科Ⅲ（法規）": 16, "学科Ⅳ（構造）": 16, "学科Ⅴ（施工）": 13, 総得点: 88 },
};

const ALL = "すべて";

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [filterSubject, setFilterSubject] = useState(ALL);
  const [filterYear, setFilterYear] = useState(ALL);
  const [shuffledOrder, setShuffledOrder] = useState(null);
  const [weakMode, setWeakMode] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState([]); // [{correct, selected}] indexed by question position
  const [sessionComplete, setSessionComplete] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showMockExam, setShowMockExam]   = useState(false);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [loadingAI, setLoadingAI]         = useState(false);
  const [articleLinks, setArticleLinks]   = useState(null);
  const [loadingArticles, setLoadingArticles] = useState(false);
  /** 一問一答：各選択肢を設問とみなし〇×で判断 */
  const [readQuestionFirst, setReadQuestionFirst] = useState(false);
  const [rqStep, setRqStep] = useState(0);
  const [rqMarks, setRqMarks] = useState([null, null, null, null]);
  const [rqItemExpl, setRqItemExpl] = useState(null);
  const [rqReview, setRqReview] = useState(false);
  const [rqExplList, setRqExplList] = useState(["", "", "", ""]);
  const [rqStepStats, setRqStepStats] = useState(() => loadRqStepStatsObject());
  /** 通常一問一答で2連続誤答した設問（苦手順へ呼び戻し） */
  const [rqRecallSet, setRqRecallSet] = useState(() => loadRqRecallSet());
  /** 通常4択で2連続誤答した問題（苦手順へ呼び戻し） */
  const [mcqRecallSet, setMcqRecallSet] = useState(() => loadMcqRecallSet());
  const [rqInterruptExists, setRqInterruptExists] = useState(() => !!readRqInterruptPayload());
  const [rqPendingRestore, setRqPendingRestore] = useState(null);
  const rqHydratingRef = useRef(false);
  /** 一問一答＋苦手順：設問フラットキューのインデックス */
  const [rqFlatIndex, setRqFlatIndex] = useState(0);
  /** 中断復元時に保存した設問順をそのまま再現する */
  const [rqFlatOrderOverride, setRqFlatOrderOverride] = useState(null);
  /** 完了画面の種別: mcq | rq | rqflatweak */
  const [sessionModeTag, setSessionModeTag] = useState(null);

  // localStorage: { "年度_問題番号": { attempts: N, correctCount: N } }
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("architect_quiz_history") || "{}"); }
    catch { return {}; }
  });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/api/questions`)
      .then((res) => {
        if (!res.ok) throw new Error("取得失敗");
        return res.json();
      })
      .then((data) => {
        setQuestions(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  function yearToNumber(year) {
    if (year === "令和元年") return 2019;
    const reiwa = year.match(/令和(\d+)年/);
    if (reiwa) return 2018 + parseInt(reiwa[1]);
    const heisei = year.match(/平成(\d+)年/);
    if (heisei) return 1988 + parseInt(heisei[1]);
    return 0;
  }

  function getQuestionNo(q) {
    const match = q.問題番号?.match(/No\.(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  const SUBJECT_ORDER = [
    "学科Ⅰ（計画）",
    "学科Ⅱ（環境・設備）",
    "学科Ⅲ（法規）",
    "学科Ⅳ（構造）",
    "学科Ⅴ（施工）",
  ];
  const existingSubjects = new Set(questions.map((q) => q.科目).filter(Boolean));
  const subjects = [ALL, ...SUBJECT_ORDER.filter((s) => existingSubjects.has(s))];
  const years    = [ALL, ...Array.from(new Set(questions.map((q) => q.年度).filter(Boolean)))
    .sort((a, b) => yearToNumber(b) - yearToNumber(a))];

  const filtered = questions.filter((q) => {
    const matchSubject = filterSubject === ALL || q.科目 === filterSubject;
    const matchYear    = filterYear    === ALL || q.年度 === filterYear;
    return matchSubject && matchYear;
  });

  function getCorrectRate(q) {
    const rec = history[`${q.年度}_${q.問題番号}`];
    if (!rec || !("attempts" in rec) || rec.attempts === 0) return null;
    return rec.correctCount / rec.attempts;
  }

  const defaultSort = (a, b) => {
    const yearDiff = yearToNumber(b.年度) - yearToNumber(a.年度);
    if (yearDiff !== 0) return yearDiff;
    const subjectDiff = SUBJECT_ORDER.indexOf(a.科目) - SUBJECT_ORDER.indexOf(b.科目);
    if (subjectDiff !== 0) return subjectDiff;
    return getQuestionNo(a) - getQuestionNo(b);
  };

  const orderIndices = shuffledOrder;
  const baseQuestionList = [...filtered].sort(defaultSort);
  const displayList = readQuestionFirst && weakMode
    ? baseQuestionList
    : orderIndices
      ? orderIndices.map((i) => filtered[i])
      : baseQuestionList;

  const flatFreezeKey = `${filterSubject}|${filterYear}|${filtered.map((x) => x.id).join(",")}`;
  const rqWeakFlatUnits = useMemo(() => {
    if (!readQuestionFirst || !weakMode) return [];
    const idMap = new Map(filtered.map((qq) => [qq.id, qq]));
    if (Array.isArray(rqFlatOrderOverride) && rqFlatOrderOverride.length > 0) {
      const rebuilt = rqFlatOrderOverride.map(({ id, step }) => {
        const qq = idMap.get(id);
        if (!qq || step < 0 || step > 3) return null;
        const histKey = `${qq.年度}_${qq.問題番号}`;
        const rid = rqStepRecallId(histKey, step);
        const isRecall = rqRecallSet.has(rid);
        if (!isRecall && isRqStepMastered(rqStepStats, histKey, step)) return null;
        return { q: qq, histKey, step, isRecall };
      }).filter(Boolean);
      if (rebuilt.length > 0) return rebuilt;
    }
    return buildRqStepWeakFlatOrder(
      [...filtered].sort(defaultSort),
      rqStepStats,
      defaultSort,
      rqRecallSet,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同一フィルター内では出題順を固定（rqStepStats の更新で並び替えない）
  }, [readQuestionFirst, weakMode, flatFreezeKey, rqFlatOrderOverride, rqRecallSet]);

  const orderKeyForListSig = readQuestionFirst && weakMode
    ? "rqflatweak"
    : weakMode && !readQuestionFirst
      ? "mcqweak"
      : shuffledOrder
        ? shuffledOrder.join("-")
        : "sorted";
  const listSig = `${filterSubject}|${filterYear}|${orderKeyForListSig}|${filtered.map((x) => x.id).join(",")}`;

  useEffect(() => {
    if (sessionComplete) return;
    if (!readQuestionFirst) return;
    if (readQuestionFirst && weakMode) return;
    if (rqHydratingRef.current) return;
    setRqStep(0);
    setRqMarks(emptyRqMarks());
    setRqItemExpl(null);
    setRqReview(false);
    setRqExplList(emptyRqExplList());
    setShowResult(false);
    setSelected(null);
    setAiExplanation(null);
    setLoadingAI(false);
  }, [currentIndex, readQuestionFirst, weakMode, sessionComplete]);

  useEffect(() => {
    if (!rqPendingRestore) return;
    if (questions.length === 0) return;
    const d = rqPendingRestore;
    if (d.listSig !== listSig) return;
    if (displayList.length === 0) return;
    rqHydratingRef.current = true;
    const flatLen = Array.isArray(d.flatOrder) && d.flatOrder.length > 0 ? d.flatOrder.length : 0;
    const len = flatLen > 0 ? flatLen : displayList.length;
    const padAnswers = (arr) => {
      const out = [...(arr || [])];
      while (out.length < len) out.push(null);
      return out.slice(0, len);
    };
    const maxIdx = Math.max(0, len - 1);
    const ri = Math.min(Math.max(d.rqFlatIndex ?? 0, 0), maxIdx);
    setRqFlatIndex(ri);
    if (Array.isArray(d.flatOrder) && d.flatOrder.length > 0) {
      setRqFlatOrderOverride(d.flatOrder);
      const ent = d.flatOrder[ri];
      if (ent?.id) {
        const qix = baseQuestionList.findIndex((qq) => qq.id === ent.id);
        if (qix >= 0) setCurrentIndex(qix);
      }
    } else {
      setRqFlatOrderOverride(null);
      setCurrentIndex(Math.min(Math.max(d.currentIndex ?? 0, 0), Math.max(0, displayList.length - 1)));
    }
    setRqStep(Math.min(Math.max(d.rqStep ?? 0, 0), 3));
    setRqMarks(Array.isArray(d.rqMarks) && d.rqMarks.length === 4 ? d.rqMarks : emptyRqMarks());
    setRqItemExpl(d.rqItemExpl ?? null);
    setRqReview(!!d.rqReview);
    setRqExplList(Array.isArray(d.rqExplList) && d.rqExplList.length === 4 ? d.rqExplList : emptyRqExplList());
    setShowResult(!!d.showResult);
    setSelected(d.selected === undefined || d.selected === null ? null : d.selected);
    setSessionAnswers(padAnswers(d.sessionAnswers));
    setReadQuestionFirst(true);
    clearRqInterruptStorage();
    clearRqResumeStorage();
    setRqInterruptExists(false);
    setRqPendingRestore(null);
    setAiExplanation(null);
    setLoadingAI(false);
    setTimeout(() => {
      rqHydratingRef.current = false;
    }, 0);
  }, [rqPendingRestore, listSig, questions.length, displayList.length]);

  if (loading) return <div style={{ padding: 24 }}>問題を読み込み中...</div>;
  if (error)   return <div style={{ padding: 24, color: "red" }}>エラー: {error}</div>;
  if (showDashboard) return <Dashboard onBack={() => setShowDashboard(false)} />;
  if (showMockExam)  return <MockExam  questions={questions} onBack={() => setShowMockExam(false)} />;

  function shuffle(arr) {
    const a = [...arr.keys()];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function resetSession() {
    clearRqResumeStorage();
    clearRqInterruptStorage();
    setRqInterruptExists(false);
    setRqPendingRestore(null);
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
    setSessionAnswers([]);
    setSessionComplete(false);
    setSessionModeTag(null);
    setAiExplanation(null);
    setLoadingAI(false);
    setArticleLinks(null);
    setLoadingArticles(false);
    setRqStep(0);
    setRqFlatIndex(0);
    setRqFlatOrderOverride(null);
    setRqMarks(emptyRqMarks());
    setRqItemExpl(null);
    setRqReview(false);
    setRqExplList(emptyRqExplList());
  }

  function handleShuffle() {
    setShuffledOrder(shuffle(filtered));
    setWeakMode(false);
    resetSession();
  }

  function handleResetOrder() {
    setShuffledOrder(null);
    setWeakMode(false);
    resetSession();
  }

  function handleWeakMode() {
    const weakSorted = buildWeakOrderIndices(filtered, history, defaultSort, mcqRecallSet);
    setShuffledOrder(weakSorted);
    setWeakMode(true);
    resetSession();
  }

  function handleSubjectChange(val) {
    setFilterSubject(val);
    setShuffledOrder(null);
    setWeakMode(false);
    resetSession();
  }

  function handleYearChange(val) {
    setFilterYear(val);
    setShuffledOrder(null);
    setWeakMode(false);
    resetSession();
  }

  if (filtered.length === 0) return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 24 }}>建築士試験 問題アプリ</h1>
      <FilterBar subjects={subjects} years={years} filterSubject={filterSubject} filterYear={filterYear}
        onSubjectChange={handleSubjectChange} onYearChange={handleYearChange} />
      <div style={{ padding: 24, color: "#6b7280" }}>該当する問題がありません。</div>
    </div>
  );

  // ── セッション完了画面 ──
  if (sessionComplete) {
    const isFlatWeakDone = sessionModeTag === "rqflatweak";
    const flatEntries = isFlatWeakDone ? sessionAnswers.filter(Boolean) : [];
    const correctCount = isFlatWeakDone
      ? flatEntries.filter((a) => a?.correct).length
      : sessionAnswers.filter((a) => a?.correct).length;
    const total = isFlatWeakDone ? Math.max(flatEntries.length, 1) : displayList.length;
    const yearCutoffs = (filterYear !== ALL) ? CUTOFF_SCORES[filterYear] : null;
    const cutoff = isFlatWeakDone
      ? null
      : (yearCutoffs
        ? (filterSubject !== ALL ? yearCutoffs[filterSubject] : yearCutoffs["総得点"])
        : null);
    const passed = cutoff !== null ? correctCount >= cutoff : null;

    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>建築士試験 問題アプリ</h1>
        <FilterBar subjects={subjects} years={years} filterSubject={filterSubject} filterYear={filterYear}
          onSubjectChange={handleSubjectChange} onYearChange={handleYearChange} />

        {/* スコアサマリー */}
        <div style={{
          padding: 24, borderRadius: 12, marginBottom: 24,
          background: passed === null ? "#f9fafb" : passed ? "#f0fdf4" : "#fef2f2",
          border: `1.5px solid ${passed === null ? "#e5e7eb" : passed ? "#bbf7d0" : "#fecaca"}`,
          textAlign: "center",
        }}>
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
            {filterYear !== ALL ? filterYear : "全年度"}
            {filterSubject !== ALL ? `　${filterSubject}` : "　全科目"}
          </div>
          <div style={{ fontSize: 36, fontWeight: "bold", marginBottom: 4 }}>
            {correctCount} <span style={{ fontSize: 20, color: "#6b7280" }}>/ {total}{isFlatWeakDone ? " 設問" : " 点"}</span>
          </div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: cutoff !== null ? 16 : 0 }}>
            正答率 {Math.round(correctCount / total * 100)}%
          </div>
          {isFlatWeakDone && (
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
              一問一答・苦手順モード（各記述を1設問として集計）
            </div>
          )}
          {cutoff !== null && (
            <div style={{
              display: "inline-block",
              padding: "6px 20px", borderRadius: 99,
              background: passed ? "#dcfce7" : "#fee2e2",
              fontSize: 15, fontWeight: "bold",
              color: passed ? "#15803d" : "#dc2626",
            }}>
              {passed ? `✅ 足切りクリア（基準: ${cutoff}点）` : `❌ 足切り不合格（基準: ${cutoff}点）`}
            </div>
          )}
        </div>

        {/* 問題別／設問別 正誤一覧 */}
        <h2 style={{ fontSize: 15, fontWeight: "bold", marginBottom: 10 }}>
          {isFlatWeakDone ? "設問別結果" : "問題別結果"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {isFlatWeakDone
            ? flatEntries.map((ans, i) => {
              const fq = questions.find((qq) => `${qq.年度}_${qq.問題番号}` === ans.flatHistKey);
              const correct = ans?.correct;
              const st = ans.flatStep ?? 0;
              const label = ["（１）", "（２）", "（３）", "（４）"][st] ?? "（？）";
              const subColor = fq ? (SUBJECT_COLORS[fq.科目] || { bg: "#f3f4f6", color: "#374151" }) : { bg: "#f3f4f6", color: "#374151" };
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 8,
                  background: correct ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${correct ? "#bbf7d0" : "#fecaca"}`,
                }}>
                  <span style={{ fontSize: 16, minWidth: 24 }}>{correct ? "✅" : "❌"}</span>
                  <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{label}</span>
                  {fq && filterSubject === ALL && (
                    <span style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 99,
                      background: subColor.bg, color: subColor.color, fontWeight: "bold", whiteSpace: "nowrap",
                    }}>{fq.科目}</span>
                  )}
                  <span style={{
                    fontSize: 13, flex: 1, color: "#111827",
                    overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                  }}>
                    {fq ? `${fq.年度} ${fq.問題番号} ` : ""}
                    {fq?.問題文?.slice(0, 28) ?? ans.flatHistKey}…
                  </span>
                </div>
              );
            })
            : displayList.map((q, i) => {
              const ans = sessionAnswers[i];
              const correct = ans?.correct;
              const subColor = SUBJECT_COLORS[q.科目] || { bg: "#f3f4f6", color: "#374151" };
              const rate = getCorrectRate(q);
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 8,
                  background: correct ? "#f0fdf4" : "#fef2f2",
                  border: `1px solid ${correct ? "#bbf7d0" : "#fecaca"}`,
                }}>
                  <span style={{ fontSize: 16, minWidth: 24 }}>{correct ? "✅" : "❌"}</span>
                  <span style={{ fontSize: 12, color: "#6b7280", minWidth: 72 }}>{q.問題番号}</span>
                  {filterSubject === ALL && (
                    <span style={{
                      fontSize: 11, padding: "1px 8px", borderRadius: 99,
                      background: subColor.bg, color: subColor.color, fontWeight: "bold", whiteSpace: "nowrap",
                    }}>{q.科目}</span>
                  )}
                  <span style={{
                    fontSize: 13, flex: 1, color: "#111827",
                    overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                  }}>
                    {q.問題文?.slice(0, 36)}…
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>正答: {q.正答}</span>
                  {rate !== null && (
                    <span style={{
                      fontSize: 11, whiteSpace: "nowrap",
                      color: rate < 0.5 ? "#dc2626" : rate < 0.8 ? "#d97706" : "#15803d",
                      fontWeight: "bold",
                    }}>
                      累計{Math.round(rate * 100)}%
                    </span>
                  )}
                </div>
              );
            })}
        </div>

        <button onClick={resetSession} style={{
          width: "100%", padding: "14px",
          background: "#1d4ed8", color: "#fff", border: "none",
          borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
        }}>
          もう一度チャレンジ
        </button>
      </div>
    );
  }

  // ── 通常の問題画面 ──
  const isMcqWeakEmpty = weakMode && !readQuestionFirst && displayList.length === 0;
  const isRqFlatWeakEmpty = readQuestionFirst && weakMode && rqWeakFlatUnits.length === 0;
  if (isRqFlatWeakEmpty || isMcqWeakEmpty) {
    return (
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>建築士試験 問題アプリ</h1>
        <FilterBar subjects={subjects} years={years} filterSubject={filterSubject} filterYear={filterYear}
          onSubjectChange={handleSubjectChange} onYearChange={handleYearChange} />
        <div style={{
          padding: 20, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0",
          marginBottom: 16, lineHeight: 1.65, fontSize: 14, color: "#166534",
        }}>
          <p style={{ margin: "0 0 8px", fontWeight: "bold" }}>出題対象がありません</p>
          {isMcqWeakEmpty ? (
            <p style={{ margin: 0, fontSize: 13, color: "#15803d" }}>
              {MCQ_MASTERED_MIN_ATTEMPTS}回以上回答し正答率{Math.round(MCQ_MASTERED_RATE * 100)}%以上の問題は苦手順から除外しています。
              通常の4択で{MCQ_RECALL_WRONG_STREAK}回連続で誤った問題は、苦手順に呼び戻されます。
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: "#15803d" }}>
              各記述で{RQ_MASTERED_MIN_ATTEMPTS}回以上回答し正答率{Math.round(RQ_MASTERED_RATE * 100)}%以上の設問は苦手順から除外しています。
              通常の一問一答で同じ記述を{RQ_RECALL_WRONG_STREAK}回連続で誤った場合は、苦手順に呼び戻されます。
            </p>
          )}
          {isMcqWeakEmpty && mcqRecallSet.size > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#b45309" }}>
              呼び戻し待ちの問題が {mcqRecallSet.size} 件あります。下のボタンで苦手順を再構築してください。
            </p>
          )}
          {isRqFlatWeakEmpty && rqRecallSet.size > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13, color: "#b45309" }}>
              呼び戻し待ちの設問が {rqRecallSet.size} 件あります。下のボタンで苦手順を再構築してください。
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (isRqFlatWeakEmpty) {
              setRqFlatOrderOverride(null);
              setRqFlatIndex(0);
              if (rqRecallSet.size === 0) handleResetOrder();
            } else {
              setShuffledOrder(buildWeakOrderIndices(filtered, history, defaultSort, mcqRecallSet));
              setCurrentIndex(0);
              if (mcqRecallSet.size === 0) handleResetOrder();
            }
          }}
          style={{
            width: "100%", padding: "14px", marginBottom: 8,
            background: isMcqWeakEmpty ? "#dc2626" : "#7c3aed",
            color: "#fff", border: "none",
            borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
          }}
        >
          {(isMcqWeakEmpty ? mcqRecallSet.size : rqRecallSet.size) > 0 ? "苦手順を再構築" : "苦手順を解除"}
        </button>
        {((isMcqWeakEmpty && mcqRecallSet.size > 0) || (isRqFlatWeakEmpty && rqRecallSet.size > 0)) && (
          <button type="button" onClick={handleResetOrder} style={{
            width: "100%", padding: "12px",
            background: "#fff", color: "#dc2626", border: "1.5px solid #dc2626",
            borderRadius: 8, fontSize: 14, cursor: "pointer",
          }}>
            苦手順を解除
          </button>
        )}
      </div>
    );
  }

  const isRqFlatWeak = readQuestionFirst && weakMode && rqWeakFlatUnits.length > 0;
  const qFlat = isRqFlatWeak ? rqWeakFlatUnits[Math.min(rqFlatIndex, rqWeakFlatUnits.length - 1)] : null;
  const q = qFlat ? qFlat.q : displayList[currentIndex];
  if (!q) return <div style={{ padding: 24 }}>問題を読み込み中...</div>;

  const choices = [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4];
  const officialNum = normalizeChoiceAnswer(q.正答);
  const officialSeiExpected = (i) => getOfficialSeiExpectedForQuestion(q, i);
  const stepIdx = isRqFlatWeak ? qFlat.step : rqStep;
  const rqFeedbackOk = !rqReview && rqItemExpl ? rqMarks[stepIdx] === officialSeiExpected(stepIdx) : null;
  const isCorrect = readQuestionFirst && rqReview
    ? [0, 1, 2, 3].every((i) => rqMarks[i] === officialSeiExpected(i))
    : selected !== null && String(selected + 1) === officialNum;
  const subjectColor = SUBJECT_COLORS[q.科目] || { bg: "#f3f4f6", color: "#374151" };
  const histKey = `${q.年度}_${q.問題番号}`;
  const isLastQuestion = currentIndex + 1 >= displayList.length;
  const useFlatProgress = isRqFlatWeak;
  const flatAnsSlice = useFlatProgress ? sessionAnswers.slice(0, rqWeakFlatUnits.length) : null;
  const answeredInSession = useFlatProgress
    ? flatAnsSlice.filter(Boolean).length
    : sessionAnswers.filter(Boolean).length;
  const correctInSession = useFlatProgress
    ? flatAnsSlice.filter((a) => a?.correct).length
    : sessionAnswers.filter((a) => a?.correct).length;

  function handleSelect(index) {
    if (showResult) return;
    if (readQuestionFirst && !rqReview) return;
    setSelected(index);
    setShowResult(true);
    const correct = String(index + 1) === officialNum;

    // セッション記録
    const newSessionAnswers = [...sessionAnswers];
    newSessionAnswers[currentIndex] = { correct, selected: index + 1 };
    setSessionAnswers(newSessionAnswers);
    setSessionModeTag("mcq");

    // localStorage 更新（旧形式 correct/selected/answeredAt は attempts なしなので無視）
    const prev = (history[histKey] && "attempts" in history[histKey])
      ? history[histKey]
      : { attempts: 0, correctCount: 0 };
    const updated = {
      ...history,
      [histKey]: {
        attempts: prev.attempts + 1,
        correctCount: prev.correctCount + (correct ? 1 : 0),
      },
    };
    setHistory(updated);
    localStorage.setItem("architect_quiz_history", JSON.stringify(updated));

    if (!readQuestionFirst && weakMode && mcqRecallSet.has(histKey)) {
      setMcqRecallSet((prev) => {
        const next = new Set(prev);
        next.delete(histKey);
        saveMcqRecallSet(next);
        return next;
      });
    }

    if (!readQuestionFirst && !weakMode) {
      const streaks = loadMcqWrongStreaks();
      if (correct) {
        delete streaks[histKey];
      } else {
        const n = (streaks[histKey] || 0) + 1;
        if (n >= MCQ_RECALL_WRONG_STREAK) {
          setMcqRecallSet((prev) => {
            const next = new Set(prev);
            next.add(histKey);
            saveMcqRecallSet(next);
            return next;
          });
          delete streaks[histKey];
        } else {
          streaks[histKey] = n;
        }
      }
      saveMcqWrongStreaks(streaks);
    }
  }

  function finalizeRqReview() {
    const overall = [0, 1, 2, 3].every((i) => rqMarks[i] === officialSeiExpected(i));
    const maruIdx = rqMarks.findIndex((m) => m === true);
    const maruCount = rqMarks.filter((m) => m === true).length;
    const selectedNum = maruCount === 1 ? maruIdx + 1 : 0;

    const newSessionAnswers = [...sessionAnswers];
    newSessionAnswers[currentIndex] = { correct: overall, selected: selectedNum };
    setSessionAnswers(newSessionAnswers);

    const prev = (history[histKey] && "attempts" in history[histKey])
      ? history[histKey]
      : { attempts: 0, correctCount: 0 };
    const updated = {
      ...history,
      [histKey]: {
        attempts: prev.attempts + 1,
        correctCount: prev.correctCount + (overall ? 1 : 0),
      },
    };
    setHistory(updated);
    localStorage.setItem("architect_quiz_history", JSON.stringify(updated));

    setSessionModeTag("rq");
    setRqReview(true);
    setShowResult(true);
    setSelected(maruIdx >= 0 ? maruIdx : null);
  }

  function handleRqMaru(userChoseSei) {
    if (!readQuestionFirst || rqReview || rqItemExpl !== null) return;
    const idx = stepIdx;
    if (rqMarks[idx] !== null) return;

    const nextMarks = [...rqMarks];
    nextMarks[idx] = userChoseSei;
    setRqMarks(nextMarks);

    const wasCorrect = userChoseSei === getOfficialSeiExpectedForQuestion(q, idx);
    setRqStepStats((prev) => {
      const next = { ...prev };
      const blank = () => ({ attempts: 0, correctCount: 0 });
      const row = Array.isArray(next[histKey]) && next[histKey].length === 4
        ? next[histKey].map((c) => ({ attempts: c.attempts, correctCount: c.correctCount }))
        : [blank(), blank(), blank(), blank()];
      row[idx] = {
        attempts: row[idx].attempts + 1,
        correctCount: row[idx].correctCount + (wasCorrect ? 1 : 0),
      };
      next[histKey] = row;
      try {
        localStorage.setItem(LS_RQ_STEP, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });

    if (readQuestionFirst && !weakMode) {
      const rid = rqStepRecallId(histKey, idx);
      const streaks = loadRqWrongStreaks();
      if (wasCorrect) {
        delete streaks[rid];
      } else {
        const n = (streaks[rid] || 0) + 1;
        if (n >= RQ_RECALL_WRONG_STREAK) {
          setRqRecallSet((prev) => {
            const next = new Set(prev);
            next.add(rid);
            saveRqRecallSet(next);
            return next;
          });
          delete streaks[rid];
        } else {
          streaks[rid] = n;
        }
      }
      saveRqWrongStreaks(streaks);
    }

    const extracted = extractKaisetsuForChoice(q.解説 || "", idx + 1);
    const text = extracted
      || "（Notionの解説から、この選択肢に対応する段落を自動では切り出せませんでした。解説の体裁が（１）（２）形式などの場合に認識しやすくなります。）";
    setRqItemExpl(text);
    setRqExplList((prev) => {
      const n = [...prev];
      n[idx] = text;
      return n;
    });
  }

  function handleRqAdvance() {
    if (!rqItemExpl) return;
    if (readQuestionFirst && weakMode && rqWeakFlatUnits.length > 0) {
      const si = stepIdx;
      const ok = rqMarks[si] === officialSeiExpected(si);
      const rid = rqStepRecallId(histKey, si);
      if (rqRecallSet.has(rid)) {
        setRqRecallSet((prev) => {
          const next = new Set(prev);
          next.delete(rid);
          saveRqRecallSet(next);
          return next;
        });
      }
      setSessionAnswers((prev) => {
        const n = [...prev];
        const tot = rqWeakFlatUnits.length;
        while (n.length < tot) n.push(null);
        n[rqFlatIndex] = {
          correct: ok,
          selected: si + 1,
          flatHistKey: histKey,
          flatStep: si,
        };
        return n;
      });
      setRqItemExpl(null);
      setRqMarks(emptyRqMarks());
      const nextIdx = rqFlatIndex + 1;
      if (nextIdx >= rqWeakFlatUnits.length) {
        setSessionModeTag("rqflatweak");
        setSessionComplete(true);
        return;
      }
      setRqFlatIndex(nextIdx);
      const nq = rqWeakFlatUnits[nextIdx].q;
      const nix = displayList.findIndex((qq) => qq.id === nq.id);
      if (nix >= 0) setCurrentIndex(nix);
      return;
    }
    if (rqStep < 3) {
      setRqStep((s) => s + 1);
      setRqItemExpl(null);
      return;
    }
    finalizeRqReview();
  }

  function handleNext() {
    const isLastQuestion = currentIndex + 1 >= displayList.length;
    setAiExplanation(null);
    setLoadingAI(false);
    setArticleLinks(null);
    setLoadingArticles(false);
    if (isLastQuestion) {
      clearRqResumeStorage();
      clearRqInterruptStorage();
      setRqInterruptExists(false);
      if (readQuestionFirst && rqReview) setSessionModeTag("rq");
      else if (!readQuestionFirst) setSessionModeTag("mcq");
      setSessionComplete(true);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelected(null);
      setShowResult(false);
    }
  }

  function saveRqInterrupt() {
    const isFlat = readQuestionFirst && weakMode && rqWeakFlatUnits.length > 0;
    const payload = {
      v: 1,
      listSig,
      filterSubject,
      filterYear,
      shuffledOrder,
      weakMode,
      currentIndex,
      rqFlatIndex: isFlat ? rqFlatIndex : 0,
      flatOrder: isFlat ? rqWeakFlatUnits.map((u) => ({ id: u.q.id, step: u.step })) : undefined,
      rqStep,
      rqMarks,
      rqItemExpl,
      rqReview,
      showResult,
      selected,
      sessionAnswers,
      rqExplList,
    };
    try {
      localStorage.setItem(LS_RQ_INTERRUPT, JSON.stringify(payload));
    } catch { /* ignore */ }
    clearRqResumeStorage();
    setRqInterruptExists(true);
    setReadQuestionFirst(false);
    setRqStep(0);
    setRqFlatIndex(0);
    setRqFlatOrderOverride(null);
    setRqMarks(emptyRqMarks());
    setRqItemExpl(null);
    setRqReview(false);
    setRqExplList(emptyRqExplList());
    setShowResult(false);
    setSelected(null);
    setAiExplanation(null);
    setLoadingAI(false);
  }

  function startRqRestoreFromInterrupt() {
    const d = readRqInterruptPayload();
    if (!d) return;
    setFilterSubject(d.filterSubject ?? ALL);
    setFilterYear(d.filterYear ?? ALL);
    setShuffledOrder(Array.isArray(d.shuffledOrder) ? d.shuffledOrder : null);
    setWeakMode(!!d.weakMode);
    setRqPendingRestore(d);
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>建築士試験 問題アプリ</h1>

      <FilterBar subjects={subjects} years={years} filterSubject={filterSubject} filterYear={filterYear}
        onSubjectChange={handleSubjectChange} onYearChange={handleYearChange} />

      <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={handleShuffle} style={{
          padding: "6px 14px", borderRadius: 8, border: "1.5px solid #6366f1",
          background: shuffledOrder ? "#6366f1" : "#fff",
          color: shuffledOrder ? "#fff" : "#6366f1",
          fontSize: 14, cursor: "pointer", fontWeight: "bold",
        }}>
          🔀 シャッフル{shuffledOrder ? "中" : ""}
        </button>
        <button onClick={weakMode ? handleResetOrder : handleWeakMode} style={{
          padding: "6px 14px", borderRadius: 8, border: "1.5px solid #dc2626",
          background: weakMode ? "#dc2626" : "#fff",
          color: weakMode ? "#fff" : "#dc2626",
          fontSize: 14, cursor: "pointer", fontWeight: "bold",
        }}>
          📊 苦手順{weakMode ? "（解除）" : ""}
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !readQuestionFirst;
            setReadQuestionFirst(next);
            if (next) {
              setRqFlatIndex(0);
              setRqFlatOrderOverride(null);
            } else {
              setRqStep(0);
              setRqFlatIndex(0);
              setRqFlatOrderOverride(null);
              setRqMarks(emptyRqMarks());
              setRqItemExpl(null);
              setRqReview(false);
              setRqExplList(emptyRqExplList());
            }
          }}
          style={{
            padding: "6px 14px", borderRadius: 8, border: "1.5px solid #7c3aed",
            background: readQuestionFirst ? "#7c3aed" : "#fff",
            color: readQuestionFirst ? "#fff" : "#7c3aed",
            fontSize: 14, cursor: "pointer", fontWeight: "bold",
          }}
        >
          📝 一問一答{readQuestionFirst ? "（ON）" : ""}
        </button>
        {rqInterruptExists && !rqPendingRestore && (
          <button
            type="button"
            onClick={startRqRestoreFromInterrupt}
            style={{
              padding: "6px 14px", borderRadius: 8, border: "1.5px solid #f59e0b",
              background: "#fffbeb", color: "#b45309",
              fontSize: 14, cursor: "pointer", fontWeight: "bold",
            }}
          >
            ▶ 再開
          </button>
        )}
        <button onClick={() => setShowMockExam(true)} style={{
          padding: "6px 14px", borderRadius: 8, border: "1.5px solid #059669",
          background: "#fff", color: "#059669",
          fontSize: 14, cursor: "pointer", fontWeight: "bold",
        }}>
          🎯 模擬試験
        </button>
        <button onClick={() => setShowDashboard(true)} style={{
          padding: "6px 14px", borderRadius: 8, border: "1.5px solid #0891b2",
          background: "#fff", color: "#0891b2",
          fontSize: 14, cursor: "pointer", fontWeight: "bold",
        }}>
          📈 進捗確認
        </button>
        {shuffledOrder && (
          <button onClick={handleResetOrder} style={{
            padding: "6px 14px", borderRadius: 8, border: "1.5px solid #e5e7eb",
            background: "#fff", color: "#6b7280", fontSize: 14, cursor: "pointer",
          }}>
            順番通りに戻す
          </button>
        )}
      </div>
      {weakMode && (
        <div style={{ fontSize: 12, color: "#dc2626", marginBottom: 8, padding: "6px 12px", background: "#fef2f2", borderRadius: 6 }}>
          {readQuestionFirst ? (
            <>⚠️ 一問一答×苦手順：各記述の累計正答率が低い順（未回答は末尾）。<strong>{RQ_MASTERED_MIN_ATTEMPTS}回以上・正答率{Math.round(RQ_MASTERED_RATE * 100)}%以上</strong>の設問は除外。通常一問一答で<strong>{RQ_RECALL_WRONG_STREAK}回連続誤答</strong>した設問は呼び戻し（先頭付近）で再出題します。</>
          ) : (
            <>⚠️ 4択×苦手順：累計正答率の低い順（未回答は末尾）。<strong>{MCQ_MASTERED_MIN_ATTEMPTS}回以上・正答率{Math.round(MCQ_MASTERED_RATE * 100)}%以上</strong>の問題は除外。通常4択で<strong>{MCQ_RECALL_WRONG_STREAK}回連続誤答</strong>した問題は呼び戻し（先頭付近）で再出題します。</>
          )}
        </div>
      )}
      {readQuestionFirst && (
        <div style={{
          fontSize: 12, color: "#5b21b6", marginBottom: 8, padding: "10px 12px",
          background: "#f5f3ff", borderRadius: 6, border: "1px solid #ddd6fe",
          display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12,
          justifyContent: "space-between",
        }}>
          <div style={{ flex: "1 1 240px", lineHeight: 1.55 }}>
            一問一答：各設問は選択肢の記述です。<strong>妥当な記述</strong>には「<strong>正</strong>」、<strong>不適当な記述</strong>には「<strong>誤</strong>」が正しいマークです（「正しいものを選べ」形式では正答の肢＝「正」、「誤り／不適当なものを選べ」形式では正答の肢＝「誤」として問題文から自動判定）。解答後に Notion の解説のうち<strong>該当箇所のみ</strong>を表示します。苦手順OFF時に同じ記述を<strong>{RQ_RECALL_WRONG_STREAK}回連続で誤る</strong>と、苦手順モードへ呼び戻されます。途中で離れる場合は<strong>中断</strong>を押すと、科目・年度・進行状況が保存され、<strong>再開</strong>で続きから再開できます。
          </div>
          {!sessionComplete && (
            <button
              type="button"
              onClick={() => {
                if (!confirm("一問一答を中断し、保存しますか？（ツールバーの「再開」で続きから再開できます）")) return;
                saveRqInterrupt();
              }}
              style={{
                flexShrink: 0, padding: "8px 16px", borderRadius: 8,
                border: "1.5px solid #7c3aed", background: "#fff", color: "#5b21b6",
                fontSize: 13, fontWeight: "bold", cursor: "pointer",
              }}
            >
              中断
            </button>
          )}
        </div>
      )}

      {/* セッション内進捗 */}
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
        {answeredInSession > 0 ? (
          <span>今回 {Math.round(correctInSession / answeredInSession * 100)}%・{correctInSession}/{answeredInSession}問正解</span>
        ) : (
          <span>今回の正答率 —</span>
        )}
        <button onClick={() => {
          if (!confirm("学習履歴をすべて削除しますか？")) return;
          localStorage.removeItem("architect_quiz_history");
          setHistory({});
        }} style={{
          padding: "2px 8px", borderRadius: 6, border: "1.5px solid #e5e7eb",
          background: "#fff", color: "#9ca3af", fontSize: 11, cursor: "pointer",
        }}>
          履歴クリア
        </button>
      </div>

      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        {isRqFlatWeak
          ? <>{rqFlatIndex + 1} / {rqWeakFlatUnits.length} 設問</>
          : <>{currentIndex + 1} / {displayList.length} 問</>}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {!readQuestionFirst && (
          <span style={{ fontSize: 14, color: "#6b7280" }}>{q.問題番号}</span>
        )}
        <span style={{
          fontSize: 13, padding: "2px 10px", borderRadius: 99,
          background: subjectColor.bg, color: subjectColor.color, fontWeight: "bold",
        }}>
          {q.科目}
        </span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{q.年度}</span>
        {(() => {
          const rate = getCorrectRate(q);
          if (rate === null) return <span style={{ fontSize: 12, color: "#9ca3af" }}>未回答</span>;
          const pct = Math.round(rate * 100);
          const col = rate < 0.5 ? "#dc2626" : rate < 0.8 ? "#d97706" : "#15803d";
          const bg  = rate < 0.5 ? "#fee2e2" : rate < 0.8 ? "#fef3c7" : "#dcfce7";
          return (
            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 99, background: bg, color: col, fontWeight: "bold" }}>
              累計正答率 {pct}%
            </span>
          );
        })()}
      </div>

      <div style={{
        background: "#f9fafb", borderRadius: 8, padding: "16px",
        marginBottom: 24, lineHeight: 1.7, fontSize: 15,
        textAlign: "left", color: "#111827",
      }}>
        {q.問題文}
      </div>

      {/* 一問一答：図表 → 設問ごとに正/誤 → Notion解説の該当箇所 */}
      {readQuestionFirst ? (
        <>
          <QuestionFigure url={q.図表URL} />
          {readQuestionFirst && (
            <div style={{
              fontSize: 12, color: "#6b7280", marginBottom: 12, lineHeight: 1.65,
              padding: "8px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb",
            }}>
              <span style={{ fontWeight: "bold", color: "#374151" }}>各記述の累計（解答回数・正答率）</span>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                {[0, 1, 2, 3].map((si) => {
                  const row = rqStepStats[histKey];
                  const cell = row?.[si];
                  const n = cell?.attempts ?? 0;
                  const p = n ? Math.round((cell.correctCount / n) * 100) : null;
                  const label = ["（１）", "（２）", "（３）", "（４）"][si];
                  const cur = readQuestionFirst && si === stepIdx;
                  return (
                    <span key={si} style={{ whiteSpace: "nowrap", fontWeight: cur ? "bold" : "normal", color: cur ? "#111827" : undefined }}>
                      {label}
                      {n ? ` ${n}回・${p}%` : " —"}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {!rqReview && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
                記述が妥当なら「正」、不適当なら「誤」を選んでください
              </div>
              <div style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                width: "100%", background: "#ffffff", border: "1.5px solid #e5e7eb",
                borderRadius: 8, padding: "14px 16px",
                textAlign: "left", fontSize: 14, color: "#111827", lineHeight: 1.6,
                marginBottom: 16,
              }}>
                <span>{choices[stepIdx]}</span>
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <button
                  type="button"
                  disabled={rqItemExpl !== null}
                  onClick={() => handleRqMaru(true)}
                  style={{
                    flex: 1, padding: "14px", borderRadius: 8, border: "1.5px solid #16a34a",
                    background: rqItemExpl !== null ? "#f3f4f6" : "#f0fdf4",
                    color: "#15803d", fontSize: 18, fontWeight: "bold", cursor: rqItemExpl !== null ? "not-allowed" : "pointer",
                  }}
                >
                  正
                </button>
                <button
                  type="button"
                  disabled={rqItemExpl !== null}
                  onClick={() => handleRqMaru(false)}
                  style={{
                    flex: 1, padding: "14px", borderRadius: 8, border: "1.5px solid #dc2626",
                    background: rqItemExpl !== null ? "#f3f4f6" : "#fef2f2",
                    color: "#991b1b", fontSize: 18, fontWeight: "bold", cursor: rqItemExpl !== null ? "not-allowed" : "pointer",
                  }}
                >
                  誤
                </button>
              </div>
              {rqItemExpl && (
                <div style={{ marginBottom: 12, width: "100%", alignSelf: "stretch" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontSize: 13, color: "#374151" }}>あなたの選択:</span>
                    <span style={{
                      fontSize: 14, fontWeight: "bold", padding: "4px 14px", borderRadius: 8,
                      border: "1.5px solid #6366f1", background: "#eef2ff", color: "#4338ca",
                    }}>
                      {rqMarks[stepIdx] ? "正" : "誤"}
                    </span>
                    <span style={{
                      fontSize: 28, fontWeight: "bold", lineHeight: 1,
                      color: rqFeedbackOk ? "#16a34a" : "#dc2626",
                    }}>
                      {rqFeedbackOk ? "〇" : "×"}
                    </span>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      {rqFeedbackOk ? "（正しいマークを選びました）" : "（正しいマークと異なります）"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: "bold", color: "#6b7280", marginBottom: 6, textAlign: "left" }}>
                    Notion解説・該当箇所
                  </div>
                  <div style={{
                    padding: "12px 14px", borderRadius: 8, background: "#fafafa",
                    border: "1px solid #e5e7eb", fontSize: 14, color: "#374151", lineHeight: 1.75, whiteSpace: "pre-wrap",
                    textAlign: "left", width: "100%", boxSizing: "border-box",
                  }}>
                    {renderWithBold(rqItemExpl)}
                  </div>
                </div>
              )}
              {rqItemExpl && (
                <button
                  type="button"
                  onClick={handleRqAdvance}
                  style={{
                    width: "100%", padding: "14px 16px", borderRadius: 8,
                    background: "#7c3aed", color: "#fff", border: "none",
                    fontSize: 15, fontWeight: "bold", cursor: "pointer",
                  }}
                >
                  {isRqFlatWeak
                    ? (rqFlatIndex + 1 >= rqWeakFlatUnits.length ? "結果を見る →" : "次の設問へ")
                    : (rqStep < 3 ? "次の記述へ" : "この問題の結果を見る")}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <HintBlock
            q={q}
            articleLinks={articleLinks}
            setArticleLinks={setArticleLinks}
            loadingArticles={loadingArticles}
            setLoadingArticles={setLoadingArticles}
          />
          <QuestionFigure url={q.図表URL} />
        </>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {(!readQuestionFirst || rqReview) && !isRqFlatWeak && choices.map((choice, i) => {
          const num = String(i + 1);
          const isSelected = selected === i;
          const isAnswer = num === officialNum;
          const rowJudgmentOk = readQuestionFirst && rqReview && rqMarks[i] !== null
            ? rqMarks[i] === officialSeiExpected(i)
            : null;
          let bg = "#ffffff", border = "1.5px solid #e5e7eb", color = "#111827";
          if (readQuestionFirst && rqReview) {
            if (isAnswer) {
              bg = "#dcfce7"; border = "1.5px solid #16a34a"; color = "#15803d";
            } else if (rowJudgmentOk === false) {
              bg = "#fef2f2"; border = "1.5px solid #fca5a5"; color = "#991b1b";
            }
          } else if (showResult) {
            if (isAnswer) { bg = "#dcfce7"; border = "1.5px solid #16a34a"; color = "#15803d"; }
            else if (isSelected) { bg = "#fee2e2"; border = "1.5px solid #dc2626"; color = "#991b1b"; }
          } else if (isSelected) {
            bg = "#eff6ff"; border = "1.5px solid #3b82f6";
          }
          return (
            <button key={i} type="button" onClick={() => handleSelect(i)} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              background: bg, border, borderRadius: 8,
              padding: "14px 16px", cursor: showResult || rqReview ? "default" : "pointer",
              textAlign: "left", fontSize: 14, color, lineHeight: 1.6,
            }}>
              <span style={{ fontWeight: "bold", minWidth: 20 }}>{num}.</span>
              <span style={{ flex: 1 }}>{choice}</span>
              {readQuestionFirst && rqReview && rqMarks[i] !== null && (
                <span style={{ fontSize: 12, fontWeight: "bold", color: "#6b7280", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>あなた: {rqMarks[i] ? "正" : "誤"}</span>
                  <span style={{ fontSize: 16, color: rowJudgmentOk ? "#16a34a" : "#dc2626" }}>
                    {rowJudgmentOk ? "〇" : "×"}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showResult && (!readQuestionFirst || rqReview) && !isRqFlatWeak && (
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 8,
          background: isCorrect ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${isCorrect ? "#bbf7d0" : "#fecaca"}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6, color: isCorrect ? "#15803d" : "#dc2626" }}>
            {readQuestionFirst && rqReview
              ? (isCorrect ? "✅ 全設問の判断が正しかったです" : "❌ 設問の判断に誤りがありました")
              : (isCorrect ? "✅ 正解！" : `❌ 不正解（正解は ${q.正答} ）`)}
          </div>
          {readQuestionFirst && rqReview && (
            <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 10 }}>
              正解として選ぶべき肢は <strong>{officialNum}</strong> 番のみです。各設問の解説は Notion 登録内容の該当箇所を上で表示済みです。
            </div>
          )}
          {/* この問題の累計成績（今回分を含む） */}
          {(() => {
            const rec = (history[histKey] && "attempts" in history[histKey]) ? history[histKey] : null;
            if (!rec) return null;
            return (
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
                この問題の累計：{rec.attempts}回中 {rec.correctCount}回正解（{Math.round(rec.correctCount / rec.attempts * 100)}%）
              </div>
            );
          })()}
          {!isCorrect && q.解説 && !readQuestionFirst && (
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, marginBottom: 10 }}>{q.解説}</div>
          )}
          {!readQuestionFirst && !aiExplanation && !loadingAI && (
            <button type="button" onClick={() => {
              setLoadingAI(true);
              const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";
              fetch(`${apiBase}/api/explain`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  question: q.問題文,
                  choices: [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4],
                  correct_answer: q.正答,
                  user_answer: String(selected + 1),
                  subject: q.科目,
                  year: q.年度,
                  question_no: q.問題番号,
                  static_explanation: q.解説 || "",
                  is_correct: isCorrect,
                }),
              })
                .then(r => r.json())
                .then(data => { setAiExplanation(data.explanation); setLoadingAI(false); })
                .catch(() => { setAiExplanation("解説の取得に失敗しました。"); setLoadingAI(false); });
            }} style={{
              marginTop: 8, padding: "6px 14px", borderRadius: 8,
              border: "1.5px solid #6366f1", background: "#fff",
              color: "#6366f1", fontSize: 13, fontWeight: "bold", cursor: "pointer",
            }}>
              🤖 AI解説を見る
            </button>
          )}
          {!readQuestionFirst && loadingAI && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>
              🤖 AI解説を生成中…
            </div>
          )}
          {!readQuestionFirst && aiExplanation && (
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 8,
              background: isCorrect ? "#eff6ff" : "#fffbeb",
              border: `1px solid ${isCorrect ? "#bfdbfe" : "#fde68a"}`,
              textAlign: "left",
            }}>
              <div style={{ fontSize: 12, fontWeight: "bold", color: isCorrect ? "#1d4ed8" : "#d97706", marginBottom: 6 }}>
                🤖 AI解説
              </div>
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {renderWithBold(aiExplanation)}
              </div>
            </div>
          )}
        </div>
      )}

      {showResult && (!readQuestionFirst || rqReview) && !isRqFlatWeak && (
        <button type="button" onClick={handleNext} style={{
          marginTop: 16, width: "100%", padding: "14px",
          background: isLastQuestion ? "#059669" : "#1d4ed8",
          color: "#fff", border: "none",
          borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
        }}>
          {isLastQuestion ? "結果を見る →" : "次の問題へ →"}
        </button>
      )}
    </div>
  );
}

function FilterBar({ subjects, years, filterSubject, filterYear, onSubjectChange, onYearChange }) {
  const selectStyle = {
    padding: "6px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb",
    fontSize: 14, background: "#fff", cursor: "pointer",
  };
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
      <select value={filterSubject} onChange={(e) => onSubjectChange(e.target.value)} style={selectStyle}>
        {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={filterYear} onChange={(e) => onYearChange(e.target.value)} style={selectStyle}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
