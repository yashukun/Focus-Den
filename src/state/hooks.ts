/**
 * React bindings for the store. Components read state via `useStore()` and the
 * ticking clock via `useNow()`. Actions are called directly on `store`.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import { store, type Snapshot } from './store';

/** Subscribe to the persisted state + transient summary. */
export function useStore(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/**
 * A live `now` (epoch ms) that re-renders on an interval. Also drives the
 * store heartbeat so break grace + auto clock-out fire even on screens that
 * don't display the timer, and immediately on tab refocus (covers throttled
 * background timers).
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    const id = window.setInterval(update, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', update);
    };
  }, [intervalMs]);

  // Keep the engine honest on every tick.
  useEffect(() => {
    store.tick(now);
  }, [now]);

  return now;
}
