import { useState, useEffect } from "react";

const SUBJECT_COLORS = {
  "学科Ⅰ（計画）":      { bg: "#ede9fe", color: "#7c3aed" },
  "学科Ⅱ（環境・設備）": { bg: "#fce7f3", color: "#9d174d" },
  "学科Ⅲ（法規）":      { bg: "#fee2e2", color: "#991b1b" },
  "学科Ⅳ（構造）":      { bg: "#fef3c7", color: "#92400e" },
  "学科Ⅴ（施工）":      { bg: "#f3f4f6", color: "#374151" },
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
  const [correctCount, setCorrectCount] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);

  useEffect(() => {
    fetch("http://localhost:8000/api/questions")
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

  const SUBJECT_ORDER = [
    "学科Ⅰ（計画）",
    "学科Ⅱ（環境・設備）",
    "学科Ⅲ（法規）",
    "学科Ⅳ（構造）",
    "学科Ⅴ（施工）",
  ];
  const existingSubjects = new Set(questions.map((q) => q.科目).filter(Boolean));
  const subjects = [ALL, ...SUBJECT_ORDER.filter((s) => existingSubjects.has(s))];
  const years    = [ALL, ...Array.from(new Set(questions.map((q) => q.年度).filter(Boolean))).sort().reverse()];

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

  function handleShuffle() {
    setShuffledOrder(shuffle(filtered));
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
  }

  function handleResetOrder() {
    setShuffledOrder(null);
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
  }

  function handleSubjectChange(val) {
    setFilterSubject(val);
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
    setShuffledOrder(null);
  }

  function handleYearChange(val) {
    setFilterYear(val);
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
    setShuffledOrder(null);
  }

  if (filtered.length === 0) return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 24 }}>建築士試験 問題アプリ</h1>
      <FilterBar subjects={subjects} years={years} filterSubject={filterSubject} filterYear={filterYear}
        onSubjectChange={handleSubjectChange} onYearChange={handleYearChange} />
      <div style={{ padding: 24, color: "#6b7280" }}>該当する問題がありません。</div>
    </div>
  );

  const displayList = shuffledOrder ? shuffledOrder.map(i => filtered[i]) : filtered;
  const q = displayList[currentIndex];
  if (!q) return <div style={{ padding: 24 }}>問題を読み込み中...</div>;

  const choices = [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4];
  const subjectColor = SUBJECT_COLORS[q.科目] || { bg: "#f3f4f6", color: "#374151" };
  const isCorrect = selected !== null && String(selected + 1) === q.正答;

function handleSelect(index) {
  if (showResult) return;
  setSelected(index);
  setShowResult(true);
  const correct = String(index + 1) === q.正答;
  setAnsweredCount((c) => c + 1);
  if (correct) setCorrectCount((c) => c + 1);
}

  function handleNext() {
    setCurrentIndex((currentIndex + 1) % displayList.length);
    setSelected(null);
    setShowResult(false);
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 16 }}>建築士試験 問題アプリ</h1>

      <FilterBar subjects={subjects} years={years} filterSubject={filterSubject} filterYear={filterYear}
        onSubjectChange={handleSubjectChange} onYearChange={handleYearChange} />

      <div style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        <button onClick={handleShuffle} style={{
          padding: "6px 14px", borderRadius: 8, border: "1.5px solid #6366f1",
          background: shuffledOrder ? "#6366f1" : "#fff",
          color: shuffledOrder ? "#fff" : "#6366f1",
          fontSize: 14, cursor: "pointer", fontWeight: "bold",
        }}>
          🔀 シャッフル{shuffledOrder ? "中" : ""}
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

      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
  {answeredCount > 0 ? (
    <>
      <span>
        正答率 {Math.round(correctCount / answeredCount * 100)}%・{correctCount}/{answeredCount}問
      </span>
      <button onClick={() => { setCorrectCount(0); setAnsweredCount(0); }} style={{
        padding: "2px 10px", borderRadius: 6, border: "1.5px solid #e5e7eb",
        background: "#fff", color: "#6b7280", fontSize: 12, cursor: "pointer",
      }}>
        リセット
      </button>
    </>
  ) : (
    <span>正答率 —</span>
  )}
</div>

      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        {currentIndex + 1} / {displayList.length} 問
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, color: "#6b7280" }}>{q.問題番号}</span>
        <span style={{
          fontSize: 13, padding: "2px 10px", borderRadius: 99,
          background: subjectColor.bg, color: subjectColor.color, fontWeight: "bold"
        }}>
          {q.科目}
        </span>
        <span style={{ fontSize: 13, color: "#6b7280" }}>{q.年度}</span>
      </div>

      <div style={{
        background: "#f9fafb", borderRadius: 8, padding: "16px",
        marginBottom: 24, lineHeight: 1.7, fontSize: 15
      }}>
        {q.問題文}
      </div>

      {q.図表URL && (
  <div style={{ marginBottom: 24, textAlign: "center" }}>
    <img
      src={q.図表URL}
      alt="図表"
      style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid #e5e7eb" }}
    />
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
          <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 8, color: isCorrect ? "#15803d" : "#dc2626" }}>
            {isCorrect ? "✅ 正解！" : `❌ 不正解（正解は ${q.正答} ）`}
          </div>
          {!isCorrect && q.解説 && (
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>{q.解説}</div>
          )}
        </div>
      )}

      {showResult && (
        <button onClick={handleNext} style={{
          marginTop: 16, width: "100%", padding: "14px",
          background: "#1d4ed8", color: "#fff", border: "none",
          borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
        }}>
          次の問題へ →
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