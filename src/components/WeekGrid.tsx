/**
 * Week grid — the Plan screen's "Week" mode: seven day columns over a full
 * 24-hour track, so a whole week can be blocked out in advance. A slot is just
 * an intention with a scheduled start (`startMin`); its height is its length
 * (`durationMin`, an hour when unset). Tickets without a start sit in the
 * day's "anytime" row under the header.
 *
 * Interactions: click an empty spot to drop a slot there (title-first, like the
 * day composer) · drag a slot to another time/day · drag its bottom edge to
 * resize it · click it to open the detail panel. Past days stay locked (view
 * only), same rule as everywhere else in the planner.
 */

import { useEffect, useRef, useState } from 'react';
import {
  addDays,
  formatDateLabel,
  formatSlotTime,
  isDateEditable,
  sortDayTickets,
  ticketsFor,
  weekDates,
  type PlanTicket,
  type State,
} from '../core';
import { store } from '../state/store';
import { play } from '../audio';

const HOUR_PX = 48; // one hour of track height
const DAY_MIN = 24 * 60;
const SNAP = 15; // drag snap (minutes)
const CREATE_SNAP = 30; // click-to-create snap (minutes)
const DEFAULT_DUR = 60; // slot length when no goal time is set
const DRAG_THRESHOLD_PX = 5; // below this a pointerdown is a click (select)

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function slotLen(t: PlanTicket): number {
  return t.durationMin ?? DEFAULT_DUR;
}

/** "Aug 17 – 23" (or "Aug 31 – Sep 6" across a month boundary). */
function weekTitle(days: string[]): string {
  const monthDay = (k: string) => formatDateLabel(k).split(', ')[1]; // "Aug 17"
  const a = monthDay(days[0]);
  const b = monthDay(days[6]);
  return a.split(' ')[0] === b.split(' ')[0] ? `${a} – ${b.split(' ')[1]}` : `${a} – ${b}`;
}

/**
 * Lane layout for overlapping slots: greedy interval partitioning, then every
 * slot in an overlap cluster shares the cluster's lane count so widths line up.
 */
function layoutLanes(scheduled: PlanTicket[]): Map<string, { lane: number; lanes: number }> {
  const blocks = scheduled
    .map((t) => ({ id: t.id, start: t.startMin!, end: t.startMin! + slotLen(t) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: string[] = [];
  let laneEnds: number[] = [];
  const flush = () => {
    for (const id of cluster) out.get(id)!.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const b of blocks) {
    if (cluster.length > 0 && b.start >= Math.max(...laneEnds)) flush();
    let lane = laneEnds.findIndex((end) => end <= b.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(b.end);
    } else {
      laneEnds[lane] = b.end;
    }
    out.set(b.id, { lane, lanes: 1 });
    cluster.push(b.id);
  }
  flush();
  return out;
}

interface DragOp {
  mode: 'move' | 'resize';
  fromKey: string;
  id: string;
  origStart: number;
  dur: number;
  /** minutes between the block's start and where inside it the pointer grabbed */
  grabOffsetMin: number;
  startX: number;
  startY: number;
  active: boolean; // crossed the click/drag threshold
}

/** Live preview of the drag, rendered as a ghost until pointer-up commits. */
interface DragPreview {
  mode: 'move' | 'resize';
  id: string;
  toKey: string;
  startMin: number;
  durationMin: number;
  allowed: boolean;
}

export interface WeekGridProps {
  state: State;
  now: number;
  todayKey: string;
  /** any day inside the week to show */
  anchorDay: string;
  selectedId: string | null;
  onAnchor: (dateKey: string) => void;
  onSelect: (dateKey: string, id: string) => void;
  /** day-header click → jump to that day in Day mode */
  onOpenDay: (dateKey: string) => void;
}

export function WeekGrid({
  state,
  now,
  todayKey,
  anchorDay,
  selectedId,
  onAnchor,
  onSelect,
  onOpenDay,
}: WeekGridProps) {
  const days = weekDates(anchorDay);
  const isThisWeek = days.includes(todayKey);

  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragOp | null>(null);
  const previewRef = useRef<DragPreview | null>(null);
  const suppressClickUntil = useRef(0);
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const [composing, setComposing] = useState<{ dateKey: string; startMin: number } | null>(null);
  const [composerTitle, setComposerTitle] = useState('');
  const [composerFeedback, setComposerFeedback] = useState<string | null>(null);

  // Wake up looking at the working hours, not midnight.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * HOUR_PX });
  }, []);

  function closeComposer() {
    setComposing(null);
    setComposerTitle('');
    setComposerFeedback(null);
  }

  function openComposer(dateKey: string, startMin: number) {
    setComposing({ dateKey, startMin: clamp(startMin, 0, DAY_MIN - DEFAULT_DUR) });
    setComposerTitle('');
    setComposerFeedback(null);
  }

  function submitComposer(e: React.FormEvent) {
    e.preventDefault();
    if (!composing) return;
    const title = composerTitle.trim();
    if (!title) return;
    const result = store.addPlanTicket(composing.dateKey, {
      title,
      startMin: composing.startMin,
      durationMin: DEFAULT_DUR,
    });
    if (result === 'duplicate') {
      setComposerFeedback('Already on this day.');
      return;
    }
    if (result === 'added') {
      play('task');
      closeComposer();
    }
  }

  /**
   * Pointer position → (day, raw unsnapped minutes) on the grid. Ratios of the
   * measured rect, not HOUR_PX: client coordinates are visual pixels, which the
   * global `html { zoom }` scales away from CSS pixels.
   */
  function slotAt(clientX: number, clientY: number): { dateKey: string; min: number } | null {
    const cols = colsRef.current;
    if (!cols) return null;
    const rect = cols.getBoundingClientRect();
    const dayIdx = clamp(Math.floor(((clientX - rect.left) / rect.width) * 7), 0, 6);
    return { dateKey: days[dayIdx], min: ((clientY - rect.top) / rect.height) * DAY_MIN };
  }

  function beginBlockDrag(
    e: React.PointerEvent,
    dateKey: string,
    ticket: PlanTicket,
    mode: 'move' | 'resize',
  ) {
    if (!isDateEditable(dateKey, todayKey) || e.button !== 0) return;
    e.preventDefault();
    const at = slotAt(e.clientX, e.clientY);
    dragRef.current = {
      mode,
      fromKey: dateKey,
      id: ticket.id,
      origStart: ticket.startMin!,
      dur: slotLen(ticket),
      grabOffsetMin: at ? clamp(at.min - ticket.startMin!, 0, slotLen(ticket)) : 0,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };

    const setPreview = (p: DragPreview | null) => {
      previewRef.current = p;
      setDrag(p);
    };

    const onMove = (ev: PointerEvent) => {
      const op = dragRef.current;
      if (!op) return;
      if (!op.active) {
        if (Math.hypot(ev.clientX - op.startX, ev.clientY - op.startY) < DRAG_THRESHOLD_PX) return;
        op.active = true;
      }
      const at = slotAt(ev.clientX, ev.clientY);
      if (!at) return;
      if (op.mode === 'move') {
        const snapped = Math.round((at.min - op.grabOffsetMin) / SNAP) * SNAP;
        setPreview({
          mode: 'move',
          id: op.id,
          toKey: at.dateKey,
          startMin: clamp(snapped, 0, DAY_MIN - op.dur),
          durationMin: op.dur,
          allowed: isDateEditable(at.dateKey, todayKey),
        });
      } else {
        const snapped = Math.round((at.min - op.origStart) / SNAP) * SNAP;
        setPreview({
          mode: 'resize',
          id: op.id,
          toKey: op.fromKey,
          startMin: op.origStart,
          durationMin: clamp(snapped, SNAP, DAY_MIN - op.origStart),
          allowed: true,
        });
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const op = dragRef.current;
      const preview = previewRef.current;
      dragRef.current = null;
      setPreview(null);
      if (!op) return;
      if (!op.active) {
        onSelect(op.fromKey, op.id); // plain click → open details
        return;
      }
      suppressClickUntil.current = performance.now() + 250;
      if (!preview || !preview.allowed) return; // dropped on a locked day — snap back
      if (preview.mode === 'resize') {
        store.updatePlanTicket(op.fromKey, op.id, { durationMin: preview.durationMin });
      } else if (preview.toKey === op.fromKey) {
        store.updatePlanTicket(op.fromKey, op.id, { startMin: preview.startMin });
      } else {
        store.movePlanTicketToDay(op.fromKey, op.id, preview.toKey, preview.startMin);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  function onColumnClick(e: React.MouseEvent<HTMLDivElement>, dateKey: string) {
    if (!isDateEditable(dateKey, todayKey)) return;
    if (performance.now() < suppressClickUntil.current) return;
    if ((e.target as Element).closest('.wk-block, .wk-composer')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = ((e.clientY - rect.top) / rect.height) * DAY_MIN;
    openComposer(dateKey, Math.floor(raw / CREATE_SNAP) * CREATE_SNAP);
  }

  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();

  return (
    <section className="card week-card">
      <div className="card-head">
        <div className="day-title">
          <h2>{weekTitle(days)}</h2>
          {isThisWeek && <span className="badge tone-work">This week</span>}
        </div>
        <div className="cal-nav">
          <button className="btn btn-sm" onClick={() => onAnchor(addDays(days[0], -7))} aria-label="Previous week">‹</button>
          {!isThisWeek && (
            <button className="btn btn-sm" onClick={() => onAnchor(todayKey)}>This week</button>
          )}
          <button className="btn btn-sm" onClick={() => onAnchor(addDays(days[0], 7))} aria-label="Next week">›</button>
        </div>
      </div>

      <div className="wk-scroll" ref={scrollRef}>
        <div className="wk-inner">
          <div className="wk-head">
            <div className="wk-corner" aria-hidden="true" />
            <div className="wk-head-days">
              {days.map((dateKey) => (
                <DayHead
                  key={dateKey}
                  state={state}
                  dateKey={dateKey}
                  todayKey={todayKey}
                  selectedId={selectedId}
                  onOpenDay={onOpenDay}
                  onSelect={onSelect}
                  onAdd={() => openComposer(dateKey, 9 * 60)}
                />
              ))}
            </div>
          </div>

          <div className="wk-body">
            <div className="wk-gutter" aria-hidden="true">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="wk-hour mono">{formatSlotTime(h * 60)}</div>
              ))}
            </div>
            <div className="wk-cols" ref={colsRef}>
              {days.map((dateKey) => {
                const editable = isDateEditable(dateKey, todayKey);
                const tickets = ticketsFor(state.plan, dateKey);
                const scheduled = tickets.filter((t) => t.startMin != null);
                const lanes = layoutLanes(scheduled);
                return (
                  <div
                    key={dateKey}
                    className={[
                      'wk-col',
                      dateKey === todayKey ? 'is-today' : '',
                      editable ? '' : 'is-locked',
                    ].filter(Boolean).join(' ')}
                    onClick={(e) => onColumnClick(e, dateKey)}
                  >
                    {scheduled.map((t) => {
                      const resizing = drag?.mode === 'resize' && drag.id === t.id;
                      const start = t.startMin!;
                      const dur = resizing ? drag!.durationMin : slotLen(t);
                      const lane = lanes.get(t.id)!;
                      const moving = drag?.mode === 'move' && drag.id === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          className={[
                            'wk-block',
                            `prio-${t.priority}`,
                            `st-${t.status}`,
                            t.status === 'done' ? 'is-done' : '',
                            t.id === selectedId ? 'is-selected' : '',
                            moving ? 'is-drag-src' : '',
                            resizing ? 'is-resizing' : '',
                          ].filter(Boolean).join(' ')}
                          style={{
                            top: (start / 60) * HOUR_PX,
                            height: Math.max(20, (dur / 60) * HOUR_PX - 2),
                            left: `${(lane.lane / lane.lanes) * 100}%`,
                            width: `calc(${100 / lane.lanes}% - 3px)`,
                          }}
                          title={`${t.title} · ${formatSlotTime(start)} – ${formatSlotTime(start + dur)}`}
                          data-sound="none"
                          onPointerDown={(e) => beginBlockDrag(e, dateKey, t, 'move')}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onSelect(dateKey, t.id);
                            }
                          }}
                        >
                          <span className="wk-block-time mono">
                            {formatSlotTime(start)} – {formatSlotTime(start + dur)}
                          </span>
                          <span className="wk-block-title">{t.title}</span>
                          {editable && (
                            <span
                              className="wk-resize"
                              aria-hidden="true"
                              onPointerDown={(e) => {
                                e.stopPropagation();
                                beginBlockDrag(e, dateKey, t, 'resize');
                              }}
                            />
                          )}
                        </button>
                      );
                    })}

                    {drag?.mode === 'move' && drag.toKey === dateKey && (
                      <div
                        className={`wk-block wk-ghost ${drag.allowed ? '' : 'is-invalid'}`}
                        style={{
                          top: (drag.startMin / 60) * HOUR_PX,
                          height: Math.max(20, (drag.durationMin / 60) * HOUR_PX - 2),
                        }}
                        aria-hidden="true"
                      >
                        <span className="wk-block-time mono">
                          {formatSlotTime(drag.startMin)} – {formatSlotTime(drag.startMin + drag.durationMin)}
                        </span>
                      </div>
                    )}

                    {composing?.dateKey === dateKey && (
                      <form
                        className="wk-composer"
                        style={{ top: (composing.startMin / 60) * HOUR_PX }}
                        onSubmit={submitComposer}
                      >
                        <span className="wk-composer-time mono">
                          {formatSlotTime(composing.startMin)} – {formatSlotTime(composing.startMin + DEFAULT_DUR)}
                        </span>
                        <input
                          className="wk-composer-input"
                          value={composerTitle}
                          onChange={(e) => {
                            setComposerTitle(e.target.value);
                            if (composerFeedback) setComposerFeedback(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') closeComposer();
                          }}
                          onBlur={closeComposer}
                          placeholder="Task, then Enter"
                          aria-label={`New task on ${formatDateLabel(dateKey)} at ${formatSlotTime(composing.startMin)}`}
                          maxLength={120}
                          autoFocus
                        />
                        {composerFeedback && <span className="wk-composer-feedback">{composerFeedback}</span>}
                      </form>
                    )}

                    {dateKey === todayKey && (
                      <div className="wk-now" style={{ top: (nowMin / 60) * HOUR_PX }} aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="muted wk-hint">
        Click an open spot to schedule a slot · drag a slot to move it, or its bottom edge to change its length.
      </p>
    </section>
  );
}

/** Sticky column header: day label, quick add, and the day's "anytime" tasks. */
function DayHead({
  state,
  dateKey,
  todayKey,
  selectedId,
  onOpenDay,
  onSelect,
  onAdd,
}: {
  state: State;
  dateKey: string;
  todayKey: string;
  selectedId: string | null;
  onOpenDay: (dateKey: string) => void;
  onSelect: (dateKey: string, id: string) => void;
  onAdd: () => void;
}) {
  const editable = isDateEditable(dateKey, todayKey);
  // Unscheduled ("anytime") tasks used to pile into a scrolling stack of tiny
  // chips inside the header — cap it: open tasks first, at most two chips,
  // and a "+N more" chip that opens the day. Bounded, no inner scrollbars.
  const anytime = sortDayTickets(
    ticketsFor(state.plan, dateKey).filter((t) => t.startMin == null),
  );
  const ANYTIME_CHIPS = 2;
  const anytimeShown = anytime.slice(0, ANYTIME_CHIPS);
  const anytimeMore = anytime.length - anytimeShown.length;
  const label = formatDateLabel(dateKey); // "Mon, Jun 29"
  return (
    <div
      className={[
        'wk-day-head',
        dateKey === todayKey ? 'is-today' : '',
        editable ? '' : 'is-locked',
      ].filter(Boolean).join(' ')}
    >
      <div className="wk-day-top">
        <button
          type="button"
          className="wk-day-label"
          title={`Open ${label} in Day view`}
          data-sound="none"
          onClick={() => onOpenDay(dateKey)}
        >
          <span className="wk-day-name">{label.slice(0, 3)}</span>
          <span className="wk-day-num">{Number(dateKey.slice(8, 10))}</span>
        </button>
        {editable && (
          <button
            type="button"
            className="wk-day-add"
            aria-label={`Add a task on ${label}`}
            title="Add a task (9:00 slot)"
            data-sound="none"
            onClick={onAdd}
          >
            ＋
          </button>
        )}
      </div>
      {anytime.length > 0 && (
        <div className="wk-anytime">
          {anytimeShown.map((t) => (
            <button
              key={t.id}
              type="button"
              className={[
                'wk-chip',
                `prio-${t.priority}`,
                t.status === 'done' ? 'is-done' : '',
                t.id === selectedId ? 'is-selected' : '',
              ].filter(Boolean).join(' ')}
              title={`${t.title} — no time slot yet`}
              data-sound="none"
              onClick={() => onSelect(dateKey, t.id)}
            >
              {t.title}
            </button>
          ))}
          {anytimeMore > 0 && (
            <button
              type="button"
              className="wk-chip wk-chip-more"
              title={`${anytimeMore} more without a slot — open the day`}
              data-sound="none"
              onClick={() => onOpenDay(dateKey)}
            >
              +{anytimeMore} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
