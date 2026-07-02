/**
 * Pure week-streak helpers. Mon–Sat are the six shift days; Sunday is off and
 * never counts. The week is keyed by its Monday's date so it resets cleanly.
 */

import { SHIFT_DAYS_PER_WEEK } from './constants';
import { weekKey } from './dates';
import type { WeekState } from './types';

/** A fresh, empty week for the given instant. */
export function freshWeek(now: number): WeekState {
  return { key: weekKey(now), days: {}, perfectAwarded: false };
}

/**
 * Return a week state aligned to `now`. If the stored week is for a different
 * Monday (or unset), it is reset. Otherwise the same object is returned.
 */
export function alignWeek(week: WeekState, now: number): WeekState {
  const key = weekKey(now);
  if (week.key === key) return week;
  return freshWeek(now);
}

/** How many of the six shift days are completed in this week. */
export function completedDays(week: WeekState): number {
  let count = 0;
  for (let i = 0; i < SHIFT_DAYS_PER_WEEK; i++) {
    if (week.days[i]) count++;
  }
  return count;
}

/** True once all six shift days (Mon–Sat) are completed. */
export function isPerfectWeek(week: WeekState): boolean {
  return completedDays(week) >= SHIFT_DAYS_PER_WEEK;
}
