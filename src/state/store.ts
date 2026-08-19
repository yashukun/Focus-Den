/**
 * The app store: a tiny framework-agnostic event emitter wrapping the pure
 * core. It holds the persisted `State` plus a transient, in-memory
 * `ShiftSummary` (the end-of-day modal payload, intentionally not persisted).
 *
 * All domain decisions live in `../core`; this layer only sequences them,
 * persists to localStorage (the single local profile), and notifies
 * subscribers. React reads it via `useStore`.
 */

import {
  addDays,
  addTask as coreAddTask,
  addTicket as planAddTicket,
  applyBreakGrace,
  applyStreakFreeze,
  canClockIn,
  clockIn as coreClockIn,
  DASH_WIDGET_IDS,
  dateString,
  defaultState,
  endTimeOf,
  finalizeShift,
  getItem,
  isActive,
  isDateEditable,
  moveTicketToDay as planMoveTo,
  moveTicketToNextDay as planMoveNext,
  removeTicket as planRemove,
  shouldAutoEnd,
  switchStatus as coreSwitch,
  ticketsFor,
  updateTicket as planUpdate,
  weekDates,
  type Appearance,
  type CosmeticSlot,
  type DashWidgetId,
  type Perks,
  type PlanTicket,
  type Settings,
  type ShiftSummary,
  type SoundscapeId,
  type State,
  type Status,
  type ThemeId,
  type TicketPatch,
  type TicketPriority,
  type TicketStatus,
} from '../core';
import { clearState, coerceState, loadState, saveState } from './persist';

export interface Snapshot {
  state: State;
  /** present only right after a wrap-up / auto-end, until dismissed */
  summary: ShiftSummary | null;
}

/** Fields for a new intention (id/status/createdAt filled by the store). */
export interface NewTicket {
  title: string;
  durationMin?: number;
  priority?: TicketPriority;
  notes?: string;
  /** allowlist-sanitized HTML (the UI sanitizes before it reaches the store) */
  descHtml?: string;
  deadlineMs?: number;
  /** scheduled start, minutes from local midnight (a slot on the week grid) */
  startMin?: number;
}

/** Clamp a scheduled start into the day, or undefined when absent/garbage. */
function clampStartMin(v: number | undefined): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return Math.min(24 * 60 - 1, Math.max(0, Math.round(v)));
}

/** Outcome of adding an intention, for inline UI feedback. */
export type AddTicketResult = 'added' | 'duplicate' | 'invalid';

/** Outcome of a duplicate action, for user feedback. */
export interface CopyResult {
  days: number;
  tickets: number;
}

let ticketSeq = 0;
function nextTicketId(): string {
  return `t${Date.now().toString(36)}-${(ticketSeq++).toString(36)}`;
}

/** Normalized title key for dedupe (so copies don't pile up duplicates). */
function titleKey(t: PlanTicket): string {
  return t.title.trim().toLowerCase();
}

/** A fresh "to do" copy of an intention (new id). */
function freshCopy(t: PlanTicket): PlanTicket {
  return {
    ...t,
    id: nextTicketId(),
    status: 'todo',
    createdAt: Date.now(),
  };
}

let state: State = loadState();
let summary: ShiftSummary | null = null;

function makeSnapshot(): Snapshot {
  return { state, summary };
}

let snapshot: Snapshot = makeSnapshot();

const listeners = new Set<() => void>();

function publish(): void {
  snapshot = makeSnapshot();
  for (const l of listeners) l();
}

function setState(next: State): void {
  if (next === state) return;
  state = next;
  saveState(state);
  publish();
}

function setSettings(patch: Partial<Settings>): void {
  setState({ ...state, settings: { ...state.settings, ...patch } });
}

/** Apply a perk purchase's effect to the perks record. */
function applyPerkPurchase(perks: Perks, id: string): Perks {
  switch (id) {
    case 'perk_streak_freeze':
      return { ...perks, streakFreeze: perks.streakFreeze + 1 };
    case 'perk_theme_midnight':
      return { ...perks, themeMidnight: true };
    case 'perk_theme_sunrise':
      return { ...perks, themeSunrise: true };
    case 'perk_grace':
      return { ...perks, graceBonusMs: 60_000 };
    case 'perk_deepwork':
      return { ...perks, deepWork: true };
    default:
      return perks;
  }
}

export const store = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): Snapshot {
    return snapshot;
  },

  getState(): State {
    return state;
  },

  // ── Day actions ──────────────────────────────────────────────────────────

  clockIn(now: number): void {
    if (!canClockIn(state, now)) return;
    summary = null;
    setState(coreClockIn(state, now));
  },

  switchStatus(target: Status, now: number): void {
    if (!isActive(state.shift.status)) return;
    const shift = coreSwitch(state.shift, target, now);
    if (shift === state.shift) return;
    setState({ ...state, shift });
  },

  addTask(text: string, now: number): void {
    if (!isActive(state.shift.status)) return;
    const shift = coreAddTask(state.shift, text, now);
    if (shift === state.shift) return;
    setState({ ...state, shift });
  },

  /** Edit a win's text in place, preserving its timestamp. */
  editTask(index: number, text: string): void {
    const tasks = state.shift.tasks;
    if (index < 0 || index >= tasks.length) return;
    const trimmed = text.trim();
    if (!trimmed || trimmed === tasks[index].text) return;
    const next = tasks.map((t, i) => (i === index ? { ...t, text: trimmed } : t));
    setState({ ...state, shift: { ...state.shift, tasks: next } });
  },

  /** Delete a win by index. */
  deleteTask(index: number): void {
    const tasks = state.shift.tasks;
    if (index < 0 || index >= tasks.length) return;
    const next = tasks.filter((_, i) => i !== index);
    setState({ ...state, shift: { ...state.shift, tasks: next } });
  },

  /** Manual "Wrap up" (finalizes early at `now`). */
  endShift(now: number): void {
    if (!isActive(state.shift.status)) return;
    const result = finalizeShift(state, now);
    summary = result.summary;
    setState(result.state);
  },

  /**
   * Per-second heartbeat. Enforces the breather grace auto-away (including any
   * permanent grace-bonus perk) and the 12h auto wrap-up. A no-op (no persist,
   * no notify) when nothing crosses a threshold — the common case.
   */
  tick(now: number): void {
    const shift = state.shift;
    const endTime = endTimeOf(shift);
    if (!isActive(shift.status) || endTime == null) return;

    const t = Math.min(now, endTime);
    const grace = applyBreakGrace(shift, t, state.perks.graceBonusMs);
    const working = grace.autoOfflined ? { ...state, shift: grace.shift } : state;

    if (shouldAutoEnd(shift, now)) {
      const result = finalizeShift(working, endTime);
      summary = result.summary;
      setState(result.state);
      return;
    }

    if (working !== state) setState(working);
  },

  dismissSummary(): void {
    if (summary === null) return;
    summary = null;
    publish();
  },

  // ── Shop / cosmetics / perks ───────────────────────────────────────────────

  buy(itemId: string): void {
    const item = getItem(itemId);
    if (!item || item.comingSoon) return;
    if (state.points < item.price) return;

    // Consumable perks (e.g. streak freeze) are re-buyable; bump the quantity.
    if (item.consumable) {
      const perks = applyPerkPurchase(state.perks, item.id);
      setState({ ...state, points: state.points - item.price, perks });
      return;
    }

    if (state.owned[itemId]) return; // non-consumable, already owned

    const owned = { ...state.owned, [itemId]: true };
    let equipped = state.equipped;
    let perks = state.perks;

    if (item.kind === 'cosmetic' && item.slot) {
      // Auto-equip a freshly bought cosmetic so the purchase visibly lands.
      equipped = { ...equipped, [item.slot]: itemId };
    } else if (item.kind === 'perk') {
      perks = applyPerkPurchase(perks, item.id);
    }

    setState({ ...state, points: state.points - item.price, owned, equipped, perks });
  },

  equip(slot: CosmeticSlot, itemId: string | null): void {
    if (itemId !== null) {
      const item = getItem(itemId);
      if (!item || item.slot !== slot || !state.owned[itemId]) return;
    }
    setState({ ...state, equipped: { ...state.equipped, [slot]: itemId } });
  },

  /** Apply a streak freeze to a missed day; returns the perfect-week bonus (0 if none). */
  applyFreeze(dayIndex: number, now: number): number {
    const result = applyStreakFreeze(state, dayIndex, now);
    if (result.state === state) return 0;
    setState(result.state);
    return result.bonusAwarded;
  },

  // ── Day planner ──────────────────────────────────────────────────────────────

  /**
   * Add an intention to a day. Rejects empty titles, locked (past) days, and
   * duplicate titles on the same day — the caller shows the feedback inline.
   */
  addPlanTicket(dateKey: string, fields: NewTicket): AddTicketResult {
    const title = fields.title.trim();
    if (!title) return 'invalid';
    const today = dateString(Date.now());
    if (!isDateEditable(dateKey, today)) return 'invalid';
    const key = title.toLowerCase();
    if (ticketsFor(state.plan, dateKey).some((t) => titleKey(t) === key)) return 'duplicate';
    const ticket: PlanTicket = {
      id: nextTicketId(),
      title,
      notes: fields.notes?.trim() || undefined,
      status: 'todo',
      priority: fields.priority ?? 'med',
      durationMin: fields.durationMin && fields.durationMin > 0 ? Math.round(fields.durationMin) : undefined,
      startMin: clampStartMin(fields.startMin),
      descHtml: fields.descHtml?.trim() || undefined,
      deadlineMs: fields.deadlineMs,
      createdAt: Date.now(),
    };
    setState({ ...state, plan: planAddTicket(state.plan, dateKey, ticket, today) });
    return 'added';
  },

  updatePlanTicket(dateKey: string, id: string, patch: TicketPatch): void {
    const next = planUpdate(state.plan, dateKey, id, patch, dateString(Date.now()));
    if (next === state.plan) return;
    setState({ ...state, plan: next });
  },

  /**
   * Change an intention's status. Marking done also logs the intention to the
   * day's wins while a shift is active.
   */
  setPlanStatus(dateKey: string, id: string, status: TicketStatus): void {
    const now = Date.now();
    const next = planUpdate(state.plan, dateKey, id, { status }, dateString(now));
    if (next === state.plan) return;
    setState({ ...state, plan: next });

    // A finished intention is logged as a win in the active day.
    if (status === 'done' && isActive(state.shift.status)) {
      const ticket = ticketsFor(state.plan, dateKey).find((t) => t.id === id);
      if (ticket) this.addTask(ticket.title, now);
    }
  },

  removePlanTicket(dateKey: string, id: string): void {
    const today = dateString(Date.now());
    const next = planRemove(state.plan, dateKey, id, today);
    if (next === state.plan) return;
    setState({ ...state, plan: next });
  },

  movePlanTicketNextDay(dateKey: string, id: string): void {
    const next = planMoveNext(state.plan, dateKey, id, dateString(Date.now()));
    if (next === state.plan) return;
    setState({ ...state, plan: next });
  },

  /**
   * End-of-day carry: MOVE every not-done intention to the following day
   * (unlike the copy actions, the source day loses them). Ones the next day
   * already has (by title) are skipped so duplicates never pile up. Returns
   * how many moved.
   */
  moveUnfinishedToNextDay(dateKey: string): number {
    const today = dateString(Date.now());
    const nextDay = addDays(dateKey, 1);
    const unfinished = ticketsFor(state.plan, dateKey).filter((t) => t.status !== 'done');
    const present = new Set(ticketsFor(state.plan, nextDay).map(titleKey));
    let plan = state.plan;
    let moved = 0;
    for (const t of unfinished) {
      if (present.has(titleKey(t))) continue;
      present.add(titleKey(t));
      plan = planMoveNext(plan, dateKey, t.id, today);
      moved += 1;
    }
    if (plan === state.plan) return 0;
    setState({ ...state, plan });
    return moved;
  },

  /**
   * Reschedule an intention onto another day (week-grid drag), optionally
   * landing it on a new slot time in the same commit.
   */
  movePlanTicketToDay(fromKey: string, id: string, toKey: string, startMin?: number): void {
    const today = dateString(Date.now());
    let plan = planMoveTo(state.plan, fromKey, id, toKey, today);
    if (plan === state.plan) return; // locked day / unknown id
    const start = clampStartMin(startMin);
    if (start !== undefined) plan = planUpdate(plan, toKey, id, { startMin: start }, today);
    setState({ ...state, plan });
  },

  /**
   * Duplicate a day's intentions onto any current/future day — skipping any
   * the target already has (by title), so repeated copies never create
   * duplicates. The source may be a past day: copying only reads it, and the
   * past-days-locked rule protects the target alone.
   */
  copyPlanDayToDay(fromKey: string, toKey: string): CopyResult {
    const today = dateString(Date.now());
    if (toKey === fromKey || !isDateEditable(toKey, today)) return { days: 0, tickets: 0 };
    const src = ticketsFor(state.plan, fromKey);
    if (!src.length) return { days: 0, tickets: 0 };
    const present = new Set(ticketsFor(state.plan, toKey).map(titleKey));
    let plan = state.plan;
    let added = 0;
    for (const t of src) {
      const key = titleKey(t);
      if (present.has(key)) continue;
      present.add(key);
      plan = planAddTicket(plan, toKey, freshCopy(t), today);
      added += 1;
    }
    if (plan === state.plan) return { days: 0, tickets: 0 };
    setState({ ...state, plan });
    return { days: 1, tickets: added };
  },

  /** "Carry to tomorrow": duplicate a day's intentions onto the following day. */
  copyPlanDayToNextDay(dateKey: string): CopyResult {
    return this.copyPlanDayToDay(dateKey, addDays(dateKey, 1));
  },

  /**
   * Duplicate a day's intentions to the rest of its week — current + upcoming
   * days only (past days skipped) — skipping any a day already has, so
   * duplicates never pile up.
   */
  copyPlanDayToWeek(dateKey: string): CopyResult {
    const today = dateString(Date.now());
    if (!isDateEditable(dateKey, today)) return { days: 0, tickets: 0 };
    const src = ticketsFor(state.plan, dateKey);
    if (!src.length) return { days: 0, tickets: 0 };
    let plan = state.plan;
    let added = 0;
    const daysTouched = new Set<string>();
    for (const target of weekDates(dateKey)) {
      if (target === dateKey || !isDateEditable(target, today)) continue;
      const present = new Set(ticketsFor(plan, target).map(titleKey));
      for (const t of src) {
        const key = titleKey(t);
        if (present.has(key)) continue;
        present.add(key);
        plan = planAddTicket(plan, target, freshCopy(t), today);
        daysTouched.add(target);
        added += 1;
      }
    }
    if (plan === state.plan) return { days: 0, tickets: 0 };
    setState({ ...state, plan });
    return { days: daysTouched.size, tickets: added };
  },

  /** Remove all intentions for an editable day. */
  clearPlanDay(dateKey: string): void {
    const today = dateString(Date.now());
    if (!isDateEditable(dateKey, today)) return;
    if (!ticketsFor(state.plan, dateKey).length) return;
    const tickets = { ...state.plan.tickets };
    delete tickets[dateKey];
    setState({ ...state, plan: { ...state.plan, tickets } });
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  setTheme(theme: ThemeId): void {
    if (theme === 'midnight' && !state.perks.themeMidnight) return;
    if (theme === 'sunrise' && !state.perks.themeSunrise) return;
    setSettings({ theme });
  },

  setAppearance(appearance: Appearance): void {
    setSettings({ appearance });
  },

  setSoundscape(id: SoundscapeId): void {
    setSettings({ soundscape: id });
  },

  setSoundscapeVolume(v: number): void {
    const vol = Math.min(1, Math.max(0, v));
    setSettings({ soundscapeVolume: vol });
  },

  setSoundscapeOn(on: boolean): void {
    setSettings({ soundscapeOn: on });
  },

  setDeepWork(on: boolean): void {
    if (on && !state.perks.deepWork) return;
    setSettings({ deepWork: on });
  },

  /**
   * Replace the Today-page layout. Defensive: unknown ids and duplicates are
   * dropped, and 'focus' (the timer hero) is forced back in if missing.
   */
  setDashWidgets(ids: DashWidgetId[]): void {
    const seen = new Set<DashWidgetId>();
    const clean = ids.filter((id) => {
      if (!DASH_WIDGET_IDS.includes(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (!seen.has('focus')) clean.unshift('focus');
    setSettings({ dashWidgets: clean });
  },

  setDashNote(text: string): void {
    const note = text.slice(0, 2000);
    if (note === state.settings.dashNote) return;
    setSettings({ dashNote: note });
  },

  completeOnboarding(): void {
    if (state.settings.onboarded) return;
    setSettings({ onboarded: true });
  },

  replayOnboarding(): void {
    setSettings({ onboarded: false });
  },

  // ── Persistence helpers (export / import) ──────────────────────────────────

  exportJSON(): string {
    return JSON.stringify(state, null, 2);
  },

  importJSON(json: string): boolean {
    try {
      const parsed = JSON.parse(json);
      const next = coerceState(parsed);
      if (next === null) return false;
      summary = null;
      setState(next);
      return true;
    } catch {
      return false;
    }
  },

  /** Wipe everything and start fresh (Settings → danger zone). */
  resetAll(): void {
    summary = null;
    clearState();
    setState(defaultState());
  },
};
