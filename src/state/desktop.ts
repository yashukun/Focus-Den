/**
 * Desktop (Tauri) storage hardening. Webview localStorage can be evicted by
 * the OS, so on desktop every save is mirrored to a JSON file in the app data
 * dir (via the Rust `save_state_file` command), and a fresh-looking start
 * restores from that file. Best-effort by design: any failure leaves the
 * plain localStorage path working exactly as on the web.
 *
 * This module is the only place the frontend talks to Tauri APIs for state —
 * everything else keeps flowing through src/state/persist.ts + store.ts.
 */

import type { State } from '../core';
import { store } from './store';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** A den that has never really been used — safe to overwrite from the mirror. */
function isPristine(s: State): boolean {
  return (
    s.points === 0 &&
    s.history.length === 0 &&
    Object.keys(s.plan.tickets).length === 0 &&
    s.shift.date === null
  );
}

const SAVE_DEBOUNCE_MS = 800;

export async function initDesktopMirror(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import('@tauri-apps/api/core');

  // Restore: if localStorage came up empty/fresh but the disk copy has a real
  // den (post-eviction, an app update, or a reinstall), adopt the disk copy.
  // Falls back to the daily backup when the main mirror is missing or won't
  // coerce — the user's schedule must survive anything.
  try {
    if (isPristine(store.getState())) {
      const disk = await invoke<string | null>('load_state_file');
      const restored = disk != null && store.importJSON(disk);
      if (!restored) {
        const backup = await invoke<string | null>('load_state_backup');
        if (backup != null) store.importJSON(backup);
      }
    }
  } catch {
    // mirror is best-effort
  }

  // Mirror: debounce-write every change; also write once now so a brand-new
  // install gets its first disk copy immediately.
  let timer: number | null = null;
  const write = () => {
    void invoke('save_state_file', { json: store.exportJSON() }).catch(() => {});
  };
  store.subscribe(() => {
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(write, SAVE_DEBOUNCE_MS);
  });
  write();
}
