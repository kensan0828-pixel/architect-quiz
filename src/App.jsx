import { useState, useEffect } from "react";
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

  if (loading) return <div style={{ padding: 24 }}>問題を読み込み中...</div>;
  if (error)   return <div style={{ padding: 24, color: "red" }}>エラー: {error}</div>;
  if (showDashboard) return <Dashboard onBack={() => setShowDashboard(false)} />;
  if (showMockExam)  return <MockExam  questions={questions} onBack={() => setShowMockExam(false)} />;

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

  function shuffle(arr) {
    const a = [...arr.keys()];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function resetSession() {
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
    setSessionAnswers([]);
    setSessionComplete(false);
    setAiExplanation(null);
    setLoadingAI(false);
    setArticleLinks(null);
    setLoadingArticles(false);
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
    // 苦手順ソートをその時点で確定し shuffledOrder に固定する
    // → historyが更新されても displayList が再ソートされない
    const weakSorted = [...filtered]
      .map((q, i) => ({ q, i }))
      .sort(({ q: a }, { q: b }) => {
        const getRate = q => {
          const rec = history[`${q.年度}_${q.問題番号}`];
          if (!rec || !("attempts" in rec) || rec.attempts === 0) return null;
          return rec.correctCount / rec.attempts;
        };
        const ra = getRate(a);
        const rb = getRate(b);
        if (ra === null && rb === null) return 0;
        if (ra === null) return 1;
        if (rb === null) return -1;
        if (ra !== rb) return ra - rb;
        return 0;
      })
      .map(({ i }) => i);
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

  // 正答率を返すヘルパー（未回答は null）
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

  const displayList = shuffledOrder
    ? shuffledOrder.map(i => filtered[i])
    : [...filtered].sort(defaultSort);

  // ── セッション完了画面 ──
  if (sessionComplete) {
    const correctCount = sessionAnswers.filter(a => a?.correct).length;
    const total = displayList.length;
    const yearCutoffs = (filterYear !== ALL) ? CUTOFF_SCORES[filterYear] : null;
    // 特定科目：その科目の足切り / 全科目×特定年度：総得点足切り / 年度「すべて」：判定なし
    const cutoff = yearCutoffs
      ? (filterSubject !== ALL ? yearCutoffs[filterSubject] : yearCutoffs["総得点"])
      : null;
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
            {correctCount} <span style={{ fontSize: 20, color: "#6b7280" }}>/ {total} 点</span>
          </div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: cutoff !== null ? 16 : 0 }}>
            正答率 {Math.round(correctCount / total * 100)}%
          </div>
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

        {/* 問題別正誤一覧 */}
        <h2 style={{ fontSize: 15, fontWeight: "bold", marginBottom: 10 }}>問題別結果</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {displayList.map((q, i) => {
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
  const q = displayList[currentIndex];
  if (!q) return <div style={{ padding: 24 }}>問題を読み込み中...</div>;

  const choices = [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4];
  const subjectColor = SUBJECT_COLORS[q.科目] || { bg: "#f3f4f6", color: "#374151" };
  const isCorrect = selected !== null && String(selected + 1) === q.正答;
  const histKey = `${q.年度}_${q.問題番号}`;
  const isLastQuestion = currentIndex + 1 >= displayList.length;
  const answeredInSession = sessionAnswers.filter(Boolean).length;
  const correctInSession  = sessionAnswers.filter(a => a?.correct).length;

  function handleSelect(index) {
    if (showResult) return;
    setSelected(index);
    setShowResult(true);
    const correct = String(index + 1) === q.正答;

    // セッション記録
    const newSessionAnswers = [...sessionAnswers];
    newSessionAnswers[currentIndex] = { correct, selected: index + 1 };
    setSessionAnswers(newSessionAnswers);

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
  }

  function handleNext() {
    const isLastQuestion = currentIndex + 1 >= displayList.length;
    setAiExplanation(null);
    setLoadingAI(false);
    setArticleLinks(null);
    setLoadingArticles(false);
    if (isLastQuestion) {
      setSessionComplete(true);
    } else {
      setCurrentIndex(currentIndex + 1);
      setSelected(null);
      setShowResult(false);
    }
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
          ⚠️ 累計正答率の低い順に出題しています。未回答の問題は末尾に表示されます。
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
        {currentIndex + 1} / {displayList.length} 問
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: "#6b7280" }}>{q.問題番号}</span>
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

      {/* ヒントボタン（全科目・回答前から表示） */}
      {(() => {
        const HINT_CONFIG = {
          "学科Ⅰ（計画）":      { icon: "💡", label: "用語・基準を確認",   color: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", heading: "💡 用語・基準（ヒント）" },
          "学科Ⅱ（環境・設備）": { icon: "💡", label: "公式・基準を確認",   color: "#9d174d", bg: "#fdf4ff", border: "#f5d0fe", heading: "💡 公式・基準（ヒント）" },
          "学科Ⅲ（法規）":      { icon: "📖", label: "関連条文を見る",     color: "#0891b2", bg: "#f0f9ff", border: "#bae6fd", heading: "📖 関連条文（ヒント）" },
          "学科Ⅳ（構造）":      { icon: "💡", label: "公式・理論を確認",   color: "#92400e", bg: "#fffbeb", border: "#fde68a", heading: "💡 公式・理論（ヒント）" },
          "学科Ⅴ（施工）":      { icon: "💡", label: "工法・基準を確認",   color: "#374151", bg: "#f9fafb", border: "#e5e7eb", heading: "💡 工法・基準（ヒント）" },
        };
        const cfg = HINT_CONFIG[q.科目];
        if (!cfg) return null;
        return (
          <div style={{ marginBottom: 16 }}>
            {!articleLinks && !loadingArticles && (
              <button onClick={() => {
                // Notionに手動登録ヒントがあればAPIを呼ばず即表示（ハイブリッド案3）
                if (q.ヒント && q.ヒント.trim() !== "") {
                  try {
                    setArticleLinks(JSON.parse(q.ヒント));
                  } catch {
                    setArticleLinks([]);
                  }
                  return;
                }
                // 未登録の場合はAI生成にフォールバック
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
                <button onClick={() => setArticleLinks(null)} style={{
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
      })()}

      {q.図表URL && (
        <div style={{ marginBottom: 24, textAlign: "center" }}>
          <img src={q.図表URL} alt="図表"
            style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }} />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {choices.map((choice, i) => {
          const num = String(i + 1);
          const isSelected = selected === i;
          const isAnswer = num === q.正答;
          let bg = "#ffffff", border = "1.5px solid #e5e7eb", color = "#111827";
          if (showResult) {
            if (isAnswer) { bg = "#dcfce7"; border = "1.5px solid #16a34a"; color = "#15803d"; }
            else if (isSelected) { bg = "#fee2e2"; border = "1.5px solid #dc2626"; color = "#991b1b"; }
          } else if (isSelected) {
            bg = "#eff6ff"; border = "1.5px solid #3b82f6";
          }
          return (
            <button key={i} onClick={() => handleSelect(i)} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              background: bg, border, borderRadius: 8,
              padding: "14px 16px", cursor: showResult ? "default" : "pointer",
              textAlign: "left", fontSize: 14, color, lineHeight: 1.6,
            }}>
              <span style={{ fontWeight: "bold", minWidth: 20 }}>{num}.</span>
              <span>{choice}</span>
            </button>
          );
        })}
      </div>

      {showResult && (
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 8,
          background: isCorrect ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${isCorrect ? "#bbf7d0" : "#fecaca"}`,
        }}>
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6, color: isCorrect ? "#15803d" : "#dc2626" }}>
            {isCorrect ? "✅ 正解！" : `❌ 不正解（正解は ${q.正答} ）`}
          </div>
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
          {!isCorrect && q.解説 && (
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7, marginBottom: 10 }}>{q.解説}</div>
          )}
          {/* AI解説ボタン */}
          {!aiExplanation && !loadingAI && (
            <button onClick={() => {
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
          {loadingAI && (
            <div style={{ marginTop: 8, fontSize: 13, color: "#6b7280" }}>🤖 AI解説を生成中...</div>
          )}
          {aiExplanation && (
            <div style={{
              marginTop: 12, padding: "12px 14px", borderRadius: 8,
              background: isCorrect ? "#eff6ff" : "#fffbeb",
              border: `1px solid ${isCorrect ? "#bfdbfe" : "#fde68a"}`,
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

      {showResult && (
        <button onClick={handleNext} style={{
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
