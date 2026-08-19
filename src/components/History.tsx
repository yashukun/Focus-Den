/**
 * Journal — the den's memory. A stat strip of all-time totals, the current
 * week (streak + freeze), three small "Rhythms" charts, and the signature
 * piece: Day by day, a week-grouped list where each day draws its hours in
 * flow as a green ribbon. Newest first; older weeks reveal on demand.
 *
 * Motion: one orchestrated entrance — sections rise in order, stat values
 * roll up, bars/ribbons grow, the points line draws itself. Everything is a
 * one-shot CSS animation (frozen by the global reduced-motion block) except
 * the count-ups, which go through src/fx.
 */

import { useRef, useState } from 'react';
import {
  completedDays,
  dayIndexMonSat,
  epochOf,
  formatDateLabel,
  formatHM,
  HOUR_MS,
  weekKey,
  type HistoryEntry,
  type State,
  type WeekState,
} from '../core';
import { store } from '../state/store';
import { countUp, useFxLayoutEffect } from '../fx';
import { WeekStreak } from './WeekStreak';
import { WeekHoursChart, PointsChart, BreakUsageChart } from './Charts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The ribbon's full width ≈ a heroic day; most days land in the 50–90% zone. */
const RIBBON_FULL_MS = 10 * HOUR_MS;

const WEEKS_PER_PAGE = 6;

interface WeekGroup {
  key: string;
  days: HistoryEntry[];
}

/** Group newest-first entries into contiguous newest-first week buckets. */
function groupByWeek(rows: HistoryEntry[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  for (const e of rows) {
    const key = weekKey(epochOf(e.date));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(e);
    else groups.push({ key, days: [e] });
  }
  return groups;
}

/** "Aug 17" from a Monday date key. */
function shortDate(dateKey: string): string {
  return formatDateLabel(dateKey).split(', ')[1] ?? dateKey;
}

export interface HistoryProps {
  state: State;
  now: number;
}

export function History({ state, now }: HistoryProps) {
  const rows = [...state.history].reverse();
  const currentWeekKey = weekKey(now);
  const wk: WeekState =
    state.week.key === currentWeekKey
      ? state.week
      : { key: currentWeekKey, days: {}, perfectAwarded: false };
  const todayIndex = dayIndexMonSat(now);

  const groups = groupByWeek(rows);
  const [weeksShown, setWeeksShown] = useState(WEEKS_PER_PAGE);
  const visibleGroups = groups.slice(0, weeksShown);
  const hiddenWeeks = groups.length - visibleGroups.length;

  return (
    <div className="history">
      <header className="jr-head jr-rise">
        <h1>Journal</h1>
        <p className="muted jr-sub">Every settled-in day, remembered.</p>
      </header>

      {rows.length > 0 && <StatStrip rows={rows} />}

      <section className="card jr-rise" style={{ animationDelay: '120ms' }}>
        <div className="card-head">
          <h2>This week</h2>
          {wk.perfectAwarded && <span className="badge tone-points">Perfect week 🏆</span>}
        </div>
        <div className="jr-week">
          <div className="jr-week-streak">
            <WeekStreak days={wk.days} todayIndex={todayIndex} completed={completedDays(wk)} />
          </div>
          <StreakFreeze state={state} wk={wk} todayIndex={todayIndex} now={now} />
        </div>
      </section>

      {rows.length > 0 && (
        <section className="card jr-rise" style={{ animationDelay: '180ms' }}>
          <div className="card-head">
            <h2>Rhythms</h2>
          </div>
          <div className="jr-charts">
            <div className="jr-chart-block">
              <h3 className="jr-chart-title">Hours in flow · this week</h3>
              <WeekHoursChart history={state.history} weekKey={currentWeekKey} />
            </div>
            <div className="jr-chart-block">
              <h3 className="jr-chart-title">Points over time</h3>
              <PointsChart history={state.history} />
            </div>
            <div className="jr-chart-block">
              <h3 className="jr-chart-title">Breathers · last day</h3>
              <BreakUsageChart history={state.history} />
            </div>
          </div>
        </section>
      )}

      <section className="card jr-rise" style={{ animationDelay: '240ms' }}>
        <div className="card-head">
          <h2>Day by day</h2>
          {rows.length > 0 && (
            <span className="muted">
              {rows.length} day{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="muted empty">
            Nothing here yet — settle in for a day and your journal writes itself.
          </p>
        ) : (
          <>
            {visibleGroups.map((g) => (
              <WeekSection key={g.key} group={g} currentWeekKey={currentWeekKey} />
            ))}
            {hiddenWeeks > 0 && (
              <button
                className="btn btn-ghost btn-block jr-more"
                data-sound="none"
                onClick={() => setWeeksShown((n) => n + WEEKS_PER_PAGE + 2)}
              >
                Show earlier weeks ({hiddenWeeks} more)
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

// ── All-time stat strip ──────────────────────────────────────────────────────

function StatStrip({ rows }: { rows: HistoryEntry[] }) {
  const days = rows.length;
  const hours = Math.round(rows.reduce((s, e) => s + e.worked, 0) / HOUR_MS);
  const points = rows.reduce((s, e) => s + e.points, 0);
  const smoothPct = Math.round((rows.filter((e) => e.clean).length / days) * 100);

  const daysRef = useRef<HTMLSpanElement>(null);
  const hoursRef = useRef<HTMLSpanElement>(null);
  const pointsRef = useRef<HTMLSpanElement>(null);
  const smoothRef = useRef<HTMLSpanElement>(null);

  useFxLayoutEffect(() => {
    countUp(daysRef.current, days, { duration: 600 });
    countUp(hoursRef.current, hours, { duration: 700 });
    countUp(pointsRef.current, points, { duration: 800 });
    countUp(smoothRef.current, smoothPct, { duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrance only
  }, []);

  return (
    <div className="jr-stats jr-rise" style={{ animationDelay: '60ms' }}>
      <div className="jr-stat">
        <span className="jr-stat-value mono">
          <span ref={daysRef}>{days}</span>
        </span>
        <span className="jr-stat-label">days settled in</span>
      </div>
      <div className="jr-stat">
        <span className="jr-stat-value mono tone-work">
          <span ref={hoursRef}>{hours}</span>h
        </span>
        <span className="jr-stat-label">in flow</span>
      </div>
      <div className="jr-stat">
        <span className="jr-stat-value mono tone-points">
          <span ref={pointsRef}>{points}</span>
        </span>
        <span className="jr-stat-label">points gathered</span>
      </div>
      <div className="jr-stat">
        <span className="jr-stat-value mono">
          <span ref={smoothRef}>{smoothPct}</span>%
        </span>
        <span className="jr-stat-label">smooth days</span>
      </div>
    </div>
  );
}

// ── Day by day ───────────────────────────────────────────────────────────────

function WeekSection({ group, currentWeekKey }: { group: WeekGroup; currentWeekKey: string }) {
  const worked = group.days.reduce((s, e) => s + e.worked, 0);
  const points = group.days.reduce((s, e) => s + e.points, 0);
  const label = group.key === currentWeekKey ? 'This week' : `Week of ${shortDate(group.key)}`;

  return (
    <div className="jr-weekgroup">
      <div className="jr-weekgroup-head">
        <h3 className="jr-weekgroup-title">{label}</h3>
        <span className="jr-weekgroup-sum mono">
          {group.days.length}d · {formatHM(worked)} · +{points}
        </span>
      </div>
      <ul className="jr-days">
        {group.days.map((e, i) => (
          <DayRow key={e.date} entry={e} index={i} />
        ))}
      </ul>
    </div>
  );
}

function DayRow({ entry, index }: { entry: HistoryEntry; index: number }) {
  const d = new Date(epochOf(entry.date));
  const frac = Math.min(1, entry.worked / RIBBON_FULL_MS);
  const detail =
    `${formatDateLabel(entry.date)} — ${formatHM(entry.worked)} in flow, ` +
    `${formatHM(entry.breaks)} breathers` +
    (entry.offline > 0 ? `, ${formatHM(entry.offline)} away` : '') +
    `, ${entry.tasks} win${entry.tasks === 1 ? '' : 's'}`;

  return (
    <li
      className="jr-day"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
      title={detail}
    >
      <span className="jr-day-date">
        <span className="jr-day-wd">{WEEKDAY_SHORT[d.getDay()]}</span>
        <span className="jr-day-num mono">{d.getDate()}</span>
      </span>
      <span className="jr-ribbon" aria-hidden="true">
        <span className="jr-ribbon-fill" style={{ width: `${frac * 100}%` }} />
      </span>
      <span className="jr-day-flow mono tone-work">{formatHM(entry.worked)}</span>
      <span className="jr-day-meta">
        {entry.offline > 0 && (
          <span className="jr-chip jr-chip-away mono">{formatHM(entry.offline)} away</span>
        )}
        {entry.tasks > 0 && (
          <span className="jr-chip">{entry.tasks} win{entry.tasks === 1 ? '' : 's'}</span>
        )}
        <span className={`jr-smooth ${entry.clean ? '' : 'is-rough'}`}>
          {entry.clean ? '✓ smooth' : 'rough'}
        </span>
      </span>
      <span className="jr-day-pts mono tone-points">+{entry.points}</span>
    </li>
  );
}

// ── Streak freeze ────────────────────────────────────────────────────────────

function StreakFreeze({
  state,
  wk,
  todayIndex,
  now,
}: {
  state: State;
  wk: WeekState;
  todayIndex: number;
  now: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const available = state.perks.streakFreeze;

  // Missed = a past Mon–Sat day this week that isn't complete.
  const missed: number[] = [];
  for (let i = 0; i < 6; i++) {
    const isPast = todayIndex < 0 || i < todayIndex;
    if (isPast && !wk.days[i]) missed.push(i);
  }

  if (available <= 0 && missed.length === 0) return null;

  function apply(dayIndex: number) {
    const bonus = store.applyFreeze(dayIndex, now);
    setMsg(
      bonus > 0
        ? `${DAY_NAMES[dayIndex]} restored — perfect week! +${bonus} pts 🏆`
        : `${DAY_NAMES[dayIndex]} restored with a freeze.`,
    );
  }

  return (
    <div className="jr-freeze">
      <div className="freeze-head">
        <span className="freeze-title">Streak freeze</span>
        <span className="muted">{available} available</span>
      </div>
      {available <= 0 ? (
        <p className="muted">Buy a Streak Freeze in the shop to restore a missed day.</p>
      ) : missed.length === 0 ? (
        <p className="muted">No missed days to restore this week. Nice. ✨</p>
      ) : (
        <div className="freeze-days">
          {missed.map((i) => (
            <button key={i} className="btn btn-sm" onClick={() => apply(i)}>
              Freeze {DAY_NAMES[i]}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="freeze-msg tone-work">{msg}</p>}
    </div>
  );
}
