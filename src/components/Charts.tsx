/**
 * Lightweight, dependency-free analytics for the Journal, drawn as plain SVG
 * (bars, line) and HTML meters (breathers). Sizing rule learned the hard way:
 * every SVG scales its viewBox with the container, so charts are width-capped
 * in CSS (`.jr-chart`) — never let one stretch across a full card.
 *
 * Marks follow the dataviz house style: one hue per chart (the app's semantic
 * tokens), thin marks, a single recessive baseline, selective direct labels
 * (peak + latest — everything else answers on hover via <title>), and one-shot
 * entrance animations (CSS keyframes, frozen by the reduced-motion block).
 */

import {
  BREAK_LABELS,
  BREAK_LIMITS,
  dayIndexMonSat,
  epochOf,
  formatHM,
  HOUR_MS,
  weekKey,
  type BreakKey,
  type HistoryEntry,
} from '../core';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BREAK_ORDER: BreakKey[] = ['break1', 'break2', 'lunch'];

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
    const ts = epochOf(h.date);
    if (weekKey(ts) !== wk) continue;
    const idx = dayIndexMonSat(ts);
    if (idx >= 0) buckets[idx] += h.worked;
  }
  const maxMs = Math.max(4 * HOUR_MS, ...buckets);
  const peak = Math.max(...buckets);
  const W = 240;
  const top = 14;
  const plotH = 82;
  const base = top + plotH;
  const slot = W / 6;
  const barW = 18;

  return (
    <svg className="jr-chart" viewBox={`0 0 ${W} 118`} role="img"
      aria-label="Hours in flow per day this week">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--line)" strokeWidth="1" />
      {buckets.map((ms, i) => {
        const h = maxMs > 0 ? (ms / maxMs) * plotH : 0;
        const x = slot * i + (slot - barW) / 2;
        const hours = ms / HOUR_MS;
        const isPeak = ms > 0 && ms === peak;
        return (
          <g key={i} className="jr-bar-slot">
            <title>{`${DAY_NAMES[i]} — ${ms > 0 ? formatHM(ms) : 'no shift'}`}</title>
            {ms > 0 && (
              <rect
                className="jr-bar"
                style={{ animationDelay: `${i * 60}ms` }}
                x={x} y={base - h} width={barW} height={h} rx="2" fill="var(--work)"
              />
            )}
            {/* Only the peak gets a printed value — the rest answer on hover. */}
            {isPeak && (
              <text x={x + barW / 2} y={base - h - 4} className="jr-chart-val" textAnchor="middle">
                {`${hours.toFixed(hours < 10 ? 1 : 0)}h`}
              </text>
            )}
            <text x={x + barW / 2} y={base + 13} className="jr-chart-axis" textAnchor="middle">
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
  const top = 14;
  const plotH = 84;
  const base = top + plotH;
  const left = 6;
  const right = W - 8;

  let cum = 0;
  const points = history.map((h) => (cum += h.points));
  const max = Math.max(1, ...points);
  const n = points.length;

  const xAt = (i: number) => (n <= 1 ? (left + right) / 2 : left + ((right - left) * i) / (n - 1));
  const yAt = (v: number) => base - (v / max) * plotH;

  const poly = points.map((v, i) => `${xAt(i)},${yAt(v)}`).join(' ');
  const area = `${left},${base} ${poly} ${xAt(n - 1)},${base}`;

  return (
    <svg className="jr-chart" viewBox={`0 0 ${W} 118`} role="img"
      aria-label="Cumulative points earned over time">
      <line x1="0" y1={base} x2={W} y2={base} stroke="var(--line)" strokeWidth="1" />
      {n > 1 && <polygon className="jr-line-area" points={area} fill="var(--points)" />}
      {n > 1 && (
        <polyline
          className="jr-line-draw"
          points={poly}
          pathLength={1}
          fill="none"
          stroke="var(--points)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {/* Dots stay tiny; each carries its own hover answer. */}
      {points.map((v, i) => (
        <circle key={i} cx={xAt(i)} cy={yAt(v)} r={n === 1 ? 4 : 2.5} fill="var(--points)">
          <title>{`${history[i].date} — ${v} pts total (+${history[i].points})`}</title>
        </circle>
      ))}
      <text x={xAt(n - 1)} y={yAt(points[n - 1]) - 6} className="jr-chart-val" textAnchor="end">
        {points[n - 1]}
      </text>
    </svg>
  );
}

// ── Breather budgets on the most recent day (HTML meters vs limit) ──────────

export function BreakUsageChart({ history }: { history: HistoryEntry[] }) {
  const last = history[history.length - 1];
  const byKey = last?.breaksByKey;

  if (!byKey) {
    return <p className="muted">Per-break data starts from your next shift.</p>;
  }

  return (
    <div className="jr-meters">
      {BREAK_ORDER.map((k, i) => {
        const used = byKey[k];
        const limit = BREAK_LIMITS[k];
        const frac = Math.min(1, used / limit);
        const over = used > limit;
        return (
          <div className="jr-meter" key={k} title={`${BREAK_LABELS[k]} — ${formatHM(used)} of ${formatHM(limit)}`}>
            <span className="jr-meter-name">{BREAK_LABELS[k]}</span>
            <span className="jr-meter-track">
              <span
                className={`jr-meter-fill ${over ? 'is-over' : ''}`}
                style={{ width: `${frac * 100}%`, animationDelay: `${i * 80}ms` }}
              />
            </span>
            <span className="jr-meter-val mono">{formatHM(used)}</span>
          </div>
        );
      })}
    </div>
  );
}
