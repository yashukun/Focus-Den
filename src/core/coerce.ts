/**
 * Pure state validation + migration. Lives in `core` (not `state/persist`) so
 * it has no `localStorage`/browser dependency and can be reused verbatim by the
 * backend to validate every incoming blob.
 *
 * This is DEEP validation, not just shape-checking: every number is clamped to
 * a finite range, every enum is whitelisted, and every string/array is capped.
 * A hostile document (imported backup, tampered sync payload) must never be
 * able to crash the app or smuggle `Infinity`/garbage into the engine — the
 * worst it can do is lose its own invalid fields to defaults.
 */

import { SOUNDSCAPE_IDS } from './constants';
import { defaultState } from './shift';
import type {
  Appearance,
  BreakKey,
  Equipped,
  HistoryEntry,
  Perks,
  PlanState,
  PlanTicket,
  Settings,
  ShiftState,
  SoundscapeId,
  State,
  Status,
  Task,
  ThemeId,
  TicketPriority,
  TicketStatus,
  TrackingState,
  WeekState,
} from './types';

// ── Caps ─────────────────────────────────────────────────────────────────────

const MAX_EPOCH_MS = 4_102_444_800_000; // year 2100 — no timestamp is beyond this
const MAX_SPAN_MS = 40 * 24 * 60 * 60 * 1000; // any single duration bucket
const MAX_POINTS = 1_000_000_000;
const MAX_ID = 64; // item / ticket ids
const MAX_TASK_TEXT = 500;
const MAX_TASKS = 500;
const MAX_TITLE = 200;
const MAX_NOTES = 2000;
const MAX_HISTORY = 5000;
const MAX_TICKETS_PER_DAY = 100;
const MAX_PLAN_DAYS = 800;
const MAX_OWNED = 300;
const MAX_FREEZES = 999;
const MAX_GRACE_BONUS_MS = 10 * 60 * 1000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Keys that must never be copied out of untrusted records. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ── Tiny validators ──────────────────────────────────────────────────────────

function num(v: unknown, def: number, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return def;
  return Math.min(max, Math.max(min, v));
}

function int(v: unknown, def: number, min: number, max: number): number {
  return Math.round(num(v, def, min, max));
}

function numOrNull(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(max, Math.max(min, v));
}

function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

function str(v: unknown, maxLen: number): string | null {
  return typeof v === 'string' ? v.slice(0, maxLen) : null;
}

function enumOf<T extends string>(v: unknown, allowed: readonly T[], def: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : def;
}

function dateKeyOrNull(v: unknown): string | null {
  return typeof v === 'string' && DATE_RE.test(v) ? v : null;
}

function safeEntries(v: unknown): [string, unknown][] {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return [];
  return Object.entries(v as Record<string, unknown>).filter(([k]) => !FORBIDDEN_KEYS.has(k));
}

// ── Section coercers ─────────────────────────────────────────────────────────

const STATUSES: readonly Status[] = ['idle', 'working', 'break1', 'break2', 'lunch', 'offline', 'ended'];
const THEMES: readonly ThemeId[] = ['cozy', 'midnight', 'sunrise'];
const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'];
const TICKET_STATUSES: readonly TicketStatus[] = ['todo', 'in_progress', 'done'];
const PRIORITIES: readonly TicketPriority[] = ['low', 'med', 'high'];
const BREAKS: readonly BreakKey[] = ['break1', 'break2', 'lunch'];

function coerceOwned(v: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  let n = 0;
  for (const [key, val] of safeEntries(v)) {
    if (n >= MAX_OWNED) break;
    if (key.length === 0 || key.length > MAX_ID || !val) continue;
    out[key] = true;
    n += 1;
  }
  return out;
}

function coerceEquipped(v: unknown): Equipped {
  const obj = (v ?? {}) as Partial<Record<keyof Equipped, unknown>>;
  return {
    outfit: str(obj.outfit, MAX_ID),
    hair: str(obj.hair, MAX_ID),
    accessory: str(obj.accessory, MAX_ID),
  };
}

function coercePerks(v: unknown, base: Perks): Perks {
  const obj = (v ?? {}) as Partial<Record<keyof Perks, unknown>>;
  return {
    streakFreeze: int(obj.streakFreeze, base.streakFreeze, 0, MAX_FREEZES),
    soundscape: bool(obj.soundscape, base.soundscape),
    themeMidnight: bool(obj.themeMidnight, base.themeMidnight),
    themeSunrise: bool(obj.themeSunrise, base.themeSunrise),
    graceBonusMs: num(obj.graceBonusMs, base.graceBonusMs, 0, MAX_GRACE_BONUS_MS),
    deepWork: bool(obj.deepWork, base.deepWork),
  };
}

function coerceSettings(v: unknown, base: Settings): Settings {
  const obj = (v ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    theme: enumOf<ThemeId>(obj.theme, THEMES, base.theme),
    appearance: enumOf<Appearance>(obj.appearance, APPEARANCES, base.appearance),
    soundscape: enumOf<SoundscapeId>(obj.soundscape, SOUNDSCAPE_IDS, base.soundscape),
    soundscapeOn: bool(obj.soundscapeOn, base.soundscapeOn),
    soundscapeVolume: num(obj.soundscapeVolume, base.soundscapeVolume, 0, 1),
    deepWork: bool(obj.deepWork, base.deepWork),
    onboarded: bool(obj.onboarded, base.onboarded),
  };
}

function coerceTasks(v: unknown): Task[] {
  if (!Array.isArray(v)) return [];
  const out: Task[] = [];
  for (const item of v.slice(0, MAX_TASKS)) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Partial<Task>;
    const text = str(t.text, MAX_TASK_TEXT)?.trim();
    if (!text) continue;
    out.push({ time: num(t.time, 0, 0, MAX_EPOCH_MS), text });
  }
  return out;
}

function coerceSpans(v: unknown, keys: readonly string[]): Record<string, number> {
  const obj = (v ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const key of keys) out[key] = num(obj[key], 0, 0, MAX_SPAN_MS);
  return out;
}

function coerceShift(v: unknown, base: ShiftState): ShiftState {
  const obj = (v ?? {}) as Partial<Record<keyof ShiftState, unknown>>;
  return {
    date: dateKeyOrNull(obj.date),
    status: enumOf<Status>(obj.status, STATUSES, base.status),
    clockIn: numOrNull(obj.clockIn, 0, MAX_EPOCH_MS),
    statusStart: numOrNull(obj.statusStart, 0, MAX_EPOCH_MS),
    acc: coerceSpans(obj.acc, ['working', 'break1', 'break2', 'lunch', 'offline']) as ShiftState['acc'],
    breakUsed: coerceSpans(obj.breakUsed, BREAKS) as ShiftState['breakUsed'],
    tasks: coerceTasks(obj.tasks),
    clean: bool(obj.clean, base.clean),
  };
}

function coerceDayFlags(v: unknown): Record<number, boolean> {
  const out: Record<number, boolean> = {};
  for (const [key, val] of safeEntries(v)) {
    const idx = Number(key);
    if (Number.isInteger(idx) && idx >= 0 && idx <= 5 && val === true) out[idx] = true;
  }
  return out;
}

function coerceWeek(v: unknown, base: WeekState): WeekState {
  const obj = (v ?? {}) as Partial<Record<keyof WeekState, unknown>>;
  const week: WeekState = {
    key: dateKeyOrNull(obj.key),
    days: coerceDayFlags(obj.days),
    perfectAwarded: bool(obj.perfectAwarded, base.perfectAwarded),
  };
  const frozen = coerceDayFlags(obj.frozen);
  if (Object.keys(frozen).length > 0) week.frozen = frozen;
  return week;
}

function coerceHistory(v: unknown): HistoryEntry[] {
  if (!Array.isArray(v)) return [];
  const out: HistoryEntry[] = [];
  // Keep the most recent entries when over the cap.
  for (const item of v.slice(-MAX_HISTORY)) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Partial<HistoryEntry>;
    const date = dateKeyOrNull(e.date);
    if (!date) continue;
    const entry: HistoryEntry = {
      date,
      worked: num(e.worked, 0, 0, MAX_SPAN_MS),
      offline: num(e.offline, 0, 0, MAX_SPAN_MS),
      breaks: num(e.breaks, 0, 0, MAX_SPAN_MS),
      tasks: int(e.tasks, 0, 0, 100_000),
      points: int(e.points, 0, 0, MAX_POINTS),
      clean: bool(e.clean, true),
    };
    if (e.breaksByKey && typeof e.breaksByKey === 'object') {
      entry.breaksByKey = coerceSpans(e.breaksByKey, BREAKS) as HistoryEntry['breaksByKey'];
    }
    out.push(entry);
  }
  return out;
}

function coerceTicket(v: unknown): PlanTicket | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Partial<PlanTicket>;
  const id = str(t.id, MAX_ID);
  const title = str(t.title, MAX_TITLE)?.trim();
  if (!id || !title) return null;
  const ticket: PlanTicket = {
    id,
    title,
    status: enumOf<TicketStatus>(t.status, TICKET_STATUSES, 'todo'),
    priority: enumOf<TicketPriority>(t.priority, PRIORITIES, 'med'),
    createdAt: num(t.createdAt, 0, 0, MAX_EPOCH_MS),
  };
  const notes = str(t.notes, MAX_NOTES)?.trim();
  if (notes) ticket.notes = notes;
  const durationMin = numOrNull(t.durationMin, 1, 24 * 60);
  if (durationMin !== null) ticket.durationMin = Math.round(durationMin);
  const spentMs = numOrNull(t.spentMs, 0, MAX_SPAN_MS);
  if (spentMs !== null) ticket.spentMs = spentMs;
  if (typeof t.notified === 'boolean') ticket.notified = t.notified;
  return ticket;
}

function coercePlan(v: unknown): PlanState {
  const obj = (v ?? {}) as { tickets?: unknown };
  const tickets: Record<string, PlanTicket[]> = {};
  let days = 0;
  for (const [key, val] of safeEntries(obj.tickets)) {
    if (days >= MAX_PLAN_DAYS) break;
    if (!DATE_RE.test(key) || !Array.isArray(val)) continue;
    const list = val
      .slice(0, MAX_TICKETS_PER_DAY)
      .map(coerceTicket)
      .filter((t): t is PlanTicket => t !== null);
    if (list.length === 0) continue;
    tickets[key] = list;
    days += 1;
  }
  return { tickets };
}

function coerceTracking(v: unknown): TrackingState | null {
  if (!v || typeof v !== 'object') return null;
  const t = v as Partial<TrackingState>;
  const dateKey = dateKeyOrNull(t.dateKey);
  const ticketId = str(t.ticketId, MAX_ID);
  if (!dateKey || !ticketId) return null;
  return { dateKey, ticketId, anchorMs: numOrNull(t.anchorMs, 0, MAX_EPOCH_MS) };
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Validate + migrate a parsed blob into a full v2 State, or return null if it
 * isn't a recognizable Focus Den state. Accepts v1 (the MVP shape) and migrates
 * it forward; every field is individually validated and defaults on failure.
 */
export function coerceState(raw: unknown): State | null {
  const base = defaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Partial<Omit<State, 'v'>> & { v?: number };

  // Only known versions are accepted; anything else is rejected.
  if (obj.v !== 1 && obj.v !== 2) return null;

  return {
    v: 2,
    points: int(obj.points, base.points, 0, MAX_POINTS),
    owned: coerceOwned(obj.owned),
    equipped: coerceEquipped(obj.equipped),
    perks: coercePerks(obj.perks, base.perks),
    settings: coerceSettings(obj.settings, base.settings),
    shift: coerceShift(obj.shift, base.shift),
    week: coerceWeek(obj.week, base.week),
    history: coerceHistory(obj.history),
    plan: coercePlan(obj.plan),
    tracking: coerceTracking(obj.tracking),
  };
}
