/**
 * Pure state validation + migration. Lives in `core` (not `state/persist`) so
 * it has no `localStorage`/browser dependency and can be reused verbatim by the
 * backend to validate every incoming blob.
 */

import { defaultState } from './shift';
import type { State } from './types';

/**
 * Validate + migrate a parsed blob into a full v2 State, or return null if it
 * isn't a recognizable Focus Den state. Accepts v1 (the MVP shape) and migrates
 * it forward with sensible defaults.
 */
export function coerceState(raw: unknown): State | null {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Partial<Omit<State, 'v'>> & { v?: number };

  // Only known versions are accepted; anything else is rejected.
  if (obj.v !== 1 && obj.v !== 2) return null;

  return {
    v: 2,
    points: typeof obj.points === 'number' ? obj.points : base.points,
    owned: obj.owned && typeof obj.owned === 'object' ? obj.owned : base.owned,
    equipped: {
      outfit: obj.equipped?.outfit ?? null,
      hair: obj.equipped?.hair ?? null,
      accessory: obj.equipped?.accessory ?? null,
    },
    perks: { ...base.perks, ...(obj.perks ?? {}) },
    settings: { ...base.settings, ...(obj.settings ?? {}) },
    shift: { ...base.shift, ...(obj.shift ?? {}) },
    week: { ...base.week, ...(obj.week ?? {}) },
    history: Array.isArray(obj.history) ? obj.history : base.history,
    plan: obj.plan && typeof obj.plan === 'object' && obj.plan.tickets ? obj.plan : base.plan,
    tracking:
      obj.tracking && typeof obj.tracking === 'object' && obj.tracking.ticketId && obj.tracking.dateKey
        ? obj.tracking
        : null,
  };
}
