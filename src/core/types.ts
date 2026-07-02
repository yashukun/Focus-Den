/**
 * Core domain types for Focus Den.
 *
 * This module is intentionally framework-agnostic and free of side effects so
 * the same shift / points / week logic can later be lifted into a FastAPI +
 * Postgres backend without touching the UI layer.
 */

/** Every state the shift machine can be in. */
export type Status =
  | 'idle' // before clock-in
  | 'working'
  | 'break1'
  | 'break2'
  | 'lunch'
  | 'offline'
  | 'ended';

/** The three single-use breaks. */
export type BreakKey = 'break1' | 'break2' | 'lunch';

/** Statuses that accumulate logged time during a shift. */
export type AccKey = 'working' | 'break1' | 'break2' | 'lunch' | 'offline';

/** A single timestamped task log entry. */
export interface Task {
  /** epoch ms when the task was logged */
  time: number;
  text: string;
}

/** The mutable state of the current (or most recent) shift. */
export interface ShiftState {
  /** YYYY-MM-DD of the shift, or null if no shift has ever started. */
  date: string | null;
  status: Status;
  /** epoch ms of clock-in, or null when idle. */
  clockIn: number | null;
  /** epoch ms the current status began, or null when idle/ended. */
  statusStart: number | null;
  /** committed cumulative ms per status (does NOT include the live, in-progress slice). */
  acc: Record<AccKey, number>;
  /** committed cumulative ms spent inside each break (drives single-use + limits). */
  breakUsed: Record<BreakKey, number>;
  tasks: Task[];
  /** false once a break overran its limit + grace and auto-flipped to offline. */
  clean: boolean;
}

/** Per-week streak tracking. Days are indexed 0=Mon .. 5=Sat (Sunday is off). */
export interface WeekState {
  /** YYYY-MM-DD of the week's Monday, or null if no week started. */
  key: string | null;
  /** completed-day map, dayIndex (0=Mon..5=Sat) -> true */
  days: Record<number, boolean>;
  /** whether the +200 perfect-week bonus was already awarded this week */
  perfectAwarded: boolean;
  /** days that were completed via a streak-freeze rather than a real shift */
  frozen?: Record<number, boolean>;
}

/** A finalized shift, appended to history at clock-out. */
export interface HistoryEntry {
  date: string;
  /** worked ms */
  worked: number;
  /** offline ms */
  offline: number;
  /** total break ms (break1 + break2 + lunch) */
  breaks: number;
  /** per-break ms (added in v2; optional for legacy entries) */
  breaksByKey?: Record<BreakKey, number>;
  /** number of tasks logged */
  tasks: number;
  /** points earned for this day (incl. any perfect-week bonus credited that day) */
  points: number;
  clean: boolean;
}

/** A planned goal/ticket for a specific day (separate from the shift task log). */
export type TicketStatus = 'todo' | 'in_progress' | 'done';
export type TicketPriority = 'low' | 'med' | 'high';

export interface PlanTicket {
  id: string;
  title: string;
  /** optional longer description (Confluence-style detail) */
  notes?: string;
  status: TicketStatus;
  priority: TicketPriority;
  /** optional planned duration in minutes */
  durationMin?: number;
  /** committed working time tracked against this ticket, in ms */
  spentMs?: number;
  /** whether the duration-complete notification has already fired */
  notified?: boolean;
  createdAt: number;
}

/** Day planner: tickets keyed by YYYY-MM-DD. */
export interface PlanState {
  tickets: Record<string, PlanTicket[]>;
}

/**
 * The single ticket currently being timed. Its elapsed accrues only while the
 * shift status is `working` — `anchorMs` is the epoch ms accrual (re)started,
 * or null when paused (on break / offline). Time stays in sync with the shift's
 * worked clock.
 */
export interface TrackingState {
  dateKey: string;
  ticketId: string;
  anchorMs: number | null;
}

/** Equipped cosmetic slots — one item per slot. */
export interface Equipped {
  outfit: string | null;
  hair: string | null;
  accessory: string | null;
}

/** Functional perks (the "focus" half of the shop). */
export interface Perks {
  /** consumable: number of unused streak freezes */
  streakFreeze: number;
  /** ambient soundscape pack unlocked */
  soundscape: boolean;
  /** selectable themes unlocked */
  themeMidnight: boolean;
  themeSunrise: boolean;
  /** permanent extra grace per break, in ms (0 or 60_000) */
  graceBonusMs: number;
  /** deep-work focus overlay unlocked */
  deepWork: boolean;
}

export type ThemeId = 'cozy' | 'midnight' | 'sunrise';
export type Appearance = 'system' | 'light' | 'dark';
export type SoundscapeId =
  | 'rain'
  | 'cafe'
  | 'lofi'
  | 'fireplace'
  | 'forest'
  | 'waves'
  | 'wind';

/** User-facing preferences (persisted alongside game state). */
export interface Settings {
  /** active color theme; 'cozy' follows `appearance` (system/light/dark) */
  theme: ThemeId;
  appearance: Appearance;
  /** selected ambient soundscape */
  soundscape: SoundscapeId;
  /** whether the ambient soundscape is currently playing */
  soundscapeOn: boolean;
  /** ambient soundscape volume, 0..1 */
  soundscapeVolume: number;
  /** whether the deep-work overlay is active */
  deepWork: boolean;
  /** first-run onboarding completed */
  onboarded: boolean;
}

/** The single, versioned, persisted state object. */
export interface State {
  v: 2;
  points: number;
  /** itemId -> owned */
  owned: Record<string, boolean>;
  equipped: Equipped;
  perks: Perks;
  settings: Settings;
  shift: ShiftState;
  week: WeekState;
  history: HistoryEntry[];
  plan: PlanState;
  /** the ticket currently being timed against worked time, or null */
  tracking: TrackingState | null;
}

/** Shop item categories. */
export type ItemCategory = 'character' | 'room' | 'perks';

/** What an item does when owned. */
export type ItemKind = 'cosmetic' | 'prop' | 'perk';

/** Cosmetic slots a character item can occupy. */
export type CosmeticSlot = 'outfit' | 'hair' | 'accessory';

export interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  category: ItemCategory;
  kind: ItemKind;
  /** present for character cosmetics; which slot it equips into */
  slot?: CosmeticSlot;
  /** has subtle code-driven motion in the scene (respects reduced-motion) */
  animated?: boolean;
  /** re-buyable consumable (e.g. streak freeze) — tracked by quantity */
  consumable?: boolean;
  /** phase-2 seam: visible but not yet functional */
  comingSoon?: boolean;
}

/** Breakdown of points for a single shift (excludes the week-level bonus). */
export interface PointsBreakdown {
  workedPoints: number;
  cleanBonus: number;
  taskBonus: number;
  /** sum of the three lines above */
  subtotal: number;
}

/** Everything shown on the end-of-shift summary screen. */
export interface ShiftSummary {
  date: string;
  workedMs: number;
  offlineMs: number;
  breakMs: Record<BreakKey, number>;
  taskCount: number;
  clean: boolean;
  points: PointsBreakdown;
  perfectWeekBonus: number;
  /** subtotal + perfectWeekBonus — what was credited to the balance */
  totalPoints: number;
  /** balance after this shift's points were credited */
  newBalance: number;
}
