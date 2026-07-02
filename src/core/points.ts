/**
 * Pure points math. No state mutation — given the raw shift facts, return the
 * breakdown. The balance itself is only ever changed by the store at clock-out
 * and on purchases; this module just computes the numbers.
 */

import { HOUR_MS, POINTS } from './constants';
import type { PointsBreakdown } from './types';

export interface PointsInput {
  /** real accumulated working ms for the shift */
  workedMs: number;
  /** false if the shift auto-offlined a break */
  clean: boolean;
  /** number of tasks logged that day */
  taskCount: number;
}

/**
 * Per-shift points (excludes the week-level perfect-week bonus, which depends
 * on more than this single shift).
 */
export function computePoints(input: PointsInput): PointsBreakdown {
  const workedHours = Math.floor(input.workedMs / HOUR_MS);
  const workedPoints = workedHours * POINTS.perWorkedHour;
  const cleanBonus = input.clean ? POINTS.cleanShift : 0;
  const taskBonus = input.taskCount >= POINTS.taskThreshold ? POINTS.taskBonus : 0;

  return {
    workedPoints,
    cleanBonus,
    taskBonus,
    subtotal: workedPoints + cleanBonus + taskBonus,
  };
}
