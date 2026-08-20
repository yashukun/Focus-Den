/**
 * The pixel room scene — drawn entirely in code (no sprite assets), and since
 * v2.7 fully data-driven: base furniture comes from `DenConfig` (room/parts),
 * the avatar from `CharacterConfig` (room/character), and movable props
 * render at their placement (room/props) inside translate groups.
 *
 * One render function powers the Dashboard preview, the Home hero and the
 * large Den view (fixed 160×144 viewBox; the consumer sets width).
 *
 * Craft notes:
 * - Pixel objects keep `shape-rendering: crispEdges` (root); light/shadow
 *   overlays opt OUT per element with `geometricPrecision`.
 * - Lighting direction is consistent: cool daylight from the window
 *   (upper-left), warm lamp light (follows the lamp's placement), soft
 *   screen light from whatever computer is chosen.
 * - Depth with free placement: the rug lies flat first; floor props that
 *   stand at y ≤ 118 render behind the desk, deeper ones in front of the
 *   character; desk props sort by height (the dual monitor stays behind the
 *   main computer); the cat walks in front.
 */

import { useId } from 'react';
import {
  defaultCharacter,
  defaultDen,
  getItem,
  type CharacterConfig,
  type DenConfig,
  type Equipped,
  type Placement,
} from '../core';
import { CharacterSprite } from './character';
import { CHAIRS, COMPUTERS, DESKS, DRAWERS, FLOORS, WALLPAPERS, WINDOWS } from './parts';
import { PROP_ART } from './props';

export interface RoomSceneProps {
  owned: Record<string, boolean>;
  equipped: Equipped;
  den?: DenConfig;
  character?: CharacterConfig;
  placements?: Record<string, Placement>;
  /** pixel width; height follows the 160×144 aspect ratio */
  width?: number;
  className?: string;
  title?: string;
  /** arrange-mode hook: adds data-item attributes to movable prop groups */
  interactive?: boolean;
}

const SHADOW = '#241a10';

/** delta between where an item is placed and where its art is drawn */
function deltaOf(
  itemId: string,
  placements: Record<string, Placement>,
): { dx: number; dy: number } {
  const item = getItem(itemId);
  const p = placements[itemId];
  if (!item?.anchor || !p) return { dx: 0, dy: 0 };
  return { dx: p.x - item.anchor.x, dy: p.y - item.anchor.y };
}

/** where the item's art bottom lands (for painter sorting of floor props) */
function standlineOf(itemId: string, placements: Record<string, Placement>): number {
  const item = getItem(itemId);
  if (!item?.anchor || !item.footprint) return 0;
  const p = placements[itemId] ?? item.anchor;
  return p.y + item.footprint.h;
}

/**
 * A movable prop, positioned by its placement. Module-scope on purpose: an
 * inline component would change identity every render, making React remount
 * every prop's DOM subtree per frame while arrange-mode drags re-render.
 */
function Prop({
  id,
  owned,
  placements,
  interactive,
}: {
  id: string;
  owned: Record<string, boolean>;
  placements: Record<string, Placement>;
  interactive: boolean;
}) {
  if (!owned[id]) return null;
  const art = PROP_ART[id];
  if (!art) return null;
  const { dx, dy } = deltaOf(id, placements);
  const item = getItem(id);
  return (
    <g
      transform={dx || dy ? `translate(${dx} ${dy})` : undefined}
      data-item={interactive ? id : undefined}
    >
      {/* invisible footprint-sized grab area — pixel art is full of gaps */}
      {interactive && item?.anchor && item.footprint && (
        <rect
          x={item.anchor.x}
          y={item.anchor.y}
          width={item.footprint.w}
          height={item.footprint.h}
          fill="transparent"
        />
      )}
      {art()}
    </g>
  );
}

export function RoomScene({
  owned,
  equipped,
  den = defaultDen(),
  character = defaultCharacter(),
  placements = {},
  width = 320,
  className,
  title = 'Your focus den',
  interactive = false,
}: RoomSceneProps) {
  const height = (width * 144) / 160;
  const uid = useId().replace(/:/g, '');
  const ref = (name: string) => `${uid}-${name}`;

  const has = (id: string) => !!owned[id];
  const raining = has('room_rain');
  const isGlow = equipped.outfit === 'outfit_glow';

  const windowSpec = WINDOWS[den.window];
  const computerSpec = COMPUTERS[den.computer];
  const glass = windowSpec.glass;

  /** element helper so the nine call sites don't repeat the shared props */
  const prop = (id: string) => (
    <Prop key={id} id={id} owned={owned} placements={placements} interactive={interactive} />
  );

  // Painter-sort the standing floor props around the desk plane.
  const floorPropIds = ['room_bookshelf', 'room_plant'].filter(has);
  const backFloor = floorPropIds
    .filter((id) => standlineOf(id, placements) <= 118)
    .sort((a, b) => standlineOf(a, placements) - standlineOf(b, placements));
  const frontFloor = floorPropIds
    .filter((id) => standlineOf(id, placements) > 118)
    .sort((a, b) => standlineOf(a, placements) - standlineOf(b, placements));

  const lampDelta = deltaOf('room_lamp', placements);
  const dualmonDelta = deltaOf('room_dualmon', placements);

  // Rain streak columns spread across the active window's glass.
  const rainStreaks = raining
    ? Array.from({ length: Math.max(3, Math.floor(glass.w / 6)) }, (_, i) => ({
        x: glass.x + 1 + Math.floor((i * (glass.w - 2)) / Math.max(1, Math.floor(glass.w / 6))),
        h: 5 + ((i * 7) % 4),
        delay: (i * 0.17) % 1.02,
      }))
    : [];

  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox="0 0 160 144"
      shapeRendering="crispEdges"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {windowSpec.roundClip ? (
          <clipPath id={ref('window-clip')}>
            <circle cx={glass.x + glass.w / 2} cy={glass.y + glass.h / 2} r={glass.w / 2} />
          </clipPath>
        ) : (
          <clipPath id={ref('window-clip')}>
            <rect x={glass.x} y={glass.y} width={glass.w} height={glass.h} />
          </clipPath>
        )}
        <linearGradient id={ref('wallShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff7e8" stopOpacity="0.06" />
          <stop offset="58%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#1c1206" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id={ref('floorShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.11" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={ref('monitorGlow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8fc0f4" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#8fc0f4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ref('lampGlow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffd27d" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffd27d" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ref('charGlow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff2d4" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#fff2d4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={ref('vignette')} cx="50%" cy="44%" r="74%">
          <stop offset="64%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#180e04" stopOpacity="0.1" />
        </radialGradient>
        <radialGradient id={ref('screenBloom')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#9cc7f4" stopOpacity="0.5" />
          <stop offset="55%" stopColor="#9cc7f4" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#9cc7f4" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={ref('lampCone')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd97d" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#ffd97d" stopOpacity="0.05" />
        </linearGradient>
        <radialGradient id={ref('auraGlow')} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e07bff" stopOpacity="0.4" />
          <stop offset="60%" stopColor="#e07bff" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#e07bff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Wall + floor (variant art over theme tokens) ─────────────── */}
      {WALLPAPERS[den.wallpaper]()}
      <rect x="0" y="0" width="160" height="100" fill={`url(#${ref('wallShade')})`}
        shapeRendering="geometricPrecision" />
      <rect x="0" y="0" width="7" height="100" fill="#000000" opacity="0.05"
        shapeRendering="geometricPrecision" />
      <rect x="153" y="0" width="7" height="100" fill="#000000" opacity="0.05"
        shapeRendering="geometricPrecision" />

      {FLOORS[den.floor]()}
      <rect x="0" y="100" width="160" height="44" fill={`url(#${ref('floorShade')})`}
        shapeRendering="geometricPrecision" />

      {/* skirting board along the wall/floor seam */}
      <rect x="0" y="95" width="160" height="5" fill="#7c6a4e" />
      <rect x="0" y="95" width="160" height="1" fill="#93805f" />
      <rect x="0" y="99" width="160" height="1" fill="#00000033" />

      {/* Cool daylight spill from the window onto the floor */}
      <polygon points="10,100 58,100 78,144 0,144" fill="#bcd6f0" opacity="0.10"
        shapeRendering="geometricPrecision" />

      {/* ── Window (variant) + rain ──────────────────────────────────── */}
      <g>
        {windowSpec.render({ raining, clipId: ref('window-clip') })}
        {raining && (
          <g clipPath={`url(#${ref('window-clip')})`}>
            {rainStreaks.map((s, i) => (
              <rect
                key={i}
                className="scene-rain"
                x={s.x}
                y={glass.y}
                width="1"
                height={s.h}
                fill="#bcd6f0"
                opacity="0.8"
                style={{ animationDelay: `${s.delay}s` }}
              />
            ))}
          </g>
        )}
      </g>

      {/* ── Sticky notes above the desk ──────────────────────────────── */}
      <g>
        <rect x="68" y="36" width="5" height="5" fill="#ffd97d" />
        <rect x="68" y="40" width="5" height="1" fill="#d9b355" />
        <rect x="76" y="37" width="5" height="5" fill="#ffb3c1" />
        <rect x="76" y="41" width="5" height="1" fill="#d98d9e" />
        <rect x="69" y="38" width="3" height="1" fill="#a8843d" opacity="0.6" />
        <rect x="77" y="39" width="3" height="1" fill="#a8626f" opacity="0.6" />
      </g>

      {/* ── Wall + floor décor (placed) ──────────────────────────────── */}
      {prop('room_posters')}
      {prop('room_rug')}
      {backFloor.map(prop)}

      {/* ── Desk (variant) + drawers (variant) ───────────────────────── */}
      <ellipse cx="80" cy="117" rx="58" ry="5" fill={SHADOW} opacity="0.12"
        shapeRendering="geometricPrecision" />
      <g>{DESKS[den.desk]()}</g>
      <g>{DRAWERS[den.drawers]()}</g>

      {/* ── Desk gear: dual monitor behind, computer, small props front ── */}
      {prop('room_dualmon')}
      <g>{computerSpec.render()}</g>
      {/* mousepad + mouse (base art) */}
      <g>
        <rect x="100" y="82" width="11" height="4" fill="#39434f" />
        <rect x="100" y="82" width="11" height="1" fill="#4a5665" />
        <rect x="104" y="83" width="4" height="2" fill="#e7e2d8" />
      </g>
      {prop('room_mug')}
      {prop('room_keyboard')}
      {prop('room_lamp')}

      {/* ── Ambient light, BEHIND the avatar ─────────────────────────── */}
      <ellipse
        cx={computerSpec.glow.cx}
        cy={computerSpec.glow.cy}
        rx={computerSpec.glow.rx}
        ry={computerSpec.glow.ry}
        fill={`url(#${ref('monitorGlow')})`}
        shapeRendering="geometricPrecision"
      />
      {has('room_dualmon') && (
        <ellipse cx={40 + dualmonDelta.dx} cy="62" rx="24" ry="21"
          fill={`url(#${ref('monitorGlow')})`} shapeRendering="geometricPrecision" />
      )}
      {has('room_lamp') && (
        <ellipse cx={116 + lampDelta.dx} cy="64" rx="28" ry="26"
          fill={`url(#${ref('lampGlow')})`} shapeRendering="geometricPrecision" />
      )}
      <ellipse cx="80" cy="82" rx="26" ry="30" fill={`url(#${ref('charGlow')})`}
        shapeRendering="geometricPrecision" />
      {isGlow && (
        <ellipse className="scene-glow" cx="80" cy="87" rx="27" ry="28"
          fill={`url(#${ref('auraGlow')})`} shapeRendering="geometricPrecision" />
      )}

      {/* ── Chair (variant) + character (hero) ───────────────────────── */}
      <ellipse cx="80" cy="112" rx="20" ry="4" fill={SHADOW} opacity="0.18"
        shapeRendering="geometricPrecision" />
      <g className="scene-character">
        {CHAIRS[den.chair]()}
        <CharacterSprite body={character.body} shirt={character.shirt} equipped={equipped} />
      </g>

      {/* ── Cat (walks the desk, in front) + deep floor props ────────── */}
      {prop('room_cat')}
      {frontFloor.map(prop)}

      {/* ── Night overlay (dims in dark themes) ──────────────────────── */}
      <rect x="0" y="0" width="160" height="144" fill="var(--scene-night)" />

      {/* ── On-top lighting ──────────────────────────────────────────── */}
      {has('room_lamp') && (
        <polygon
          points={`${111 + lampDelta.dx},64 ${121 + lampDelta.dx},64 ${130 + lampDelta.dx},88 ${102 + lampDelta.dx},88`}
          fill={`url(#${ref('lampCone')})`}
          shapeRendering="geometricPrecision"
        />
      )}
      <ellipse
        className="scene-screen-glow"
        cx={computerSpec.night.cx}
        cy={computerSpec.night.cy}
        rx={computerSpec.night.rx}
        ry={computerSpec.night.ry}
        fill={`url(#${ref('screenBloom')})`}
        opacity="var(--scene-screen-glow, 0)"
        shapeRendering="geometricPrecision"
      />

      {/* string lights (owned, animated, wired to the wall — not movable) */}
      {has('room_string_lights') && (
        <g>
          <path d="M0 8 Q40 18 80 8 T160 8" fill="none" stroke="#4a4036" strokeWidth="1" />
          {[12, 28, 44, 60, 76, 92, 108, 124, 140, 152].map((x, i) => (
            <circle
              key={x}
              className="scene-bulb"
              cx={x}
              cy={i % 2 === 0 ? 11 : 13}
              r="2.4"
              fill={['#ffd97d', '#ff9f7d', '#9fe0ff', '#c2ff9f', '#ffb3e6'][i % 5]}
              style={{ animationDelay: `${(i % 5) * 0.3}s` }}
            />
          ))}
        </g>
      )}

      {/* gentle vignette to focus the eye on the room */}
      <rect x="0" y="0" width="160" height="144" fill={`url(#${ref('vignette')})`}
        shapeRendering="geometricPrecision" />
    </svg>
  );
}
