/**
 * Plan — a calendar of intentions per day (separate from the during-day wins
 * log), laid out as three panes: a compact always-visible month calendar in
 * the left rail, the selected day's task list in the middle, and a detail
 * panel that opens when a task is selected. Adding is title-first (type,
 * Enter) — the new task auto-selects so priority / length / rich
 * description are each one click away in the detail panel.
 *
 * Rule: current and upcoming days are editable; past days are locked (view only).
 */

import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  dateString,
  formatDateLabel,
  formatHM,
  formatSlotTime,
  isDateEditable,
  liveSpentMs,
  monthMatrix,
  monthOf,
  monthTitle,
  sortDayTickets,
  TICKET_PRIORITY_IDS,
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_IDS,
  TICKET_STATUS_LABELS,
  ticketsFor,
  type PlanTicket,
  type State,
  type TicketStatus,
} from '../core';
import { store } from '../state/store';
import { ATTENTION_EVENT, consumeAttention } from '../state/attention';
import { play } from '../audio';
import { RichTextEditor, RichTextViewer, textToDescHtml } from './RichText';
import { useArmedConfirm } from './useArmedConfirm';
import { useEscape } from './useEscape';
import { WeekGrid } from './WeekGrid';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const STATUSES = TICKET_STATUS_IDS.map((id) => ({ id, label: TICKET_STATUS_LABELS[id] }));
const PRIORITIES = TICKET_PRIORITY_IDS.map((id) => ({ id, label: TICKET_PRIORITY_LABELS[id] }));

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
  // A clicked reminder lands here: jump to the task's day and flash its row.
  const [noticedId, setNoticedId] = useState<string | null>(null);

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
    rememberedMode = next;
    setMode(next);
    setSelectedId(null);
  }

  // Consume a pending reminder click: on mount (App just switched us in),
  // on window focus (desktop notification click) and on the attention event
  // (web notification click while the planner is already open).
  useEffect(() => {
    const tryConsume = () => {
      const p = consumeAttention();
      if (!p) return;
      rememberedMode = 'day';
      setMode('day');
      setSelectedDay(p.dateKey);
      setSelectedId(null);
      const m = monthOf(p.dateKey);
      setView({ y: Number(p.dateKey.slice(0, 4)), m });
      setNoticedId(p.ticketId);
      // scroll the flashed row into view once it has rendered
      window.setTimeout(() => {
        document.querySelector('.ticket.is-noticed')?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        });
      }, 120);
    };
    tryConsume();
    window.addEventListener('focus', tryConsume);
    window.addEventListener(ATTENTION_EVENT, tryConsume);
    return () => {
      window.removeEventListener('focus', tryConsume);
      window.removeEventListener(ATTENTION_EVENT, tryConsume);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners live once
  }, []);

  // The flash is brief by design: 2.5 s, then the row returns to normal.
  useEffect(() => {
    if (!noticedId) return;
    const t = window.setTimeout(() => setNoticedId(null), 2500);
    return () => window.clearTimeout(t);
  }, [noticedId]);

  const detail = selected && (
    <DetailPanel
      key={selected.id}
      ticket={selected}
      dateKey={selectedDay}
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

      {/* key={mode} remounts the pane so the rise-in replays on every switch,
          matching the tab-switch entrance everywhere else in the app */}
      {mode === 'week' ? (
        <div className="plan plan-week plan-enter" key="week">
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
        <div className={`plan plan-enter ${selected ? 'has-detail' : ''}`} key="day">
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
            selectedId={selected?.id ?? null}
            noticedId={noticedId}
            onSelect={setSelectedId}
            onAdded={(title) => setPendingTitle(title)}
          />

          {/* Always-rendered third column: its width animates 0 ↔ open, so the
              task list scooches over smoothly instead of jumping. */}
          <div className="plan-detail-col">{detail}</div>
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
  selectedId,
  noticedId,
  onSelect,
  onAdded,
}: {
  state: State;
  dateKey: string;
  todayKey: string;
  selectedId: string | null;
  /** reminder-clicked ticket — briefly flashed */
  noticedId: string | null;
  onSelect: (id: string) => void;
  onAdded: (titleKey: string) => void;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const [confirmClear, fireClear] = useArmedConfirm();
  useEscape(() => setCopyOpen(false), copyOpen);
  const editable = isDateEditable(dateKey, todayKey);
  const tickets = sortDayTickets(ticketsFor(state.plan, dateKey));
  const rel = dateKey === todayKey ? 'Today' : dateKey === addDays(todayKey, 1) ? 'Tomorrow' : null;
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
    setMsg(null);
    fireClear(() => store.clearPlanDay(dateKey));
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
              editable={editable}
              selected={t.id === selectedId}
              noticed={t.id === noticedId}
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
  editable,
  selected,
  noticed,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onSelect,
}: {
  ticket: PlanTicket;
  dateKey: string;
  editable: boolean;
  selected: boolean;
  /** true for ~2.5 s after this task's reminder was clicked */
  noticed: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onSelect: () => void;
}) {
  const done = ticket.status === 'done';

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
        noticed ? 'is-noticed' : '',
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
              {TICKET_STATUS_LABELS[ticket.status]}
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
          <span className={`prio-badge prio-${ticket.priority}`}>{TICKET_PRIORITY_LABELS[ticket.priority]}</span>
          {ticket.startMin != null && (
            <span className="meta-chip mono" title="Scheduled slot">
              ◷ {formatSlotTime(ticket.startMin)}–{formatSlotTime(ticket.startMin + (ticket.durationMin ?? 60))}
            </span>
          )}
          {ticket.startMin == null && ticket.durationMin != null && (
            <span className="meta-chip mono" title="Task length">◔ {lengthLabel(ticket.durationMin)}</span>
          )}
          {(ticket.descHtml || ticket.notes) && <span className="meta-chip" title="Has description">≡</span>}
        </span>
      </div>
    </li>
  );
}

// ── Length: presets + a custom h/min entry ───────────────────────────────────

function LengthField({
  ticket,
  dateKey,
  editable,
}: {
  ticket: PlanTicket;
  dateKey: string;
  editable: boolean;
}) {
  const isPreset = ticket.durationMin == null || LENGTHS.some((l) => l.min === ticket.durationMin);
  const [custom, setCustom] = useState(!isPreset);

  function commitCustom(h: number, m: number) {
    const total = Math.max(5, Math.min(24 * 60, Math.round(h) * 60 + Math.round(m)));
    store.updatePlanTicket(dateKey, ticket.id, { durationMin: total });
  }

  const curH = Math.floor((ticket.durationMin ?? 60) / 60);
  const curM = (ticket.durationMin ?? 60) % 60;

  return (
    <div className="detail-field" role="group" aria-label="Length">
      <span className="detail-label">Length</span>
      {editable ? (
        <div className="detail-inline detail-length-row">
          <select
            className="input detail-length"
            value={custom ? 'custom' : ticket.durationMin ?? ''}
            onChange={(e) => {
              if (e.target.value === 'custom') {
                setCustom(true);
                return;
              }
              setCustom(false);
              const min = e.target.value ? Number(e.target.value) : undefined;
              store.updatePlanTicket(dateKey, ticket.id, { durationMin: min });
            }}
            aria-label="Task length"
          >
            <option value="">1 h · default</option>
            {LENGTHS.map((l) => (
              <option key={l.min} value={l.min}>{l.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
          {custom && (
            <span className="detail-custom-len">
              <input
                className="input detail-len-num"
                type="number"
                min={0}
                max={24}
                defaultValue={curH}
                aria-label="Hours"
                onChange={(e) => commitCustom(Number(e.target.value) || 0, curM)}
              />
              <span className="muted">h</span>
              <input
                className="input detail-len-num"
                type="number"
                min={0}
                max={59}
                step={5}
                defaultValue={curM}
                aria-label="Minutes"
                onChange={(e) => commitCustom(curH, Number(e.target.value) || 0)}
              />
              <span className="muted">min</span>
            </span>
          )}
        </div>
      ) : (
        <span className="mono">{ticket.durationMin ? lengthLabel(ticket.durationMin) : '1 h'}</span>
      )}
    </div>
  );
}

// ── Right: detail panel for the selected task ────────────────────────────────

function DetailPanel({
  ticket,
  dateKey,
  now,
  editable,
  onClose,
}: {
  ticket: PlanTicket;
  dateKey: string;
  now: number;
  editable: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(ticket.title);
  const [confirmDelete, fireDelete] = useArmedConfirm();

  // Esc backs out of the details — edits auto-save, so nothing is lost.
  useEscape(onClose);

  const initialDesc = ticket.descHtml ?? (ticket.notes ? textToDescHtml(ticket.notes) : '');

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

  function remove() {
    fireDelete(() => {
      store.removePlanTicket(dateKey, ticket.id);
      onClose();
    });
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

      <LengthField ticket={ticket} dateKey={dateKey} editable={editable} />

      {/* the task stopwatch — ticks live while the ticket is In progress */}
      {liveSpentMs(ticket, now) > 0 && (
        <div className="detail-field" role="group" aria-label="Time tracked">
          <span className="detail-label">Tracked</span>
          <span className="mono tone-work">
            {formatHM(liveSpentMs(ticket, now))}
            {ticket.status === 'in_progress' && <span className="muted"> · running</span>}
          </span>
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
