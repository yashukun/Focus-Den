/**
 * Domain constants. These encode the non-negotiable shift rules.
 * Real-time only — there is deliberately no fast-forward / speed control.
 */

import type { BreakKey, SoundscapeId } from './types';

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

/** Human labels for each break. */
export const BREAK_LABELS: Record<BreakKey, string> = {
  break1: 'Break 1',
  break2: 'Break 2',
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
