/**
 * Domain constants. These encode the non-negotiable shift rules.
 * Real-time only — there is deliberately no fast-forward / speed control.
 */

import type {
  BreakKey,
  DashWidgetId,
  SoundscapeId,
  TicketPriority,
  TicketStatus,
} from './types';

/** Ambient soundscapes, in display order, with their labels. */
export const SOUNDSCAPE_IDS: SoundscapeId[] = [
  'rain',
  'cafe',
  'lofi',
  'fireplace',
  'forest',
  'waves',
  'wind',
];

export const SOUNDSCAPE_LABELS: Record<SoundscapeId, string> = {
  rain: 'Rain',
  cafe: 'Café',
  lofi: 'Lo-fi',
  fireplace: 'Fireplace',
  forest: 'Forest',
  waves: 'Waves',
  wind: 'Wind',
};

/** Every Today-page widget that exists (whitelist for coercion + the edit tray). */
export const DASH_WIDGET_IDS: DashWidgetId[] = [
  'focus',
  'plan',
  'breathers',
  'wins',
  'points',
  'week',
  'den',
  'clock',
  'note',
  'media',
];

/** Fresh-den layout: mirrors the classic dashboard, with the plan card on. */
export const DEFAULT_DASH_WIDGETS: DashWidgetId[] = [
  'focus',
  'plan',
  'breathers',
  'wins',
  'week',
  'points',
  'den',
];

/** Ticket statuses in display order, with the labels every screen shares. */
export const TICKET_STATUS_IDS: TicketStatus[] = ['todo', 'in_progress', 'blocked', 'done'];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Completed',
};

/** Ticket priorities in display order (most urgent first), with shared labels. */
export const TICKET_PRIORITY_IDS: TicketPriority[] = ['critical', 'high', 'med', 'low'];

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  critical: 'Critical',
  high: 'High',
  med: 'Medium',
  low: 'Low',
};

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

/** A shift lasts 12 hours, anchored to the actual clock-in time. */
export const SHIFT_MS = 12 * HOUR_MS;

/** Grace period added to every break limit before the auto-offline kicks in. */
export const GRACE_MS = 3 * MINUTE_MS;

/** Per-break time budgets. */
export const BREAK_LIMITS: Record<BreakKey, number> = {
  break1: 20 * MINUTE_MS,
  break2: 20 * MINUTE_MS,
  lunch: 50 * MINUTE_MS,
};

/** Human labels for each breather (ids stay break1/break2/lunch — persisted). */
export const BREAK_LABELS: Record<BreakKey, string> = {
  break1: 'Stretch',
  break2: 'Recharge',
  lunch: 'Lunch',
};

export const BREAK_KEYS: BreakKey[] = ['break1', 'break2', 'lunch'];

/** Points rules. */
export const POINTS = {
  /** points awarded per whole hour of working time */
  perWorkedHour: 10,
  /** bonus for a shift that never auto-offlined */
  cleanShift: 50,
  /** bonus for logging at least `taskThreshold` tasks */
  taskBonus: 20,
  taskThreshold: 3,
  /** bonus for completing all 6 shift days (Mon–Sat) in a week */
  perfectWeek: 200,
} as const;

/** Number of shift days in a perfect week (Mon–Sat; Sunday is off). */
export const SHIFT_DAYS_PER_WEEK = 6;
