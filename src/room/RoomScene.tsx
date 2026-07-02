/**
 * The pixel room scene — drawn entirely in code (no sprite assets).
 *
 * One render function powers both the small Dashboard preview and the large
 * Room view (fixed 160×144 viewBox; the consumer sets width). Owned room props
 * add conditional layers; equipped cosmetics swap the character's outfit / hair
 * / accessory. Buying or equipping anything visibly changes this scene at once.
 *
 * Craft notes:
 * - The pixel objects keep `shape-rendering: crispEdges` (set on the root <svg>).
 *   Lighting / shadow overlays opt OUT per-element with `shapeRendering=
 *   "geometricPrecision"`, so ambient light stays soft while the art stays crisp.
 * - Lighting direction is consistent: cool daylight from the window (upper-left),
 *   warm light from the lamp (right), soft screen light from the monitors.
 * - A gentle vignette + a glow behind the character pull the eye to the avatar
 *   (hero) → desk → décor → background.
 *
 * Animated items (glow outfit, string lights, desk cat, rain window) use small
 * CSS-keyframe motion defined in styles.css and freeze to a static frame under
 * `prefers-reduced-motion`.
 */

import { useId } from 'react';
import type { Equipped } from '../core';

export interface RoomSceneProps {
  owned: Record<string, boolean>;
  equipped: Equipped;
  /** pixel width; height follows the 160×144 aspect ratio */
  width?: number;
  className?: string;
  title?: string;
}

const WOOD = '#9c6b43';
const WOOD_HI = '#b58455';
const WOOD_DK = '#7c5433';
const HAIR = '#4a3525';
const SHADOW = '#241a10'; // warm-black contact shadow

const OUTFITS: Record<string, { body: string; shade: string }> = {
  outfit_hoodie: { body: '#6f9e6f', shade: '#5c8a5c' },
  outfit_blazer: { body: '#3b4a63', shade: '#2c3a50' },
  outfit_denim: { body: '#5577a8', shade: '#456090' },
  outfit_glow: { body: '#c558d6', shade: '#a23fb0' },
  _default: { body: '#c98a5e', shade: '#b3744a' },
};

const BULBS = [12, 28, 44, 60, 76, 92, 108, 124, 140, 152];
const BULB_COLORS = ['#ffd97d', '#ff9f7d', '#9fe0ff', '#c2ff9f', '#ffb3e6'];

/** A soft contact shadow that grounds an object (smooth, not pixelated). */
function ContactShadow(props: { cx: number; cy: number; rx: number; ry: number; opacity?: number }) {
  return (
    <ellipse
      cx={props.cx}
      cy={props.cy}
      rx={props.rx}
      ry={props.ry}
      fill={SHADOW}
      opacity={props.opacity ?? 0.16}
      shapeRendering="geometricPrecision"
    />
  );
}

export function RoomScene({
  owned,
  equipped,
  width = 320,
  className,
  title = 'Your focus den',
}: RoomSceneProps) {
  const height = (width * 144) / 160;
  const uid = useId().replace(/:/g, '');
  const ref = (name: string) => `${uid}-${name}`;

  const has = (id: string) => !!owned[id];
  const outfitId = equipped.outfit ?? '_default';
  const outfit = OUTFITS[outfitId] ?? OUTFITS._default;
  const isHoodie = equipped.outfit === 'outfit_hoodie';
  const isBlazer = equipped.outfit === 'outfit_blazer';
  const isDenim = equipped.outfit === 'outfit_denim';
  const isGlow = equipped.outfit === 'outfit_glow';
  const hair = equipped.hair;
  const acc = equipped.accessory;

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
        <clipPath id={ref('window-clip')}>
          <rect x="19" y="21" width="36" height="28" />
        </clipPath>
        {/* Soft top-light / floor-recede shading (kept very gentle) */}
        <linearGradient id={ref('wallShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff7e8" stopOpacity="0.06" />
          <stop offset="58%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#1c1206" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id={ref('floorShade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.09" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
        {/* Ambient glows — drawn BEHIND the avatar so the pixels stay crisp */}
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
      </defs>

      {/* ── Wall + floor (with soft shading for depth) ───────────────── */}
      <rect x="0" y="0" width="160" height="100" fill="var(--scene-wall)" />
      <rect x="0" y="0" width="160" height="100" fill={`url(#${ref('wallShade')})`}
        shapeRendering="geometricPrecision" />
      <rect x="0" y="100" width="160" height="44" fill="var(--scene-floor)" />
      <rect x="0" y="100" width="160" height="44" fill={`url(#${ref('floorShade')})`}
        shapeRendering="geometricPrecision" />
      <rect x="0" y="98" width="160" height="2" fill="#00000022" />
      <rect x="0" y="112" width="160" height="1" fill="var(--scene-floor-2)" />
      <rect x="0" y="124" width="160" height="1" fill="var(--scene-floor-2)" />
      <rect x="0" y="136" width="160" height="1" fill="var(--scene-floor-2)" />

      {/* Cool daylight spill from the window onto the floor (upper-left source) */}
      <polygon points="10,100 58,100 78,144 0,144" fill="#bcd6f0" opacity="0.10"
        shapeRendering="geometricPrecision" />

      {/* ── Window (+ rain if owned) ─────────────────────────────────── */}
      <g>
        <rect x="16" y="18" width="42" height="34" fill="#6b5d44" />
        <rect x="15" y="17" width="44" height="2" fill="#7c6c50" />
        <rect
          x="19"
          y="21"
          width="36"
          height="28"
          fill={has('room_rain') ? '#26354f' : 'var(--scene-window-sky)'}
        />
        {/* glass top highlight */}
        <rect x="19" y="21" width="36" height="7" fill="#ffffff" opacity="0.08"
          shapeRendering="geometricPrecision" />
        {has('room_rain') && (
          <g clipPath={`url(#${ref('window-clip')})`}>
            {[20, 27, 34, 41, 48].map((x, i) => (
              <rect
                key={x}
                className="scene-rain"
                x={x}
                y="21"
                width="1"
                height="6"
                fill="#bcd6f0"
                opacity="0.8"
                style={{ animationDelay: `${i * 0.22}s` }}
              />
            ))}
          </g>
        )}
        <rect x="35" y="21" width="2" height="28" fill="#6b5d44" />
        <rect x="19" y="34" width="36" height="2" fill="#6b5d44" />
        <rect x="14" y="52" width="46" height="3" fill="#5b4d36" />
      </g>

      {/* ── Wall posters (owned) ─────────────────────────────────────── */}
      {has('room_posters') && (
        <g>
          <rect x="112" y="16" width="18" height="24" fill="#3a3530" />
          <rect x="114" y="18" width="14" height="20" fill="#d98a62" />
          <rect x="117" y="22" width="8" height="8" fill="#f2c14e" />
          <rect x="136" y="22" width="16" height="20" fill="#3a3530" />
          <rect x="138" y="24" width="12" height="16" fill="#6f9ec0" />
          <rect x="140" y="30" width="8" height="2" fill="#fff" />
          <rect x="140" y="34" width="6" height="2" fill="#fff" />
        </g>
      )}

      {/* ── Rug (owned) ──────────────────────────────────────────────── */}
      {has('room_rug') && (
        <g>
          <ellipse cx="80" cy="122" rx="46" ry="15" fill={SHADOW} opacity="0.06"
            shapeRendering="geometricPrecision" />
          <rect x="38" y="106" width="84" height="30" fill="#b5654a" />
          <rect x="44" y="111" width="72" height="20" fill="#cf7d5f" />
          <rect x="44" y="111" width="72" height="2" fill="#e0a184" />
          <rect x="44" y="129" width="72" height="2" fill="#9c4f38" />
        </g>
      )}

      {/* ── Bookshelf (owned) ────────────────────────────────────────── */}
      {has('room_bookshelf') && (
        <g>
          <ContactShadow cx={146} cy={99} rx={14} ry={3} opacity={0.14} />
          <rect x="135" y="54" width="22" height="44" fill="#6b4a30" />
          <rect x="135" y="54" width="22" height="2" fill="#7e5a3b" />
          <rect x="137" y="56" width="18" height="2" fill="#7c5836" />
          <rect x="137" y="70" width="18" height="2" fill="#5a3e28" />
          <rect x="137" y="84" width="18" height="2" fill="#5a3e28" />
          {/* books */}
          <rect x="138" y="59" width="3" height="11" fill="#c4704f" />
          <rect x="142" y="60" width="3" height="10" fill="#5f9a5f" />
          <rect x="146" y="58" width="3" height="12" fill="#5f8cb8" />
          <rect x="150" y="60" width="4" height="10" fill="#cf962a" />
          <rect x="138" y="74" width="4" height="10" fill="#5f8cb8" />
          <rect x="143" y="73" width="3" height="11" fill="#c4704f" />
          <rect x="147" y="75" width="3" height="9" fill="#cf962a" />
          <rect x="151" y="74" width="3" height="10" fill="#5f9a5f" />
        </g>
      )}

      {/* ── Plant (owned) ────────────────────────────────────────────── */}
      {has('room_plant') && (
        <g>
          <ContactShadow cx={20} cy={119} rx={13} ry={3} opacity={0.14} />
          <rect x="14" y="88" width="12" height="18" fill="#4f8a4f" />
          <rect x="8" y="94" width="10" height="12" fill="#5fa05f" />
          <rect x="22" y="92" width="10" height="14" fill="#46824a" />
          <rect x="16" y="84" width="8" height="8" fill="#5fa05f" />
          <rect x="12" y="106" width="16" height="12" fill="#c2724a" />
          <rect x="10" y="103" width="20" height="4" fill="#d98a62" />
        </g>
      )}

      {/* ── Desk (with grounding shadow) ─────────────────────────────── */}
      <ellipse cx="80" cy="117" rx="58" ry="5" fill={SHADOW} opacity="0.12"
        shapeRendering="geometricPrecision" />
      <g>
        <rect x="28" y="86" width="104" height="8" fill={WOOD} />
        <rect x="28" y="86" width="104" height="2" fill={WOOD_HI} />
        <rect x="28" y="92" width="104" height="2" fill={WOOD_DK} opacity="0.6" />
        <rect x="34" y="94" width="6" height="22" fill={WOOD_DK} />
        <rect x="120" y="94" width="6" height="22" fill={WOOD_DK} />
      </g>

      {/* ── Dual monitor (owned, left of main) ───────────────────────── */}
      {has('room_dualmon') && (
        <g>
          <rect x="18" y="50" width="30" height="26" fill="#2a2a30" />
          <rect x="21" y="53" width="24" height="20" fill="#4f8fd0" />
          <rect x="24" y="57" width="14" height="2" fill="#bfe0ff" />
          <rect x="24" y="62" width="18" height="2" fill="#9ccaf5" />
          <rect x="24" y="67" width="10" height="2" fill="#bfe0ff" />
          <rect x="31" y="76" width="4" height="8" fill="#3b3b42" />
          <rect x="26" y="84" width="14" height="2" fill="#3b3b42" />
        </g>
      )}

      {/* ── Main monitor ─────────────────────────────────────────────── */}
      <g>
        <rect x="76" y="78" width="8" height="8" fill="#3b3b42" />
        <rect x="70" y="84" width="20" height="2" fill="#3b3b42" />
        <rect x="54" y="46" width="52" height="34" fill="#2a2a30" />
        <rect x="55" y="47" width="50" height="1" fill="#43434c" />
        <rect x="57" y="49" width="46" height="28" fill="#4f8fd0" />
        <rect x="60" y="53" width="22" height="2" fill="#bfe0ff" />
        <rect x="60" y="58" width="32" height="2" fill="#9ccaf5" />
        <rect x="60" y="63" width="16" height="2" fill="#bfe0ff" />
        <rect x="60" y="68" width="26" height="2" fill="#9ccaf5" />
      </g>

      {/* ── Coffee mug (owned) ───────────────────────────────────────── */}
      {has('room_mug') && (
        <g>
          <rect x="48" y="79" width="8" height="7" fill="#e7e2d8" />
          <rect x="48" y="79" width="8" height="2" fill="#f3efe6" />
          <rect x="56" y="81" width="2" height="3" fill="#cfc9bd" />
          <rect x="49" y="76" width="2" height="2" fill="#d8d2c6" opacity="0.7" />
          <rect x="52" y="75" width="2" height="2" fill="#d8d2c6" opacity="0.5" />
        </g>
      )}

      {/* ── Mechanical keyboard (owned) ──────────────────────────────── */}
      {has('room_keyboard') && (
        <g>
          <rect x="60" y="83" width="40" height="4" fill="#2f2c29" />
          {[62, 66, 70, 74, 78, 82, 86, 90, 94].map((x) => (
            <rect key={x} x={x} y="84" width="2" height="2" fill="#d8d2c6" />
          ))}
        </g>
      )}

      {/* ── Lamp (owned) — structure (warm light drawn later) ─────────── */}
      {has('room_lamp') && (
        <g>
          <rect x="112" y="82" width="10" height="4" fill="#555" />
          <rect x="116" y="62" width="2" height="20" fill="#555" />
          <polygon points="106,56 124,56 120,64 110,64" fill="#f2c14e" />
          <rect x="112" y="63" width="6" height="2" fill="#fff6d0" />
        </g>
      )}

      {/* ── Ambient light, BEHIND the avatar (keeps the avatar crisp) ── */}
      <ellipse cx="80" cy="60" rx="46" ry="32" fill={`url(#${ref('monitorGlow')})`}
        shapeRendering="geometricPrecision" />
      {has('room_dualmon') && (
        <ellipse cx="33" cy="62" rx="26" ry="22" fill={`url(#${ref('monitorGlow')})`}
          shapeRendering="geometricPrecision" />
      )}
      {has('room_lamp') && (
        <ellipse cx="116" cy="66" rx="28" ry="26" fill={`url(#${ref('lampGlow')})`}
          shapeRendering="geometricPrecision" />
      )}
      <ellipse cx="80" cy="82" rx="26" ry="30" fill={`url(#${ref('charGlow')})`}
        shapeRendering="geometricPrecision" />

      {/* ── Character (hero) — grounded, with a gentle scale-up ───────── */}
      <ellipse cx="80" cy="104" rx="22" ry="4.5" fill={SHADOW} opacity="0.2"
        shapeRendering="geometricPrecision" />
      <g className="scene-character">
        {/* chair */}
        <rect x="66" y="72" width="28" height="32" fill="#5b4a3a" />
        <rect x="66" y="72" width="28" height="2" fill="#6b5847" />
        <rect x="68" y="70" width="24" height="6" fill="#6b5847" />

        {/* long hair back panel (behind torso) */}
        {hair === 'hair_long' && <rect x="70" y="68" width="20" height="22" fill={HAIR} />}

        {/* hood (hoodie) */}
        {isHoodie && <rect x="71" y="76" width="18" height="8" fill={outfit.shade} />}

        {/* torso / outfit */}
        <rect x="68" y="82" width="24" height="9" fill={outfit.body} />
        <rect x="70" y="80" width="20" height="24" fill={outfit.body} />
        <rect x="70" y="80" width="20" height="2" fill={outfit.shade} />
        {/* outfit details */}
        {isBlazer && (
          <>
            <rect x="74" y="80" width="12" height="3" fill={outfit.shade} />
            <rect x="79" y="82" width="2" height="22" fill={outfit.shade} />
          </>
        )}
        {isDenim && (
          <>
            <rect x="72" y="80" width="16" height="3" fill={outfit.shade} />
            <rect x="70" y="90" width="20" height="1" fill={outfit.shade} />
          </>
        )}

        {/* head */}
        <rect x="73" y="64" width="14" height="14" fill="#e3b591" />

        {/* base hair (skipped under a cap) */}
        {acc !== 'acc_cap' && (
          <>
            <rect x="72" y="62" width="16" height="7" fill={HAIR} />
            <rect x="72" y="68" width="2" height="6" fill={HAIR} />
            <rect x="86" y="68" width="2" height="6" fill={HAIR} />
          </>
        )}
        {/* long hair side strands */}
        {hair === 'hair_long' && acc !== 'acc_cap' && (
          <>
            <rect x="70" y="68" width="3" height="20" fill={HAIR} />
            <rect x="87" y="68" width="3" height="20" fill={HAIR} />
          </>
        )}
        {/* spiky hair */}
        {hair === 'hair_spiky' && acc !== 'acc_cap' && (
          <>
            <polygon points="73,62 76,54 79,62" fill={HAIR} />
            <polygon points="78,62 81,53 84,62" fill={HAIR} />
            <polygon points="83,62 86,55 88,62" fill={HAIR} />
          </>
        )}

        {/* directional rim light: cool from the window (left), warm from lamp (right) */}
        <rect x="72" y="64" width="2" height="8" fill="#d6e6f2" opacity="0.4" />
        <rect x="88" y="83" width="2" height="10" fill="#ffdca6" opacity="0.42" />

        {/* accessory: headphones */}
        {acc === 'acc_headphones' && (
          <g>
            <rect x="71" y="61" width="18" height="3" fill="#222" />
            <rect x="69" y="64" width="4" height="9" fill="#222" />
            <rect x="87" y="64" width="4" height="9" fill="#222" />
          </g>
        )}
        {/* accessory: glasses (temple arms visible from behind) */}
        {acc === 'acc_glasses' && (
          <g>
            <rect x="71" y="70" width="3" height="2" fill="#2a2a2a" />
            <rect x="86" y="70" width="3" height="2" fill="#2a2a2a" />
            <rect x="72" y="69" width="2" height="2" fill="#3a3a3a" />
          </g>
        )}
        {/* accessory: cap */}
        {acc === 'acc_cap' && (
          <g>
            <rect x="71" y="60" width="18" height="6" fill="#c4704f" />
            <rect x="71" y="60" width="18" height="2" fill="#d98a62" />
            <rect x="65" y="64" width="7" height="2" fill="#a85a3e" />
          </g>
        )}
      </g>

      {/* ── Desk cat (owned, animated) ───────────────────────────────── */}
      {has('room_cat') && (
        <g>
          <ellipse cx="114" cy="86" rx="9" ry="2" fill={SHADOW} opacity="0.16"
            shapeRendering="geometricPrecision" />
          <rect x="106" y="74" width="16" height="12" fill="#8a8076" />
          <rect x="106" y="74" width="16" height="2" fill="#9a9086" />
          <polygon points="106,74 109,68 112,74" fill="#8a8076" />
          <polygon points="116,74 119,68 122,74" fill="#8a8076" />
          <rect
            className="scene-cat-tail"
            x="121"
            y="80"
            width="9"
            height="3"
            fill="#8a8076"
          />
          <rect className="scene-cat-eye" x="109" y="78" width="2" height="3" fill="#2c2c2c" />
          <rect className="scene-cat-eye" x="116" y="78" width="2" height="3" fill="#2c2c2c" />
          <rect x="112" y="81" width="3" height="2" fill="#caa0a0" />
        </g>
      )}

      {/* ── Night overlay (dims in dark themes) ──────────────────────── */}
      <rect x="0" y="0" width="160" height="144" fill="var(--scene-night)" />

      {/* ── On-top lighting (localized; does not wash the avatar) ─────── */}
      {/* warm pool cast by the lamp onto the desk */}
      {has('room_lamp') && (
        <polygon points="110,63 124,63 132,88 100,88" fill="#ffd97d" opacity="0.2"
          shapeRendering="geometricPrecision" />
      )}
      {/* faint monitor bloom on the upper screen at night (above the head) */}
      <rect
        className="scene-screen-glow"
        x="56"
        y="44"
        width="48"
        height="18"
        fill="#9cc7f4"
        opacity="var(--scene-screen-glow, 0)"
        shapeRendering="geometricPrecision"
      />

      {/* glow outfit aura */}
      {isGlow && (
        <rect
          className="scene-glow"
          x="66"
          y="78"
          width="28"
          height="28"
          fill="none"
          stroke="#e07bff"
          strokeWidth="2"
        />
      )}

      {/* string lights (owned, animated) */}
      {has('room_string_lights') && (
        <g>
          <path d="M0 8 Q40 18 80 8 T160 8" fill="none" stroke="#4a4036" strokeWidth="1" />
          {BULBS.map((x, i) => (
            <circle
              key={x}
              className="scene-bulb"
              cx={x}
              cy={i % 2 === 0 ? 11 : 13}
              r="2.4"
              fill={BULB_COLORS[i % BULB_COLORS.length]}
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
