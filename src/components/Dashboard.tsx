/**
 * Today — the main screen of the den, built from arrangeable widget cards.
 *
 * The layout lives in `settings.dashWidgets` (order = arrangement, presence =
 * enabled). Wide cards stack in the main column, small ones in the side rail.
 * A "Customize" mode lets the user move, hide, and add cards — including a
 * live clock and a free-text sticky note. The focus hero (settle in / live
 * timer / day complete) is always present so the day can't get lost.
 *
 * "Today's plan" surfaces the day's planned intentions from the Plan tab and,
 * once the day is wrapped up, flips into a small report (done vs. not
 * completed, with a carry-to-tomorrow action) plus tomorrow's plan.
 */

import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  BREAK_KEYS,
  BREAK_LABELS,
  BREAK_LIMITS,
  breakThreshold,
  canClockIn,
  canEnterBreak,
  completedDays,
  DASH_WIDGET_IDS,
  dateString,
  dayIndexMonSat,
  earnedPreview,
  effectiveGrace,
  formatClock,
  formatDateLabel,
  formatHM,
  formatHMS,
  formatMS,
  formatSlotTime,
  isActive,
  isBreakConsumed,
  isBreakKey,
  liveAcc,
  liveBreakUsed,
  pad2,
  shiftProgress,
  sortDayTickets,
  TICKET_STATUS_LABELS,
  ticketsFor,
  weekKey,
  type BreakKey,
  type DashCol,
  type DashSize,
  type DashWidgetId,
  type PlanTicket,
  type State,
  type Status,
} from '../core';
import { store } from '../state/store';
import { isTauri } from '../state/desktop';
import { play } from '../audio';
import { ensureNotifyPermission } from '../notify';
import { RoomScene } from '../room/RoomScene';
import { MediaCard } from './MediaCard';
import { SoundscapeCard } from './SoundscapeCard';
import { STATUS_META } from './statusMeta';
import { useArmedConfirm } from './useArmedConfirm';
import { useEscape } from './useEscape';
import { WeekStreak } from './WeekStreak';

// Away is intentionally absent: it's reached only automatically when a
// breather overruns its grace. You resume from it by tapping In flow.
const SWITCH_ORDER: { status: Status; key?: BreakKey }[] = [
  { status: 'working' },
  { status: 'break1', key: 'break1' },
  { status: 'break2', key: 'break2' },
  { status: 'lunch', key: 'lunch' },
];

/** Display metadata per widget. `side: true` → the narrow right rail. */
const WIDGET_META: Record<
  DashWidgetId,
  { label: string; icon: string; side: boolean; activeOnly?: boolean; desktopOnly?: boolean }
> = {
  focus: { label: 'Focus timer', icon: '⏱', side: false },
  plan: { label: 'Today’s plan', icon: '🗓', side: false },
  breathers: { label: 'Breathers', icon: '🌿', side: false, activeOnly: true },
  points: { label: 'Points', icon: '◈', side: true },
  week: { label: 'This week', icon: '🔥', side: true },
  den: { label: 'Your den', icon: '🛋', side: true },
  clock: { label: 'Clock', icon: '🕰', side: true },
  note: { label: 'Sticky note', icon: '📝', side: true },
  media: { label: 'Now playing', icon: '🎧', side: true, desktopOnly: true },
  soundscape: { label: 'Soundscape', icon: '🎶', side: true },
};

export interface DashboardProps {
  state: State;
  now: number;
  onGoToRoom: () => void;
  onGoToPlan: () => void;
}

export function Dashboard({ state, now, onGoToRoom, onGoToPlan }: DashboardProps) {
  const [editing, setEditing] = useState(false);
  useEscape(() => setEditing(false), editing);
  const { settings } = state;
  const widgets = settings.dashWidgets;
  const active = isActive(state.shift.status);
  const dockMode = settings.focusTimer === 'dock';

  // Whether the media session has anything to show — when it doesn't, the
  // Now-playing card quietly sinks to the bottom of its column (not while
  // editing, so arranging stays stable).
  const [mediaActive, setMediaActive] = useState(false);

  const colOf = (id: DashWidgetId): DashCol =>
    settings.dashCols[id] ?? (WIDGET_META[id].side ? 'side' : 'main');
  const sizeOf = (id: DashWidgetId): DashSize => settings.dashSizes[id] ?? 'lg';

  // Desktop-only widgets (Now playing) don't exist on the web at all; cards
  // that only make sense mid-shift vanish while idle — except in edit mode,
  // where a placeholder keeps them arrangeable. In dock mode the focus timer
  // lives in the corner dock instead of the grid.
  const available = (id: DashWidgetId) => !WIDGET_META[id].desktopOnly || isTauri();
  const visible = widgets.filter(
    (id) =>
      available(id) &&
      !(dockMode && id === 'focus') &&
      (editing || active || !WIDGET_META[id].activeOnly),
  );
  const hidden = DASH_WIDGET_IDS.filter(
    (id) => available(id) && !widgets.includes(id) && !(dockMode && id === 'focus'),
  );

  function columnIds(col: DashCol): DashWidgetId[] {
    const ids = visible.filter((id) => colOf(id) === col);
    if (editing || mediaActive) return ids;
    // idle media sinks to the bottom of whichever column it's in
    const i = ids.indexOf('media');
    if (i < 0 || i === ids.length - 1) return ids;
    const out = ids.slice();
    out.splice(i, 1);
    out.push('media');
    return out;
  }
  const mainIds = columnIds('main');
  const sideIds = columnIds('side');

  // Layout mutations read the store directly (not the render-time `widgets`)
  // so rapid clicks in one frame can't act on a stale list.
  function move(id: DashWidgetId, dir: -1 | 1) {
    const s = store.getState().settings;
    const list = [...s.dashWidgets];
    const col = s.dashCols[id] ?? (WIDGET_META[id].side ? 'side' : 'main');
    const peers = list.filter((w) => (s.dashCols[w] ?? (WIDGET_META[w].side ? 'side' : 'main')) === col);
    const target = peers[peers.indexOf(id) + dir];
    if (!target) return;
    const i = list.indexOf(id);
    const j = list.indexOf(target);
    [list[i], list[j]] = [list[j], list[i]];
    store.setDashWidgets(list);
  }

  function hide(id: DashWidgetId) {
    store.setDashWidgets(store.getState().settings.dashWidgets.filter((w) => w !== id));
  }

  function add(id: DashWidgetId) {
    store.setDashWidgets([...store.getState().settings.dashWidgets, id]);
  }

  function renderBody(id: DashWidgetId, size: DashSize, col: DashCol) {
    if (WIDGET_META[id].activeOnly && !active) {
      return <SleepingCard label={WIDGET_META[id].label} />;
    }
    switch (id) {
      case 'focus':
        return <FocusHero state={state} now={now} compact />;
      case 'plan':
        return <TodayPlanCard state={state} now={now} onOpenPlanner={onGoToPlan} />;
      case 'breathers':
        return <BreathersCard state={state} now={now} />;
      case 'points':
        return <PointsCard state={state} now={now} />;
      case 'week':
        return <WeekCard state={state} now={now} />;
      case 'den':
        return (
          <DenCard
            state={state}
            onGoToRoom={onGoToRoom}
            sceneWidth={col === 'main' ? (size === 'sm' ? 260 : 380) : size === 'sm' ? 190 : 260}
            compact={size === 'sm'}
          />
        );
      case 'clock':
        return <ClockCard now={now} />;
      case 'note':
        return <NoteCard note={state.settings.dashNote} />;
      case 'media':
        return <MediaCard onActiveChange={setMediaActive} />;
      case 'soundscape':
        return <SoundscapeCard state={state} />;
    }
  }

  function renderWidget(id: DashWidgetId) {
    const col = colOf(id);
    const size = sizeOf(id);
    const peers = widgets.filter((w) => visible.includes(w) && colOf(w) === col);
    const pi = peers.indexOf(id);
    const label = WIDGET_META[id].label;
    return (
      <div
        key={id}
        className={`dash-widget ${editing ? 'is-editing' : ''} ${size === 'sm' ? 'dash-sm' : ''}`}
      >
        {editing && (
          <div className="dash-widget-bar">
            <span className="dash-widget-name">
              <span aria-hidden="true">{WIDGET_META[id].icon}</span> {label}
            </span>
            <span className="dash-widget-tools">
              <button
                type="button"
                disabled={pi <= 0}
                aria-label={`Move ${label} up`}
                title="Move up"
                data-sound="none"
                onClick={() => move(id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={pi === peers.length - 1}
                aria-label={`Move ${label} down`}
                title="Move down"
                data-sound="none"
                onClick={() => move(id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-label={
                  col === 'main' ? `Move ${label} to the side rail` : `Move ${label} to the main column`
                }
                title={col === 'main' ? 'Move to the side rail' : 'Move to the main column'}
                data-sound="none"
                onClick={() => store.setDashCol(id, col === 'main' ? 'side' : 'main')}
              >
                {col === 'main' ? '▸' : '◂'}
              </button>
              <button
                type="button"
                aria-label={size === 'lg' ? `Smaller ${label}` : `Larger ${label}`}
                title={size === 'lg' ? 'Smaller view' : 'Larger view'}
                data-sound="none"
                onClick={() => store.setDashSize(id, size === 'lg' ? 'sm' : 'lg')}
              >
                {size === 'lg' ? '⊟' : '⊞'}
              </button>
              {id !== 'focus' && (
                <button
                  type="button"
                  aria-label={`Hide ${label}`}
                  title="Hide"
                  data-sound="none"
                  onClick={() => hide(id)}
                >
                  ✕
                </button>
              )}
            </span>
          </div>
        )}
        <div className="dash-widget-body">{renderBody(id, size, col)}</div>
      </div>
    );
  }

  return (
    <div className="dash-wrap">
      <div className="dash-toolbar">
        {editing ? (
          <>
            <span className="muted dash-toolbar-hint">
              Arrange your Today page — move, hide, or add cards.
            </span>
            <button className="btn btn-sm" data-sound="none" onClick={() => store.resetDash()}>
              Reset layout
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => setEditing(false)}>
              Done
            </button>
          </>
        ) : (
          <button
            className="btn btn-ghost btn-sm"
            data-sound="none"
            title="Customize this page"
            onClick={() => setEditing(true)}
          >
            ✎ Customize
          </button>
        )}
      </div>

      {editing && hidden.length > 0 && (
        <div className="dash-tray">
          <span className="muted">Add a card:</span>
          {hidden.map((id) => (
            <button
              key={id}
              className="btn btn-sm"
              data-sound="none"
              onClick={() => add(id)}
            >
              + <span aria-hidden="true">{WIDGET_META[id].icon}</span> {WIDGET_META[id].label}
            </button>
          ))}
        </div>
      )}

      <div className={`dashboard ${sideIds.length === 0 ? 'no-side' : ''}`}>
        <div className="dash-main">{mainIds.map(renderWidget)}</div>
        {sideIds.length > 0 && <div className="dash-side">{sideIds.map(renderWidget)}</div>}
      </div>
    </div>
  );
}

// ── Focus dock: the timer as a collapsible bottom-left corner pill ───────────
//
// Rendered by App.tsx as a SIBLING of <main> (like the other fixed overlays):
// the screen-entrance animation leaves a transform on <main>, which would
// otherwise become the containing block and pin the dock to the page instead
// of the viewport.

export function FocusDock({ state, now }: { state: State; now: number }) {
  const [open, setOpen] = useState(false);
  useEscape(() => setOpen(false), open);
  const { shift } = state;
  const active = isActive(shift.status);
  const meta = STATUS_META[shift.status];
  const stint = shift.statusStart != null ? Math.max(0, now - shift.statusStart) : 0;
  const ready = !active && canClockIn(state, now);

  // Drag the pill anywhere along the bottom edge; on release it parks in the
  // nearest of three spots (left / middle / right) and remembers it.
  const pos = state.settings.focusDockPos;
  const [dragX, setDragX] = useState<number | null>(null);
  const down = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  // The app renders under `html { zoom }`, so pointer coords (visual px) must
  // be divided by the zoom before they can position a fixed element (CSS px) —
  // otherwise the pill lands up to 25% too far right and leaves the screen.
  const zoom = useRef(1);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    down.current = { x: e.clientX, y: e.clientY, moved: false };
    // currentCSSZoom is the standardized effective zoom; older engines fall
    // back to the computed style, and anything else means no zoom.
    const el = e.currentTarget as HTMLElement & { currentCSSZoom?: number };
    zoom.current =
      el.currentCSSZoom ||
      parseFloat(getComputedStyle(document.documentElement).zoom || '1') ||
      1;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events (tests) have no pointer to capture
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = down.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
    d.moved = true;
    // Keep the whole pill on screen even when the cursor rides the edge.
    const half = (e.currentTarget as HTMLElement).getBoundingClientRect().width / 2 + 8;
    setDragX(Math.min(window.innerWidth - half, Math.max(half, e.clientX)));
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = down.current;
    down.current = null;
    if (!d?.moved) return; // a plain click — onClick toggles the panel
    dragged.current = true; // swallow the click that follows this drag
    const third = window.innerWidth / 3;
    store.setFocusDockPos(e.clientX < third ? 'left' : e.clientX < third * 2 ? 'center' : 'right');
    setDragX(null);
  }

  return (
    <div
      className={`focus-dock pos-${pos} ${open ? 'is-open' : ''} ${dragX != null ? 'is-dragging' : ''}`}
      style={
        dragX != null
          ? { left: dragX / zoom.current, right: 'auto', transform: 'translateX(-50%)' }
          : undefined
      }
    >
      {open && (
        <div className="focus-dock-panel">
          <FocusHero state={state} now={now} compact />
        </div>
      )}
      <button
        type="button"
        className={`focus-dock-pill ${active ? `tone-${meta.tone}` : ''}`}
        aria-expanded={open}
        aria-label={open ? 'Collapse the focus timer' : 'Expand the focus timer'}
        title="Drag me to another corner"
        data-sound="none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          down.current = null;
          setDragX(null);
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          setOpen(!open);
        }}
      >
        {active ? (
          <>
            <span className="status-dot" aria-hidden="true" />
            <span className="focus-dock-label">{meta.label}</span>
            <span className="focus-dock-time mono">{formatHMS(stint)}</span>
          </>
        ) : (
          <span className="focus-dock-label">{ready ? '⏱ Settle in' : '🌙 Day complete'}</span>
        )}
        <span className="focus-dock-chevron" aria-hidden="true">
          {open ? '▾' : '▴'}
        </span>
      </button>
    </div>
  );
}

/** Edit-mode stand-in for cards that only appear during an active shift. */
function SleepingCard({ label }: { label: string }) {
  return (
    <section className="card dash-sleeping">
      <p className="muted">{label} appears here while you’re settled in.</p>
    </section>
  );
}

// ── Focus hero: settle in / live shift / done ────────────────────────────────

function FocusHero({
  state,
  now,
  compact = false,
}: {
  state: State;
  now: number;
  compact?: boolean;
}) {
  const body = isActive(state.shift.status) ? (
    <StatusCard state={state} now={now} />
  ) : canClockIn(state, now) ? (
    <ReadyCard balance={state.points} />
  ) : (
    <DoneCard state={state} />
  );
  return compact ? <div className="focus-compact">{body}</div> : body;
}

function ReadyCard({ balance }: { balance: number }) {
  return (
    <section className="card hero-card">
      <h1 className="hero-title">Your den is ready</h1>
      <p className="muted">
        Settle in when you feel it. The day unfolds on its own from there — time spent{' '}
        <strong>In flow</strong> gathers points for your den.
      </p>
      <button
        className="btn btn-primary btn-xl"
        data-sound="start"
        onClick={() => store.clockIn(Date.now())}
      >
        Settle in
      </button>
      <p className="muted balance-line">
        Balance: <strong className="mono tone-points">{balance}</strong> pts
      </p>
    </section>
  );
}

function DoneCard({ state }: { state: State }) {
  const today = state.shift.date;
  const entry = [...state.history].reverse().find((h) => h.date === today);
  return (
    <section className="card hero-card">
      <h1 className="hero-title">Day complete 🌙</h1>
      <p className="muted">That’s a wrap — your den rests until tomorrow.</p>
      {entry && (
        <div className="summary-grid">
          <div className="summary-stat">
            <span className="summary-stat-label">In flow</span>
            <span className="summary-stat-value tone-work">{formatHM(entry.worked)}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Points</span>
            <span className="summary-stat-value tone-points">+{entry.points}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Wins</span>
            <span className="summary-stat-value">{entry.tasks}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Smooth day</span>
            <span className="summary-stat-value">{entry.clean ? 'Yes ✓' : 'No'}</span>
          </div>
        </div>
      )}
      <p className="muted balance-line">
        Balance: <strong className="mono tone-points">{state.points}</strong> pts
      </p>
      <div className="notired">
        <span className="muted">Not tired?</span>
        <button
          className="btn btn-sm"
          data-sound="start"
          onClick={() => store.resumeDay(Date.now())}
        >
          Settle back in
        </button>
      </div>
    </section>
  );
}

function StatusCard({ state, now }: { state: State; now: number }) {
  const { shift } = state;
  const meta = STATUS_META[shift.status];
  const stint = shift.statusStart != null ? Math.max(0, now - shift.statusStart) : 0;
  const used = liveBreakUsed(shift, now);
  const progress = shiftProgress(shift, now);
  const endTime = (shift.clockIn ?? 0) + progress.total;
  const graceBonusMs = state.perks.graceBonusMs;

  // Pre-grace warning: within 2 min of the auto-offline threshold.
  const currentBreak = isBreakKey(shift.status) ? shift.status : null;
  const toThreshold = currentBreak ? breakThreshold(currentBreak, graceBonusMs) - used[currentBreak] : 0;
  const warn = currentBreak != null && toThreshold > 0 && toThreshold <= 2 * 60 * 1000;

  // The OS notification for this warning lives in useTaskReminders (App) —
  // it fires no matter which screen is open. Here we only show the banner.
  const [endArmed, fireEnd] = useArmedConfirm();

  return (
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
          A breather ran long, so you drifted <strong>Away</strong>. Tap{' '}
          <strong>In flow</strong> when you’re back.
        </p>
      )}
      {shift.status === 'offline' && shift.clean && (
        <p className="status-note">Away — the flow clock is paused. Tap In flow to resume.</p>
      )}

      {warn && currentBreak && (
        <div className="grace-warning" role="alert">
          <span>
            ⚠ {BREAK_LABELS[currentBreak]} ends in {formatMS(toThreshold)} — tap{' '}
            <strong>In flow</strong> to keep the day smooth.
          </span>
          <button
            className="btn btn-sm"
            data-sound="none"
            onClick={() => void ensureNotifyPermission()}
          >
            Enable alerts
          </button>
        </div>
      )}

      {/* Day progress */}
      <div className="progress">
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, progress.fraction * 100)}%` }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.fraction * 100)}
            aria-label="Day progress"
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

      <button
        className={`btn btn-danger btn-block ${endArmed ? 'is-armed' : ''}`}
        onClick={() => fireEnd(() => store.endShift(Date.now()))}
      >
        {endArmed ? 'Really wrap up? This locks in today’s points.' : 'Wrap up the day'}
      </button>

      {/* Soundscape moved to its own widget — only the deep-work shortcut stays. */}
      {state.perks.deepWork && (
        <div className="focus-tools">
          <button className="btn btn-sm" onClick={() => store.setDeepWork(true)}>
            ◎ Deep work
          </button>
        </div>
      )}
    </section>
  );
}

// ── Breathers ────────────────────────────────────────────────────────────────

function BreathersCard({ state, now }: { state: State; now: number }) {
  const { shift } = state;
  const graceBonusMs = state.perks.graceBonusMs;
  const used = liveBreakUsed(shift, now);
  return (
    <section className="card">
      <div className="card-head">
        <h2>Breathers</h2>
        <span className="muted">{effectiveGrace(graceBonusMs) / 60000}-min grace, then you drift Away</span>
      </div>
      <div className="break-chips">
        {BREAK_KEYS.map((k) => (
          <BreakChip key={k} shift={shift} k={k} used={used[k]} graceBonusMs={graceBonusMs} />
        ))}
      </div>
    </section>
  );
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

// ── Points ───────────────────────────────────────────────────────────────────

function PointsCard({ state, now }: { state: State; now: number }) {
  const { shift } = state;
  const active = isActive(shift.status);
  return (
    <section className="card points-card">
      <div className="card-head">
        <h2>Points</h2>
      </div>
      <div className="balance">
        <span className="mono tone-points balance-big">{state.points}</span>
        <span className="muted"> pts balance</span>
      </div>
      {active ? (
        <PointsPreview state={state} now={now} />
      ) : (
        <p className="muted">Time in flow gathers points — they lock in when you wrap up.</p>
      )}
    </section>
  );
}

function PointsPreview({ state, now }: { state: State; now: number }) {
  const { shift } = state;
  const live = liveAcc(shift, now);
  const preview = earnedPreview(shift, now);
  return (
    <div className="preview">
      <div className="preview-total mono tone-points">+{preview.subtotal}</div>
      <div className="preview-label">gathered today (so far)</div>
      <ul className="points-lines">
        <li>
          <span>In flow · {formatHM(live.working)}</span>
          <span className="mono">+{preview.workedPoints}</span>
        </li>
        <li className={shift.clean ? '' : 'line-muted'}>
          <span>Smooth day</span>
          <span className="mono">+{preview.cleanBonus}</span>
        </li>
        <li className={preview.taskBonus ? '' : 'line-muted'}>
          <span>3+ wins ({shift.tasks.length})</span>
          <span className="mono">+{preview.taskBonus}</span>
        </li>
      </ul>
      <p className="muted preview-foot">Locks in when you wrap up.</p>
    </div>
  );
}

// ── Week / den / clock / note ────────────────────────────────────────────────

function WeekCard({ state, now }: { state: State; now: number }) {
  // Aligned to the live "now", not the possibly-stale stored week.
  const currentWeekKey = weekKey(now);
  const wk =
    state.week.key === currentWeekKey
      ? state.week
      : { key: currentWeekKey, days: {}, perfectAwarded: false };
  return (
    <section className="card">
      <div className="card-head">
        <h2>This week</h2>
      </div>
      <WeekStreak days={wk.days} todayIndex={dayIndexMonSat(now)} completed={completedDays(wk)} />
    </section>
  );
}

function DenCard({
  state,
  onGoToRoom,
  sceneWidth = 260,
  compact = false,
}: {
  state: State;
  onGoToRoom: () => void;
  sceneWidth?: number;
  compact?: boolean;
}) {
  return (
    <section className="card room-preview-card">
      <div className="card-head">
        <h2>Your den</h2>
        {!compact && (
          <button className="btn btn-ghost btn-sm" onClick={onGoToRoom}>
            Open ›
          </button>
        )}
      </div>
      <button className="room-preview-btn" onClick={onGoToRoom} aria-label="Open your room">
        <RoomScene
          owned={state.owned}
          equipped={state.equipped}
          den={state.den}
          character={state.character}
          placements={state.placements}
          width={sceneWidth}
        />
      </button>
    </section>
  );
}

function ClockCard({ now }: { now: number }) {
  const d = new Date(now);
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return (
    <section className="card clock-card">
      <div className="clock-face" role="timer" aria-label="Current time">
        <span className="clock-time mono">
          {h}:{pad2(d.getMinutes())}
        </span>
        <span className="clock-secs mono">:{pad2(d.getSeconds())}</span>
        <span className="clock-ampm">{ampm}</span>
      </div>
      <div className="clock-date muted">{formatDateLabel(dateString(now))}</div>
    </section>
  );
}

function NoteCard({ note }: { note: string }) {
  const [text, setText] = useState(note);
  const focused = useRef(false);

  // Pick up outside changes (import, reset) whenever the user isn't typing.
  useEffect(() => {
    if (!focused.current) setText(note);
  }, [note]);

  return (
    <section className="card note-card">
      <div className="card-head">
        <h2>Note</h2>
      </div>
      <textarea
        className="input note-input"
        value={text}
        maxLength={2000}
        placeholder="Jot anything — it stays on your Today page."
        aria-label="Sticky note"
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          focused.current = false;
          store.setDashNote(e.target.value);
        }}
      />
    </section>
  );
}

// ── Today's plan / end-of-day report ─────────────────────────────────────────

function TodayPlanCard({
  state,
  now,
  onOpenPlanner,
}: {
  state: State;
  now: number;
  onOpenPlanner: () => void;
}) {
  const todayKey = dateString(now);
  const dayDone = state.shift.date === todayKey && state.shift.status === 'ended';
  if (dayDone) {
    return <TodayReport state={state} todayKey={todayKey} onOpenPlanner={onOpenPlanner} />;
  }

  const tickets = sortDayTickets(ticketsFor(state.plan, todayKey));
  const done = tickets.filter((t) => t.status === 'done').length;

  return (
    <section className="card tplan-card">
      <div className="card-head">
        <h2>Today’s plan</h2>
        <span className="card-head-side">
          {tickets.length > 0 && (
            <span className="day-progress mono" title={`${done} of ${tickets.length} completed`}>
              {done}/{tickets.length} done
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onOpenPlanner}>
            Planner ›
          </button>
        </span>
      </div>

      <QuickAdd dateKey={todayKey} />

      {tickets.length === 0 ? (
        <p className="muted empty">
          Nothing planned for today — add an intention above, or sketch the week in the planner.
        </p>
      ) : (
        <ul className="tplan-list">
          {tickets.map((t) => (
            <TodayTicketRow key={t.id} ticket={t} todayKey={todayKey} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuickAdd({ dateKey }: { dateKey: string }) {
  const [title, setTitle] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const result = store.addPlanTicket(dateKey, { title: trimmed });
    if (result === 'duplicate') {
      setFeedback('That intention is already on today.');
      return;
    }
    if (result === 'added') {
      play('task');
      setFeedback(null);
      setTitle('');
    }
  }

  return (
    <form className="tplan-add" onSubmit={submit}>
      <div className="task-form">
        <input
          className="input"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (feedback) setFeedback(null);
          }}
          placeholder="Add an intention for today…"
          aria-label="Add an intention for today"
          maxLength={120}
        />
        <button className="btn btn-primary" type="submit" disabled={!title.trim()} data-sound="none">
          Add
        </button>
      </div>
      {feedback && <p className="composer-feedback" role="status">{feedback}</p>}
    </form>
  );
}

function TodayTicketRow({ ticket, todayKey }: { ticket: PlanTicket; todayKey: string }) {
  const done = ticket.status === 'done';
  return (
    <li className={`tplan-item prio-${ticket.priority} ${done ? 'is-done' : ''}`}>
      <button
        type="button"
        className={`ticket-check ${done ? 'is-done' : ''}`}
        aria-label={done ? `Mark “${ticket.title}” as to do` : `Mark “${ticket.title}” as completed`}
        title={done ? 'Mark as to do' : 'Mark as completed'}
        data-sound="switch"
        onClick={() => store.setPlanStatus(todayKey, ticket.id, done ? 'todo' : 'done')}
      >
        {done ? '✓' : ''}
      </button>
      <span className="tplan-title">{ticket.title}</span>
      <span className="tplan-meta">
        {!done && ticket.status !== 'todo' && (
          <span className={`meta-chip st-${ticket.status}`}>{TICKET_STATUS_LABELS[ticket.status]}</span>
        )}
        {ticket.startMin != null && (
          <span className="meta-chip mono" title="Scheduled slot">
            ◷ {formatSlotTime(ticket.startMin)}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * After wrap-up the plan card becomes a small report — what got done, what
 * didn't (with a carry-to-tomorrow action) — plus tomorrow's plan.
 */
function TodayReport({
  state,
  todayKey,
  onOpenPlanner,
}: {
  state: State;
  todayKey: string;
  onOpenPlanner: () => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const tomorrowKey = addDays(todayKey, 1);
  const tickets = sortDayTickets(ticketsFor(state.plan, todayKey));
  const done = tickets.filter((t) => t.status === 'done');
  const missed = tickets.filter((t) => t.status !== 'done');
  const tomorrow = sortDayTickets(ticketsFor(state.plan, tomorrowKey));

  function carry() {
    const n = store.moveUnfinishedToNextDay(todayKey);
    setMsg(n ? `Moved ${n} intention${n === 1 ? '' : 's'} to tomorrow.` : 'Tomorrow already has these.');
  }

  return (
    <section className="card tplan-card">
      <div className="card-head">
        <h2>Today’s report</h2>
        <span className="card-head-side">
          {tickets.length > 0 && (
            <span className="day-progress mono" title={`${done.length} of ${tickets.length} completed`}>
              {done.length}/{tickets.length} done
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onOpenPlanner}>
            Planner ›
          </button>
        </span>
      </div>

      {tickets.length === 0 ? (
        <p className="muted empty">No intentions were planned for today.</p>
      ) : (
        <>
          {done.length > 0 && (
            <div className="report-group">
              <h3 className="report-h report-h-done">Completed</h3>
              <ul className="report-list">
                {done.map((t) => (
                  <li key={t.id} className="report-row is-done">
                    <span className="report-mark" aria-hidden="true">✓</span>
                    <span className="tplan-title">{t.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {missed.length > 0 && (
            <div className="report-group">
              <h3 className="report-h report-h-missed">Not completed</h3>
              <ul className="report-list">
                {missed.map((t) => (
                  <li key={t.id} className="report-row is-missed">
                    <span className="report-mark" aria-hidden="true">•</span>
                    <span className="tplan-title">{t.title}</span>
                    <span className="meta-chip">{TICKET_STATUS_LABELS[t.status]}</span>
                  </li>
                ))}
              </ul>
              {/* Sits under the "Not completed" list, so the referent is clear. */}
              <button className="btn btn-sm" data-sound="none" onClick={carry}>
                → Move to tomorrow
              </button>
            </div>
          )}
          {msg && <p className="plan-msg tone-work">{msg}</p>}
        </>
      )}

      <div className="report-tomorrow">
        <h3 className="report-h">Tomorrow · {formatDateLabel(tomorrowKey)}</h3>
        {tomorrow.length === 0 ? (
          <p className="muted empty">Nothing planned yet — sketch tomorrow in the planner.</p>
        ) : (
          <ul className="tplan-list">
            {tomorrow.map((t) => (
              <li key={t.id} className={`tplan-item prio-${t.priority}`}>
                <span className="tplan-dot" aria-hidden="true" />
                <span className="tplan-title">{t.title}</span>
                <span className="tplan-meta">
                  {t.startMin != null && (
                    <span className="meta-chip mono" title="Scheduled slot">
                      ◷ {formatSlotTime(t.startMin)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

