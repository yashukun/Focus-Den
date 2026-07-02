/**
 * Lightweight, dependency-free analytics charts drawn as plain SVG.
 * Each chart has a fixed viewBox and scales to its container width.
 */

import {
  BREAK_LABELS,
  BREAK_LIMITS,
  dayIndexMonSat,
  formatHM,
  HOUR_MS,
  weekKey,
  type BreakKey,
  type HistoryEntry,
} from '../core';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];
const BREAK_ORDER: BreakKey[] = ['break1', 'break2', 'lunch'];

/** Local epoch (noon) for a YYYY-MM-DD string — avoids TZ edge cases. */
function tsOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0).getTime();
}

// ── Worked hours this week (bars, Mon–Sat) ──────────────────────────────────

export function WeekHoursChart({
  history,
  weekKey: wk,
}: {
  history: HistoryEntry[];
  weekKey: string;
}) {
  const buckets = [0, 0, 0, 0, 0, 0];
  for (const h of history) {
    const ts = tsOf(h.date);
    if (weekKey(ts) !== wk) continue;
    const idx = dayIndexMonSat(ts);
    if (idx >= 0) buckets[idx] += h.worked;
  }
  const maxMs = Math.max(4 * HOUR_MS, ...buckets);
  const W = 240;
  const top = 10;
  const plotH = 86;
  const base = top + plotH;
  const slot = W / 6;
  const barW = 22;

  return (
    <svg className="chart" viewBox={`0 0 ${W} 120`} role="img"
      aria-label="Worked hours per day this week">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--line)" strokeWidth="1" />
      {buckets.map((ms, i) => {
        const h = maxMs > 0 ? (ms / maxMs) * plotH : 0;
        const x = slot * i + (slot - barW) / 2;
        const hours = ms / HOUR_MS;
        return (
          <g key={i}>
            {ms > 0 && (
              <rect x={x} y={base - h} width={barW} height={h} rx="2" fill="var(--work)" />
            )}
            <text x={x + barW / 2} y={base - h - 3} className="chart-val" textAnchor="middle">
              {ms > 0 ? `${hours.toFixed(hours < 10 ? 1 : 0)}h` : ''}
            </text>
            <text x={x + barW / 2} y={base + 13} className="chart-axis" textAnchor="middle">
              {DAY_LABELS[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Cumulative points earned over time (line) ───────────────────────────────

export function PointsChart({ history }: { history: HistoryEntry[] }) {
  const W = 240;
  const top = 12;
  const plotH = 84;
  const base = top + plotH;
  const left = 6;
  const right = W - 6;

  let cum = 0;
  const points = history.map((h) => (cum += h.points));
  const max = Math.max(1, ...points);
  const n = points.length;

  const xAt = (i: number) => (n <= 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
  const yAt = (v: number) => base - (v / max) * plotH;

  const poly = points.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  const area = `${left},${base} ${poly} ${xAt(n - 1)},${base}`;

  return (
    <svg className="chart" viewBox={`0 0 ${W} 120`} role="img"
      aria-label="Cumulative points earned over time">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--line)" strokeWidth="1" />
      {n > 1 && <polygon points={area} fill="var(--points)" opacity="0.14" />}
      {n > 1 && (
        <polyline points={poly} fill="none" stroke="var(--points)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {points.map((v, i) => (
        <circle key={i} cx={xAt(i)} cy={yAt(v)} r={n === 1 ? 4 : 2.5} fill="var(--points)" />
      ))}
      <text x={left} y={top - 2} className="chart-axis">0</text>
      <text x={xAt(n - 1)} y={yAt(points[n - 1]) - 5} className="chart-val" textAnchor="end">
        {points[n - 1]}
      </text>
    </svg>
  );
}

// ── Break-budget usage for the most recent shift (bars vs limit) ────────────

export function BreakUsageChart({ history }: { history: HistoryEntry[] }) {
  const last = history[history.length - 1];
  const byKey = last?.breaksByKey;

  if (!byKey) {
    return <p className="muted">Per-break data starts from your next shift.</p>;
  }

  const W = 240;
  const rowH = 26;
  const labelW = 52;
  const trackX = labelW + 4;
  const trackW = W - trackX - 36;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${rowH * 3 + 6}`} role="img"
      aria-label="Break budget used in the last shift">
      {BREAK_ORDER.map((k, i) => {
        const used = byKey[k];
        const limit = BREAK_LIMITS[k];
        const frac = Math.min(1, used / limit);
        const y = i * rowH + 6;
        const over = used > limit;
        return (
          <g key={k}>
            <text x="0" y={y + 11} className="chart-axis">{BREAK_LABELS[k]}</text>
            <rect x={trackX} y={y} width={trackW} height="14" rx="3" fill="var(--surface-2)"
              stroke="var(--line)" />
            <rect x={trackX} y={y} width={trackW * frac} height="14" rx="3"
              fill={over ? 'var(--offline)' : 'var(--break)'} />
            <text x={trackX + trackW + 4} y={y + 11} className="chart-val">
              {formatHM(used)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
