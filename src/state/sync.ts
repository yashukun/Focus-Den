/**
 * Sync controller — keeps the local (offline) working copy in sync with the
 * server using last-write-wins on the whole State document.
 *
 * - On every local change the store calls `markDirty()` → a debounced push.
 * - On sign-in / reconnect, `pullAndReconcile()` fetches the server copy and
 *   adopts whichever side is newer (by edit time).
 * - It never blocks the UI: pushes are best-effort; localStorage remains the
 *   always-available working copy, so the app stays fully usable offline.
 *
 * Edit times are stamped with a **server-corrected clock**: we estimate the
 * offset between this device's clock and the server's (midpoint method against
 * /api/health) and add it to every stamp. Otherwise a device with a skewed-fast
 * clock would win every LWW conflict. Offline-before-first-calibration falls
 * back to the last persisted offset (or 0 — the old behavior).
 *
 * It talks to the store only through injected callbacks (`bindStore`) to avoid
 * a circular import.
 */

import { coerceState, defaultState, type State } from '../core';
import { api, ApiError, getToken } from './api';

/** Pure last-write-wins choice by edit time. Exported for tests. */
export function pickNewer(
  localUpdatedAt: number | null,
  serverUpdatedAt: number | null,
): 'local' | 'server' | 'equal' {
  if (serverUpdatedAt == null) return 'local';
  if (localUpdatedAt == null) return 'server';
  if (serverUpdatedAt > localUpdatedAt) return 'server';
  if (localUpdatedAt > serverUpdatedAt) return 'local';
  return 'equal';
}

interface SyncMeta {
  updatedAt: number | null;
  rev: number;
}

interface StoreHooks {
  getState: () => State;
  getUserId: () => string | null;
  adoptRemote: (state: State) => void;
}

const DEBOUNCE_MS = 1200;
const metaKey = (userId: string) => `focus-den/sync/${userId}`;
const OFFSET_KEY = 'focus-den/clock-offset';

/**
 * Midpoint estimate of (server clock − local clock): the server read its clock
 * roughly halfway between our request (t0) and response (t1). Exported for tests.
 */
export function estimateOffset(t0: number, serverTime: number, t1: number): number {
  return Math.round(serverTime - (t0 + t1) / 2);
}

function readOffset(): number {
  try {
    const n = Number(localStorage.getItem(OFFSET_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

let clockOffset = readOffset();
let calibrated = false;

/** The local clock corrected toward the server's. */
function syncNow(): number {
  return Date.now() + clockOffset;
}

/** Refresh the clock offset from the server (once per session unless forced). */
async function calibrate(force = false): Promise<void> {
  if ((calibrated && !force) || !online()) return;
  const t0 = Date.now();
  const serverTime = await api.serverTime();
  const t1 = Date.now();
  if (serverTime == null) return; // unreachable — keep the persisted offset
  clockOffset = estimateOffset(t0, serverTime, t1);
  calibrated = true;
  try {
    localStorage.setItem(OFFSET_KEY, String(clockOffset));
  } catch {
    // ignore
  }
}

function readMeta(userId: string): SyncMeta {
  try {
    const raw = localStorage.getItem(metaKey(userId));
    if (raw) return JSON.parse(raw) as SyncMeta;
  } catch {
    // ignore
  }
  return { updatedAt: null, rev: 0 };
}

function writeMeta(userId: string, meta: SyncMeta): void {
  try {
    localStorage.setItem(metaKey(userId), JSON.stringify(meta));
  } catch {
    // ignore
  }
}

let hooks: StoreHooks | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;
let flushing = false;
let started = false;

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, DEBOUNCE_MS);
}

async function flush(): Promise<void> {
  if (!hooks || flushing) return;
  const userId = hooks.getUserId();
  if (!userId || !getToken() || !online() || !dirty) return;

  flushing = true;
  const state = hooks.getState();
  const meta = readMeta(userId);
  const updatedAt = meta.updatedAt ?? syncNow();
  try {
    const res = await api.putState(state, updatedAt);
    if (res.accepted) {
      writeMeta(userId, { updatedAt: res.updatedAt, rev: res.rev });
      dirty = false;
    } else if (res.serverDoc) {
      // Another device wrote something newer — adopt it.
      hooks.adoptRemote(coerceState(res.serverDoc) ?? defaultState());
      writeMeta(userId, { updatedAt: res.updatedAt, rev: res.rev });
      dirty = false;
    }
  } catch (err) {
    // Auth failure clears nothing here; network errors just retry on reconnect.
    if (err instanceof ApiError && err.status === 401) dirty = false;
    // else keep dirty
  } finally {
    flushing = false;
    if (dirty) schedule(); // changed again mid-flight (or retry pending)
  }
}

export const sync = {
  bindStore(h: StoreHooks): void {
    hooks = h;
  },

  /** Start listening for connectivity/visibility changes (idempotent). */
  start(): void {
    if (started || typeof window === 'undefined') return;
    started = true;
    window.addEventListener('online', () => {
      // Re-calibrate on reconnect — the clock may have drifted or been reset
      // while offline (laptop sleep, timezone/NTP changes).
      void calibrate(true)
        .then(() => sync.pullAndReconcile())
        .then(() => flush());
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void flush();
    });
  },

  /** Record a local change and schedule a push. */
  markDirty(): void {
    if (!hooks) return;
    const userId = hooks.getUserId();
    if (!userId) return;
    const meta = readMeta(userId);
    writeMeta(userId, { ...meta, updatedAt: syncNow() });
    dirty = true;
    schedule();
  },

  /** Pull the server copy and adopt whichever side is newer. */
  async pullAndReconcile(): Promise<void> {
    if (!hooks) return;
    const userId = hooks.getUserId();
    if (!userId || !getToken() || !online()) return;

    await calibrate(); // stamps from here on use the corrected clock

    let remote;
    try {
      remote = await api.getState();
    } catch {
      return; // offline / error → keep local
    }
    const meta = readMeta(userId);
    if (pickNewer(meta.updatedAt, remote.updatedAt) === 'server') {
      hooks.adoptRemote(coerceState(remote.doc) ?? defaultState());
      writeMeta(userId, { updatedAt: remote.updatedAt, rev: remote.rev });
      dirty = false;
    } else {
      // Local is newer or equal → push it up.
      dirty = true;
      await flush();
    }
  },

  /** Stop pending pushes (on sign-out). Listeners stay but no-op without a session. */
  stop(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    dirty = false;
  },
};
