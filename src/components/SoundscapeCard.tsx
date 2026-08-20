/**
 * Soundscape widget — the ambience picker as a living picture. The card's
 * whole background is a small animated pixel scene matched to the selected
 * soundscape (rain streaks, a flickering fire, drifting clouds…), with the
 * controls floating on a scrim at the bottom: cycle ‹ ›, name, play/pause.
 *
 * The scenes are fixed-palette mood pieces (not theme-tokened like the den) —
 * a rainy sky is rainy in every theme. All motion is CSS keyframes in
 * styles.css (`ss-*`), paused entirely while the sound is off and frozen
 * under prefers-reduced-motion, like every other ambient loop.
 */

import { SOUNDSCAPE_IDS, SOUNDSCAPE_LABELS, type SoundscapeId, type State } from '../core';
import { store } from '../state/store';

export interface SoundscapeCardProps {
  state: State;
}

export function SoundscapeCard({ state }: SoundscapeCardProps) {
  const { soundscape, soundscapeOn } = state.settings;
  const n = SOUNDSCAPE_IDS.length;
  const idx = SOUNDSCAPE_IDS.indexOf(soundscape);

  function cycle(dir: -1 | 1) {
    store.setSoundscape(SOUNDSCAPE_IDS[(idx + dir + n) % n]);
  }

  return (
    <section className={`card ss-card ${soundscapeOn ? 'is-on' : ''}`}>
      <div className="ss-art" aria-hidden="true">
        {ART[soundscape]}
      </div>
      <div className="ss-ui">
        <button
          type="button"
          className="ss-btn"
          aria-label="Previous soundscape"
          title="Previous soundscape"
          data-sound="switch"
          onClick={() => cycle(-1)}
        >
          ‹
        </button>
        <div className="ss-name">
          <h2>{SOUNDSCAPE_LABELS[soundscape]}</h2>
          <span className="ss-state">{soundscapeOn ? '♪ playing' : 'paused'}</span>
        </div>
        <button
          type="button"
          className="ss-btn"
          aria-label="Next soundscape"
          title="Next soundscape"
          data-sound="switch"
          onClick={() => cycle(1)}
        >
          ›
        </button>
        <button
          type="button"
          className={`ss-btn ss-play ${soundscapeOn ? 'is-on' : ''}`}
          aria-pressed={soundscapeOn}
          aria-label={soundscapeOn ? 'Pause the soundscape' : 'Play the soundscape'}
          title={soundscapeOn ? 'Pause' : 'Play'}
          data-sound="none"
          onClick={() => store.setSoundscapeOn(!soundscapeOn)}
        >
          {soundscapeOn ? '❚❚' : '▶'}
        </button>
      </div>
    </section>
  );
}

// ── The seven scenes (viewBox 160×90, pixel rects, calm loops) ──────────────

// Streaks start scattered THROUGH the scene so the paused frame still reads
// as rain; the loop carries each one the full height from wherever it sits.
const RAIN_STREAKS = Array.from({ length: 12 }, (_, i) => ({
  x: 6 + i * 13,
  y: -14 + ((i * 29) % 72),
  delay: (i * 0.37) % 1.6,
  h: 7 + ((i * 5) % 5),
}));

const rain = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#46536b" />
    <rect y="58" width="160" height="32" fill="#3a465c" />
    {/* far hills */}
    <rect x="0" y="52" width="70" height="10" fill="#39445a" />
    <rect x="90" y="50" width="70" height="12" fill="#39445a" />
    {/* clouds, drifting very slowly */}
    <g className="ss-cloud-a">
      <rect x="14" y="12" width="34" height="8" fill="#5a6880" />
      <rect x="20" y="8" width="20" height="6" fill="#5a6880" />
    </g>
    <g className="ss-cloud-b">
      <rect x="96" y="20" width="40" height="8" fill="#525f76" />
      <rect x="104" y="16" width="22" height="6" fill="#525f76" />
    </g>
    {/* rain */}
    {RAIN_STREAKS.map((s, i) => (
      <rect
        key={i}
        className="ss-rain"
        x={s.x}
        y={s.y}
        width="1"
        height={s.h}
        fill="#9fb4d4"
        opacity="0.7"
        style={{ animationDelay: `${s.delay}s` }}
      />
    ))}
    {/* puddle glints */}
    <rect className="ss-blink-a" x="34" y="80" width="10" height="1" fill="#8ba3c7" opacity="0.5" />
    <rect className="ss-blink-b" x="108" y="84" width="8" height="1" fill="#8ba3c7" opacity="0.5" />
  </svg>
);

const cafe = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#4a3a30" />
    {/* evening window */}
    <rect x="12" y="12" width="40" height="30" fill="#2c3050" />
    <rect x="12" y="12" width="40" height="2" fill="#3a2e26" />
    <rect x="30" y="12" width="2" height="30" fill="#3a2e26" />
    <rect x="12" y="26" width="40" height="2" fill="#3a2e26" />
    <rect className="ss-blink-a" x="20" y="18" width="3" height="3" fill="#f2c14e" opacity="0.8" />
    <rect className="ss-blink-b" x="40" y="32" width="3" height="3" fill="#f2c14e" opacity="0.6" />
    {/* hanging lamp with breathing glow */}
    <rect x="99" y="0" width="2" height="16" fill="#2e241e" />
    <rect x="94" y="16" width="12" height="6" fill="#8a5a34" />
    <rect x="96" y="22" width="8" height="2" fill="#f2c14e" />
    <ellipse className="ss-glow" cx="100" cy="38" rx="26" ry="18" fill="#f2b04e" opacity="0.16"
      shapeRendering="geometricPrecision" />
    {/* counter + mug with steam */}
    <rect x="0" y="62" width="160" height="28" fill="#3a2e26" />
    <rect x="0" y="62" width="160" height="3" fill="#5a4636" />
    <rect x="92" y="52" width="12" height="10" fill="#c96f4a" />
    <rect x="104" y="54" width="3" height="5" fill="#c96f4a" />
    <rect className="ss-steam-a" x="95" y="44" width="2" height="5" fill="#e8dcc8" opacity="0.6" />
    <rect className="ss-steam-b" x="99" y="42" width="2" height="6" fill="#e8dcc8" opacity="0.5" />
    {/* jars on the counter */}
    <rect x="20" y="54" width="8" height="8" fill="#6a4f3a" />
    <rect x="32" y="50" width="8" height="12" fill="#7d5c42" />
  </svg>
);

const LOFI_WINDOWS = [
  { x: 18, y: 58, blink: 'a' }, { x: 26, y: 66, blink: '' }, { x: 44, y: 50, blink: 'b' },
  { x: 52, y: 62, blink: '' }, { x: 78, y: 56, blink: 'a' }, { x: 86, y: 68, blink: '' },
  { x: 112, y: 52, blink: 'b' }, { x: 120, y: 64, blink: '' }, { x: 140, y: 60, blink: 'a' },
];

const lofi = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#232746" />
    {/* moon + stars */}
    <rect x="118" y="12" width="12" height="12" fill="#e8e0c8" />
    <rect x="118" y="12" width="4" height="4" fill="#d4cbb0" />
    <rect className="ss-blink-a" x="30" y="10" width="2" height="2" fill="#cfd4ee" />
    <rect className="ss-blink-b" x="66" y="20" width="2" height="2" fill="#cfd4ee" />
    <rect className="ss-blink-a" x="94" y="8" width="2" height="2" fill="#cfd4ee" />
    <rect className="ss-blink-b" x="146" y="30" width="2" height="2" fill="#cfd4ee" />
    {/* skyline */}
    <rect x="10" y="46" width="24" height="44" fill="#161930" />
    <rect x="38" y="56" width="22" height="34" fill="#12152a" />
    <rect x="70" y="48" width="26" height="42" fill="#161930" />
    <rect x="104" y="44" width="26" height="46" fill="#12152a" />
    <rect x="134" y="54" width="18" height="36" fill="#161930" />
    {/* lit windows */}
    {LOFI_WINDOWS.map((w, i) => (
      <rect
        key={i}
        className={w.blink ? `ss-blink-${w.blink}` : undefined}
        x={w.x}
        y={w.y}
        width="4"
        height="4"
        fill="#f2c14e"
        opacity="0.85"
      />
    ))}
  </svg>
);

const fireplace = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#241a14" />
    {/* hearth */}
    <rect x="46" y="18" width="68" height="72" fill="#3a2a20" />
    <rect x="54" y="26" width="52" height="64" fill="#1a120c" />
    <rect x="46" y="18" width="68" height="4" fill="#4a3626" />
    {/* logs */}
    <rect x="62" y="74" width="36" height="6" fill="#5a4030" />
    <rect x="58" y="80" width="44" height="6" fill="#4a3426" />
    {/* fire — three flickering layers */}
    <ellipse className="ss-glow" cx="80" cy="64" rx="34" ry="24" fill="#f2892e" opacity="0.14"
      shapeRendering="geometricPrecision" />
    <g className="ss-flame">
      <rect x="70" y="52" width="20" height="22" fill="#d9772e" />
      <rect x="74" y="44" width="12" height="10" fill="#d9772e" />
    </g>
    <g className="ss-flame-mid">
      <rect x="74" y="58" width="12" height="16" fill="#f2a03d" />
      <rect x="77" y="52" width="6" height="8" fill="#f2a03d" />
    </g>
    <g className="ss-flame-core">
      <rect x="77" y="64" width="6" height="10" fill="#ffd27d" />
    </g>
    {/* rising embers */}
    <rect className="ss-ember-a" x="72" y="50" width="2" height="2" fill="#ffb45e" />
    <rect className="ss-ember-b" x="84" y="48" width="2" height="2" fill="#ff9e42" />
    <rect className="ss-ember-c" x="79" y="46" width="1" height="2" fill="#ffd27d" />
  </svg>
);

const forest = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#9dbfae" />
    {/* far treeline */}
    <rect x="0" y="34" width="160" height="20" fill="#5f8a6f" />
    <rect x="8" y="26" width="18" height="12" fill="#5f8a6f" />
    <rect x="52" y="24" width="22" height="14" fill="#5f8a6f" />
    <rect x="110" y="28" width="20" height="10" fill="#5f8a6f" />
    {/* near canopy + trunks (stepped canopies with a lit top edge) */}
    <rect x="0" y="50" width="160" height="40" fill="#3f6b50" />
    <rect x="18" y="36" width="26" height="22" fill="#4a7a5c" />
    <rect x="23" y="28" width="16" height="10" fill="#4a7a5c" />
    <rect x="26" y="24" width="10" height="6" fill="#548a68" />
    <rect x="20" y="38" width="9" height="4" fill="#5c9270" />
    <rect x="28" y="58" width="6" height="18" fill="#5a4632" />
    <rect x="28" y="58" width="2" height="18" fill="#6b563e" />
    <rect x="96" y="32" width="30" height="26" fill="#4a7a5c" />
    <rect x="102" y="22" width="18" height="12" fill="#4a7a5c" />
    <rect x="106" y="18" width="10" height="6" fill="#548a68" />
    <rect x="98" y="34" width="11" height="4" fill="#5c9270" />
    <rect x="108" y="58" width="6" height="20" fill="#5a4632" />
    <rect x="108" y="58" width="2" height="20" fill="#6b563e" />
    {/* ground with a soft path */}
    <rect x="0" y="78" width="160" height="12" fill="#365c44" />
    <rect x="58" y="80" width="34" height="4" fill="#4a6b52" />
    {/* fireflies */}
    <rect className="ss-firefly-a" x="52" y="62" width="2" height="2" fill="#ffe9a0" />
    <rect className="ss-firefly-b" x="86" y="70" width="2" height="2" fill="#ffe9a0" />
    <rect className="ss-firefly-c" x="132" y="64" width="2" height="2" fill="#ffe9a0" />
  </svg>
);

const WAVE_TEETH = Array.from({ length: 24 }, (_, i) => i * 8);

function waveBand(y: number, h: number, fill: string, cls: string) {
  return (
    <g className={cls}>
      {/* one long band, wider than the view so the loop can slide it */}
      <rect x="-40" y={y + 3} width="240" height={h} fill={fill} />
      {WAVE_TEETH.map((x) => (
        <rect key={x} x={x - 40} y={y} width="4" height="3" fill={fill} />
      ))}
    </g>
  );
}

const waves = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#bcd6de" />
    {/* low sun + glint */}
    <rect x="26" y="16" width="10" height="10" fill="#f2c14e" />
    <rect className="ss-blink-a" x="28" y="44" width="6" height="1" fill="#ffe9a0" opacity="0.8" />
    {waveBand(40, 50, '#58a0c4', 'ss-wave-a')}
    {waveBand(56, 34, '#3d7fa3', 'ss-wave-b')}
    {waveBand(72, 18, '#2e6b8a', 'ss-wave-c')}
  </svg>
);

const wind = (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" shapeRendering="crispEdges">
    <rect width="160" height="90" fill="#cfe3dd" />
    {/* drifting clouds */}
    <g className="ss-cloud-a">
      <rect x="20" y="14" width="30" height="7" fill="#ffffff" opacity="0.85" />
      <rect x="26" y="10" width="16" height="5" fill="#ffffff" opacity="0.85" />
    </g>
    <g className="ss-cloud-b">
      <rect x="90" y="24" width="36" height="7" fill="#ffffff" opacity="0.7" />
      <rect x="98" y="20" width="18" height="5" fill="#ffffff" opacity="0.7" />
    </g>
    {/* rolling hills */}
    <rect x="0" y="52" width="160" height="38" fill="#7fae6f" />
    <rect x="0" y="46" width="70" height="10" fill="#8fbc7d" />
    <rect x="86" y="48" width="74" height="8" fill="#8fbc7d" />
    <rect x="0" y="70" width="160" height="20" fill="#6a9a5c" />
    {/* grass tufts, swaying */}
    <g className="ss-sway">
      <rect x="30" y="64" width="2" height="6" fill="#4f7a44" />
      <rect x="34" y="62" width="2" height="8" fill="#5a8a4e" />
      <rect x="118" y="66" width="2" height="6" fill="#4f7a44" />
      <rect x="122" y="63" width="2" height="9" fill="#5a8a4e" />
    </g>
    {/* leaves tumbling across */}
    <rect className="ss-leaf-a" x="-6" y="40" width="3" height="3" fill="#8a6a3a" />
    <rect className="ss-leaf-b" x="-6" y="56" width="3" height="3" fill="#a8843d" />
  </svg>
);

const ART: Record<SoundscapeId, JSX.Element> = {
  rain,
  cafe,
  lofi,
  fireplace,
  forest,
  waves,
  wind,
};
