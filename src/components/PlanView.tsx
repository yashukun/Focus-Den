/**
 * Plan — a calendar of intentions per day (separate from the during-day wins
 * log), laid out as three panes: a compact always-visible month calendar in
 * the left rail, the selected day's task list in the middle, and a detail
 * panel that opens when a task is selected. Adding is title-first (type,
 * Enter) — the new task auto-selects so deadline / goal / priority / rich
 * description are each one click away in the detail panel.
 *
 * Rule: current and upcoming days are editable; past days are locked (view only).
 */

import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  dateString,
  formatDateLabel,
  formatHMS,
  isDateEditable,
  isTiming,
  liveSpentMs,
  monthMatrix,
  monthOf,
  monthTitle,
  ticketsFor,
  type PlanTicket,
  type State,
  type TicketPriority,
  type TicketStatus,
  type TrackingState,
} from '../core';
import { store } from '../state/store';
import { play } from '../audio';
import { RichTextEditor, RichTextViewer, textToDescHtml } from './RichText';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const STATUSES: { id: TicketStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Completed' },
];

const PRIORITIES: { id: TicketPriority; label: string }[] = [
  { id: 'critical', label: 'Critical' },
  { id: 'high', label: 'High' },
  { id: 'med', label: 'Medium' },
  { id: 'low', label: 'Low' },
];

/** Time-goal presets for the detail panel (minutes; null = no goal). */
const DURATION_PRESETS: { min: number | null; label: string }[] = [
  { min: null, label: 'None' },
  { min: 15, label: '15m' },
  { min: 25, label: '25m' },
  { min: 45, label: '45m' },
  { min: 60, label: '1h' },
  { min: 90, label: '1h 30' },
  { min: 120, label: '2h' },
];

function statusMeta(id: TicketStatus) {
  return STATUSES.find((s) => s.id === id)!;
}
function priorityMeta(id: TicketPriority) {
  return PRIORITIES.find((p) => p.id === id)!;
}

function fmtDuration(min?: number): string | null {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "today 17:30" / "tomorrow 09:00" / "Aug 18, 17:30" */
function fmtDeadline(ms: number, todayKey: string): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const key = dateString(ms);
  if (key === todayKey) return `today ${hm}`;
  if (key === addDays(todayKey, 1)) return `tomorrow ${hm}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${hm}`;
}

/** Epoch ms → value for <input type="datetime-local"> (local time). */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function isOverdue(t: PlanTicket, now: number): boolean {
  return t.deadlineMs != null && t.deadlineMs < now && t.status !== 'done';
}

export interface PlanViewProps {
  state: State;
  now: number;
}

export function PlanView({ state, now }: PlanViewProps) {
  const todayKey = dateString(now);
  const today = new Date(now);
  const [view, setView] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);

  const tickets = ticketsFor(state.plan, selectedDay);
  const selected = selectedId ? tickets.find((t) => t.id === selectedId) ?? null : null;
  const editable = isDateEditable(selectedDay, todayKey);

  // A just-added task auto-selects so its details are one click away.
  useEffect(() => {
    if (!pendingTitle) return;
    const t = tickets.find((x) => x.title.trim().toLowerCase() === pendingTitle);
    if (t) setSelectedId(t.id);
    setPendingTitle(null);
  }, [pendingTitle, tickets]);

  function pickDay(dateKey: string) {
    setSelectedDay(dateKey);
    setSelectedId(null);
    const m = monthOf(dateKey);
    if (m !== view.m) setView({ y: Number(dateKey.slice(0, 4)), m });
  }

  return (
    <div className="plan">
      <aside className="plan-rail">
        <MiniCalendar
          state={state}
          view={view}
          setView={setView}
          todayKey={todayKey}
          selectedDay={selectedDay}
          onPick={pickDay}
        />
      </aside>

      <DayPanel
        key={selectedDay}
        state={state}
        dateKey={selectedDay}
        todayKey={todayKey}
        now={now}
        selectedId={selected?.id ?? null}
        onSelect={setSelectedId}
        onAdded={(title) => setPendingTitle(title)}
      />

      {selected ? (
        <DetailPanel
          key={selected.id}
          ticket={selected}
          dateKey={selectedDay}
          todayKey={todayKey}
          now={now}
          editable={editable}
          tracking={state.tracking}
          startable={selectedDay === todayKey && state.shift.status === 'working'}
          onClose={() => setSelectedId(null)}
        />
      ) : (
        <section className="card detail-panel detail-empty" aria-label="Task details">
          <p className="muted">Select a task to see its details —<br />or add one and it opens here.</p>
        </section>
      )}
    </div>
  );
}

// ── Left rail: compact month calendar ────────────────────────────────────────

function MiniCalendar({
  state,
  view,
  setView,
  todayKey,
  selectedDay,
  onPick,
}: {
  state: State;
  view: { y: number; m: number };
  setView: React.Dispatch<React.SetStateAction<{ y: number; m: number }>>;
  todayKey: string;
  selectedDay: string;
  onPick: (dateKey: string) => void;
}) {
  const weeks = monthMatrix(view.y, view.m);

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }

  return (
    <section className="card plan-cal">
      <div className="cal-head">
        <h2>{monthTitle(view.y, view.m)}</h2>
        <div className="cal-nav">
          <button className="btn btn-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
          <button className="btn btn-sm" onClick={() => shiftMonth(1)} aria-label="Next month">›</button>
        </div>
      </div>

      <div className="cal-grid cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
      </div>

      <div className="cal-grid" role="grid">
        {weeks.flat().map((dateKey) => {
          const dayNum = Number(dateKey.slice(8, 10));
          const inMonth = monthOf(dateKey) === view.m;
          const tickets = ticketsFor(state.plan, dateKey);
          const open = tickets.filter((t) => t.status !== 'done').length;
          const cls = [
            'cal-cell',
            inMonth ? '' : 'cal-out',
            dateKey === todayKey ? 'cal-today' : '',
            dateKey === selectedDay ? 'cal-selected' : '',
            dateKey < todayKey ? 'cal-past' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={dateKey}
              className={cls}
              aria-pressed={dateKey === selectedDay}
              aria-label={`${formatDateLabel(dateKey)}, ${tickets.length} task${tickets.length === 1 ? '' : 's'}`}
              onClick={() => onPick(dateKey)}
              data-sound="none"
            >
              <span className="cal-num">{dayNum}</span>
              {tickets.length > 0 && (
                <span className={`cal-count ${open === 0 ? 'is-done' : ''}`}>
                  {open === 0 ? '✓' : tickets.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay !== todayKey && (
        <button className="btn btn-sm cal-today-btn" onClick={() => onPick(todayKey)}>
          Back to today
        </button>
      )}
    </section>
  );
}

// ── Middle: the day's task list ──────────────────────────────────────────────

function DayPanel({
  state,
  dateKey,
  todayKey,
  now,
  selectedId,
  onSelect,
  onAdded,
}: {
  state: State;
  dateKey: string;
  todayKey: string;
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdded: (titleKey: string) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const editable = isDateEditable(dateKey, todayKey);
  const tickets = ticketsFor(state.plan, dateKey);
  const rel = dateKey === todayKey ? 'Today' : dateKey === addDays(todayKey, 1) ? 'Tomorrow' : null;
  const startable = dateKey === todayKey && state.shift.status === 'working';
  const done = tickets.filter((t) => t.status === 'done').length;

  // The status popover closes on outside click / Escape.
  useEffect(() => {
    if (!menuFor) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest?.('.status-menu-wrap')) setMenuFor(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menuFor]);

  const plural = (n: number) => (n === 1 ? '' : 's');

  function copyNextDay() {
    const r = store.copyPlanDayToNextDay(dateKey);
    setMsg(r.tickets ? `Carried ${r.tickets} task${plural(r.tickets)} to tomorrow.` : 'Tomorrow already has these.');
  }
  function copyWeek() {
    const r = store.copyPlanDayToWeek(dateKey);
    setMsg(
      r.tickets
        ? `Carried ${r.tickets} task${plural(r.tickets)} across ${r.days} upcoming day${plural(r.days)} this week.`
        : 'Already up to date — nothing new to carry.',
    );
  }
  function clearDay() {
    if (window.confirm(`Let go of all ${tickets.length} task(s) for ${formatDateLabel(dateKey)}?`)) {
      store.clearPlanDay(dateKey);
      setMsg(null);
    }
  }

  return (
    <section className="card day-panel">
      <div className="card-head">
        <div className="day-title">
          <h2>{formatDateLabel(dateKey)}</h2>
          {rel && <span className="badge tone-work">{rel}</span>}
          {!editable && <span className="badge day-locked">Locked 🔒</span>}
        </div>
        {tickets.length > 0 && (
          <span className="day-progress mono" title={`${done} of ${tickets.length} completed`}>
            {done}/{tickets.length} done
          </span>
        )}
      </div>

      {editable && <Composer dateKey={dateKey} onAdded={onAdded} />}

      {editable && tickets.length > 0 && (
        <>
          <div className="day-actions">
            <button className="btn btn-sm" onClick={copyNextDay} title="Carry these tasks to the next day">
              Carry → tomorrow
            </button>
            <button className="btn btn-sm" onClick={copyWeek} title="Carry these tasks to current + upcoming days this week">
              Carry → week
            </button>
            <button className="btn btn-sm" onClick={clearDay} title="Remove every task for this day">
              Clear day
            </button>
          </div>
          {msg && <p className="plan-msg tone-work">{msg}</p>}
        </>
      )}

      {tickets.length === 0 ? (
        <p className="muted empty">
          {editable ? 'Nothing here yet — set a gentle intention for this day.' : 'Nothing was planned for this day.'}
        </p>
      ) : (
        <ul className="ticket-list">
          {tickets.map((t) => (
            <TicketRow
              key={t.id}
              ticket={t}
              dateKey={dateKey}
              todayKey={todayKey}
              editable={editable}
              startable={startable}
              tracking={state.tracking}
              now={now}
              selected={t.id === selectedId}
              menuOpen={menuFor === t.id}
              onToggleMenu={() => setMenuFor((v) => (v === t.id ? null : t.id))}
              onCloseMenu={() => setMenuFor(null)}
              onSelect={() => onSelect(t.id)}
            />
          ))}
        </ul>
      )}

      {editable && !startable && dateKey === todayKey && tickets.some((t) => t.status !== 'done') && (
        <p className="muted plan-hint">Settle in and be <strong>In flow</strong> to start a task's timer.</p>
      )}
      {!editable && (
        <p className="muted day-locked-note">Past days can't be changed — they're a record of what you intended.</p>
      )}
    </section>
  );
}

/**
 * Title-first quick add: type, Enter, done — the task then auto-selects so
 * every other field is one click away in the detail panel. Duplicate titles
 * on the same day get inline feedback instead of piling up.
 */
function Composer({ dateKey, onAdded }: { dateKey: string; onAdded: (titleKey: string) => void }) {
  const [title, setTitle] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    const result = store.addPlanTicket(dateKey, { title: trimmed });
    if (result === 'duplicate') {
      setFeedback('That task is already on this day.');
      return;
    }
    if (result === 'added') {
      play('task');
      setFeedback(null);
      setTitle('');
      onAdded(trimmed.toLowerCase());
      titleRef.current?.focus();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-title-row">
        <input
          ref={titleRef}
          className="input"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (feedback) setFeedback(null);
          }}
          placeholder="Add a task… e.g. read 30 pages"
          aria-label="New task title"
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

function TicketRow({
  ticket,
  dateKey,
  todayKey,
  editable,
  startable,
  tracking,
  now,
  selected,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onSelect,
}: {
  ticket: PlanTicket;
  dateKey: string;
  todayKey: string;
  editable: boolean;
  startable: boolean;
  tracking: TrackingState | null;
  now: number;
  selected: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSelect: () => void;
}) {
  const spent = liveSpentMs(ticket, tracking, dateKey, now);
  const timing = isTiming(ticket, tracking, dateKey);
  const dur = fmtDuration(ticket.durationMin);
  const overdue = isOverdue(ticket, now);
  const done = ticket.status === 'done';
  const st = statusMeta(ticket.status);

  function toggleDone(e: React.MouseEvent) {
    e.stopPropagation();
    if (!editable) return;
    store.setPlanStatus(dateKey, ticket.id, done ? 'todo' : 'done');
  }

  function pickStatus(e: React.MouseEvent, status: TicketStatus) {
    e.stopPropagation();
    store.setPlanStatus(dateKey, ticket.id, status);
    onCloseMenu();
  }

  return (
    <li
      className={[
        'ticket',
        'ticket-pop',
        `prio-${ticket.priority}`,
        done ? 'ticket-done' : '',
        timing ? 'ticket-timing-row' : '',
        selected ? 'is-selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={onSelect}
      aria-current={selected || undefined}
    >
      <button
        type="button"
        className={`ticket-check ${done ? 'is-done' : ''}`}
        aria-label={done ? 'Mark as to do' : 'Mark as completed'}
        title={done ? 'Mark as to do' : 'Mark as completed'}
        disabled={!editable}
        onClick={toggleDone}
        data-sound="switch"
      >
        {done ? '✓' : ''}
      </button>

      <div className="ticket-text">
        <span className="ticket-title">{ticket.title}</span>
        <span className="ticket-meta">
          <span className={`prio-badge prio-${ticket.priority}`}>{priorityMeta(ticket.priority).label}</span>
          {dur && <span className="meta-chip mono">◔ {dur}</span>}
          {ticket.deadlineMs != null && (
            <span className={`meta-chip mono ${overdue ? 'is-over' : ''}`}>
              ⚑ {fmtDeadline(ticket.deadlineMs, todayKey)}
            </span>
          )}
          {(ticket.descHtml || ticket.notes) && <span className="meta-chip" title="Has description">≡</span>}
          {(spent > 0 || timing) && (
            <span className={`meta-chip mono ${timing ? 'tone-break' : ''}`}>
              {timing && <span className="timing-dot" aria-hidden="true" />}
              {formatHMS(spent)}
            </span>
          )}
        </span>
      </div>

      <div className="status-menu-wrap">
        <button
          type="button"
          className={`status-chip st-${ticket.status}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={editable ? 'Change status' : undefined}
          disabled={!editable}
          data-sound="none"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu();
          }}
        >
          {st.label}
        </button>
        {menuOpen && (
          <div className="status-menu" role="menu">
            {STATUSES.map((s) => {
              const blocked = s.id === 'in_progress' && ticket.status !== 'in_progress' && !startable;
              return (
                <button
                  key={s.id}
                  role="menuitem"
                  className={`status-menu-item st-${s.id} ${ticket.status === s.id ? 'is-on' : ''}`}
                  disabled={blocked}
                  title={blocked ? 'Settle in and be In flow to start the timer' : undefined}
                  data-sound="switch"
                  onClick={(e) => pickStatus(e, s.id)}
                >
                  <span className={`status-menu-dot st-${s.id}`} aria-hidden="true" />
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}

// ── Right: detail panel for the selected task ────────────────────────────────

function DetailPanel({
  ticket,
  dateKey,
  todayKey,
  now,
  editable,
  startable,
  tracking,
  onClose,
}: {
  ticket: PlanTicket;
  dateKey: string;
  todayKey: string;
  now: number;
  editable: boolean;
  startable: boolean;
  tracking: TrackingState | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [customGoal, setCustomGoal] = useState('');
  const [customOpen, setCustomOpen] = useState(
    !!ticket.durationMin && !DURATION_PRESETS.some((p) => p.min === ticket.durationMin),
  );

  const spent = liveSpentMs(ticket, tracking, dateKey, now);
  const timing = isTiming(ticket, tracking, dateKey);
  const durationMs = ticket.durationMin ? ticket.durationMin * 60_000 : 0;
  const overGoal = durationMs > 0 && spent >= durationMs;
  const overdue = isOverdue(ticket, now);
  const dur = fmtDuration(ticket.durationMin);
  const initialDesc = ticket.descHtml ?? (ticket.notes ? textToDescHtml(ticket.notes) : '');

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === ticket.title) {
      setTitle(ticket.title);
      return;
    }
    store.updatePlanTicket(dateKey, ticket.id, { title: trimmed });
  }

  function setGoal(min: number | null) {
    setCustomOpen(false);
    store.updatePlanTicket(dateKey, ticket.id, { durationMin: min ?? undefined });
  }

  function saveCustomGoal() {
    const min = Number(customGoal);
    if (Number.isFinite(min) && min > 0) {
      store.updatePlanTicket(dateKey, ticket.id, { durationMin: Math.round(min) });
    }
  }

  function saveDesc(html: string) {
    // Once a rich description exists, the legacy plain `notes` retires.
    store.updatePlanTicket(dateKey, ticket.id, { descHtml: html || undefined, notes: undefined });
  }

  function remove() {
    if (window.confirm(`Remove “${ticket.title}”?`)) {
      store.removePlanTicket(dateKey, ticket.id);
      onClose();
    }
  }

  return (
    <section className="card detail-panel is-open" aria-label="Task details">
      <div className="detail-head">
        {editable ? (
          <input
            className="detail-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            maxLength={120}
            aria-label="Task title"
          />
        ) : (
          <h2 className="detail-title-static">{ticket.title}</h2>
        )}
        <button className="btn btn-sm detail-close" onClick={onClose} aria-label="Close details" data-sound="none">
          ✕
        </button>
      </div>

      <div className="detail-field" role="group" aria-label="Status">
        <span className="detail-label">Status</span>
        <div className="detail-segs">
          {STATUSES.map((s) => {
            const blocked = s.id === 'in_progress' && ticket.status !== 'in_progress' && !startable;
            return (
              <button
                key={s.id}
                type="button"
                className={`seg st-${s.id} ${ticket.status === s.id ? 'is-on' : ''}`}
                aria-pressed={ticket.status === s.id}
                disabled={!editable || blocked}
                title={blocked ? 'Settle in and be In flow to start the timer' : undefined}
                data-sound="switch"
                onClick={() => store.setPlanStatus(dateKey, ticket.id, s.id)}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="detail-field" role="group" aria-label="Priority">
        <span className="detail-label">Priority</span>
        <div className="detail-segs">
          {PRIORITIES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`seg seg-prio prio-${p.id} ${ticket.priority === p.id ? 'is-on' : ''}`}
              aria-pressed={ticket.priority === p.id}
              disabled={!editable}
              data-sound="none"
              onClick={() => store.updatePlanTicket(dateKey, ticket.id, { priority: p.id })}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="detail-field" role="group" aria-label="Deadline">
        <span className="detail-label">Deadline</span>
        <div className="detail-inline">
          {editable ? (
            <>
              <input
                className="input detail-deadline"
                type="datetime-local"
                value={ticket.deadlineMs != null ? toLocalInput(ticket.deadlineMs) : ''}
                onChange={(e) => {
                  const ms = e.target.value ? new Date(e.target.value).getTime() : NaN;
                  store.updatePlanTicket(dateKey, ticket.id, {
                    deadlineMs: Number.isFinite(ms) ? ms : undefined,
                  });
                }}
                aria-label="Deadline date and time"
              />
              {ticket.deadlineMs != null && (
                <button
                  className="btn btn-sm"
                  data-sound="none"
                  onClick={() => store.updatePlanTicket(dateKey, ticket.id, { deadlineMs: undefined })}
                >
                  Clear
                </button>
              )}
            </>
          ) : (
            <span className="mono">{ticket.deadlineMs != null ? fmtDeadline(ticket.deadlineMs, todayKey) : '—'}</span>
          )}
          {overdue && <span className="badge badge-overdue">Overdue</span>}
        </div>
      </div>

      <div className="detail-field" role="group" aria-label="Time goal">
        <span className="detail-label">Goal time</span>
        {editable ? (
          <div className="composer-chips">
            {DURATION_PRESETS.map((p) => {
              const on = !customOpen && (ticket.durationMin ?? null) === p.min;
              return (
                <button
                  key={p.label}
                  type="button"
                  className={`chip ${on ? 'is-on' : ''}`}
                  aria-pressed={on}
                  data-sound="none"
                  onClick={() => setGoal(p.min)}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              className={`chip ${customOpen ? 'is-on' : ''}`}
              aria-pressed={customOpen}
              data-sound="none"
              onClick={() => setCustomOpen((v) => !v)}
            >
              Custom
            </button>
            {customOpen && (
              <input
                className="input composer-custom"
                type="number"
                min={1}
                max={720}
                step={5}
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                onBlur={saveCustomGoal}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                placeholder={ticket.durationMin ? String(ticket.durationMin) : 'min'}
                aria-label="Custom time goal in minutes"
                autoFocus
              />
            )}
          </div>
        ) : (
          <span className="mono">{dur ?? '—'}</span>
        )}
      </div>

      {(spent > 0 || durationMs > 0) && (
        <div className={`ticket-time ${overGoal ? 'is-over' : ''}`}>
          {timing && <span className="timing-dot" aria-hidden="true" />}
          <span className="ticket-time-label mono">
            {timing ? 'focusing · ' : ''}
            {formatHMS(spent)}
            {dur ? ` / ${dur}` : ''}
            {overGoal ? ' ✓' : ''}
          </span>
          {durationMs > 0 && (
            <span className="ticket-progress">
              <span
                className={`ticket-progress-fill ${overGoal ? 'tone-work' : 'tone-break'}`}
                style={{ width: `${Math.min(100, (spent / durationMs) * 100)}%` }}
              />
            </span>
          )}
        </div>
      )}

      <div className="detail-field detail-desc" role="group" aria-label="Description">
        <span className="detail-label">Description</span>
        {editable ? (
          <RichTextEditor
            initialHtml={initialDesc}
            placeholder="Add details — paste screenshots right in…"
            onChange={saveDesc}
          />
        ) : initialDesc ? (
          <RichTextViewer html={initialDesc} />
        ) : (
          <span className="muted">—</span>
        )}
      </div>

      <div className="detail-foot">
        {editable && (
          <div className="detail-actions">
            <button
              className="btn btn-sm"
              title="Move to next day"
              data-sound="none"
              onClick={() => store.movePlanTicketNextDay(dateKey, ticket.id)}
            >
              → Tomorrow
            </button>
            <button className="btn btn-sm btn-danger" data-sound="none" onClick={remove}>
              Delete
            </button>
          </div>
        )}
        {ticket.createdAt > 0 && (
          <span className="muted detail-created">
            added {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </section>
  );
}
