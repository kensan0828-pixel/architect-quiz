import { useEffect, useRef } from 'react';

// 科目定義（問題番号レンジで判定）
const SUBJECTS = [
  { key: '計画', label: 'Ⅰ計画', fullLabel: '学科Ⅰ（計画）',     min: 1,  max: 20,  color: '#818cf8' },
  { key: '環境', label: 'Ⅱ環境', fullLabel: '学科Ⅱ（環境・設備）', min: 21, max: 30,  color: '#22d3ee' },
  { key: '法規', label: 'Ⅲ法規', fullLabel: '学科Ⅲ（法規）',     min: 31, max: 50,  color: '#fbbf24' },
  { key: '構造', label: 'Ⅳ構造', fullLabel: '学科Ⅳ（構造）',     min: 51, max: 75,  color: '#34d399' },
  { key: '施工', label: 'Ⅴ施工', fullLabel: '学科Ⅴ（施工）',     min: 76, max: 100, color: '#fb7185' },
];

const YEARS       = ['平成28年','平成29年','平成30年','令和元年','令和2年','令和3年','令和4年','令和5年','令和6年','令和7年'];
const YEARS_SHORT = ['H28','H29','H30','R1','R2','R3','R4','R5','R6','R7'];

// ── helpers ──────────────────────────────────────────────────────────────────

function getSubjectForNumber(num) {
  return SUBJECTS.find(s => num >= s.min && num <= s.max);
}

function parseHistory() {
  try {
    const raw = localStorage.getItem('architect_quiz_history');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function computeStats(history) {
  const entries = [];
  Object.entries(history).forEach(([key, val]) => {
    const match = key.match(/^(.+)_No\.(\d+)$/);
    if (!match) return;
    const year = match[1];
    const num  = parseInt(match[2], 10);
    const subj = getSubjectForNumber(num);
    if (!subj) return;
    entries.push({ year, num, subject: subj.key, attempts: val.attempts, correct: val.correctCount });
  });

  // 総計
  const totalAtt  = entries.reduce((s, e) => s + e.attempts, 0);
  const totalCor  = entries.reduce((s, e) => s + e.correct,  0);
  const overallRate = totalAtt > 0 ? Math.round(totalCor / totalAtt * 100) : null;
  const uniqueQ   = new Set(entries.map(e => `${e.year}_${e.num}`)).size;

  // 科目別
  const subjectStats = SUBJECTS.map(s => {
    const rel = entries.filter(e => e.subject === s.key);
    const att = rel.reduce((sum, e) => sum + e.attempts, 0);
    const cor = rel.reduce((sum, e) => sum + e.correct,  0);
    return { ...s, att, cor, rate: att > 0 ? Math.round(cor / att * 100) : null };
  });

  const best = [...subjectStats].filter(s => s.rate !== null).sort((a, b) => b.rate - a.rate)[0] ?? null;

  // 年度×科目ヒートマップ
  const heatmap = YEARS.map((year, yi) => ({
    yearShort: YEARS_SHORT[yi],
    subjects: SUBJECTS.map(s => {
      const rel = entries.filter(e => e.year === year && e.subject === s.key);
      const att = rel.reduce((sum, e) => sum + e.attempts, 0);
      const cor = rel.reduce((sum, e) => sum + e.correct,  0);
      return { key: s.key, rate: att > 0 ? Math.round(cor / att * 100) : null, att };
    }),
  }));

  // 年度別推移
  const yearTrend = YEARS.map((year, yi) => {
    const rel = entries.filter(e => e.year === year);
    const att = rel.reduce((sum, e) => sum + e.attempts, 0);
    const cor = rel.reduce((sum, e) => sum + e.correct,  0);
    return { label: YEARS_SHORT[yi], rate: att > 0 ? Math.round(cor / att * 100) : null };
  });

  return { uniqueQ, totalAtt, totalCor, overallRate, subjectStats, best, heatmap, yearTrend };
}

// ── heat cell colors ──────────────────────────────────────────────────────────

function heatStyle(rate) {
  if (rate === null) return { background: 'var(--color-bg-empty)', color: '#64748b', text: '—' };
  if (rate >= 80)   return { background: '#065f46', color: '#a7f3d0', text: `${rate}%` };
  if (rate >= 60)   return { background: '#1e3a5f', color: '#93c5fd', text: `${rate}%` };
  if (rate >= 40)   return { background: '#78350f', color: '#fcd34d', text: `${rate}%` };
  return               { background: '#7f1d1d', color: '#fca5a5', text: `${rate}%` };
}

// ── inline styles (no Tailwind required) ────────────────────────────────────

const S = {
  wrap: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '24px 16px',
    fontFamily: 'inherit',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 500,
    margin: 0,
    color: 'inherit',
  },
  backBtn: {
    fontSize: 13,
    cursor: 'pointer',
    background: 'none',
    border: '1px solid rgba(100,116,139,0.4)',
    borderRadius: 8,
    padding: '6px 14px',
    color: 'inherit',
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 10,
    marginBottom: 28,
  },
  card: {
    background: 'rgba(100,116,139,0.08)',
    borderRadius: 10,
    padding: '14px 16px',
  },
  cardLabel: { fontSize: 12, color: '#64748b', margin: '0 0 6px' },
  cardValue: { fontSize: 26, fontWeight: 500, margin: 0 },
  cardSub:   { fontSize: 12, color: '#94a3b8', margin: '4px 0 0' },
  section:   { marginBottom: 28 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 500,
    color: '#94a3b8',
    margin: '0 0 12px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  barRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  barLabel:  { fontSize: 13, color: '#94a3b8', width: 72, flexShrink: 0 },
  barTrack:  { flex: 1, background: 'rgba(100,116,139,0.12)', borderRadius: 3, height: 18, overflow: 'hidden' },
  barPct:    { fontSize: 12, color: '#94a3b8', width: 40, textAlign: 'right', flexShrink: 0 },
  barCount:  { fontSize: 11, color: '#64748b', width: 56, textAlign: 'right', flexShrink: 0 },
  heatScroll: { overflowX: 'auto' },
  heatTable: { borderCollapse: 'collapse', width: '100%' },
  heatTh:    { fontSize: 11, fontWeight: 400, color: '#64748b', padding: '2px 4px', textAlign: 'center' },
  heatYearTh: { fontSize: 11, fontWeight: 400, color: '#64748b', padding: '2px 6px', textAlign: 'left', whiteSpace: 'nowrap' },
  heatTd:    { padding: '2px 3px' },
  heatCell:  { borderRadius: 4, height: 28, width: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500 },
  noData:    { textAlign: 'center', padding: '48px 0', color: '#64748b', fontSize: 14 },
  legend:    { display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#94a3b8' },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
};

// ── Trend SVG ────────────────────────────────────────────────────────────────

function TrendSVG({ data }) {
  const W = 640, H = 100, PAD_L = 36, PAD_R = 16, PAD_T = 8, PAD_B = 24;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const valid = data.filter(d => d.rate !== null);
  if (valid.length === 0) {
    return <p style={S.noData}>学習データがありません</p>;
  }

  const step = plotW / (data.length - 1);
  const pts  = data.map((d, i) => ({
    x: PAD_L + i * step,
    y: d.rate !== null ? PAD_T + plotH - (d.rate / 100) * plotH : null,
    rate: d.rate,
    label: d.label,
  }));

  // connected segments (skip nulls)
  const segments = [];
  let seg = [];
  pts.forEach(p => {
    if (p.y !== null) { seg.push(p); }
    else if (seg.length) { segments.push(seg); seg = []; }
  });
  if (seg.length) segments.push(seg);

  function pathD(seg) {
    return seg.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  }

  const yTicks = [0, 25, 50, 75, 100];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      {/* grid */}
      {yTicks.map(v => (
        <g key={v}>
          <line
            x1={PAD_L} x2={W - PAD_R}
            y1={PAD_T + plotH - (v / 100) * plotH}
            y2={PAD_T + plotH - (v / 100) * plotH}
            stroke="rgba(148,163,184,0.15)" strokeWidth={1}
          />
          <text x={PAD_L - 4} y={PAD_T + plotH - (v / 100) * plotH + 4}
            fontSize={10} fill="#64748b" textAnchor="end">{v}%</text>
        </g>
      ))}

      {/* fill area */}
      {segments.map((seg, si) => (
        <path key={si}
          d={`${pathD(seg)} L ${seg[seg.length-1].x.toFixed(1)} ${(PAD_T+plotH).toFixed(1)} L ${seg[0].x.toFixed(1)} ${(PAD_T+plotH).toFixed(1)} Z`}
          fill="rgba(129,140,248,0.08)"
        />
      ))}

      {/* lines */}
      {segments.map((seg, si) => (
        <path key={si} d={pathD(seg)} fill="none" stroke="#818cf8" strokeWidth={2} strokeLinejoin="round" />
      ))}

      {/* dots + x-labels */}
      {pts.map((p, i) => (
        <g key={i}>
          {p.y !== null && (
            <circle cx={p.x} cy={p.y} r={4} fill="#818cf8" />
          )}
          <text x={p.x} y={H - 4} fontSize={10} fill="#64748b" textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Dashboard({ onBack }) {
  const history = parseHistory();
  const hasData = Object.keys(history).length > 0;

  if (!hasData) {
    return (
      <div style={S.wrap}>
        <div style={S.header}>
          <h2 style={S.title}>学習進捗ダッシュボード</h2>
          <button style={S.backBtn} onClick={onBack}>← 戻る</button>
        </div>
        <p style={S.noData}>まだ学習履歴がありません。<br />問題を解いてから確認してください。</p>
      </div>
    );
  }

  const { uniqueQ, overallRate, best, subjectStats, heatmap, yearTrend } = computeStats(history);

  return (
    <div style={S.wrap}>

      {/* ヘッダー */}
      <div style={S.header}>
        <h2 style={S.title}>学習進捗ダッシュボード</h2>
        <button style={S.backBtn} onClick={onBack}>← 戻る</button>
      </div>

      {/* サマリーカード */}
      <div style={S.cards}>
        <div style={S.card}>
          <p style={S.cardLabel}>総学習問題数</p>
          <p style={S.cardValue}>{uniqueQ.toLocaleString()}</p>
          <p style={S.cardSub}>問（回答済み）</p>
        </div>
        <div style={S.card}>
          <p style={S.cardLabel}>総合正答率</p>
          <p style={S.cardValue}>{overallRate !== null ? `${overallRate}%` : '—'}</p>
          <p style={S.cardSub}>全科目・全年度</p>
        </div>
        <div style={S.card}>
          <p style={S.cardLabel}>最も得意な科目</p>
          <p style={{ ...S.cardValue, fontSize: 15, lineHeight: 1.4, paddingTop: 4 }}>
            {best ? best.fullLabel : '—'}
          </p>
          <p style={S.cardSub}>{best ? `正答率 ${best.rate}%` : ''}</p>
        </div>
      </div>

      {/* 科目別正答率バー */}
      <div style={S.section}>
        <p style={S.sectionTitle}>科目別正答率</p>
        {subjectStats.map(s => (
          <div key={s.key} style={S.barRow}>
            <span style={S.barLabel}>{s.label}</span>
            <div style={S.barTrack}>
              <div style={{
                height: '100%',
                width: `${s.rate ?? 0}%`,
                background: s.color,
                borderRadius: 3,
                transition: 'width 0.6s ease',
              }} />
            </div>
            <span style={S.barPct}>{s.rate !== null ? `${s.rate}%` : '—'}</span>
            <span style={S.barCount}>{s.att > 0 ? `${s.cor}/${s.att}` : '未回答'}</span>
          </div>
        ))}
      </div>

      {/* ヒートマップ */}
      <div style={S.section}>
        <p style={S.sectionTitle}>年度 × 科目 ヒートマップ</p>
        <div style={S.heatScroll}>
          <table style={S.heatTable}>
            <thead>
              <tr>
                <th style={S.heatYearTh}>年度</th>
                {SUBJECTS.map(s => (
                  <th key={s.key} style={S.heatTh}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap.map(row => (
                <tr key={row.yearShort}>
                  <th style={S.heatYearTh}>{row.yearShort}</th>
                  {row.subjects.map(cell => {
                    const hs = heatStyle(cell.rate);
                    return (
                      <td key={cell.key} style={S.heatTd}>
                        <div style={{ ...S.heatCell, background: hs.background, color: hs.color }}>
                          {hs.text}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* 凡例 */}
        <div style={S.legend}>
          {[
            { bg: '#065f46', color: '#a7f3d0', label: '80%以上' },
            { bg: '#1e3a5f', color: '#93c5fd', label: '60〜79%' },
            { bg: '#78350f', color: '#fcd34d', label: '40〜59%' },
            { bg: '#7f1d1d', color: '#fca5a5', label: '39%以下' },
          ].map(l => (
            <span key={l.label} style={S.legendItem}>
              <span style={{ ...S.legendDot, background: l.bg }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* 年度別推移 */}
      <div style={S.section}>
        <p style={S.sectionTitle}>年度別正答率の推移</p>
        <TrendSVG data={yearTrend} />
      </div>

    </div>
  );
}
