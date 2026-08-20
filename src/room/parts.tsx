/**
 * Base-furniture variants for the den (chosen in DenConfig — all free).
 *
 * Craft rules (same as RoomScene):
 * - pixel rects on the crispEdges root; soft light opts out per element
 * - the `_classic` variant of every part is the pre-v2.7 art, verbatim
 * - patterns (floors, wallpapers) draw OVER the theme's base color tokens
 *   (`--scene-wall` / `--scene-floor`) with translucent overlays, so every
 *   variant works in all four themes and under the night overlay
 * - geometry contracts other art relies on: desk top is y86–94 (x28–132),
 *   the seat line is y≈104, the window lives in x10–66 y12–58
 *
 * Each computer variant exports its screen/glow geometry so RoomScene can
 * place the ambient bloom and night glow correctly.
 */

import type { ChairId, ComputerId, DeskId, DrawersId, FloorId, WallpaperId, WindowId } from '../core';

const CURTAIN = '#7d9a6f';
const CURTAIN_DK = '#69855c';

// ── Floors ──────────────────────────────────────────────────────────────────

function FloorBase() {
  return <rect x="0" y="100" width="160" height="44" fill="var(--scene-floor)" />;
}

export const FLOORS: Record<FloorId, () => JSX.Element> = {
  floor_planks: () => (
    <>
      <FloorBase />
      <rect x="0" y="112" width="160" height="1" fill="var(--scene-floor-2)" />
      <rect x="0" y="124" width="160" height="1" fill="var(--scene-floor-2)" />
      <rect x="0" y="136" width="160" height="1" fill="var(--scene-floor-2)" />
      {([
        [100, [40, 104]],
        [112, [20, 76, 132]],
        [124, [52, 116]],
        [136, [30, 92]],
      ] as [number, number[]][]).map(([rowY, xs]) =>
        xs.map((x) => (
          <rect key={`${rowY}-${x}`} x={x} y={rowY + 1} width="1" height="11"
            fill="var(--scene-floor-2)" opacity="0.75" />
        )),
      )}
      <rect x="64" y="118" width="2" height="1" fill="var(--scene-floor-2)" />
      <rect x="110" y="130" width="2" height="1" fill="var(--scene-floor-2)" />
      <rect x="36" y="106" width="2" height="1" fill="var(--scene-floor-2)" />
    </>
  ),

  floor_herringbone: () => (
    <>
      <FloorBase />
      {/* zigzag pairs, offset per row */}
      {[102, 112, 122, 132].map((y, row) =>
        Array.from({ length: 14 }, (_, i) => {
          const x = i * 12 + (row % 2 === 0 ? 0 : 6) - 4;
          return (
            <g key={`${y}-${i}`}>
              <rect x={x} y={y} width="6" height="1" fill="var(--scene-floor-2)" opacity="0.8" />
              <rect x={x + 6} y={y + 4} width="6" height="1" fill="var(--scene-floor-2)" opacity="0.55" />
              <rect x={x + 6} y={y} width="1" height="5" fill="var(--scene-floor-2)" opacity="0.55" />
            </g>
          );
        }),
      )}
    </>
  ),

  floor_checker: () => (
    <>
      <FloorBase />
      {Array.from({ length: 12 }, (_, cx) =>
        Array.from({ length: 4 }, (_, cy) =>
          (cx + cy) % 2 === 0 ? (
            <rect key={`${cx}-${cy}`} x={cx * 14 - 4} y={100 + cy * 11} width="14" height="11"
              fill="#000000" opacity="0.10" />
          ) : null,
        ),
      )}
      <rect x="0" y="100" width="160" height="1" fill="#ffffff" opacity="0.06" />
    </>
  ),

  floor_carpet: () => (
    <>
      <FloorBase />
      {/* soft warm pile over the theme base */}
      <rect x="0" y="100" width="160" height="44" fill="#c26a4a" opacity="0.30" />
      {[
        [14, 108], [38, 116], [70, 105], [96, 122], [126, 110], [54, 130],
        [110, 134], [24, 126], [146, 124], [82, 138],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="2" height="1" fill="#ffffff" opacity="0.10" />
      ))}
      <rect x="0" y="100" width="160" height="2" fill="#000000" opacity="0.08" />
    </>
  ),

  floor_stone: () => (
    <>
      <FloorBase />
      <rect x="0" y="100" width="160" height="44" fill="#8a8f98" opacity="0.22" />
      {/* big offset tiles */}
      {[100, 115, 130].map((y, row) => (
        <g key={y}>
          <rect x="0" y={y + 14} width="160" height="1" fill="#000000" opacity="0.16" />
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={i * 30 + (row % 2 ? 15 : 0)} y={y} width="1" height="15"
              fill="#000000" opacity="0.14" />
          ))}
        </g>
      ))}
      <rect x="46" y="106" width="3" height="1" fill="#000000" opacity="0.12" />
      <rect x="118" y="122" width="4" height="1" fill="#000000" opacity="0.12" />
    </>
  ),
};

// ── Wallpapers ──────────────────────────────────────────────────────────────

function WallBase() {
  return <rect x="0" y="0" width="160" height="100" fill="var(--scene-wall)" />;
}

export const WALLPAPERS: Record<WallpaperId, () => JSX.Element> = {
  wall_plain: () => <WallBase />,

  wall_striped: () => (
    <>
      <WallBase />
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={i * 12} y="0" width="5" height="100" fill="#ffffff" opacity="0.05" />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <rect key={i} x={i * 12 + 5} y="0" width="1" height="100" fill="#000000" opacity="0.05" />
      ))}
    </>
  ),

  wall_stars: () => (
    <>
      <WallBase />
      {[
        [12, 10], [30, 26], [52, 8], [74, 20], [96, 9], [118, 27], [140, 12],
        [22, 46], [66, 40], [104, 44], [148, 38], [8, 74], [86, 60], [128, 58],
      ].map(([x, y], i) => (
        <g key={i} opacity={i % 3 === 0 ? 0.55 : 0.35}>
          <rect x={x} y={y} width="2" height="2" fill="#d9a94f" />
          <rect x={x - 1} y={y} width="1" height="2" fill="#d9a94f" opacity="0.5" />
          <rect x={x + 2} y={y} width="1" height="2" fill="#d9a94f" opacity="0.5" />
          <rect x={x} y={y - 1} width="2" height="1" fill="#d9a94f" opacity="0.5" />
          <rect x={x} y={y + 2} width="2" height="1" fill="#d9a94f" opacity="0.5" />
        </g>
      ))}
    </>
  ),

  wall_wainscot: () => (
    <>
      <WallBase />
      <rect x="0" y="64" width="160" height="31" fill="#000000" opacity="0.10" />
      <rect x="0" y="64" width="160" height="2" fill="#ffffff" opacity="0.10" />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 20 + 8} y="70" width="1" height="22" fill="#000000" opacity="0.10" />
      ))}
    </>
  ),

  wall_brick: () => (
    <>
      <WallBase />
      <rect x="0" y="0" width="160" height="100" fill="#a35b45" opacity="0.16" />
      {Array.from({ length: 12 }, (_, r) => (
        <g key={r}>
          <rect x="0" y={r * 9 + 4} width="160" height="1" fill="#000000" opacity="0.10" />
          {Array.from({ length: 8 }, (_, c) => (
            <rect key={c} x={c * 22 + (r % 2 ? 11 : 0)} y={r * 9 + 4} width="1" height="9"
              fill="#000000" opacity="0.08" />
          ))}
        </g>
      ))}
    </>
  ),
};

// ── Windows ─────────────────────────────────────────────────────────────────
// Each variant exports its glass rect (for the rain clip + streak layout).

export interface WindowSpec {
  render: (opts: { raining: boolean; clipId: string }) => JSX.Element;
  /** rectangular bounds of the glass (rain falls inside this, clipped) */
  glass: { x: number; y: number; w: number; h: number };
  /** true → the clip path is a circle centered in the glass rect */
  roundClip?: boolean;
}

/** Shared "view" behind the glass: hills + clouds (hidden while raining). */
function WindowView({ clipId, g }: { clipId: string; g: WindowSpec['glass'] }) {
  const bottom = g.y + g.h;
  return (
    <g clipPath={`url(#${clipId})`}>
      <rect x={g.x} y={bottom - 6} width={g.w} height="6" fill="#7da06b" opacity="0.8" />
      <rect x={g.x} y={bottom - 8} width={g.w * 0.4} height="2" fill="#7da06b" opacity="0.55" />
      <rect x={g.x + g.w * 0.58} y={bottom - 8} width={g.w * 0.42} height="2" fill="#7da06b" opacity="0.55" />
      <rect x={g.x + 5} y={g.y + 5} width="7" height="2" fill="#ffffff" opacity="0.5" />
      <rect x={g.x + 7} y={g.y + 3} width="4" height="2" fill="#ffffff" opacity="0.5" />
      <rect x={g.x + g.w - 12} y={g.y + 9} width="8" height="2" fill="#ffffff" opacity="0.4" />
    </g>
  );
}

function Curtains() {
  return (
    <>
      <rect x="11" y="15" width="53" height="2" fill="#5b4d36" />
      <rect x="10" y="14" width="2" height="3" fill="#4a3e2c" />
      <rect x="63" y="14" width="2" height="3" fill="#4a3e2c" />
      <rect x="12" y="17" width="6" height="37" fill={CURTAIN} />
      <rect x="14" y="17" width="1" height="37" fill={CURTAIN_DK} />
      <rect x="16" y="17" width="1" height="37" fill={CURTAIN_DK} />
      <rect x="12" y="52" width="6" height="2" fill={CURTAIN_DK} />
      <rect x="57" y="17" width="6" height="37" fill={CURTAIN} />
      <rect x="59" y="17" width="1" height="37" fill={CURTAIN_DK} />
      <rect x="61" y="17" width="1" height="37" fill={CURTAIN_DK} />
      <rect x="57" y="52" width="6" height="2" fill={CURTAIN_DK} />
    </>
  );
}

function Sill({ succulent = true }: { succulent?: boolean }) {
  return (
    <>
      <rect x="14" y="52" width="46" height="3" fill="#5b4d36" />
      <rect x="14" y="52" width="46" height="1" fill="#6f5f42" />
      <rect x="17" y="55" width="2" height="2" fill="#4a3e2c" />
      <rect x="55" y="55" width="2" height="2" fill="#4a3e2c" />
      {succulent && (
        <>
          <rect x="22" y="48" width="4" height="2" fill="#5f9a5f" />
          <rect x="23" y="46" width="2" height="2" fill="#6fae6f" />
          <rect x="21" y="50" width="6" height="2" fill="#b5654a" />
        </>
      )}
    </>
  );
}

export const WINDOWS: Record<WindowId, WindowSpec> = {
  window_classic: {
    glass: { x: 19, y: 21, w: 36, h: 28 },
    render: ({ raining, clipId }) => (
      <>
        <rect x="16" y="18" width="42" height="34" fill="#6b5d44" />
        <rect x="15" y="17" width="44" height="2" fill="#7c6c50" />
        <rect x="17" y="19" width="40" height="1" fill="#59492f" />
        <rect x="19" y="21" width="36" height="28"
          fill={raining ? '#26354f' : 'var(--scene-window-sky)'} />
        {!raining && <WindowView clipId={clipId} g={WINDOWS.window_classic.glass} />}
        <rect x="19" y="21" width="36" height="7" fill="#ffffff" opacity="0.08"
          shapeRendering="geometricPrecision" />
        <rect x="35" y="21" width="2" height="28" fill="#6b5d44" />
        <rect x="19" y="34" width="36" height="2" fill="#6b5d44" />
        <Sill />
        <Curtains />
      </>
    ),
  },

  window_round: {
    glass: { x: 21, y: 18, w: 32, h: 32 },
    roundClip: true,
    render: ({ raining, clipId }) => (
      <>
        <circle cx="37" cy="34" r="19" fill="#6b5d44" />
        <circle cx="37" cy="33" r="19" fill="#7c6c50" />
        <circle cx="37" cy="34" r="18" fill="#59492f" />
        <circle cx="37" cy="34" r="16"
          fill={raining ? '#26354f' : 'var(--scene-window-sky)'} />
        {!raining && <WindowView clipId={clipId} g={WINDOWS.window_round.glass} />}
        <g clipPath={`url(#${clipId})`}>
          <rect x="21" y="18" width="32" height="8" fill="#ffffff" opacity="0.08"
            shapeRendering="geometricPrecision" />
        </g>
        <rect x="36" y="18" width="2" height="32" fill="#6b5d44" />
        <rect x="21" y="33" width="32" height="2" fill="#6b5d44" />
        <Sill succulent={false} />
      </>
    ),
  },

  window_arch: {
    glass: { x: 20, y: 20, w: 34, h: 30 },
    render: ({ raining, clipId }) => (
      <>
        {/* arched frame: rounded top + straight sides */}
        <path d="M16 52 L16 32 Q16 14 37 14 Q58 14 58 32 L58 52 Z" fill="#6b5d44" />
        <path d="M19 52 L19 33 Q19 17 37 17 Q55 17 55 33 L55 52 Z" fill="#59492f" />
        <path d="M20 52 L20 33 Q20 18 37 18 Q54 18 54 33 L54 52 Z"
          fill={raining ? '#26354f' : 'var(--scene-window-sky)'} />
        {!raining && <WindowView clipId={clipId} g={WINDOWS.window_arch.glass} />}
        <g clipPath={`url(#${clipId})`}>
          <rect x="20" y="18" width="34" height="8" fill="#ffffff" opacity="0.08"
            shapeRendering="geometricPrecision" />
        </g>
        <rect x="36" y="18" width="2" height="34" fill="#6b5d44" />
        <Sill />
        <Curtains />
      </>
    ),
  },

  window_wide: {
    glass: { x: 13, y: 23, w: 48, h: 24 },
    render: ({ raining, clipId }) => (
      <>
        <rect x="10" y="20" width="54" height="30" fill="#6b5d44" />
        <rect x="9" y="19" width="56" height="2" fill="#7c6c50" />
        <rect x="11" y="21" width="52" height="1" fill="#59492f" />
        <rect x="13" y="23" width="48" height="24"
          fill={raining ? '#26354f' : 'var(--scene-window-sky)'} />
        {!raining && <WindowView clipId={clipId} g={WINDOWS.window_wide.glass} />}
        <rect x="13" y="23" width="48" height="6" fill="#ffffff" opacity="0.08"
          shapeRendering="geometricPrecision" />
        <rect x="28" y="23" width="2" height="24" fill="#6b5d44" />
        <rect x="44" y="23" width="2" height="24" fill="#6b5d44" />
        <rect x="10" y="50" width="54" height="3" fill="#5b4d36" />
        <rect x="10" y="50" width="54" height="1" fill="#6f5f42" />
      </>
    ),
  },

  window_garden: {
    glass: { x: 19, y: 21, w: 36, h: 28 },
    render: ({ raining, clipId }) => (
      <>
        <rect x="16" y="18" width="42" height="34" fill="#6b5d44" />
        <rect x="15" y="17" width="44" height="2" fill="#7c6c50" />
        <rect x="19" y="21" width="36" height="28"
          fill={raining ? '#26354f' : 'var(--scene-window-sky)'} />
        {!raining && <WindowView clipId={clipId} g={WINDOWS.window_garden.glass} />}
        <rect x="35" y="21" width="2" height="28" fill="#6b5d44" />
        <rect x="19" y="34" width="36" height="2" fill="#6b5d44" />
        <Sill succulent={false} />
        {/* trailing ivy from a hanging pot + sill herbs */}
        <rect x="46" y="18" width="6" height="4" fill="#b5654a" />
        <rect x="45" y="22" width="2" height="6" fill="#4f8a4f" />
        <rect x="47" y="22" width="2" height="10" fill="#5fa05f" />
        <rect x="50" y="22" width="2" height="8" fill="#46824a" />
        <rect x="52" y="30" width="2" height="4" fill="#5fa05f" />
        <rect x="20" y="47" width="5" height="3" fill="#5f9a5f" />
        <rect x="21" y="45" width="2" height="2" fill="#6fae6f" />
        <rect x="19" y="50" width="7" height="2" fill="#b5654a" />
        <rect x="29" y="48" width="4" height="2" fill="#6fae6f" />
        <rect x="28" y="50" width="6" height="2" fill="#c2724a" />
        <Curtains />
      </>
    ),
  },
};

// ── Desks (top y86–94, x28–132; legs below) ─────────────────────────────────

const WOOD = '#9c6b43';
const WOOD_HI = '#b58455';
const WOOD_DK = '#7c5433';

function DeskGrain({ dark }: { dark: string }) {
  return (
    <>
      <rect x="44" y="89" width="8" height="1" fill={dark} opacity="0.5" />
      <rect x="96" y="90" width="10" height="1" fill={dark} opacity="0.45" />
      <rect x="34" y="90" width="5" height="1" fill={dark} opacity="0.4" />
    </>
  );
}

export const DESKS: Record<DeskId, () => JSX.Element> = {
  desk_classic: () => (
    <>
      <rect x="28" y="86" width="104" height="8" fill={WOOD} />
      <rect x="28" y="86" width="104" height="2" fill={WOOD_HI} />
      <rect x="28" y="92" width="104" height="2" fill={WOOD_DK} opacity="0.6" />
      <DeskGrain dark={WOOD_DK} />
      <rect x="34" y="94" width="6" height="22" fill={WOOD_DK} />
      <rect x="34" y="94" width="2" height="22" fill="#8a5f3b" />
      <rect x="33" y="114" width="8" height="2" fill="#5f3f26" />
      <rect x="120" y="94" width="6" height="22" fill={WOOD_DK} />
      <rect x="120" y="94" width="2" height="22" fill="#8a5f3b" />
      <rect x="119" y="114" width="8" height="2" fill="#5f3f26" />
    </>
  ),

  desk_walnut: () => (
    <>
      <rect x="28" y="86" width="104" height="9" fill="#7a4f33" />
      <rect x="28" y="86" width="104" height="2" fill="#8f5f3d" />
      <rect x="28" y="93" width="104" height="2" fill="#5f3a24" opacity="0.7" />
      <DeskGrain dark="#5f3a24" />
      <rect x="32" y="95" width="8" height="21" fill="#5f3a24" />
      <rect x="32" y="95" width="2" height="21" fill="#6f462c" />
      <rect x="120" y="95" width="8" height="21" fill="#5f3a24" />
      <rect x="120" y="95" width="2" height="21" fill="#6f462c" />
      <rect x="30" y="114" width="12" height="2" fill="#472b1a" />
      <rect x="118" y="114" width="12" height="2" fill="#472b1a" />
    </>
  ),

  desk_white: () => (
    <>
      <rect x="28" y="86" width="104" height="7" fill="#e8e4da" />
      <rect x="28" y="86" width="104" height="2" fill="#f4f1ea" />
      <rect x="28" y="91" width="104" height="2" fill="#c9c3b6" opacity="0.8" />
      <rect x="36" y="93" width="3" height="23" fill="#9a9a9a" />
      <rect x="36" y="93" width="1" height="23" fill="#b8b8b8" />
      <rect x="121" y="93" width="3" height="23" fill="#9a9a9a" />
      <rect x="121" y="93" width="1" height="23" fill="#b8b8b8" />
      <rect x="33" y="114" width="9" height="2" fill="#7c7c7c" />
      <rect x="118" y="114" width="9" height="2" fill="#7c7c7c" />
    </>
  ),

  desk_industrial: () => (
    <>
      <rect x="28" y="86" width="104" height="8" fill="#a1793f" />
      <rect x="28" y="86" width="104" height="2" fill="#bb9256" />
      <rect x="28" y="92" width="104" height="2" fill="#7c5a2c" opacity="0.7" />
      <DeskGrain dark="#7c5a2c" />
      {/* A-frame steel legs with crossbar */}
      <rect x="32" y="94" width="4" height="22" fill="#3a3a40" />
      <rect x="42" y="94" width="4" height="22" fill="#3a3a40" />
      <rect x="32" y="104" width="14" height="2" fill="#2c2c31" />
      <rect x="114" y="94" width="4" height="22" fill="#3a3a40" />
      <rect x="124" y="94" width="4" height="22" fill="#3a3a40" />
      <rect x="114" y="104" width="14" height="2" fill="#2c2c31" />
      <rect x="30" y="114" width="18" height="2" fill="#232327" />
      <rect x="112" y="114" width="18" height="2" fill="#232327" />
    </>
  ),

  desk_standing: () => (
    <>
      <rect x="28" y="86" width="104" height="7" fill="#c9a06a" />
      <rect x="28" y="86" width="104" height="2" fill="#dcb67e" />
      <rect x="28" y="91" width="104" height="2" fill="#a37c48" opacity="0.7" />
      {/* motorized columns + wide feet */}
      <rect x="38" y="93" width="6" height="12" fill="#55565e" />
      <rect x="39" y="105" width="4" height="9" fill="#3f4048" />
      <rect x="32" y="114" width="18" height="2" fill="#2f3037" />
      <rect x="116" y="93" width="6" height="12" fill="#55565e" />
      <rect x="117" y="105" width="4" height="9" fill="#3f4048" />
      <rect x="110" y="114" width="18" height="2" fill="#2f3037" />
      {/* controller pod on the edge */}
      <rect x="52" y="93" width="6" height="3" fill="#3f4048" />
    </>
  ),
};

// ── Drawers (under the desk's right side, x110–132 y94–118) ─────────────────

export const DRAWERS: Record<DrawersId, () => JSX.Element | null> = {
  drawers_classic: () => (
    <>
      <rect x="110" y="94" width="22" height="24" fill={WOOD_DK} />
      <rect x="110" y="94" width="22" height="1" fill="#8a5f3b" />
      <rect x="112" y="97" width="18" height="7" fill={WOOD} />
      <rect x="112" y="97" width="18" height="1" fill={WOOD_HI} />
      <rect x="112" y="106" width="18" height="7" fill={WOOD} />
      <rect x="112" y="106" width="18" height="1" fill={WOOD_HI} />
      <rect x="120" y="100" width="3" height="2" fill="#3a2d1f" />
      <rect x="120" y="109" width="3" height="2" fill="#3a2d1f" />
      <rect x="110" y="115" width="22" height="3" fill="#5f3f26" />
    </>
  ),

  drawers_tall: () => (
    <>
      <rect x="110" y="94" width="22" height="24" fill="#5b4a3a" />
      <rect x="110" y="94" width="22" height="1" fill="#6b5847" />
      {[96, 103, 110].map((y) => (
        <g key={y}>
          <rect x="112" y={y} width="18" height="5" fill="#6f5b47" />
          <rect x="112" y={y} width="18" height="1" fill="#7d6853" />
          <rect x="119" y={y + 2} width="4" height="1" fill="#3a2d1f" />
        </g>
      ))}
      <rect x="110" y="116" width="22" height="2" fill="#463728" />
    </>
  ),

  drawers_shelves: () => (
    <>
      <rect x="110" y="94" width="22" height="24" fill="#6b4a30" />
      <rect x="112" y="96" width="18" height="9" fill="#4a3520" />
      <rect x="112" y="107" width="18" height="9" fill="#4a3520" />
      {/* books + a box in the cubbies */}
      <rect x="113" y="98" width="3" height="7" fill="#c4704f" />
      <rect x="117" y="99" width="3" height="6" fill="#5f8cb8" />
      <rect x="121" y="98" width="3" height="7" fill="#5f9a5f" />
      <rect x="114" y="109" width="10" height="7" fill="#b58455" />
      <rect x="114" y="109" width="10" height="2" fill="#c9976a" />
      <rect x="110" y="116" width="22" height="2" fill="#54381f" />
    </>
  ),

  drawers_minimal: () => null,
};

// ── Chairs (behind the character; seat line y≈104) ──────────────────────────

export const CHAIRS: Record<ChairId, () => JSX.Element> = {
  chair_office: () => (
    <>
      <rect x="78" y="104" width="4" height="6" fill="#3f342a" />
      <rect x="70" y="110" width="20" height="2" fill="#3f342a" />
      <rect x="69" y="111" width="2" height="2" fill="#2a221a" />
      <rect x="89" y="111" width="2" height="2" fill="#2a221a" />
      <rect x="66" y="72" width="28" height="32" fill="#5b4a3a" />
      <rect x="66" y="72" width="2" height="32" fill="#6b5847" />
      <rect x="66" y="72" width="28" height="2" fill="#6b5847" />
      <rect x="68" y="70" width="24" height="6" fill="#6b5847" />
      <rect x="63" y="86" width="3" height="12" fill="#4a3c2e" />
      <rect x="63" y="86" width="3" height="2" fill="#5b4a3a" />
      <rect x="94" y="86" width="3" height="12" fill="#4a3c2e" />
      <rect x="94" y="86" width="3" height="2" fill="#5b4a3a" />
    </>
  ),

  chair_gaming: () => (
    <>
      <rect x="78" y="104" width="4" height="6" fill="#26262c" />
      <rect x="68" y="110" width="24" height="2" fill="#26262c" />
      <rect x="67" y="111" width="2" height="2" fill="#18181d" />
      <rect x="91" y="111" width="2" height="2" fill="#18181d" />
      {/* tall winged back with racing stripes */}
      <rect x="65" y="64" width="30" height="40" fill="#2e2e36" />
      <rect x="65" y="64" width="2" height="40" fill="#3c3c46" />
      <rect x="65" y="64" width="30" height="2" fill="#3c3c46" />
      <rect x="63" y="80" width="2" height="16" fill="#2e2e36" />
      <rect x="95" y="80" width="2" height="16" fill="#2e2e36" />
      <rect x="70" y="64" width="3" height="40" fill="#c0392b" />
      <rect x="87" y="64" width="3" height="40" fill="#c0392b" />
      {/* headrest pillow */}
      <rect x="72" y="60" width="16" height="6" fill="#26262c" />
      <rect x="74" y="62" width="12" height="2" fill="#c0392b" />
      <rect x="62" y="86" width="3" height="12" fill="#1f1f24" />
      <rect x="95" y="86" width="3" height="12" fill="#1f1f24" />
    </>
  ),

  chair_armchair: () => (
    <>
      {/* wide cozy fabric chair with rolled arms */}
      <rect x="62" y="76" width="36" height="30" fill="#7a8c5f" />
      <rect x="62" y="76" width="36" height="2" fill="#8ba06e" />
      <rect x="62" y="76" width="2" height="30" fill="#8ba06e" />
      <rect x="58" y="88" width="8" height="18" fill="#6b7c52" />
      <rect x="58" y="88" width="8" height="3" fill="#7a8c5f" />
      <rect x="94" y="88" width="8" height="18" fill="#6b7c52" />
      <rect x="94" y="88" width="8" height="3" fill="#7a8c5f" />
      <rect x="60" y="106" width="40" height="4" fill="#5c6b46" />
      <rect x="62" y="110" width="4" height="4" fill="#3f342a" />
      <rect x="94" y="110" width="4" height="4" fill="#3f342a" />
      {/* seat cushion seam */}
      <rect x="66" y="100" width="28" height="1" fill="#5c6b46" />
    </>
  ),

  chair_stool: () => (
    <>
      {/* backless stool — the character's back shows */}
      <rect x="70" y="102" width="20" height="4" fill="#8a5f3b" />
      <rect x="70" y="102" width="20" height="1" fill="#9c6f47" />
      <rect x="72" y="106" width="3" height="10" fill="#5f3f26" />
      <rect x="85" y="106" width="3" height="10" fill="#5f3f26" />
      <rect x="73" y="112" width="14" height="1" fill="#5f3f26" />
    </>
  ),

  chair_beanbag: () => (
    <>
      {/* squishy blob */}
      <ellipse cx="80" cy="106" rx="22" ry="12" fill="#d98a62"
        shapeRendering="geometricPrecision" />
      <ellipse cx="80" cy="102" rx="18" ry="9" fill="#e39b73"
        shapeRendering="geometricPrecision" />
      <ellipse cx="74" cy="100" rx="6" ry="3" fill="#f0b18c" opacity="0.7"
        shapeRendering="geometricPrecision" />
    </>
  ),
};

// ── Computers (on the desk, roughly x44–116 y44–86) ─────────────────────────

export interface ComputerSpec {
  render: () => JSX.Element;
  /** center + radii for the ambient bloom behind the avatar */
  glow: { cx: number; cy: number; rx: number; ry: number };
  /** ellipse for the night screen-glow overlay */
  night: { cx: number; cy: number; rx: number; ry: number };
}

/** Syntax-tinted code lines + blinking cursor, laid out inside a screen rect. */
function CodeLines({ x, y, w, tint = 1 }: { x: number; y: number; w: number; tint?: number }) {
  const line = (dx: number, dy: number, lw: number, fill: string) => (
    <rect x={x + dx} y={y + dy} width={Math.min(lw, w - dx - 2)} height="2" fill={fill} opacity={tint} />
  );
  return (
    <>
      {line(3, 4, 9, '#e3c1f0')}
      {line(14, 4, 13, '#bfe0ff')}
      {line(3, 9, 6, '#ffe0a3')}
      {line(11, 9, 22, '#9ccaf5')}
      {line(6, 14, 12, '#b8ecc4')}
      {line(20, 14, 8, '#bfe0ff')}
      {line(3, 19, 8, '#9ccaf5')}
      {line(13, 19, 16, '#bfe0ff')}
      <rect className="scene-cursor" x={x + 3} y={y + 23} width="2" height="3" fill="#eaf4ff" />
    </>
  );
}

export const COMPUTERS: Record<ComputerId, ComputerSpec> = {
  computer_desktop: {
    glow: { cx: 80, cy: 60, rx: 46, ry: 32 },
    night: { cx: 80, cy: 61, rx: 35, ry: 21 },
    render: () => (
      <>
        <rect x="76" y="78" width="8" height="8" fill="#3b3b42" />
        <rect x="70" y="84" width="20" height="2" fill="#3b3b42" />
        <rect x="54" y="46" width="52" height="34" fill="#2a2a30" />
        <rect x="55" y="47" width="50" height="1" fill="#43434c" />
        <rect x="57" y="49" width="46" height="28" fill="#4f8fd0" />
        <CodeLines x={57} y={49} w={46} />
        <rect x="57" y="78" width="2" height="1" fill="#7fdc8f" />
      </>
    ),
  },

  computer_laptop: {
    glow: { cx: 72, cy: 68, rx: 40, ry: 27 },
    night: { cx: 72, cy: 69, rx: 30, ry: 16 },
    render: () => (
      <>
        {/* open laptop, offset LEFT of center so the screen shows beside the
            avatar (a centered laptop hides completely behind them) */}
        <rect x="48" y="54" width="44" height="28" fill="#3c3c44" />
        <rect x="49" y="55" width="42" height="1" fill="#53535e" />
        <rect x="50" y="56" width="40" height="24" fill="#4f8fd0" />
        <CodeLines x={50} y={56} w={40} />
        <rect x="46" y="82" width="48" height="4" fill="#4a4a54" />
        <rect x="46" y="82" width="48" height="1" fill="#5d5d69" />
        <rect x="64" y="83" width="10" height="2" fill="#3a3a42" />
        <rect x="90" y="84" width="2" height="1" fill="#7fdc8f" />
      </>
    ),
  },

  computer_ultrawide: {
    glow: { cx: 80, cy: 60, rx: 54, ry: 32 },
    night: { cx: 80, cy: 62, rx: 44, ry: 20 },
    render: () => (
      <>
        <rect x="76" y="78" width="8" height="8" fill="#3b3b42" />
        <rect x="66" y="84" width="28" height="2" fill="#3b3b42" />
        <rect x="44" y="50" width="72" height="30" fill="#2a2a30" />
        <rect x="45" y="51" width="70" height="1" fill="#43434c" />
        <rect x="47" y="53" width="66" height="24" fill="#4f8fd0" />
        {/* split panes on the wide screen */}
        <CodeLines x={47} y={53} w={32} />
        <rect x="80" y="53" width="1" height="24" fill="#3c6ea8" />
        <CodeLines x={82} y={53} w={31} tint={0.9} />
        <rect x="47" y="78" width="2" height="1" fill="#7fdc8f" />
      </>
    ),
  },

  computer_allinone: {
    glow: { cx: 80, cy: 60, rx: 46, ry: 32 },
    night: { cx: 80, cy: 59, rx: 34, ry: 20 },
    render: () => (
      <>
        {/* slim all-in-one with a silver chin + wedge stand */}
        <rect x="74" y="80" width="12" height="6" fill="#b9b9c0" />
        <rect x="70" y="79" width="20" height="2" fill="#a7a7af" />
        <rect x="55" y="44" width="50" height="32" fill="#d6d6dc" />
        <rect x="57" y="46" width="46" height="24" fill="#4f8fd0" />
        <CodeLines x={57} y={46} w={46} />
        <rect x="55" y="70" width="50" height="6" fill="#d6d6dc" />
        <rect x="79" y="72" width="2" height="2" fill="#9a9aa2" />
        <rect x="55" y="44" width="50" height="1" fill="#e8e8ee" />
      </>
    ),
  },

  computer_retro: {
    glow: { cx: 80, cy: 62, rx: 42, ry: 30 },
    night: { cx: 80, cy: 63, rx: 28, ry: 18 },
    render: () => (
      <>
        {/* chunky CRT with green phosphor */}
        <rect x="58" y="48" width="44" height="38" fill="#c9bfa4" />
        <rect x="58" y="48" width="44" height="2" fill="#dcd3ba" />
        <rect x="58" y="84" width="44" height="2" fill="#a89e83" />
        <rect x="64" y="53" width="32" height="24" fill="#1d2a1d" />
        <rect x="66" y="55" width="28" height="20" fill="#233523" />
        {/* green terminal lines */}
        <rect x="68" y="58" width="16" height="2" fill="#7fdc8f" />
        <rect x="68" y="63" width="22" height="2" fill="#5fae6d" />
        <rect x="68" y="68" width="12" height="2" fill="#7fdc8f" />
        <rect className="scene-cursor" x="82" y="68" width="3" height="2" fill="#a8f0b4" />
        {/* vents + power light */}
        <rect x="64" y="80" width="20" height="1" fill="#a89e83" />
        <rect x="64" y="82" width="20" height="1" fill="#a89e83" />
        <rect x="96" y="80" width="3" height="3" fill="#c0392b" />
      </>
    ),
  },
};
