/**
 * fx — one-shot UI animation (anime.js), the "juice" layer.
 *
 *   import { popIn, useBumpOnChange } from '../fx';
 *
 * Rules of the layer:
 *   - presentational only: fx reads DOM refs, never app state, and is never
 *     imported by core/ or state/
 *   - every effect no-ops under prefers-reduced-motion and without a DOM
 *   - one-shot moments live here; ambient loops stay CSS (styles.css)
 */

export { motionOK } from './motion';
export { popIn, bump, cheer, sparkleBurst, countUp, modalEnter, zoomFromRect } from './effects';
export type { BurstOptions, CountUpOptions } from './effects';
export { useFxLayoutEffect, useBumpOnChange, useCelebrateOnIncrease } from './hooks';
