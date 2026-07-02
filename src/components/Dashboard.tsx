/**
 * Dashboard — the home screen. Shows the live status + timer, shift progress,
 * the status switcher, break budgets, the task log, the points balance with a
 * live "earned today" preview, the weekly streak, and a room preview.
 *
 * Three macro modes: ready-to-clock-in, active shift, and done-for-today.
 */

import { useEffect, useRef, useState } from 'react';
import {
  BREAK_KEYS,
  BREAK_LABELS,
  BREAK_LIMITS,
  breakThreshold,
  canClockIn,
  canEnterBreak,
  completedDays,
  dayIndexMonSat,
  earnedPreview,
  effectiveGrace,
  formatClock,
  formatHM,
  formatHMS,
  formatMS,
  isActive,
  isBreakConsumed,
  isBreakKey,
  liveAcc,
  liveBreakUsed,
  shiftProgress,
  SOUNDSCAPE_LABELS,
  weekKey,
  type BreakKey,
  type State,
  type Status,
} from '../core';
import { store } from '../state/store';
import { play } from '../audio';
import { RoomScene } from '../room/RoomScene';
import { STATUS_META } from './statusMeta';
import { WeekStreak } from './WeekStreak';

// Offline is intentionally absent: it's reached only automatically when a
// break overruns its grace. You resume from it by tapping Working.
const SWITCH_ORDER: { status: Status; key?: BreakKey }[] = [
  { status: 'working' },
  { status: 'break1', key: 'break1' },
  { status: 'break2', key: 'break2' },
  { status: 'lunch', key: 'lunch' },
];

export interface DashboardProps {
  state: State;
  now: number;
  onGoToRoom: () => void;
}

export function Dashboard({ state, now, onGoToRoom }: DashboardProps) {
  const { shift } = state;
  const active = isActive(shift.status);
  const ready = canClockIn(state, now);

  // Week (aligned to the live "now", not the possibly-stale stored week).
  const currentWeekKey = weekKey(now);
  const wk =
    state.week.key === currentWeekKey
      ? state.week
      : { key: currentWeekKey, days: {}, perfectAwarded: false };
  const streak = (
    <WeekStreak
      days={wk.days}
      todayIndex={dayIndexMonSat(now)}
      completed={completedDays(wk)}
    />
  );

  const roomCard = (
    <section className="card room-preview-card">
      <div className="card-head">
        <h2>Your den</h2>
        <button className="btn btn-ghost btn-sm" onClick={onGoToRoom}>
          Open ›
        </button>
      </div>
      <button className="room-preview-btn" onClick={onGoToRoom} aria-label="Open your room">
        <RoomScene owned={state.owned} equipped={state.equipped} width={260} />
      </button>
    </section>
  );

  return (
    <div className="dashboard">
      <div className="dash-main">
        {active ? (
          <ActiveShift state={state} now={now} />
        ) : ready ? (
          <ReadyCard balance={state.points} />
        ) : (
          <DoneCard state={state} />
        )}
      </div>

      <div className="dash-side">
        <section className="card">
          <div className="card-head">
            <h2>This week</h2>
          </div>
          {streak}
        </section>
        {roomCard}
      </div>
    </div>
  );
}

// ── Ready to clock in ────────────────────────────────────────────────────────

function ReadyCard({ balance }: { balance: number }) {
  return (
    <section className="card hero-card">
      <h1 className="hero-title">Ready to focus?</h1>
      <p className="muted">
        Clock in to start your 12-hour shift. Stay in <strong>Working</strong> to earn points.
      </p>
      <button
        className="btn btn-primary btn-xl"
        data-sound="start"
        onClick={() => store.clockIn(Date.now())}
      >
        Clock in
      </button>
      <p className="muted balance-line">
        Balance: <strong className="mono tone-points">{balance}</strong> pts
      </p>
    </section>
  );
}

// ── Done for today ───────────────────────────────────────────────────────────

function DoneCard({ state }: { state: State }) {
  const today = state.shift.date;
  const entry = [...state.history].reverse().find((h) => h.date === today);
  return (
    <section className="card hero-card">
      <h1 className="hero-title">Shift complete 🌙</h1>
      <p className="muted">You're done for today. The next shift unlocks tomorrow.</p>
      {entry && (
        <div className="summary-grid">
          <div className="summary-stat">
            <span className="summary-stat-label">Worked</span>
            <span className="summary-stat-value tone-work">{formatHM(entry.worked)}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Points</span>
            <span className="summary-stat-value tone-points">+{entry.points}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Tasks</span>
            <span className="summary-stat-value">{entry.tasks}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Clean</span>
            <span className="summary-stat-value">{entry.clean ? 'Yes ✓' : 'No'}</span>
          </div>
        </div>
      )}
      <p className="muted balance-line">
        Balance: <strong className="mono tone-points">{state.points}</strong> pts
      </p>
    </section>
  );
}

// ── Active shift ─────────────────────────────────────────────────────────────

function ActiveShift({ state, now }: { state: State; now: number }) {
  const { shift } = state;
  const meta = STATUS_META[shift.status];
  const stint = shift.statusStart != null ? Math.max(0, now - shift.statusStart) : 0;
  const live = liveAcc(shift, now);
  const used = liveBreakUsed(shift, now);
  const progress = shiftProgress(shift, now);
  const preview = earnedPreview(shift, now);
  const endTime = (shift.clockIn ?? 0) + progress.total;
  const graceBonusMs = state.perks.graceBonusMs;

  // Pre-grace warning: within 2 min of the auto-offline threshold.
  const currentBreak = isBreakKey(shift.status) ? shift.status : null;
  const toThreshold = currentBreak ? breakThreshold(currentBreak, graceBonusMs) - used[currentBreak] : 0;
  const warn = currentBreak != null && toThreshold > 0 && toThreshold <= 2 * 60 * 1000;

  // Fire a single browser notification (when permission is granted) per break.
  const notifiedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!currentBreak) {
      notifiedFor.current = null;
      return;
    }
    if (!warn || notifiedFor.current === currentBreak) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Break almost over', {
          body: `${BREAK_LABELS[currentBreak]} hits its limit soon — tap Working to stay clean.`,
        });
      } catch {
        // notifications unavailable
      }
      notifiedFor.current = currentBreak;
    }
  }, [warn, currentBreak]);

  function onEnd() {
    if (window.confirm('End your shift now? This finalizes today’s points.')) {
      store.endShift(Date.now());
    }
  }

  return (
    <>
      <section className={`card status-card tone-${meta.tone}`}>
        <div className="status-head">
          <span className="status-dot" aria-hidden="true" />
          <span className="status-label">{meta.label}</span>
        </div>
        <div className="status-timer mono" aria-label={`Time in ${meta.label}`}>
          {formatHMS(stint)}
        </div>
        {shift.status === 'offline' && !shift.clean && (
          <p className="status-note">
            A break overran its limit — you were moved to Offline. Tap{' '}
            <strong>Working</strong> to resume earning.
          </p>
        )}
        {shift.status === 'offline' && shift.clean && (
          <p className="status-note">Offline — worked time is paused. Tap Working to resume.</p>
        )}

        {warn && currentBreak && (
          <div className="grace-warning" role="alert">
            <span>
              ⚠ {BREAK_LABELS[currentBreak]} ends in {formatMS(toThreshold)} — tap{' '}
              <strong>Working</strong> to stay clean.
            </span>
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <button
                className="btn btn-sm"
                data-sound="none"
                onClick={() => void Notification.requestPermission()}
              >
                Enable alerts
              </button>
            )}
          </div>
        )}

        {/* Shift progress */}
        <div className="progress">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${Math.min(100, progress.fraction * 100)}%` }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress.fraction * 100)}
              aria-label="Shift progress"
            />
          </div>
          <div className="progress-labels">
            <span className="mono">{formatClock(shift.clockIn ?? now)}</span>
            <span className="muted">{formatHMS(progress.remaining)} left</span>
            <span className="mono">{formatClock(endTime)}</span>
          </div>
        </div>

        {/* Status switcher */}
        <div className="switcher" role="group" aria-label="Switch status">
          {SWITCH_ORDER.map(({ status, key }) => {
            const isCurrent = shift.status === status;
            const disabled = key ? !isCurrent && !canEnterBreak(shift, key) : false;
            const tone = STATUS_META[status].tone;
            const remaining = key ? Math.max(0, BREAK_LIMITS[key] - used[key]) : 0;
            return (
              <button
                key={status}
                className={`btn switch-btn tone-${tone} ${isCurrent ? 'is-current' : ''}`}
                aria-pressed={isCurrent}
                disabled={disabled}
                data-sound="switch"
                onClick={() => store.switchStatus(status, Date.now())}
              >
                <span className="switch-label">{STATUS_META[status].label}</span>
                {key && (
                  <span className="switch-sub mono">
                    {isCurrent
                      ? `${formatMS(remaining)} left`
                      : isBreakConsumed(shift, key)
                        ? 'used'
                        : `${BREAK_LIMITS[key] / 60000}m`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button className="btn btn-danger btn-block" onClick={onEnd}>
          End shift
        </button>

        {(state.perks.deepWork || state.perks.soundscape) && (
          <div className="focus-tools">
            {state.perks.deepWork && (
              <button className="btn btn-sm" onClick={() => store.setDeepWork(true)}>
                ◎ Deep work
              </button>
            )}
            {state.perks.soundscape && (
              <button
                className={`btn btn-sm ${state.settings.soundscapeOn ? 'btn-primary' : ''}`}
                aria-pressed={state.settings.soundscapeOn}
                onClick={() => store.setSoundscapeOn(!state.settings.soundscapeOn)}
              >
                ♪ {state.settings.soundscapeOn ? `${soundscapeName(state)} on` : 'Soundscape'}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Break budgets */}
      <section className="card">
        <div className="card-head">
          <h2>Breaks</h2>
          <span className="muted">{effectiveGrace(graceBonusMs) / 60000}-min grace, then auto-offline</span>
        </div>
        <div className="break-chips">
          {BREAK_KEYS.map((k) => (
            <BreakChip key={k} shift={shift} k={k} used={used[k]} graceBonusMs={graceBonusMs} />
          ))}
        </div>
      </section>

      {/* Tasks + Points */}
      <div className="dash-two">
        <TaskLog shift={shift} />
        <section className="card points-card">
          <div className="card-head">
            <h2>Points</h2>
          </div>
          <div className="balance">
            <span className="mono tone-points balance-big">{state.points}</span>
            <span className="muted"> pts balance</span>
          </div>
          <div className="preview">
            <div className="preview-total mono tone-points">+{preview.subtotal}</div>
            <div className="preview-label">earned today (preview)</div>
            <ul className="points-lines">
              <li>
                <span>Worked · {formatHM(live.working)}</span>
                <span className="mono">+{preview.workedPoints}</span>
              </li>
              <li className={shift.clean ? '' : 'line-muted'}>
                <span>Clean shift</span>
                <span className="mono">+{preview.cleanBonus}</span>
              </li>
              <li className={preview.taskBonus ? '' : 'line-muted'}>
                <span>3+ tasks ({shift.tasks.length})</span>
                <span className="mono">+{preview.taskBonus}</span>
              </li>
            </ul>
            <p className="muted preview-foot">Finalizes at clock-out.</p>
          </div>
        </section>
      </div>
    </>
  );
}

function soundscapeName(state: State): string {
  return SOUNDSCAPE_LABELS[state.settings.soundscape];
}

function BreakChip({
  shift,
  k,
  used,
  graceBonusMs,
}: {
  shift: State['shift'];
  k: BreakKey;
  used: number;
  graceBonusMs: number;
}) {
  const limit = BREAK_LIMITS[k];
  const isCurrent = shift.status === k;
  const consumed = isBreakConsumed(shift, k);
  const inGrace = isCurrent && used >= limit;
  const remainingToLimit = Math.max(0, limit - used);
  const graceLeft = Math.max(0, breakThreshold(k, graceBonusMs) - used);

  let stateClass = 'chip-ready';
  let detail = `${limit / 60000}m available`;
  if (isCurrent) {
    stateClass = inGrace ? 'chip-grace' : 'chip-current';
    detail = inGrace ? `grace · ${formatMS(graceLeft)}` : `${formatMS(remainingToLimit)} left`;
  } else if (consumed) {
    stateClass = 'chip-used';
    detail = `used · ${formatMS(used)}`;
  }

  return (
    <div className={`break-chip ${stateClass}`}>
      <span className="break-chip-name">{BREAK_LABELS[k]}</span>
      <span className="break-chip-detail mono">{detail}</span>
    </div>
  );
}

function TaskLog({ shift }: { shift: State['shift'] }) {
  const [text, setText] = useState('');
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    store.addTask(text, Date.now());
    play('task'); // covers both Enter and the Add button
    setText('');
  }

  function startEdit(index: number, current: string) {
    setEditIndex(index);
    setEditText(current);
  }

  function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editIndex == null) return;
    store.editTask(editIndex, editText);
    setEditIndex(null);
  }

  function remove(index: number) {
    store.deleteTask(index);
    if (editIndex === index) setEditIndex(null);
  }

  // Newest first, but keep the real index for edit/delete.
  const ordered = shift.tasks.map((t, i) => ({ t, i })).reverse();

  return (
    <section className="card tasks-card">
      <div className="card-head">
        <h2>Tasks</h2>
        <span className="muted">
          {shift.tasks.length} logged{shift.tasks.length < 3 ? ` · +20 at 3` : ' · +20 ✓'}
        </span>
      </div>
      <form className="task-form" onSubmit={submit}>
        <input
          className="input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What did you finish?"
          aria-label="Log a task"
          maxLength={120}
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim()} data-sound="none">
          Add
        </button>
      </form>
      {shift.tasks.length === 0 ? (
        <p className="muted empty">No tasks yet — log what you ship.</p>
      ) : (
        <ul className="task-list">
          {ordered.map(({ t, i }) =>
            editIndex === i ? (
              <li key={i}>
                <form className="task-edit-form" onSubmit={saveEdit}>
                  <input
                    className="input"
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    aria-label="Edit task"
                    maxLength={120}
                    autoFocus
                  />
                  <button className="btn btn-sm btn-primary" type="submit" data-sound="none">
                    Save
                  </button>
                  <button
                    className="btn btn-sm"
                    type="button"
                    data-sound="none"
                    onClick={() => setEditIndex(null)}
                  >
                    ✕
                  </button>
                </form>
              </li>
            ) : (
              <li key={i}>
                <span className="task-time mono">{formatClock(t.time)}</span>
                <span className="task-text">{t.text}</span>
                <span className="task-actions">
                  <button
                    type="button"
                    data-sound="none"
                    aria-label="Edit task"
                    title="Edit"
                    onClick={() => startEdit(i, t.text)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    data-sound="none"
                    aria-label="Delete task"
                    title="Delete"
                    onClick={() => remove(i)}
                  >
                    🗑
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
