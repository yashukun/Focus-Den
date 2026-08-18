/**
 * Plan — a calendar of intentions per day (separate from the during-day wins
 * log), laid out as three panes: a compact always-visible month calendar in
 * the left rail, the selected day's task list in the middle, and a detail
 * panel that opens when a task is selected. Adding is title-first (type,
 * Enter) — the new task auto-selects so deadline / schedule / priority / rich
 * description are each one click away in the detail panel.
 *
 * Rule: current and upcoming days are editable; past days are locked (view only).
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  addDays,
  dateString,
  formatDateLabel,
  formatSlotTime,
  isDateEditable,
  monthMatrix,
  monthOf,
  monthTitle,
  ticketsFor,
  type PlanTicket,
  type State,
  type TicketPriority,
  type TicketStatus,
} from '../core';
import { store } from '../state/store';
import { play } from '../audio';
import { zoomFromRect } from '../fx';
import { RichTextEditor, RichTextViewer, textToDescHtml } from './RichText';
import { WeekGrid } from './WeekGrid';

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

/** Slot-length presets (minutes) — sizes a task, nothing is timed. */
const LENGTHS: { min: number; label: string }[] = [
  { min: 15, label: '15 min' },
  { min: 30, label: '30 min' },
  { min: 45, label: '45 min' },
  { min: 60, label: '1 h' },
  { min: 90, label: '1 h 30' },
  { min: 120, label: '2 h' },
  { min: 180, label: '3 h' },
  { min: 240, label: '4 h' },
];

function lengthLabel(min: number): string {
  const preset = LENGTHS.find((l) => l.min === min);
  if (preset) return preset.label;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function statusMeta(id: TicketStatus) {
  return STATUSES.find((s) => s.id === id)!;
}
function priorityMeta(id: TicketPriority) {
  return PRIORITIES.find((p) => p.id === id)!;
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

type PlanMode = 'day' | 'week';

// The screen remounts on every tab switch; remember the chosen mode in-session.
let rememberedMode: PlanMode = 'day';

export function PlanView({ state, now }: PlanViewProps) {
  const todayKey = dateString(now);
  const today = new Date(now);
  const [mode, setMode] = useState<PlanMode>(rememberedMode);
  const [view, setView] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const weekPaneRef = useRef<HTMLDivElement>(null);
  const weekZoomFrom = useRef<DOMRect | null>(null);

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

  function pickMode(next: PlanMode) {
    if (next === 'week' && mode === 'day') {
      // The week view will zoom out of the selected day's calendar cell.
      const cell = document.querySelector('.cal-selected') ?? document.querySelector('.cal-today');
      weekZoomFrom.current = cell?.getBoundingClientRect() ?? null;
    }
    rememberedMode = next;
    setMode(next);
    setSelectedId(null);
  }

  // Runs right after the week pane mounts, before paint — FLIP from the cell.
  useLayoutEffect(() => {
    if (mode !== 'week') return;
    const from = weekZoomFrom.current;
    weekZoomFrom.current = null;
    if (from) zoomFromRect(weekPaneRef.current?.querySelector('.week-card') ?? null, from);
  }, [mode]);

  const detail = selected && (
    <DetailPanel
      key={selected.id}
      ticket={selected}
      dateKey={selectedDay}
      todayKey={todayKey}
      now={now}
      editable={editable}
      onClose={() => setSelectedId(null)}
    />
  );

  return (
    <div className="plan-wrap">
      <div className="plan-bar" role="group" aria-label="Planner view">
        {(['day', 'week'] as const).map((m) => (
          <button
            key={m}
            type="button"
            className={`seg ${mode === m ? 'is-on' : ''}`}
            aria-pressed={mode === m}
            data-sound="switch"
            onClick={() => pickMode(m)}
          >
            {m === 'day' ? 'Day' : 'Week'}
          </button>
        ))}
      </div>

      {mode === 'week' ? (
        <div className="plan plan-week" ref={weekPaneRef}>
          <WeekGrid
            state={state}
            now={now}
            todayKey={todayKey}
            anchorDay={selectedDay}
            selectedId={selected?.id ?? null}
            onAnchor={pickDay}
            onSelect={(dateKey, id) => {
              pickDay(dateKey);
              setSelectedId(id);
            }}
            onOpenDay={(dateKey) => {
              pickDay(dateKey);
              pickMode('day');
            }}
          />
          {detail}
        </div>
      ) : (
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

          {detail}
        </div>
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
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const editable = isDateEditable(dateKey, todayKey);
  // Scheduled slots first in time order; "anytime" tasks after, as entered.
  const tickets = [...ticketsFor(state.plan, dateKey)].sort(
    (a, b) => (a.startMin ?? Number.MAX_SAFE_INTEGER) - (b.startMin ?? Number.MAX_SAFE_INTEGER),
  );
  const rel = dateKey === todayKey ? 'Today' : dateKey === addDays(todayKey, 1) ? 'Tomorrow' : null;
  const done = tickets.filter((t) => t.status === 'done').length;

  // An armed "Clear day" stands down on its own if the second click never comes.
  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClear]);

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
  // Inline two-step confirm — no native dialog (browsers can silently suppress
  // window.confirm, which made the button look broken). Arms, then auto-disarms.
  function clearDay() {
    if (!confirmClear) {
      setConfirmClear(true);
      setMsg(null);
      return;
    }
    setConfirmClear(false);
    store.clearPlanDay(dateKey);
  }
  function toggleCopyPicker() {
    if (!copyOpen) {
      const next = addDays(dateKey, 1);
      setCopyTarget(next >= todayKey ? next : todayKey);
      setMsg(null);
    }
    setCopyOpen(!copyOpen);
  }
  function copyToDate() {
    if (!copyTarget) return;
    if (copyTarget === dateKey) {
      setMsg('That is this same day — pick another.');
      return;
    }
    if (!isDateEditable(copyTarget, todayKey)) {
      setMsg('Past days are locked — pick today or a future day.');
      return;
    }
    const r = store.copyPlanDayToDay(dateKey, copyTarget);
    setMsg(
      r.tickets
        ? `Copied ${r.tickets} task${plural(r.tickets)} to ${formatDateLabel(copyTarget)}.`
        : `${formatDateLabel(copyTarget)} already has these.`,
    );
    setCopyOpen(false);
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

      {tickets.length > 0 && (
        <div className="day-foot">
          <div className="day-actions">
            {editable && (
              <>
                <button className="day-action" data-sound="none" onClick={copyNextDay} title="Copy these tasks to the next day">
                  <span className="day-action-ico" aria-hidden="true">→</span>
                  Carry to tomorrow
                </button>
                <button className="day-action" data-sound="none" onClick={copyWeek} title="Copy these tasks to the rest of this week">
                  <span className="day-action-ico" aria-hidden="true">»</span>
                  Carry to week
                </button>
              </>
            )}
            <button
              className={`day-action ${copyOpen ? 'is-open' : ''}`}
              data-sound="none"
              aria-expanded={copyOpen}
              onClick={toggleCopyPicker}
              title="Copy these tasks to any other day"
            >
              <span className="day-action-ico" aria-hidden="true">⧉</span>
              Copy to a day…
            </button>
            {editable && (
              <button
                className={`day-action day-action-danger ${confirmClear ? 'is-armed' : ''}`}
                data-sound="none"
                onClick={clearDay}
                title="Remove every task for this day"
              >
                <span className="day-action-ico" aria-hidden="true">✕</span>
                {confirmClear ? `Really clear ${tickets.length} task${plural(tickets.length)}?` : 'Clear day'}
              </button>
            )}
          </div>
          {copyOpen && (
            <div className="day-copy-row">
              <input
                className="input day-copy-date"
                type="date"
                min={todayKey}
                value={copyTarget}
                onChange={(e) => setCopyTarget(e.target.value)}
                aria-label="Day to copy these tasks to"
              />
              <button className="btn btn-sm" data-sound="none" disabled={!copyTarget} onClick={copyToDate}>
                Copy
              </button>
              <button className="btn btn-sm" data-sound="none" onClick={() => setCopyOpen(false)}>
                Cancel
              </button>
            </div>
          )}
          {msg && <p className="plan-msg tone-work">{msg}</p>}
        </div>
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
  now: number;
  selected: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSelect: () => void;
}) {
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

      <div className="ticket-body">
        <div className="ticket-line">
          <span className="ticket-title">{ticket.title}</span>
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
                {STATUSES.map((s) => (
                  <button
                    key={s.id}
                    role="menuitem"
                    className={`status-menu-item st-${s.id} ${ticket.status === s.id ? 'is-on' : ''}`}
                    data-sound="switch"
                    onClick={(e) => pickStatus(e, s.id)}
                  >
                    <span className={`status-menu-dot st-${s.id}`} aria-hidden="true" />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <span className="ticket-meta">
          <span className={`prio-badge prio-${ticket.priority}`}>{priorityMeta(ticket.priority).label}</span>
          {ticket.startMin != null && (
            <span className="meta-chip mono" title="Scheduled slot">
              ◷ {formatSlotTime(ticket.startMin)}–{formatSlotTime(ticket.startMin + (ticket.durationMin ?? 60))}
            </span>
          )}
          {ticket.startMin == null && ticket.durationMin != null && (
            <span className="meta-chip mono" title="Task length">◔ {lengthLabel(ticket.durationMin)}</span>
          )}
          {ticket.deadlineMs != null && (
            <span className={`meta-chip mono ${overdue ? 'is-over' : ''}`}>
              ⚑ {fmtDeadline(ticket.deadlineMs, todayKey)}
            </span>
          )}
          {(ticket.descHtml || ticket.notes) && <span className="meta-chip" title="Has description">≡</span>}
        </span>
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
  onClose,
}: {
  ticket: PlanTicket;
  dateKey: string;
  todayKey: string;
  now: number;
  editable: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const overdue = isOverdue(ticket, now);
  const initialDesc = ticket.descHtml ?? (ticket.notes ? textToDescHtml(ticket.notes) : '');

  // An armed Delete stands down on its own if the second click never comes.
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed || trimmed === ticket.title) {
      setTitle(ticket.title);
      return;
    }
    store.updatePlanTicket(dateKey, ticket.id, { title: trimmed });
  }

  function saveDesc(html: string) {
    // Once a rich description exists, the legacy plain `notes` retires.
    store.updatePlanTicket(dateKey, ticket.id, { descHtml: html || undefined, notes: undefined });
  }

  // Inline two-step confirm — no native dialog (browsers can suppress it).
  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    store.removePlanTicket(dateKey, ticket.id);
    onClose();
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
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`seg st-${s.id} ${ticket.status === s.id ? 'is-on' : ''}`}
              aria-pressed={ticket.status === s.id}
              disabled={!editable}
              data-sound="switch"
              onClick={() => store.setPlanStatus(dateKey, ticket.id, s.id)}
            >
              {s.label}
            </button>
          ))}
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

      <div className="detail-field" role="group" aria-label="Scheduled slot">
        <span className="detail-label">Scheduled</span>
        <div className="detail-inline">
          {editable ? (
            <>
              <input
                className="input detail-deadline"
                type="time"
                step={300}
                value={ticket.startMin != null ? formatSlotTime(ticket.startMin) : ''}
                onChange={(e) => {
                  if (!e.target.value) {
                    store.updatePlanTicket(dateKey, ticket.id, { startMin: undefined });
                    return;
                  }
                  const [h, m] = e.target.value.split(':').map(Number);
                  store.updatePlanTicket(dateKey, ticket.id, { startMin: h * 60 + m });
                }}
                aria-label="Scheduled start time"
              />
              {ticket.startMin != null ? (
                <>
                  <span className="muted mono">
                    – {formatSlotTime(ticket.startMin + (ticket.durationMin ?? 60))}
                  </span>
                  <button
                    className="btn btn-sm"
                    data-sound="none"
                    onClick={() => store.updatePlanTicket(dateKey, ticket.id, { startMin: undefined })}
                  >
                    Clear
                  </button>
                </>
              ) : (
                <span className="muted detail-slot-hint">Anytime — pick a start to slot it on the week grid</span>
              )}
            </>
          ) : (
            <span className="mono">
              {ticket.startMin != null
                ? `${formatSlotTime(ticket.startMin)} – ${formatSlotTime(ticket.startMin + (ticket.durationMin ?? 60))}`
                : '—'}
            </span>
          )}
        </div>
      </div>

      <div className="detail-field" role="group" aria-label="Length">
        <span className="detail-label">Length</span>
        {editable ? (
          <select
            className="input detail-length"
            value={ticket.durationMin ?? ''}
            onChange={(e) => {
              const min = e.target.value ? Number(e.target.value) : undefined;
              store.updatePlanTicket(dateKey, ticket.id, { durationMin: min });
            }}
            aria-label="Task length"
          >
            <option value="">1 h · default</option>
            {(ticket.durationMin && !LENGTHS.some((l) => l.min === ticket.durationMin)
              ? [...LENGTHS, { min: ticket.durationMin, label: lengthLabel(ticket.durationMin) }].sort(
                  (a, b) => a.min - b.min,
                )
              : LENGTHS
            ).map((l) => (
              <option key={l.min} value={l.min}>{l.label}</option>
            ))}
          </select>
        ) : (
          <span className="mono">{ticket.durationMin ? lengthLabel(ticket.durationMin) : '1 h'}</span>
        )}
      </div>

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
            <button
              className={`btn btn-sm btn-danger ${confirmDelete ? 'is-armed' : ''}`}
              data-sound="none"
              onClick={remove}
            >
              {confirmDelete ? 'Really delete?' : 'Delete'}
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
