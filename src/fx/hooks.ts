/**
 * React-facing fx helpers for the common cases. Each hook returns a callback
 * ref — attach it to the element that should animate:
 *
 *   const walletRef = useBumpOnChange(state.points);
 *   <div ref={walletRef}>◈ {state.points}</div>
 *
 * Bespoke sequences skip the hooks and call effects directly inside a
 * useFxLayoutEffect (see WeekStreak.tsx for the pattern).
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { bump, popIn, sparkleBurst } from './effects';

/**
 * useLayoutEffect that quietly becomes useEffect where there's no DOM, so
 * renderToString (the render smoke tests) doesn't warn. In the browser fx
 * runs pre-paint — animations start on the same frame the change appears.
 */
export const useFxLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** Callback ref: bumps its element whenever `value` changes (not on mount). */
export function useBumpOnChange(value: unknown): (el: HTMLElement | null) => void {
  const el = useRef<HTMLElement | null>(null);
  const prev = useRef(value);
  useFxLayoutEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    bump(el.current);
  }, [value]);
  return useCallback((node: HTMLElement | null) => {
    el.current = node;
  }, []);
}

/**
 * Callback ref: pop + sparkle its element whenever `signal` increases (not on
 * mount). Pass a number that goes up exactly when the celebrated thing
 * happens — e.g. owned count + consumable quantity for a shop card.
 */
export function useCelebrateOnIncrease(signal: number): (el: HTMLElement | null) => void {
  const el = useRef<HTMLElement | null>(null);
  const prev = useRef(signal);
  useFxLayoutEffect(() => {
    const before = prev.current;
    prev.current = signal;
    if (signal <= before) return;
    popIn(el.current);
    sparkleBurst(el.current);
  }, [signal]);
  return useCallback((node: HTMLElement | null) => {
    el.current = node;
  }, []);
}
