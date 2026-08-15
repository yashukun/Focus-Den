/**
 * localStorage persistence for the single local profile. Focus Den is
 * local-first and (for now) local-only: this device's storage is the source of
 * truth. Validation/migration lives in `core/coerce.ts` and is re-exported here
 * so existing imports keep working.
 */

import { coerceState, defaultState, type State } from '../core';

export { coerceState };

const STATE_PREFIX = 'focus-den/state/';
const LOCAL_KEY = `${STATE_PREFIX}local`;
/** Where the removed accounts build kept the signed-in profile id. */
const LEGACY_SESSION_KEY = 'focus-den/session';

function parse(raw: string | null): State | null {
  if (!raw) return null;
  try {
    return coerceState(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Any per-user state left behind by the old accounts build (best match first). */
function findLegacyProfile(): State | null {
  const lastUserId = localStorage.getItem(LEGACY_SESSION_KEY);
  if (lastUserId) {
    const state = parse(localStorage.getItem(`${STATE_PREFIX}${lastUserId}`));
    if (state) return state;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STATE_PREFIX) || key === LOCAL_KEY) continue;
    const state = parse(localStorage.getItem(key));
    if (state) return state;
  }
  return null;
}

/**
 * Load the local profile. On the first run after login was removed, adopt the
 * profile that was last signed in on this device (or any profile found) so
 * nobody loses their den in the transition.
 */
export function loadState(): State {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const own = parse(localStorage.getItem(LOCAL_KEY));
    if (own) return own;
    const legacy = findLegacyProfile();
    if (legacy) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(legacy));
      return legacy;
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state: State): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded / private mode / disabled storage — degrade gracefully.
  }
}

export function clearState(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
}
