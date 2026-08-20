/**
 * Den personalization rules — pure, like everything in core.
 *
 * The den's base furniture is a set of free variants (`DenConfig`); movable
 * decorative items carry a `surface` + `anchor` + `footprint` in the catalog
 * and can be re-placed within that surface's zone. Defaults reproduce the
 * classic den exactly, so existing saves look identical after the update.
 */

import { getItem } from './items';
import type {
  BodyId,
  CharacterConfig,
  DenConfig,
  DenPart,
  Item,
  Placement,
  ShirtId,
  State,
} from './types';

/** Every variant per part, in display order. Ids are persisted — stable forever. */
export const DEN_OPTIONS = {
  desk: ['desk_classic', 'desk_walnut', 'desk_white', 'desk_industrial', 'desk_standing'],
  window: ['window_classic', 'window_round', 'window_arch', 'window_wide', 'window_garden'],
  computer: ['computer_desktop', 'computer_laptop', 'computer_ultrawide', 'computer_allinone', 'computer_retro'],
  drawers: ['drawers_classic', 'drawers_tall', 'drawers_shelves', 'drawers_minimal'],
  chair: ['chair_office', 'chair_gaming', 'chair_armchair', 'chair_stool', 'chair_beanbag'],
  floor: ['floor_planks', 'floor_herringbone', 'floor_checker', 'floor_carpet', 'floor_stone'],
  wallpaper: ['wall_plain', 'wall_striped', 'wall_stars', 'wall_wainscot', 'wall_brick'],
} as const satisfies Record<DenPart, readonly string[]>;

export const DEN_PARTS = Object.keys(DEN_OPTIONS) as DenPart[];

export const BODY_IDS: BodyId[] = ['masc', 'fem'];

/** Starter shirts (base + shade) — `shirt_tan` is the classic pre-v2.7 look. */
export const SHIRT_COLORS: Record<ShirtId, { body: string; shade: string }> = {
  shirt_tan: { body: '#c98a5e', shade: '#b3744a' },
  shirt_green: { body: '#6f9e6f', shade: '#5c8a5c' },
  shirt_blue: { body: '#5c85b8', shade: '#4a6f9e' },
  shirt_rose: { body: '#c76f8a', shade: '#ad5873' },
  shirt_slate: { body: '#6d7587', shade: '#596070' },
};

export const SHIRT_IDS = Object.keys(SHIRT_COLORS) as ShirtId[];

/** The classic den — exactly what every save before v2.7 looked like. */
export function defaultDen(): DenConfig {
  return {
    desk: 'desk_classic',
    window: 'window_classic',
    computer: 'computer_desktop',
    drawers: 'drawers_classic',
    chair: 'chair_office',
    floor: 'floor_planks',
    wallpaper: 'wall_plain',
  };
}

export function defaultCharacter(): CharacterConfig {
  return { body: 'masc', shirt: 'shirt_tan' };
}

// ── Placement zones (scene coords, 160×144 viewBox) ─────────────────────────
//
// Desk items slide along the desktop (x only — they sit ON the surface).
// Floor items move in 2D; what's clamped is where they STAND (bottom edge).
// Wall items move in 2D within the wall, above the skirting.

const DESK = { x1: 28, x2: 132 };
const FLOOR = { x1: 2, x2: 158, standY1: 98, standY2: 142 };
const WALL = { x1: 2, x2: 158, y1: 6, yMaxBottom: 92 };
/** floor props whose bottom lands past this line render in FRONT of the desk */
const FRONT_FLOOR_Y = 119;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ── The cat's perches ────────────────────────────────────────────────────────
//
// The desk cat is special: instead of one surface it snaps to the nearest
// PERCH — the desk band, the open floor in front of the desk, the window
// sill, or the top of the bookshelf (which follows the shelf's placement).
// Every perch resolves to a plain {x,y}, so state stays ordinary placements.

/** Sill ledges per window variant — keep in sync with room/parts.tsx art. */
export const WINDOW_SILLS: Record<DenConfig['window'], { x1: number; x2: number; y: number }> = {
  window_classic: { x1: 14, x2: 60, y: 52 },
  window_round: { x1: 14, x2: 60, y: 52 },
  window_arch: { x1: 14, x2: 60, y: 52 },
  window_wide: { x1: 10, x2: 64, y: 50 },
  window_garden: { x1: 14, x2: 60, y: 52 },
};

/** What the cat's perch snapping needs to know about the rest of the den. */
export interface PerchCtx {
  windowId: DenConfig['window'];
  /** top-left of the bookshelf if it's owned (placement or catalog anchor) */
  shelfAt: Placement | null;
}

export function perchCtx(state: State): PerchCtx {
  return {
    windowId: state.den.window,
    shelfAt: state.owned.room_bookshelf ? placementOf(state, 'room_bookshelf') : null,
  };
}

function clampCat(item: Item, x: number, y: number, ctx: PerchCtx): Placement {
  const { w, h } = item.footprint!;
  const sill = WINDOW_SILLS[ctx.windowId];
  const candidates: Placement[] = [
    // the desk band, at sitting height (like any desk prop)
    { x: clamp(x, DESK.x1, DESK.x2 - w), y: item.anchor!.y },
    // the open floor IN FRONT of the desk (behind it the cat would be hidden)
    {
      x: clamp(x, FLOOR.x1, FLOOR.x2 - w),
      y: clamp(y, FRONT_FLOOR_Y - h, FLOOR.standY2 - h),
    },
    // the window sill
    { x: clamp(x, sill.x1, Math.max(sill.x1, sill.x2 - w)), y: sill.y - h },
  ];
  if (ctx.shelfAt) {
    const shelfW = getItem('room_bookshelf')?.footprint?.w ?? 22;
    // a little overhang is allowed — cats do that
    const x1 = ctx.shelfAt.x - 3;
    candidates.push({
      x: clamp(x, x1, Math.max(x1, ctx.shelfAt.x + shelfW - w + 3)),
      y: ctx.shelfAt.y - h,
    });
  }
  let best = candidates[0];
  let bestD = Infinity;
  for (const c of candidates) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * Clamp a desired anchor for an item to its surface zone (and snap to the
 * pixel grid). Returns null for items that aren't movable. With a `ctx`,
 * the cat snaps to its nearest perch instead of a single surface; without
 * one it behaves like a plain desk prop.
 */
export function clampPlacement(item: Item, x: number, y: number, ctx?: PerchCtx): Placement | null {
  if (!item.surface || !item.anchor || !item.footprint) return null;
  const { w, h } = item.footprint;
  const gx = Math.round(x);
  const gy = Math.round(y);
  if (item.id === 'room_cat' && ctx) return clampCat(item, gx, gy, ctx);
  switch (item.surface) {
    case 'desk':
      // slides along the desktop; its resting height never changes
      return { x: clamp(gx, DESK.x1, DESK.x2 - w), y: item.anchor.y };
    case 'floor':
      return {
        x: clamp(gx, FLOOR.x1, FLOOR.x2 - w),
        y: clamp(gy, FLOOR.standY1 - h, FLOOR.standY2 - h),
      };
    case 'wall':
      return {
        x: clamp(gx, WALL.x1, WALL.x2 - w),
        y: clamp(gy, WALL.y1, WALL.yMaxBottom - h),
      };
  }
}

/** The item's effective anchor: user placement or the catalog default. */
export function placementOf(state: State, itemId: string): Placement | null {
  const item = getItem(itemId);
  if (!item?.surface || !item.anchor) return null;
  return state.placements[itemId] ?? item.anchor;
}

/**
 * A den that has never really been used — the first-run creator shows only
 * here (and after a full reset), so existing users are never interrupted.
 */
export function isPristineState(s: State): boolean {
  return (
    s.points === 0 &&
    s.history.length === 0 &&
    Object.keys(s.plan.tickets).length === 0 &&
    s.shift.date === null
  );
}
