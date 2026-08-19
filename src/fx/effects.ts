/**
 * One-shot animation effects (anime.js). The contract, for every effect here:
 *
 *   - fire-and-forget: call it and walk away — nothing to hold or clean up
 *   - null-safe targets, so `popIn(ref.current)` needs no guard at the caller
 *   - no-ops under reduced motion and without a DOM (motionOK)
 *   - touches only transform/opacity (+ its own throwaway particles) — never
 *     layout properties, never React state
 *
 * Ambient looping animation does NOT belong here — that stays CSS keyframes
 * in styles.css. React components usually reach these through the hooks in
 * hooks.ts; call effects directly only for bespoke sequences.
 */

import { animate, createTimeline, stagger, utils } from 'animejs';
import { motionOK } from './motion';

type Target = Element | null | undefined;

/** Pop for something that just appeared or upgraded (bought card, streak dot). */
export function popIn(el: Target): void {
  if (!el || !motionOK()) return;
  animate(el, {
    scale: { from: 0.92, to: 1 },
    duration: 450,
    ease: 'outBack',
  });
}

/** Small attention pulse for a value that just changed (wallet balance). */
export function bump(el: Target): void {
  if (!el || !motionOK()) return;
  animate(el, {
    scale: [
      { to: 1.14, duration: 120, ease: 'outQuad' },
      { to: 1, duration: 300, ease: 'outElastic(1.4, .5)' },
    ],
  });
}

/** Staggered hop across a set of elements (streak dots on a perfect week). */
export function cheer(els: ArrayLike<Element> | null | undefined): void {
  if (!els || els.length === 0 || !motionOK()) return;
  animate(els, {
    y: [
      { to: -7, duration: 150, ease: 'outQuad' },
      { to: 0, duration: 340, ease: 'outBounce' },
    ],
    delay: stagger(55),
  });
}

export interface BurstOptions {
  /** particle count (default 10) */
  count?: number;
  /** max travel distance in px (default 46) */
  spread?: number;
}

/**
 * Pixel-confetti burst centred on an element. Particles are throwaway squares
 * in the theme's --points/--accent colors, appended to <body> and removed on
 * completion. The layer sits below the modal backdrop (z 50) on purpose, so
 * bursts behind an open dialog glow through the blur instead of piercing it.
 */
export function sparkleBurst(el: Target, { count = 10, spread = 46 }: BurstOptions = {}): void {
  if (!el || count <= 0 || !motionOK()) return;
  const box = el.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:40;overflow:clip;';
  const bits: HTMLSpanElement[] = [];
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('span');
    const size = 3 + Math.random() * 4;
    bit.style.cssText =
      `position:absolute;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;` +
      `background:var(${i % 3 ? '--points' : '--accent'});`;
    holder.appendChild(bit);
    bits.push(bit);
  }
  document.body.appendChild(holder);

  animate(bits, {
    x: () => (Math.random() - 0.5) * 2 * spread,
    y: () => (Math.random() - 0.7) * 2 * spread, // biased upward — sparks rise
    rotate: () => (Math.random() - 0.5) * 360,
    scale: { from: 1, to: 0 },
    duration: () => 500 + Math.random() * 300,
    ease: 'outCubic',
    onComplete: () => holder.remove(),
  });
}

export interface CountUpOptions {
  /** total roll-up time in ms (default 800) */
  duration?: number;
  /** text kept in front of the number, e.g. '+' (default '') */
  prefix?: string;
}

/**
 * Roll a number up from 0 to `to` in the element's text. The element must
 * contain only this number (plus the prefix) — textContent is overwritten
 * every frame, and ends on exactly `prefix + to`.
 */
export function countUp(el: Target, to: number, { duration = 800, prefix = '' }: CountUpOptions = {}): void {
  if (!el || !motionOK()) return;
  const counter = { n: 0 };
  animate(counter, {
    n: to,
    duration,
    ease: 'outQuad',
    modifier: utils.round(0),
    onUpdate: () => {
      el.textContent = `${prefix}${counter.n}`;
    },
  });
}

/**
 * Dialog entrance: the card rises into place, then children matching
 * `staggerSelector` (optional) cascade in behind it.
 */
export function modalEnter(card: Target, staggerSelector?: string): void {
  if (!card || !motionOK()) return;
  const tl = createTimeline({ defaults: { ease: 'outQuad' } });
  tl.add(card, {
    opacity: { from: 0, to: 1 },
    y: { from: 16, to: 0 },
    scale: { from: 0.97, to: 1 },
    duration: 280,
  });
  const kids = staggerSelector ? card.querySelectorAll(staggerSelector) : null;
  if (kids && kids.length > 0) {
    tl.add(
      kids,
      {
        opacity: { from: 0, to: 1 },
        y: { from: 8, to: 0 },
        duration: 240,
        delay: stagger(45),
      },
      '-=140',
    );
  }
}
