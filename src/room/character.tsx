/**
 * The avatar, seen from behind at the desk. Two light body presets share the
 * outfit / hair / accessory systems — a preset only changes build metrics and
 * the default hairstyle, so every outfit (current and future) fits both.
 * The base clothing color comes from the free starter shirt when no outfit
 * is equipped.
 */

import { SHIRT_COLORS } from '../core';
import type { BodyId, Equipped, ShirtId } from '../core';

const HAIR = '#4a3525';
const HAIR_DK = '#38271b';
const SKIN = '#e3b591';
const SKIN_DK = '#d0a67f';

const OUTFITS: Record<string, { body: string; shade: string }> = {
  outfit_hoodie: { body: '#6f9e6f', shade: '#5c8a5c' },
  outfit_blazer: { body: '#3b4a63', shade: '#2c3a50' },
  outfit_denim: { body: '#5577a8', shade: '#456090' },
  outfit_glow: { body: '#c558d6', shade: '#a23fb0' },
};

interface BodyMetrics {
  torsoX: number;
  torsoW: number;
  chestX: number;
  chestW: number;
  armLX: number;
  armRX: number;
  hoodX: number;
  hoodW: number;
  /** long hair by default (no hair item equipped) */
  longDefaultHair: boolean;
}

const BODIES: Record<BodyId, BodyMetrics> = {
  masc: {
    torsoX: 70, torsoW: 20, chestX: 68, chestW: 24,
    armLX: 66, armRX: 90, hoodX: 71, hoodW: 18, longDefaultHair: false,
  },
  fem: {
    torsoX: 71, torsoW: 18, chestX: 69, chestW: 22,
    armLX: 67, armRX: 89, hoodX: 72, hoodW: 16, longDefaultHair: true,
  },
};

export interface CharacterSpriteProps {
  body: BodyId;
  shirt: ShirtId;
  equipped: Equipped;
}

/** The avatar only — the chair renders separately (it's den furniture). */
export function CharacterSprite({ body, shirt, equipped }: CharacterSpriteProps) {
  const m = BODIES[body];
  const outfit = (equipped.outfit && OUTFITS[equipped.outfit]) || SHIRT_COLORS[shirt];
  const isHoodie = equipped.outfit === 'outfit_hoodie';
  const isBlazer = equipped.outfit === 'outfit_blazer';
  const isDenim = equipped.outfit === 'outfit_denim';
  const hair = equipped.hair;
  const acc = equipped.accessory;
  const longHair = hair === 'hair_long' || (hair == null && m.longDefaultHair);

  return (
    <>
      {/* long hair back panel (behind torso) */}
      {longHair && <rect x="70" y="68" width="20" height="22" fill={HAIR} />}

      {/* neck (covered by the hood when a hoodie is on) */}
      <rect x="77" y="76" width="6" height="5" fill={SKIN_DK} />

      {/* hood (hoodie) */}
      {isHoodie && <rect x={m.hoodX} y="76" width={m.hoodW} height="8" fill={outfit.shade} />}

      {/* torso / outfit */}
      <rect x={m.chestX} y="82" width={m.chestW} height="9" fill={outfit.body} />
      <rect x={m.torsoX} y="80" width={m.torsoW} height="24" fill={outfit.body} />
      <rect x={m.torsoX} y="80" width={m.torsoW} height="2" fill={outfit.shade} />
      <rect x={m.torsoX} y="101" width={m.torsoW} height="3" fill={outfit.shade} />
      {/* arms resting at the sides */}
      <rect x={m.armLX} y="84" width="4" height="14" fill={outfit.shade} />
      <rect x={m.armLX} y="84" width="4" height="2" fill={outfit.body} />
      <rect x={m.armRX} y="84" width="4" height="14" fill={outfit.shade} />
      <rect x={m.armRX} y="84" width="4" height="2" fill={outfit.body} />
      {/* outfit details */}
      {isBlazer && (
        <>
          <rect x={m.torsoX + 4} y="80" width={m.torsoW - 8} height="3" fill={outfit.shade} />
          <rect x="79" y="82" width="2" height="22" fill={outfit.shade} />
        </>
      )}
      {isDenim && (
        <>
          <rect x={m.torsoX + 2} y="80" width={m.torsoW - 4} height="3" fill={outfit.shade} />
          <rect x={m.torsoX} y="90" width={m.torsoW} height="1" fill={outfit.shade} />
        </>
      )}

      {/* head */}
      <rect x="73" y="64" width="14" height="14" fill={SKIN} />

      {/* base hair (skipped under a cap) */}
      {acc !== 'acc_cap' && (
        <>
          <rect x="72" y="62" width="16" height="7" fill={HAIR} />
          <rect x="72" y="67" width="16" height="2" fill={HAIR_DK} />
          <rect x="72" y="68" width="2" height="6" fill={HAIR} />
          <rect x="86" y="68" width="2" height="6" fill={HAIR} />
        </>
      )}
      {/* long hair side strands */}
      {longHair && acc !== 'acc_cap' && (
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
      <rect x={m.armRX - 2} y="83" width="2" height="10" fill="#ffdca6" opacity="0.42" />

      {/* accessory: headphones */}
      {acc === 'acc_headphones' && (
        <g>
          <rect x="71" y="61" width="18" height="3" fill="#222" />
          <rect x="74" y="60" width="12" height="1" fill="#3a3a3a" />
          <rect x="69" y="64" width="4" height="9" fill="#222" />
          <rect x="87" y="64" width="4" height="9" fill="#222" />
          <rect x="69" y="64" width="1" height="9" fill="#3a3a3a" />
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
    </>
  );
}
