/**
 * History — past completed shift days, the current week's streak (with streak-
 * freeze application), and lightweight analytics charts.
 */

import { useState } from 'react';
import {
  completedDays,
  dayIndexMonSat,
  formatDateLabel,
  formatHM,
  weekKey,
  type State,
  type WeekState,
} from '../core';
import { store } from '../state/store';
import { WeekStreak } from './WeekStreak';
import { WeekHoursChart, PointsChart, BreakUsageChart } from './Charts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

  return (
    <div className="history">
      <h1>History</h1>

      <section className="card">
        <div className="card-head">
          <h2>This week</h2>
          {wk.perfectAwarded && (
            <span className="badge tone-points">Perfect week 🏆</span>
          )}
        </div>
        <WeekStreak days={wk.days} todayIndex={todayIndex} completed={completedDays(wk)} />
        <StreakFreeze state={state} wk={wk} todayIndex={todayIndex} now={now} />
      </section>

      {rows.length > 0 && (
        <section className="card">
          <div className="card-head"><h2>Analytics</h2></div>
          <div className="charts">
            <div className="chart-block">
              <h3 className="chart-title">Worked hours · this week</h3>
              <WeekHoursChart history={state.history} weekKey={currentWeekKey} />
            </div>
            <div className="chart-block">
              <h3 className="chart-title">Points over time</h3>
              <PointsChart history={state.history} />
            </div>
            <div className="chart-block">
              <h3 className="chart-title">Break budget · last shift</h3>
              <BreakUsageChart history={state.history} />
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Past shifts</h2>
          <span className="muted">{rows.length} day{rows.length === 1 ? '' : 's'}</span>
        </div>

        {rows.length === 0 ? (
          <p className="muted empty">No completed shifts yet. Clock in to start your record.</p>
        ) : (
          <div className="table-wrap">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Worked</th>
                  <th>Breaks</th>
                  <th>Offline</th>
                  <th>Tasks</th>
                  <th>Clean</th>
                  <th className="num">Points</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h, i) => (
                  <tr key={`${h.date}-${i}`}>
                    <td>{formatDateLabel(h.date)}</td>
                    <td className="mono tone-work">{formatHM(h.worked)}</td>
                    <td className="mono">{formatHM(h.breaks)}</td>
                    <td className="mono tone-offline">{formatHM(h.offline)}</td>
                    <td className="mono">{h.tasks}</td>
                    <td>{h.clean ? '✓' : '—'}</td>
                    <td className="num mono tone-points">+{h.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

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
    <div className="freeze">
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
