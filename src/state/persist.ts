/**
 * localStorage persistence for the per-profile state object (the offline
 * working copy). The server (see api.ts + sync.ts) is the cross-device source
 * of truth; this stays as the instant, always-available local cache.
 *
 * Validation/migration lives in `core/coerce.ts` and is re-exported here so
 * existing imports keep working.
 */

import { coerceState, defaultState, type State } from '../core';

export { coerceState };

const STATE_PREFIX = 'focus-den/state/';

function stateKey(userId: string): string {
  return `${STATE_PREFIX}${userId}`;
}

export function loadState(userId: string): State {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(stateKey(userId));
    if (!raw) return defaultState();
    return coerceState(JSON.parse(raw)) ?? defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(userId: string, state: State): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(state));
  } catch {
    // Quota exceeded / private mode / disabled storage — degrade gracefully.
  }
}

export function clearState(userId: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(stateKey(userId));
  } catch {
    // ignore
  }
}
