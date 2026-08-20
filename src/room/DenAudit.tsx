/**
 * DEV-ONLY art audit grid: every den variant, body and shirt rendered side by
 * side. Open http://localhost:5173/?den-audit while `npm run dev` is running.
 * Not part of the app — main.tsx only mounts this in dev builds.
 */

import {
  BODY_IDS,
  defaultCharacter,
  defaultDen,
  DEN_OPTIONS,
  DEN_PARTS,
  SHIRT_IDS,
  type DenConfig,
} from '../core';
import { RoomScene } from './RoomScene';

const ALL_PROPS: Record<string, boolean> = {
  room_mug: true, room_plant: true, room_posters: true, room_lamp: true,
  room_rug: true, room_keyboard: true, room_bookshelf: true, room_dualmon: true,
  room_string_lights: true, room_cat: true,
};

const NO_EQUIP = { outfit: null, hair: null, accessory: null };

export function DenAudit() {
  // audit in daylight — the night overlay hides art mistakes
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = 'light';
  return (
    <div style={{ padding: 16, background: '#e8dcc0' }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>Den art audit</h1>
      {DEN_PARTS.map((part) => (
        <section key={part} style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, margin: '8px 0' }}>{part}</h2>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {DEN_OPTIONS[part].map((id) => (
              <figure key={id} style={{ margin: 0 }}>
                <RoomScene
                  owned={part === 'drawers' || part === 'computer' ? {} : ALL_PROPS}
                  equipped={NO_EQUIP}
                  den={{ ...defaultDen(), [part]: id } as DenConfig}
                  character={defaultCharacter()}
                  width={230}
                />
                <figcaption style={{ fontSize: 11, textAlign: 'center' }}>{id}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, margin: '8px 0' }}>bodies × shirts</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {BODY_IDS.map((body) =>
            SHIRT_IDS.map((shirt) => (
              <figure key={`${body}-${shirt}`} style={{ margin: 0 }}>
                <RoomScene
                  owned={{}}
                  equipped={NO_EQUIP}
                  den={defaultDen()}
                  character={{ body, shirt }}
                  width={160}
                />
                <figcaption style={{ fontSize: 11, textAlign: 'center' }}>
                  {body} · {shirt.replace('shirt_', '')}
                </figcaption>
              </figure>
            )),
          )}
        </div>
      </section>
      <section>
        <h2 style={{ fontSize: 14, margin: '8px 0' }}>outfits × bodies (fit check)</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {BODY_IDS.map((body) =>
            ['outfit_hoodie', 'outfit_blazer', 'outfit_denim', 'outfit_glow'].map((outfit) => (
              <figure key={`${body}-${outfit}`} style={{ margin: 0 }}>
                <RoomScene
                  owned={{}}
                  equipped={{ outfit, hair: null, accessory: null }}
                  den={defaultDen()}
                  character={{ body, shirt: 'shirt_tan' }}
                  width={160}
                />
                <figcaption style={{ fontSize: 11, textAlign: 'center' }}>
                  {body} · {outfit.replace('outfit_', '')}
                </figcaption>
              </figure>
            )),
          )}
        </div>
      </section>
    </div>
  );
}
