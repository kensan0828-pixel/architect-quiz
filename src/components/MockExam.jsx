import { useState, useEffect, useRef } from "react";

function renderWithBold(text) {
  if (!text) return null;
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

// ── 定数 ────────────────────────────────────────────────────────────────────

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

const SUBJECT_COLORS = {
  "学科Ⅰ（計画）":      { bg: "#ede9fe", color: "#7c3aed" },
  "学科Ⅱ（環境・設備）": { bg: "#fce7f3", color: "#9d174d" },
  "学科Ⅲ（法規）":      { bg: "#fee2e2", color: "#991b1b" },
  "学科Ⅳ（構造）":      { bg: "#fef3c7", color: "#92400e" },
  "学科Ⅴ（施工）":      { bg: "#f3f4f6", color: "#374151" },
};

const SUBJECT_ORDER = [
  "学科Ⅰ（計画）",
  "学科Ⅱ（環境・設備）",
  "学科Ⅲ（法規）",
  "学科Ⅳ（構造）",
  "学科Ⅴ（施工）",
];

const TIME_PRESETS = [
  { label: "60分",    minutes: 60  },
  { label: "90分",    minutes: 90  },
  { label: "120分",   minutes: 120 },
  { label: "150分",   minutes: 150 },
  { label: "180分",   minutes: 180 },
  { label: "制限なし", minutes: 0  },
];

const HONBAN_SECTIONS = [
  { label: "午前①　学科Ⅰ・Ⅱ", subjects: ["学科Ⅰ（計画）", "学科Ⅱ（環境・設備）"], minutes: 120, color: "#7c3aed" },
  { label: "午前②　学科Ⅲ",     subjects: ["学科Ⅲ（法規）"],                          minutes: 105, color: "#991b1b" },
  { label: "午後　学科Ⅳ・Ⅴ",   subjects: ["学科Ⅳ（構造）", "学科Ⅴ（施工）"],         minutes: 180, color: "#92400e" },
];

function yearToNumber(year) {
  if (year === "令和元年") return 2019;
  const reiwa = year.match(/令和(\d+)年/);
  if (reiwa) return 2018 + parseInt(reiwa[1]);
  const heisei = year.match(/平成(\d+)年/);
  if (heisei) return 1988 + parseInt(heisei[1]);
  return 0;
}
function getQuestionNo(q) {
  const m = q.問題番号?.match(/No\.(\d+)/);
  return m ? parseInt(m[1]) : 0;
}
function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function MockExam({ questions, onBack }) {
  const [phase, setPhase]               = useState("setup");
  const [examYear, setExamYear]         = useState("");
  const [examMode, setExamMode]         = useState("honban");
  const [timeLimit, setTimeLimit]       = useState(120);
  const [examQuestions, setExamQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected]         = useState(null);
  const [showResult, setShowResult]     = useState(false);
  const [answers, setAnswers]           = useState([]);
  const [sectionDefs, setSectionDefs]   = useState([]);
  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [timeLeft, setTimeLeft]         = useState(0);
  const [usedTime, setUsedTime]         = useState(0);
  const [timeUpSignal, setTimeUpSignal] = useState(0);
  const [aiExplanation, setAiExplanation] = useState(null);
  const [loadingAI, setLoadingAI]         = useState(false);
  const startRef = useRef(null);
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("architect_quiz_history") || "{}"); }
    catch { return {}; }
  });

  const years = [...new Set(questions.map(q => q.年度).filter(Boolean))]
    .sort((a,b) => yearToNumber(b) - yearToNumber(a));

  useEffect(() => {
    if (years.length > 0 && !examYear) setExamYear(years[0]);
  }, [years.length]);

  useEffect(() => {
    if (phase !== "exam" || timeLeft <= 0) return;
    const id = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(id); setTimeUpSignal(s => s + 1); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase, currentSectionIdx]);

  useEffect(() => {
    if (timeUpSignal === 0) return;
    if (examMode === "honban" && currentSectionIdx < sectionDefs.length - 1) {
      setPhase("transition");
    } else {
      setUsedTime(Math.floor((Date.now() - startRef.current) / 1000));
      setPhase("result");
    }
  }, [timeUpSignal]); // eslint-disable-line

  function startExam() {
    const qs = questions
      .filter(q => q.年度 === examYear)
      .sort((a,b) => {
        const sa = SUBJECT_ORDER.indexOf(a.科目);
        const sb = SUBJECT_ORDER.indexOf(b.科目);
        if (sa !== sb) return sa - sb;
        return getQuestionNo(a) - getQuestionNo(b);
      });
    if (qs.length === 0) return;
    setExamQuestions(qs);
    setAnswers(new Array(qs.length).fill(null));
    setCurrentIndex(0);
    setSelected(null);
    setShowResult(false);
    startRef.current = Date.now();

    if (examMode === "honban") {
      const defs = HONBAN_SECTIONS.map(sec => {
        const indices = qs.reduce((acc,q,i) => { if (sec.subjects.includes(q.科目)) acc.push(i); return acc; }, []);
        return { ...sec, startIdx: indices[0] ?? 0, endIdx: indices[indices.length-1] ?? 0, questionCount: indices.length };
      }).filter(s => s.questionCount > 0);
      setSectionDefs(defs);
      setCurrentSectionIdx(0);
      setTimeLeft(defs[0]?.minutes * 60 ?? 0);
    } else {
      setSectionDefs([]);
      setCurrentSectionIdx(0);
      setTimeLeft(timeLimit > 0 ? timeLimit * 60 : 0);
    }
    setPhase("exam");
  }

  function startNextSection() {
    const nextIdx = currentSectionIdx + 1;
    const nextSec = sectionDefs[nextIdx];
    setCurrentSectionIdx(nextIdx);
    setCurrentIndex(nextSec.startIdx);
    setSelected(null);
    setShowResult(false);
    setAiExplanation(null);
    setLoadingAI(false);
    setTimeLeft(nextSec.minutes * 60);
    setPhase("exam");
  }

  function finishExam() {
    setUsedTime(Math.floor((Date.now() - startRef.current) / 1000));
    setPhase("result");
  }

  function handleSelect(idx) {
    if (showResult) return;
    setSelected(idx);
    setShowResult(true);
    const q = examQuestions[currentIndex];
    const correct = String(idx + 1) === q.正答;
    setAnswers(prev => { const next=[...prev]; next[currentIndex]={chosen:idx,correct}; return next; });
    const histKey = `${q.年度}_${q.問題番号}`;
    setHistory(prev => {
      const prevRec = (prev[histKey] && "attempts" in prev[histKey]) ? prev[histKey] : {attempts:0,correctCount:0};
      const updated = { ...prev, [histKey]: { attempts: prevRec.attempts+1, correctCount: prevRec.correctCount+(correct?1:0) } };
      localStorage.setItem("architect_quiz_history", JSON.stringify(updated));
      return updated;
    });
    if (!correct) {
      setAiExplanation(null);
      setLoadingAI(true);
      fetch(`${apiBase}/api/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.問題文,
          choices: [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4],
          correct_answer: q.正答,
          user_answer: String(idx + 1),
          subject: q.科目,
          year: q.年度,
          question_no: q.問題番号,
          static_explanation: q.解説 || "",
          is_correct: false,
        }),
      })
        .then(r => r.json())
        .then(data => { setAiExplanation(data.explanation); setLoadingAI(false); })
        .catch(() => { setAiExplanation("解説の取得に失敗しました。"); setLoadingAI(false); });
    }
  }

  function handleNext() {
    setAiExplanation(null);
    setLoadingAI(false);
    if (examMode === "honban" && sectionDefs.length > 0) {
      const sec = sectionDefs[currentSectionIdx];
      if (currentIndex >= sec.endIdx) {
        if (currentSectionIdx + 1 >= sectionDefs.length) finishExam();
        else setPhase("transition");
        return;
      }
    } else if (currentIndex + 1 >= examQuestions.length) {
      finishExam(); return;
    }
    setCurrentIndex(c => c + 1);
    setSelected(null);
    setShowResult(false);
  }

  // ── SETUP ──────────────────────────────────────────────────────────────────
  if (phase === "setup") {
    const qCount = questions.filter(q => q.年度 === examYear).length;
    return (
      <div style={{maxWidth:680,margin:"0 auto",padding:"24px 16px",fontFamily:"sans-serif"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <button onClick={onBack} style={ghostBtn}>← 戻る</button>
          <h1 style={{fontSize:20,fontWeight:"bold",margin:0}}>🎯 模擬試験モード</h1>
        </div>

        <div style={sectionBox}>
          <p style={sectionLabel}>① 年度を選択</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {years.map(y => (
              <button key={y} onClick={() => setExamYear(y)} style={{
                padding:"8px 14px",borderRadius:8,fontSize:14,cursor:"pointer",
                border: examYear===y ? "2px solid #6366f1" : "1.5px solid #e5e7eb",
                background: examYear===y ? "#ede9fe" : "#fff",
                color: examYear===y ? "#7c3aed" : "#374151",
                fontWeight: examYear===y ? "bold" : "normal",
              }}>{y}</button>
            ))}
          </div>
        </div>

        <div style={sectionBox}>
          <p style={sectionLabel}>② 出題形式</p>
          <div style={{display:"flex",gap:10}}>
            {[
              {key:"honban",label:"🏛 本番形式",desc:"実際の試験と同じ3セクション構成"},
              {key:"custom",label:"⚙️ カスタム",desc:"制限時間を自由に設定"},
            ].map(m => (
              <button key={m.key} onClick={() => setExamMode(m.key)} style={{
                flex:1,padding:"12px 14px",borderRadius:10,cursor:"pointer",textAlign:"left",
                border: examMode===m.key ? "2px solid #059669" : "1.5px solid #e5e7eb",
                background: examMode===m.key ? "#ecfdf5" : "#fff",
              }}>
                <div style={{fontSize:14,fontWeight:"bold",color:examMode===m.key?"#059669":"#374151",marginBottom:4}}>{m.label}</div>
                <div style={{fontSize:12,color:"#6b7280"}}>{m.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {examMode === "honban" && (
          <div style={{...sectionBox,background:"#f0fdf4",borderColor:"#bbf7d0"}}>
            <p style={{...sectionLabel,color:"#15803d"}}>本番スケジュール</p>
            {HONBAN_SECTIONS.map((sec,i) => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:i<HONBAN_SECTIONS.length-1?"1px solid #d1fae5":"none"}}>
                <span style={{fontSize:12,padding:"2px 10px",borderRadius:99,background:"#dcfce7",color:"#15803d",fontWeight:"bold",whiteSpace:"nowrap"}}>{sec.minutes}分</span>
                <span style={{fontSize:14,color:"#111827",fontWeight:"bold"}}>{sec.label}</span>
                <span style={{fontSize:12,color:"#6b7280",marginLeft:"auto"}}>{sec.subjects.join("・")}</span>
              </div>
            ))}
            <div style={{marginTop:10,fontSize:12,color:"#6b7280"}}>合計 {HONBAN_SECTIONS.reduce((s,sec)=>s+sec.minutes,0)}分 ／ セクション間に「次へ」ボタンで進みます</div>
          </div>
        )}

        {examMode === "custom" && (
          <div style={sectionBox}>
            <p style={sectionLabel}>③ 制限時間</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {TIME_PRESETS.map(t => (
                <button key={t.minutes} onClick={() => setTimeLimit(t.minutes)} style={{
                  padding:"8px 14px",borderRadius:8,fontSize:14,cursor:"pointer",
                  border: timeLimit===t.minutes ? "2px solid #0891b2" : "1.5px solid #e5e7eb",
                  background: timeLimit===t.minutes ? "#ecfeff" : "#fff",
                  color: timeLimit===t.minutes ? "#0e7490" : "#374151",
                  fontWeight: timeLimit===t.minutes ? "bold" : "normal",
                }}>{t.label}</button>
              ))}
            </div>
          </div>
        )}

        {examYear && (
          <div style={{padding:"14px 20px",borderRadius:10,background:"#f9fafb",border:"1.5px solid #e5e7eb",marginBottom:24,display:"flex",gap:24,flexWrap:"wrap"}}>
            <InfoItem label="年度" value={examYear} />
            <InfoItem label="出題数" value={`${qCount}問`} />
            <InfoItem label="制限時間" value={examMode==="honban" ? `${HONBAN_SECTIONS.reduce((s,sec)=>s+sec.minutes,0)}分（3区分）` : timeLimit>0?`${timeLimit}分`:"なし"} />
          </div>
        )}

        <button onClick={startExam} disabled={!examYear||qCount===0} style={{
          width:"100%",padding:"16px",
          background:examYear&&qCount>0?"#1d4ed8":"#d1d5db",
          color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:"bold",cursor:"pointer",
        }}>試験開始 →</button>
      </div>
    );
  }

  // ── EXAM ───────────────────────────────────────────────────────────────────
  if (phase === "exam") {
    const q = examQuestions[currentIndex];
    if (!q) return null;
    const currentSec = examMode==="honban" ? sectionDefs[currentSectionIdx] : null;
    const isLastQuestion = currentSec ? currentIndex>=currentSec.endIdx : currentIndex+1>=examQuestions.length;
    const isCorrect = selected!==null && String(selected+1)===q.正答;
    const choices = [q.選択肢1,q.選択肢2,q.選択肢3,q.選択肢4];
    const subjectColor = SUBJECT_COLORS[q.科目]||{bg:"#f3f4f6",color:"#374151"};
    const answeredCount = answers.filter(Boolean).length;
    const timerRed = timeLeft>0 && timeLeft<300;
    const secProgress = currentSec ? `${currentIndex-currentSec.startIdx+1}/${currentSec.questionCount}問` : `${currentIndex+1}/${examQuestions.length}問`;

    return (
      <div style={{maxWidth:680,margin:"0 auto",padding:"16px",fontFamily:"sans-serif"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:"#f9fafb",border:"1px solid #e5e7eb",borderRadius:10,marginBottom:10,gap:8,flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:"bold",color:currentSec?currentSec.color:"#374151"}}>
            {currentSec ? `■ ${currentSec.label}` : `🎯 ${examYear}`}
          </span>
          <span style={{fontSize:13,color:"#6b7280"}}>{secProgress}</span>
          {timeLeft>0 && (
            <span style={{fontSize:20,fontWeight:"bold",color:timerRed?"#dc2626":"#111827",background:timerRed?"#fee2e2":"transparent",padding:timerRed?"2px 8px":0,borderRadius:6,fontVariantNumeric:"tabular-nums"}}>
              ⏱ {formatTime(timeLeft)}
            </span>
          )}
          <button onClick={() => { if (window.confirm("試験を終了して結果を表示しますか？")) finishExam(); }}
            style={{fontSize:12,padding:"4px 10px",borderRadius:6,border:"1.5px solid #e5e7eb",background:"#fff",cursor:"pointer",color:"#6b7280"}}>終了</button>
        </div>

        <div style={{height:4,background:"#e5e7eb",borderRadius:2,marginBottom:14}}>
          <div style={{height:"100%",width:`${Math.round((answeredCount/examQuestions.length)*100)}%`,background:"#6366f1",borderRadius:2,transition:"width 0.3s"}} />
        </div>

        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{fontSize:14,color:"#6b7280"}}>{q.問題番号}</span>
          <span style={{fontSize:13,padding:"2px 10px",borderRadius:99,background:subjectColor.bg,color:subjectColor.color,fontWeight:"bold"}}>{q.科目}</span>
          <span style={{fontSize:13,color:"#6b7280"}}>{q.年度}</span>
        </div>

        <div style={{background:"#f9fafb",borderRadius:8,padding:16,marginBottom:20,lineHeight:1.7,fontSize:15,color:"#111827"}}>{q.問題文}</div>

        {q.図表URL && (
          <div style={{marginBottom:20,textAlign:"center"}}>
            <img src={q.図表URL} alt="図表" style={{maxWidth:"100%",borderRadius:8,border:"1px solid #e5e7eb"}} />
          </div>
        )}

        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {choices.map((choice,i) => {
            const num=String(i+1); const isSelected=selected===i; const isAnswer=num===q.正答;
            let bg="#fff",border="1.5px solid #e5e7eb",color="#111827";
            if (showResult) {
              if (isAnswer) {bg="#dcfce7";border="1.5px solid #16a34a";color="#15803d";}
              else if (isSelected) {bg="#fee2e2";border="1.5px solid #dc2626";color="#991b1b";}
            } else if (isSelected) {bg="#eff6ff";border="1.5px solid #3b82f6";}
            return (
              <button key={i} onClick={() => handleSelect(i)} style={{display:"flex",alignItems:"flex-start",gap:12,background:bg,border,borderRadius:8,padding:"14px 16px",cursor:showResult?"default":"pointer",textAlign:"left",fontSize:14,color,lineHeight:1.6}}>
                <span style={{fontWeight:"bold",minWidth:20}}>{num}.</span>
                <span>{choice}</span>
              </button>
            );
          })}
        </div>

        {showResult && (
          <div style={{padding:"14px 16px",borderRadius:8,marginBottom:12,background:isCorrect?"#f0fdf4":"#fef2f2",border:`1px solid ${isCorrect?"#bbf7d0":"#fecaca"}`}}>
            <div style={{fontSize:16,fontWeight:"bold",color:isCorrect?"#15803d":"#dc2626"}}>{isCorrect?"✅ 正解！":`❌ 不正解（正解は ${q.正答}）`}</div>
            {!isCorrect && loadingAI && (
              <div style={{fontSize:13,color:"#6b7280",marginTop:8}}>🤖 AI解説を生成中...</div>
            )}
            {!isCorrect && aiExplanation && (
              <div style={{marginTop:10,padding:"12px 14px",borderRadius:8,background:"#fffbeb",border:"1px solid #fde68a"}}>
                <div style={{fontSize:12,fontWeight:"bold",color:"#d97706",marginBottom:6}}>🤖 AI解説</div>
                <div style={{fontSize:14,color:"#374151",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{renderWithBold(aiExplanation)}</div>
              </div>
            )}
          </div>
        )}

        {showResult && (
          <button onClick={handleNext} style={{
            width:"100%",padding:14,color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:"bold",cursor:"pointer",
            background: isLastQuestion ? (currentSec&&currentSectionIdx<sectionDefs.length-1?"#d97706":"#059669") : "#1d4ed8",
          }}>
            {isLastQuestion
              ? (currentSec&&currentSectionIdx<sectionDefs.length-1 ? `次のセクションへ（${sectionDefs[currentSectionIdx+1]?.label}）→` : "結果を見る →")
              : "次の問題へ →"}
          </button>
        )}
      </div>
    );
  }

  // ── TRANSITION ─────────────────────────────────────────────────────────────
  if (phase === "transition") {
    const sec = sectionDefs[currentSectionIdx];
    const nextSec = sectionDefs[currentSectionIdx + 1];

    const secItems = examQuestions
      .map((q, i) => ({ q, i, ans: answers[i] }))
      .filter(({ q }) => sec.subjects.includes(q.科目));

    const secCorrect = secItems.filter(({ ans }) => ans?.correct).length;
    const secTotal = sec.questionCount;
    const secRate = secTotal > 0 ? Math.round(secCorrect / secTotal * 100) : 0;

    const cutoffs = CUTOFF_SCORES[examYear] ?? null;
    const subjectResults = sec.subjects.map(subj => {
      const subjItems = secItems.filter(({ q }) => q.科目 === subj);
      const total = subjItems.length;
      const correct = subjItems.filter(({ ans }) => ans?.correct).length;
      const cutoff = cutoffs?.[subj] ?? null;
      const passed = cutoff !== null ? correct >= cutoff : null;
      const color = SUBJECT_COLORS[subj] ?? { bg: "#f3f4f6", color: "#374151" };
      return { subj, total, correct, cutoff, passed, color };
    });
    const allPassed = subjectResults.filter(r => r.cutoff !== null).every(r => r.passed);

    return (
      <div style={{maxWidth:680,margin:"0 auto",padding:"24px 16px",fontFamily:"sans-serif"}}>
        <h1 style={{fontSize:20,fontWeight:"bold",marginBottom:20}}>
          <span style={{color:sec.color}}>■</span> {sec.label}　結果
        </h1>

        <div style={{padding:24,borderRadius:12,marginBottom:20,background:allPassed?"#f0fdf4":"#fef2f2",border:`1.5px solid ${allPassed?"#bbf7d0":"#fecaca"}`,textAlign:"center"}}>
          <div style={{fontSize:38,fontWeight:"bold",marginBottom:4}}>
            {secCorrect} <span style={{fontSize:18,color:"#6b7280"}}>/ {secTotal} 点</span>
          </div>
          <div style={{fontSize:14,color:"#6b7280",marginBottom:10}}>正答率 {secRate}%</div>
          <div style={{display:"inline-block",padding:"6px 20px",borderRadius:99,background:allPassed?"#dcfce7":"#fee2e2",fontSize:14,fontWeight:"bold",color:allPassed?"#15803d":"#dc2626"}}>
            {allPassed ? "✅ 足切りクリア" : "❌ 足切り未達"}
          </div>
        </div>

        <h2 style={{fontSize:14,fontWeight:"bold",marginBottom:10}}>科目別結果</h2>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {subjectResults.map(r => (
            <div key={r.subj} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:10,background:r.passed===false?"#fef2f2":r.passed===true?"#f0fdf4":"#f9fafb",border:`1.5px solid ${r.passed===false?"#fecaca":r.passed===true?"#bbf7d0":"#e5e7eb"}`}}>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:r.color.bg,color:r.color.color,fontWeight:"bold",whiteSpace:"nowrap",flexShrink:0}}>{r.subj}</span>
              <div style={{flex:1}}>
                <div style={{height:8,background:"#e5e7eb",borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${r.total>0?Math.round((r.correct/r.total)*100):0}%`,background:r.passed===false?"#ef4444":r.passed===true?"#22c55e":"#6366f1",borderRadius:4}} />
                </div>
              </div>
              <span style={{fontSize:15,fontWeight:"bold",minWidth:60,textAlign:"right"}}>{r.correct} / {r.total}</span>
              {r.cutoff !== null
                ? <span style={{fontSize:12,fontWeight:"bold",whiteSpace:"nowrap",color:r.passed?"#15803d":"#dc2626"}}>{r.passed?"✅":"❌"} 基準{r.cutoff}点</span>
                : <span style={{fontSize:12,color:"#9ca3af",whiteSpace:"nowrap"}}>判定なし</span>}
            </div>
          ))}
        </div>

        <h2 style={{fontSize:14,fontWeight:"bold",marginBottom:10}}>問題別結果</h2>
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:24}}>
          {secItems.map(({ q, i, ans }) => {
            const correct = ans?.correct;
            const unanswered = ans === null;
            const subColor = SUBJECT_COLORS[q.科目] || { bg: "#f3f4f6", color: "#374151" };
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,background:unanswered?"#fffbeb":correct?"#f0fdf4":"#fef2f2",border:`1px solid ${unanswered?"#fde68a":correct?"#bbf7d0":"#fecaca"}`}}>
                <span style={{fontSize:15,minWidth:22}}>{unanswered?"—":correct?"✅":"❌"}</span>
                <span style={{fontSize:12,color:"#6b7280",minWidth:64}}>{q.問題番号}</span>
                <span style={{fontSize:11,padding:"1px 7px",borderRadius:99,background:subColor.bg,color:subColor.color,fontWeight:"bold",whiteSpace:"nowrap"}}>{q.科目?.replace("学科","")}</span>
                <span style={{fontSize:13,flex:1,color:"#111827",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{q.問題文?.slice(0,40)}…</span>
                <span style={{fontSize:12,color:"#6b7280",whiteSpace:"nowrap"}}>正答: {q.正答}</span>
              </div>
            );
          })}
        </div>

        <div style={{padding:"16px 20px",borderRadius:10,background:"#fffbeb",border:"1.5px solid #fde68a",marginBottom:16,textAlign:"left"}}>
          <p style={{fontSize:12,color:"#92400e",fontWeight:"bold",margin:"0 0 4px"}}>次のセクション</p>
          <p style={{fontSize:16,fontWeight:"bold",margin:"0 0 2px",color:"#111827"}}>{nextSec.label}</p>
          <p style={{fontSize:13,color:"#6b7280",margin:0}}>{nextSec.subjects.join("・")}　制限時間 {nextSec.minutes}分</p>
        </div>
        <button onClick={startNextSection} style={{width:"100%",padding:"16px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:10,fontSize:16,fontWeight:"bold",cursor:"pointer"}}>
          {nextSec.label} を開始する →
        </button>
      </div>
    );
  }

  // ── RESULT ─────────────────────────────────────────────────────────────────
  if (phase === "result") {
    const totalCorrect  = answers.filter(a=>a?.correct).length;
    const totalAnswered = answers.filter(Boolean).length;
    const totalQuestions= examQuestions.length;
    const cutoffs       = CUTOFF_SCORES[examYear]??null;
    const totalCutoff   = cutoffs?.["総得点"]??null;
    const totalPassed   = totalCutoff!==null ? totalCorrect>=totalCutoff : null;

    const subjectResults = SUBJECT_ORDER.map(subj => {
      const indices = examQuestions.map((q,i)=>q.科目===subj?i:-1).filter(i=>i!==-1);
      if (indices.length===0) return null;
      const total=indices.length; const correct=indices.filter(i=>answers[i]?.correct).length;
      const cutoff=cutoffs?.[subj]??null; const passed=cutoff!==null?correct>=cutoff:null;
      const color=SUBJECT_COLORS[subj]??{bg:"#f3f4f6",color:"#374151"};
      return {subj,total,correct,cutoff,passed,color};
    }).filter(Boolean);

    const allSubjectsPassed = subjectResults.filter(r=>r.cutoff!==null).every(r=>r.passed);
    const overallPassed = allSubjectsPassed && totalPassed!==false;

    return (
      <div style={{maxWidth:680,margin:"0 auto",padding:"24px 16px",fontFamily:"sans-serif"}}>
        <h1 style={{fontSize:20,fontWeight:"bold",marginBottom:20}}>🎯 模擬試験 結果</h1>

        <div style={{padding:24,borderRadius:12,marginBottom:24,background:overallPassed?"#f0fdf4":"#fef2f2",border:`1.5px solid ${overallPassed?"#bbf7d0":"#fecaca"}`,textAlign:"center"}}>
          <div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>{examYear}　{examMode==="honban"?"本番形式":"カスタム"}</div>
          <div style={{fontSize:42,fontWeight:"bold",marginBottom:4}}>{totalCorrect} <span style={{fontSize:20,color:"#6b7280"}}>/ {totalQuestions} 点</span></div>
          <div style={{fontSize:14,color:"#6b7280",marginBottom:12}}>正答率 {totalQuestions>0?Math.round(totalCorrect/totalQuestions*100):0}%　回答済 {totalAnswered}/{totalQuestions}問{usedTime>0&&`　使用時間 ${formatTime(usedTime)}`}</div>
          <div style={{display:"inline-block",padding:"8px 24px",borderRadius:99,background:overallPassed?"#dcfce7":"#fee2e2",fontSize:16,fontWeight:"bold",color:overallPassed?"#15803d":"#dc2626"}}>
            {overallPassed?"✅ 全科目足切りクリア":"❌ 足切り不合格あり"}
          </div>
        </div>

        <h2 style={{fontSize:15,fontWeight:"bold",marginBottom:12}}>科目別結果</h2>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
          {subjectResults.map(r => (
            <div key={r.subj} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:10,background:r.passed===false?"#fef2f2":r.passed===true?"#f0fdf4":"#f9fafb",border:`1.5px solid ${r.passed===false?"#fecaca":r.passed===true?"#bbf7d0":"#e5e7eb"}`}}>
              <span style={{fontSize:11,padding:"2px 8px",borderRadius:99,background:r.color.bg,color:r.color.color,fontWeight:"bold",whiteSpace:"nowrap",flexShrink:0}}>{r.subj}</span>
              <div style={{flex:1}}>
                <div style={{height:8,background:"#e5e7eb",borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.round((r.correct/r.total)*100)}%`,background:r.passed===false?"#ef4444":r.passed===true?"#22c55e":"#6366f1",borderRadius:4}} />
                </div>
              </div>
              <span style={{fontSize:15,fontWeight:"bold",minWidth:60,textAlign:"right"}}>{r.correct} / {r.total}</span>
              {r.cutoff!==null
                ? <span style={{fontSize:12,fontWeight:"bold",whiteSpace:"nowrap",color:r.passed?"#15803d":"#dc2626"}}>{r.passed?"✅":"❌"} 基準{r.cutoff}点</span>
                : <span style={{fontSize:12,color:"#9ca3af",whiteSpace:"nowrap"}}>判定なし</span>}
            </div>
          ))}
        </div>

        <h2 style={{fontSize:15,fontWeight:"bold",marginBottom:10}}>問題別結果</h2>
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:28}}>
          {examQuestions.map((q,i) => {
            const ans=answers[i]; const correct=ans?.correct; const unanswered=ans===null;
            const subColor=SUBJECT_COLORS[q.科目]||{bg:"#f3f4f6",color:"#374151"};
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderRadius:8,background:unanswered?"#fffbeb":correct?"#f0fdf4":"#fef2f2",border:`1px solid ${unanswered?"#fde68a":correct?"#bbf7d0":"#fecaca"}`}}>
                <span style={{fontSize:15,minWidth:22}}>{unanswered?"—":correct?"✅":"❌"}</span>
                <span style={{fontSize:12,color:"#6b7280",minWidth:64}}>{q.問題番号}</span>
                <span style={{fontSize:11,padding:"1px 7px",borderRadius:99,background:subColor.bg,color:subColor.color,fontWeight:"bold",whiteSpace:"nowrap"}}>{q.科目?.replace("学科","")}</span>
                <span style={{fontSize:13,flex:1,color:"#111827",overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{q.問題文?.slice(0,40)}…</span>
                <span style={{fontSize:12,color:"#6b7280",whiteSpace:"nowrap"}}>正答: {q.正答}</span>
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={() => setPhase("setup")} style={{flex:1,padding:14,background:"#fff",color:"#1d4ed8",border:"1.5px solid #1d4ed8",borderRadius:8,fontSize:15,fontWeight:"bold",cursor:"pointer"}}>もう一度チャレンジ</button>
          <button onClick={onBack} style={{flex:1,padding:14,background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:"bold",cursor:"pointer"}}>問題に戻る</button>
        </div>
      </div>
    );
  }

  return null;
}

function InfoItem({ label, value }) {
  return (
    <div>
      <p style={{fontSize:11,color:"#9ca3af",margin:"0 0 2px"}}>{label}</p>
      <p style={{fontSize:15,fontWeight:"bold",margin:0,color:"#111827"}}>{value}</p>
    </div>
  );
}
const ghostBtn = {padding:"6px 14px",borderRadius:8,fontSize:13,cursor:"pointer",background:"#fff",color:"#374151",border:"1.5px solid #e5e7eb"};
const sectionBox = {padding:"16px 20px",borderRadius:10,background:"#f9fafb",border:"1.5px solid #e5e7eb",marginBottom:16};
const sectionLabel = {fontSize:13,fontWeight:"bold",color:"#374151",margin:"0 0 12px"};
