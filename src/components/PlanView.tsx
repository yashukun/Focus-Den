/**
 * Day Planner — a calendar of predetermined goals/tickets per day (separate
 * from the during-shift task log). Pick a day on the month grid, then add /
 * edit / delete tickets, set a status (To do → In progress → Done), give an
 * optional duration, move a ticket to the next day, or copy a day's tickets to
 * the rest of its week.
 *
 * Rule: current and upcoming days are editable; past days are locked (view only).
 */

import { useState } from 'react';
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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const STATUSES: { id: TicketStatus; label: string; tone: string }[] = [
  { id: 'todo', label: 'To do', tone: 'idle' },
  { id: 'in_progress', label: 'In progress', tone: 'break' },
  { id: 'done', label: 'Done', tone: 'work' },
];

const PRIORITIES: { id: TicketPriority; label: string; tone: string }[] = [
  { id: 'low', label: 'Low', tone: 'break' },
  { id: 'med', label: 'Med', tone: 'points' },
  { id: 'high', label: 'High', tone: 'offline' },
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

export interface PlanViewProps {
  state: State;
  now: number;
}

export function PlanView({ state, now }: PlanViewProps) {
  const todayKey = dateString(now);
  const today = new Date(now);
  const [view, setView] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [selected, setSelected] = useState(todayKey);

  const weeks = monthMatrix(view.y, view.m);

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      if (m < 0) return { y: v.y - 1, m: 11 };
      if (m > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m };
    });
  }
  function goToday() {
    setView({ y: today.getFullYear(), m: today.getMonth() });
    setSelected(todayKey);
  }
  function pick(dateKey: string) {
    setSelected(dateKey);
    const m = monthOf(dateKey);
    if (m !== view.m) setView({ y: Number(dateKey.slice(0, 4)), m });
  }

  return (
    <div className="plan">
      <section className="card plan-cal">
        <div className="cal-head">
          <h2>{monthTitle(view.y, view.m)}</h2>
          <div className="cal-nav">
            <button className="btn btn-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">‹</button>
            <button className="btn btn-sm" onClick={goToday}>Today</button>
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
            const isToday = dateKey === todayKey;
            const isSelected = dateKey === selected;
            const isPast = dateKey < todayKey;
            const tickets = ticketsFor(state.plan, dateKey);
            const cls = [
              'cal-cell',
              inMonth ? '' : 'cal-out',
              isToday ? 'cal-today' : '',
              isSelected ? 'cal-selected' : '',
              isPast ? 'cal-past' : '',
            ].filter(Boolean).join(' ');
            return (
              <button
                key={dateKey}
                className={cls}
                aria-pressed={isSelected}
                aria-label={`${formatDateLabel(dateKey)}, ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}
                onClick={() => pick(dateKey)}
                data-sound="none"
              >
                <span className="cal-num">{dayNum}</span>
                {tickets.length > 0 && (
                  <span className="cal-dots">
                    {tickets.slice(0, 3).map((t) => (
                      <span key={t.id} className={`cal-dot tone-${statusMeta(t.status).tone}`} />
                    ))}
                    {tickets.length > 3 && <span className="cal-more">+{tickets.length - 3}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <DayPanel key={selected} state={state} dateKey={selected} todayKey={todayKey} now={now} />
    </div>
  );
}

function DayPanel({
  state,
  dateKey,
  todayKey,
  now,
}: {
  state: State;
  dateKey: string;
  todayKey: string;
  now: number;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const editable = isDateEditable(dateKey, todayKey);
  const tickets = ticketsFor(state.plan, dateKey);
  const rel = dateKey === todayKey ? 'Today' : dateKey === addDays(todayKey, 1) ? 'Tomorrow' : null;
  // Tickets can only be *started* (timed) for today while clocked in & Working.
  const startable = dateKey === todayKey && state.shift.status === 'working';

  const plural = (n: number) => (n === 1 ? '' : 's');

  function copyNextDay() {
    const r = store.copyPlanDayToNextDay(dateKey);
    setMsg(
      r.tickets
        ? `Copied ${r.tickets} ticket${plural(r.tickets)} to tomorrow.`
        : 'Tomorrow already has these tickets.',
    );
  }
  function copyWeek() {
    const r = store.copyPlanDayToWeek(dateKey);
    setMsg(
      r.tickets
        ? `Copied ${r.tickets} ticket${plural(r.tickets)} to ${r.days} upcoming day${plural(r.days)} this week.`
        : 'Already up to date — no new copies needed.',
    );
  }

  function clearDay() {
    if (window.confirm(`Clear all ${tickets.length} ticket(s) for ${formatDateLabel(dateKey)}?`)) {
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
      </div>

      {editable && tickets.length > 0 && (
        <>
          <div className="day-actions">
            <button className="btn btn-sm" onClick={copyNextDay} title="Duplicate these tickets to the next day">
              Copy → tomorrow
            </button>
            <button className="btn btn-sm" onClick={copyWeek} title="Duplicate these tickets to current + upcoming days this week">
              Copy → week
            </button>
            <button className="btn btn-sm" onClick={clearDay} title="Delete all tickets for this day">
              Clear day
            </button>
          </div>
          {msg && <p className="plan-msg tone-work">{msg}</p>}
        </>
      )}

      {editable && <AddTicketForm dateKey={dateKey} />}

      {editable && !startable && tickets.length > 0 && dateKey === todayKey && (
        <p className="muted plan-hint">Clock in and switch to <strong>Working</strong> to start a ticket’s timer.</p>
      )}

      {tickets.length === 0 ? (
        <p className="muted empty">
          {editable ? 'No tickets yet — add a goal for this day.' : 'Nothing was planned for this day.'}
        </p>
      ) : (
        <ul className="ticket-list">
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              dateKey={dateKey}
              editable={editable}
              startable={startable}
              tracking={state.tracking}
              now={now}
            />
          ))}
        </ul>
      )}

      {!editable && (
        <p className="muted day-locked-note">Past days can’t be changed — they’re a record of what you planned.</p>
      )}
    </section>
  );
}

function AddTicketForm({ dateKey }: { dateKey: string }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('med');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const min = Number(duration);
    store.addPlanTicket(dateKey, {
      title,
      priority,
      durationMin: Number.isFinite(min) && min > 0 ? min : undefined,
    });
    setTitle('');
    setDuration('');
    setPriority('med');
  }

  return (
    <form className="ticket-add" onSubmit={submit}>
      <input
        className="input"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Goal for the day — e.g. Learn DSA: trees"
        aria-label="Ticket title"
        maxLength={120}
      />
      <div className="ticket-add-row">
        <input
          className="input ticket-dur"
          type="number"
          min={0}
          step={5}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="min"
          aria-label="Planned duration in minutes (optional)"
        />
        <select
          className="input ticket-prio"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TicketPriority)}
          aria-label="Priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit" disabled={!title.trim()} data-sound="task">
          Add
        </button>
      </div>
    </form>
  );
}

function TicketCard({
  ticket,
  dateKey,
  editable,
  startable,
  tracking,
  now,
}: {
  ticket: PlanTicket;
  dateKey: string;
  editable: boolean;
  startable: boolean;
  tracking: TrackingState | null;
  now: number;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(ticket.title);
  const [notes, setNotes] = useState(ticket.notes ?? '');
  const [duration, setDuration] = useState(ticket.durationMin ? String(ticket.durationMin) : '');
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);

  const spent = liveSpentMs(ticket, tracking, dateKey, now);
  const timing = isTiming(ticket, tracking, dateKey);
  const durationMs = ticket.durationMin ? ticket.durationMin * 60_000 : 0;
  const overGoal = durationMs > 0 && spent >= durationMs;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const min = Number(duration);
    store.updatePlanTicket(dateKey, ticket.id, {
      title: title.trim(),
      notes: notes.trim() || undefined,
      priority,
      durationMin: Number.isFinite(min) && min > 0 ? Math.round(min) : undefined,
    });
    setEditing(false);
  }

  const dur = fmtDuration(ticket.durationMin);
  const prio = priorityMeta(ticket.priority);

  if (editing && editable) {
    return (
      <li className="ticket ticket-editing">
        <form onSubmit={save} className="ticket-edit">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Title" autoFocus />
          <textarea className="input ticket-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" rows={2} aria-label="Notes" />
          <div className="ticket-add-row">
            <input className="input ticket-dur" type="number" min={0} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="min" aria-label="Duration" />
            <select className="input ticket-prio" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} aria-label="Priority">
              {PRIORITIES.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
            </select>
            <button className="btn btn-sm btn-primary" type="submit" data-sound="none">Save</button>
            <button className="btn btn-sm" type="button" data-sound="none" onClick={() => setEditing(false)}>✕</button>
          </div>
        </form>
      </li>
    );
  }

  const spentLabel = spent > 0 || durationMs > 0 ? formatHMS(spent) : null;

  return (
    <li className={`ticket ${ticket.status === 'done' ? 'ticket-done' : ''} ${timing ? 'ticket-timing-row' : ''}`}>
      <div className="ticket-main">
        <span className={`prio-dot tone-${prio.tone}`} title={`${prio.label} priority`} aria-hidden="true" />
        <div className="ticket-text">
          <span className="ticket-title">{ticket.title}</span>
          {ticket.notes && <span className="ticket-note">{ticket.notes}</span>}
        </div>
        {dur && <span className="ticket-dur-chip mono">{dur}</span>}
      </div>

      {spentLabel && (
        <div className={`ticket-time ${overGoal ? 'is-over' : ''}`}>
          {timing && <span className="timing-dot" aria-hidden="true" />}
          <span className="ticket-time-label mono">
            {timing ? 'timing · ' : ''}
            {spentLabel}
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

      <div className="ticket-foot">
        {editable ? (
          <div className="ticket-status" role="group" aria-label="Status">
            {STATUSES.map((s) => {
              const disabled = s.id === 'in_progress' && ticket.status !== 'in_progress' && !startable;
              return (
                <button
                  key={s.id}
                  className={`status-seg tone-${s.tone} ${ticket.status === s.id ? 'is-on' : ''}`}
                  aria-pressed={ticket.status === s.id}
                  disabled={disabled}
                  title={disabled ? 'Clock in and be Working to start the timer' : undefined}
                  onClick={() => store.setPlanStatus(dateKey, ticket.id, s.id)}
                  data-sound="switch"
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className={`status-label tone-${statusMeta(ticket.status).tone}`}>
            {statusMeta(ticket.status).label}
          </span>
        )}

        {editable && (
          <div className="ticket-actions">
            <button type="button" title="Edit" aria-label="Edit ticket" data-sound="none" onClick={() => setEditing(true)}>✎</button>
            <button type="button" title="Move to next day" aria-label="Move to next day" data-sound="none" onClick={() => store.movePlanTicketNextDay(dateKey, ticket.id)}>→</button>
            <button type="button" title="Delete" aria-label="Delete ticket" data-sound="none" onClick={() => store.removePlanTicket(dateKey, ticket.id)}>🗑</button>
          </div>
        )}
      </div>
    </li>
  );
}
