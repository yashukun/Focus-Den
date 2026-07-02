/**
 * The shift engine — pure, deterministic, framework-agnostic.
 *
 * Every function takes the current state plus an explicit `now` (epoch ms) and
 * returns new immutable state or a derived value. Nothing here reads the clock,
 * touches storage, or imports React. This is the module a future FastAPI +
 * Postgres backend would reuse verbatim.
 *
 * Key invariant: `acc` / `breakUsed` hold only *committed* time. The slice of
 * time spent in the current status since `statusStart` is added live by the
 * `live*` helpers and only written into `acc` when the status is committed
 * (on a switch, on auto-offline, or at finalize).
 */

import { BREAK_KEYS, BREAK_LIMITS, GRACE_MS, SHIFT_MS } from './constants';
import { dateString, dayIndexMonSat } from './dates';
import { computePoints } from './points';
import { alignWeek, isPerfectWeek } from './week';
import { POINTS } from './constants';
import type {
  AccKey,
  BreakKey,
  PointsBreakdown,
  ShiftState,
  ShiftSummary,
  State,
  Status,
} from './types';

// ── Factories ─────────────────────────────────────────────────────────────

export function freshShift(): ShiftState {
  return {
    date: null,
    status: 'idle',
    clockIn: null,
    statusStart: null,
    acc: { working: 0, break1: 0, break2: 0, lunch: 0, offline: 0 },
    breakUsed: { break1: 0, break2: 0, lunch: 0 },
    tasks: [],
    clean: true,
  };
}

export function defaultPerks() {
  return {
    streakFreeze: 0,
    soundscape: false,
    themeMidnight: false,
    themeSunrise: false,
    graceBonusMs: 0,
    deepWork: false,
  };
}

export function defaultSettings() {
  return {
    theme: 'cozy' as const,
    appearance: 'system' as const,
    soundscape: 'rain' as const,
    soundscapeOn: false,
    soundscapeVolume: 0.6,
    deepWork: false,
    onboarded: false,
  };
}

export function defaultState(): State {
  return {
    v: 2,
    points: 0,
    owned: {},
    equipped: { outfit: null, hair: null, accessory: null },
    perks: defaultPerks(),
    settings: defaultSettings(),
    shift: freshShift(),
    week: { key: null, days: {}, perfectAwarded: false },
    history: [],
    plan: { tickets: {} },
    tracking: null,
  };
}

// ── Status predicates ───────────────────────────────────────────────────────

const ACTIVE_STATUSES: ReadonlySet<Status> = new Set<Status>([
  'working',
  'break1',
  'break2',
  'lunch',
  'offline',
]);

const ACC_KEYS: ReadonlySet<string> = new Set<AccKey>([
  'working',
  'break1',
  'break2',
  'lunch',
  'offline',
]);

const BREAK_SET: ReadonlySet<string> = new Set<BreakKey>(BREAK_KEYS);

/** True while a shift is running (any switchable status). */
export function isActive(status: Status): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function isAccKey(status: Status): status is AccKey {
  return ACC_KEYS.has(status);
}

export function isBreakKey(status: Status): status is BreakKey {
  return BREAK_SET.has(status);
}

// ── Time / progress derivations ─────────────────────────────────────────────

/** epoch ms when the 12h window closes, or null when idle. */
export function endTimeOf(shift: ShiftState): number | null {
  return shift.clockIn == null ? null : shift.clockIn + SHIFT_MS;
}

/** Committed acc plus the live, in-progress slice of the current status. */
export function liveAcc(shift: ShiftState, now: number): Record<AccKey, number> {
  const result = { ...shift.acc };
  if (isActive(shift.status) && isAccKey(shift.status) && shift.statusStart != null) {
    result[shift.status] += Math.max(0, now - shift.statusStart);
  }
  return result;
}

/** Committed breakUsed plus the live slice if a break is currently active. */
export function liveBreakUsed(shift: ShiftState, now: number): Record<BreakKey, number> {
  const result = { ...shift.breakUsed };
  if (isBreakKey(shift.status) && shift.statusStart != null) {
    result[shift.status] += Math.max(0, now - shift.statusStart);
  }
  return result;
}

/** Real accumulated working ms (committed + live). */
export function workedMs(shift: ShiftState, now: number): number {
  return liveAcc(shift, now).working;
}

/** Live ms spent in a given break this shift. */
export function breakElapsed(shift: ShiftState, key: BreakKey, now: number): number {
  return liveBreakUsed(shift, now)[key];
}

/** Remaining ms in a break before its limit (clamped at 0; ignores grace). */
export function breakRemaining(shift: ShiftState, key: BreakKey, now: number): number {
  return Math.max(0, BREAK_LIMITS[key] - breakElapsed(shift, key, now));
}

/** A break is consumed (single-use) once any committed time exists for it. */
export function isBreakConsumed(shift: ShiftState, key: BreakKey): boolean {
  return shift.breakUsed[key] > 0;
}

/** Whether the user may switch into a given break right now. */
export function canEnterBreak(shift: ShiftState, key: BreakKey): boolean {
  return isActive(shift.status) && shift.status !== key && !isBreakConsumed(shift, key);
}

/** Progress through the 12h window for the shift progress bar. */
export function shiftProgress(
  shift: ShiftState,
  now: number,
): { elapsed: number; total: number; remaining: number; fraction: number } {
  if (shift.clockIn == null) {
    return { elapsed: 0, total: SHIFT_MS, remaining: SHIFT_MS, fraction: 0 };
  }
  const elapsed = Math.min(SHIFT_MS, Math.max(0, now - shift.clockIn));
  return {
    elapsed,
    total: SHIFT_MS,
    remaining: SHIFT_MS - elapsed,
    fraction: elapsed / SHIFT_MS,
  };
}

// ── Clock-in eligibility ────────────────────────────────────────────────────

/**
 * One shift per calendar day. May clock in only when no shift is currently
 * running and today is not the locked (already-finished) day.
 */
export function canClockIn(state: State, now: number): boolean {
  return !isActive(state.shift.status) && state.shift.date !== dateString(now);
}

// ── Mutations (return new state) ────────────────────────────────────────────

/** Commit the current status's elapsed slice into acc/breakUsed; advance start. */
export function commit(shift: ShiftState, now: number): ShiftState {
  if (shift.statusStart == null) return shift;
  const elapsed = Math.max(0, now - shift.statusStart);
  const acc = { ...shift.acc };
  const breakUsed = { ...shift.breakUsed };
  if (isAccKey(shift.status)) acc[shift.status] += elapsed;
  if (isBreakKey(shift.status)) breakUsed[shift.status] += elapsed;
  return { ...shift, acc, breakUsed, statusStart: now };
}

/** Begin a new shift for the day. Caller must check `canClockIn` first. */
export function clockIn(state: State, now: number): State {
  const week = alignWeek(state.week, now);
  const shift: ShiftState = {
    date: dateString(now),
    status: 'working',
    clockIn: now,
    statusStart: now,
    acc: { working: 0, break1: 0, break2: 0, lunch: 0, offline: 0 },
    breakUsed: { break1: 0, break2: 0, lunch: 0 },
    tasks: [],
    clean: true,
  };
  return { ...state, week, shift };
}

/**
 * One-tap status switch. Commits the prior status's time, then enters `target`.
 * Returns the shift unchanged for invalid transitions (inactive shift, or a
 * consumed break) so callers can stay simple.
 */
export function switchStatus(shift: ShiftState, target: Status, now: number): ShiftState {
  if (!isActive(shift.status)) return shift;
  if (!isActive(target)) return shift;
  // Offline is reached only automatically (a break overrunning its grace) —
  // it can't be chosen by hand.
  if (target === 'offline') return shift;
  if (isBreakKey(target) && target !== shift.status && isBreakConsumed(shift, target)) {
    return shift;
  }
  const committed = commit(shift, now);
  return { ...committed, status: target };
}

/** Append a timestamped task. */
export function addTask(shift: ShiftState, text: string, now: number): ShiftState {
  const trimmed = text.trim();
  if (!trimmed) return shift;
  return { ...shift, tasks: [...shift.tasks, { time: now, text: trimmed }] };
}

/** Total grace window (base 3 min + any permanent perk bonus), in ms. */
export function effectiveGrace(graceBonusMs = 0): number {
  return GRACE_MS + Math.max(0, graceBonusMs);
}

/** The auto-offline threshold for a break: its limit + effective grace. */
export function breakThreshold(key: BreakKey, graceBonusMs = 0): number {
  return BREAK_LIMITS[key] + effectiveGrace(graceBonusMs);
}

/**
 * Enforce break limits + grace. If the active break has reached limit + grace
 * (plus any permanent perk bonus), cap its committed time at the threshold,
 * move the overflow into offline, flip status to offline, mark the shift not
 * clean. `graceBonusMs` shifts the threshold without altering the base rule.
 */
export function applyBreakGrace(
  shift: ShiftState,
  now: number,
  graceBonusMs = 0,
): { shift: ShiftState; autoOfflined: boolean } {
  if (!isBreakKey(shift.status) || shift.statusStart == null) {
    return { shift, autoOfflined: false };
  }
  const key = shift.status;
  const elapsed = Math.max(0, now - shift.statusStart);
  const total = shift.breakUsed[key] + elapsed;
  const threshold = breakThreshold(key, graceBonusMs);
  if (total < threshold) return { shift, autoOfflined: false };

  const breakCommit = threshold - shift.breakUsed[key];
  const offlineExtra = total - threshold;
  const acc = { ...shift.acc };
  const breakUsed = { ...shift.breakUsed };
  acc[key] += breakCommit;
  acc.offline += offlineExtra;
  breakUsed[key] += breakCommit;

  return {
    shift: {
      ...shift,
      acc,
      breakUsed,
      status: 'offline',
      statusStart: now,
      clean: false,
    },
    autoOfflined: true,
  };
}

/** True once the 12h window has elapsed for an active shift. */
export function shouldAutoEnd(shift: ShiftState, now: number): boolean {
  const end = endTimeOf(shift);
  return isActive(shift.status) && end != null && now >= end;
}

// ── Previews ────────────────────────────────────────────────────────────────

/**
 * Live "earned today (so far)" preview. Same math as the real award minus the
 * week-level perfect-week bonus. Finalizes (and may change) at clock-out.
 */
export function earnedPreview(shift: ShiftState, now: number): PointsBreakdown {
  const live = liveAcc(shift, now);
  return computePoints({
    workedMs: live.working,
    clean: shift.clean,
    taskCount: shift.tasks.length,
  });
}

// ── Finalize (clock-out / auto-end) ─────────────────────────────────────────

/**
 * Finalize the active shift at `now` (clamped to the 12h window). Commits time,
 * computes points (incl. a one-time perfect-week bonus), credits the balance,
 * advances the weekly streak, and appends a history entry.
 *
 * Returns the unchanged state + null summary if there is no active shift.
 */
export function finalizeShift(
  state: State,
  now: number,
): { state: State; summary: ShiftSummary | null } {
  const shift = state.shift;
  if (!isActive(shift.status) || shift.clockIn == null || shift.date == null) {
    return { state, summary: null };
  }

  const endTime = shift.clockIn + SHIFT_MS;
  const t = Math.min(now, endTime);
  const committed = commit(shift, t);

  const worked = committed.acc.working;
  const offline = committed.acc.offline;
  const breakMs: Record<BreakKey, number> = {
    break1: committed.acc.break1,
    break2: committed.acc.break2,
    lunch: committed.acc.lunch,
  };
  const taskCount = committed.tasks.length;
  const clean = committed.clean;

  const points = computePoints({ workedMs: worked, clean, taskCount });

  // Attribute the shift to its clock-in day/week (not `now`, which for an
  // auto-end is the window's close and could differ).
  const week = alignWeek(state.week, shift.clockIn);
  const dayIdx = dayIndexMonSat(shift.clockIn);
  const days = { ...week.days };
  if (dayIdx >= 0) days[dayIdx] = true;
  let perfectAwarded = week.perfectAwarded;
  let perfectWeekBonus = 0;
  const nextWeek = { ...week, days };
  if (!perfectAwarded && isPerfectWeek(nextWeek)) {
    perfectWeekBonus = POINTS.perfectWeek;
    perfectAwarded = true;
  }
  nextWeek.perfectAwarded = perfectAwarded;

  const totalPoints = points.subtotal + perfectWeekBonus;
  const newBalance = state.points + totalPoints;

  const endedShift: ShiftState = {
    ...committed,
    status: 'ended',
    statusStart: null,
  };

  const historyEntry = {
    date: shift.date,
    worked,
    offline,
    breaks: breakMs.break1 + breakMs.break2 + breakMs.lunch,
    breaksByKey: breakMs,
    tasks: taskCount,
    points: totalPoints,
    clean,
  };

  const summary: ShiftSummary = {
    date: shift.date,
    workedMs: worked,
    offlineMs: offline,
    breakMs,
    taskCount,
    clean,
    points,
    perfectWeekBonus,
    totalPoints,
    newBalance,
  };

  return {
    state: {
      ...state,
      points: newBalance,
      shift: endedShift,
      week: nextWeek,
      history: [...state.history, historyEntry],
    },
    summary,
  };
}

// ── Streak freeze (perk) ────────────────────────────────────────────────────

/**
 * Whether a streak freeze can be applied to `dayIndex` (0=Mon..5=Sat) of the
 * current week: a freeze must be in stock and the day must not already be done.
 */
export function canApplyFreeze(state: State, dayIndex: number, now: number): boolean {
  if (state.perks.streakFreeze <= 0) return false;
  if (dayIndex < 0 || dayIndex >= 6) return false;
  const wk = alignWeek(state.week, now);
  return !wk.days[dayIndex];
}

/**
 * Apply a streak freeze to a missed day: mark it complete, decrement the
 * freeze count, then re-evaluate the perfect-week bonus (awarding +200 once if
 * the freeze completes all six days). Pure — returns the new state and the
 * bonus credited (0 if none).
 */
export function applyStreakFreeze(
  state: State,
  dayIndex: number,
  now: number,
): { state: State; bonusAwarded: number } {
  if (!canApplyFreeze(state, dayIndex, now)) return { state, bonusAwarded: 0 };

  const wk = alignWeek(state.week, now);
  const days = { ...wk.days, [dayIndex]: true };
  const frozen = { ...(wk.frozen ?? {}), [dayIndex]: true };
  const nextWeek = { ...wk, days, frozen };

  let bonus = 0;
  if (!nextWeek.perfectAwarded && isPerfectWeek(nextWeek)) {
    bonus = POINTS.perfectWeek;
    nextWeek.perfectAwarded = true;
  }

  return {
    state: {
      ...state,
      perks: { ...state.perks, streakFreeze: state.perks.streakFreeze - 1 },
      week: nextWeek,
      points: state.points + bonus,
    },
    bonusAwarded: bonus,
  };
}
