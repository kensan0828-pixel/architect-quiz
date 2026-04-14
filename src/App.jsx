import { useState } from "react";

const SAMPLE_QUESTIONS = [
  {
    問題番号: "No.1",
    科目: "学科Ⅳ（構造）",
    年度: "令和6年",
    問題文: "木造軸組工法における耐力壁の壁倍率に関する記述として、最も不適当なものはどれか。",
    選択肢1: "筋かいを入れた軸組の壁倍率は、筋かいの断面寸法によって異なる。",
    選択肢2: "構造用合板を張った軸組の壁倍率は、釘の種類や間隔によって異なる。",
    選択肢3: "壁倍率が高いほど、水平力に対する耐力が大きい。",
    選択肢4: "壁倍率の上限は5と定められており、異なる仕様を併用する場合も同様である。",
    正答: "4",
    解説: "壁倍率の上限は5ですが、異なる仕様を併用する場合は個別の壁倍率の合計が上限となり、最大5を超えないようにします。",
  },
  {
    問題番号: "No.2",
    科目: "学科Ⅳ（構造）",
    年度: "令和6年",
    問題文: "鉄筋コンクリート構造に関する記述として、最も不適当なものはどれか。",
    選択肢1: "コンクリートのヤング係数は、コンクリートの強度が高いほど大きくなる。",
    選択肢2: "普通コンクリートのポアソン比は、一般に1/6程度である。",
    選択肢3: "鉄筋のヤング係数は、コンクリートのヤング係数より大きい。",
    選択肢4: "コンクリートは引張力に弱く、圧縮力に強い材料である。",
    正答: "2",
    解説: "普通コンクリートのポアソン比は一般に1/5（0.2）程度です。1/6ではありません。",
  },
];

const SUBJECT_COLORS = {
  "学科Ⅰ（計画）":      { bg: "#ede9fe", color: "#7c3aed" },
  "学科Ⅱ（環境・設備）": { bg: "#fce7f3", color: "#9d174d" },
  "学科Ⅲ（法規）":      { bg: "#fee2e2", color: "#991b1b" },
  "学科Ⅳ（構造）":      { bg: "#fef3c7", color: "#92400e" },
  "学科Ⅴ（施工）":      { bg: "#f3f4f6", color: "#374151" },
};

export default function App() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showResult, setShowResult] = useState(false);

  const q = SAMPLE_QUESTIONS[currentIndex];
  const choices = [q.選択肢1, q.選択肢2, q.選択肢3, q.選択肢4];
  const subjectColor = SUBJECT_COLORS[q.科目] || { bg: "#f3f4f6", color: "#374151" };

  function handleSelect(index) {
    if (showResult) return;
    setSelected(index);
    setShowResult(true);
  }

  function handleNext() {
    setCurrentIndex((currentIndex + 1) % SAMPLE_QUESTIONS.length);
    setSelected(null);
    setShowResult(false);
  }

  const isCorrect = selected !== null && String(selected + 1) === q.正答;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 24 }}>
        建築士試験 問題アプリ
      </h1>

      {/* 問題ヘッダー */}
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

      {/* 問題文 */}
      <div style={{
        background: "#f9fafb", borderRadius: 8, padding: "16px",
        marginBottom: 24, lineHeight: 1.7, fontSize: 15
      }}>
        {q.問題文}
      </div>

      {/* 選択肢 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {choices.map((choice, i) => {
          const num = String(i + 1);
          const isSelected = selected === i;
          const isAnswer = num === q.正答;

          let bg = "#ffffff";
          let border = "1.5px solid #e5e7eb";
          let color = "#111827";

          if (showResult) {
            if (isAnswer) { bg = "#dcfce7"; border = "1.5px solid #16a34a"; color = "#15803d"; }
            else if (isSelected && !isAnswer) { bg = "#fee2e2"; border = "1.5px solid #dc2626"; color = "#991b1b"; }
          } else if (isSelected) {
            bg = "#eff6ff"; border = "1.5px solid #3b82f6";
          }

          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              style={{
                display: "flex", alignItems: "flex-start", gap: 12,
                background: bg, border, borderRadius: 8,
                padding: "14px 16px", cursor: showResult ? "default" : "pointer",
                textAlign: "left", fontSize: 14, color, lineHeight: 1.6,
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontWeight: "bold", minWidth: 20 }}>{num}.</span>
              <span>{choice}</span>
            </button>
          );
        })}
      </div>

      {/* 正誤フィードバック */}
      {showResult && (
        <div style={{
          marginTop: 24, padding: 16, borderRadius: 8,
          background: isCorrect ? "#f0fdf4" : "#fef2f2",
          border: `1px solid ${isCorrect ? "#bbf7d0" : "#fecaca"}`,
        }}>
          <div style={{
            fontSize: 18, fontWeight: "bold", marginBottom: 8,
            color: isCorrect ? "#15803d" : "#dc2626"
          }}>
            {isCorrect ? "✅ 正解！" : `❌ 不正解（正解は ${q.正答} ）`}
          </div>
          {!isCorrect && (
            <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.7 }}>
              {q.解説}
            </div>
          )}
        </div>
      )}

      {/* 次の問題ボタン */}
      {showResult && (
        <button
          onClick={handleNext}
          style={{
            marginTop: 16, width: "100%", padding: "14px",
            background: "#1d4ed8", color: "#fff", border: "none",
            borderRadius: 8, fontSize: 15, fontWeight: "bold", cursor: "pointer",
          }}
        >
          次の問題へ →
        </button>
      )}
    </div>
  );
}