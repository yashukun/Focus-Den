/**
 * The gate for one-shot animations (src/fx). Every effect checks this before
 * touching the DOM, so reduced-motion users — and non-browser environments
 * like the renderToString smoke tests — get the plain, fully functional UI.
 *
 * Ambient loops (cat tail, string lights, rain…) are CSS keyframes in
 * styles.css, gated by the same media query there.
 */

export function motionOK(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
