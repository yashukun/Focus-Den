/**
 * Room / Avatar view — the large pixel scene plus a Customize / Shop panel.
 * Owned room props appear automatically; owned character cosmetics can be
 * equipped one at a time per slot. The shop lives here too (no separate tab),
 * so buying an item visibly updates the scene right beside it.
 *
 * Arrange mode: movable owned props (items with a `surface`) drag freely
 * inside their zone. The drag previews via a local draft placement (so the
 * store — and localStorage — is only written once, on drop), snaps to a 2 px
 * grid and clamps through core `clampPlacement`. Pointer math mirrors
 * WeekGrid: ratios of the measured svg rect, immune to `html { zoom }`.
 */

import { useRef, useState } from 'react';
import {
  BODY_IDS,
  clampPlacement,
  DEN_OPTIONS,
  DEN_PARTS,
  getItem,
  itemsByCategory,
  ownedCosmetics,
  perchCtx,
  SHIRT_COLORS,
  SHIRT_IDS,
  type CosmeticSlot,
  type DenConfig,
  type Placement,
  type State,
} from '../core';
import { play } from '../audio';
import { store } from '../state/store';
import { RoomScene } from '../room/RoomScene';
import { BODY_LABELS, DEN_PART_LABELS, VARIANT_LABELS } from './denLabels';
import { Shop } from './Shop';
import { useArmedConfirm } from './useArmedConfirm';
import { useEscape } from './useEscape';



export interface RoomViewProps {
  state: State;
}

type Panel = 'customize' | 'shop';

const SLOTS: { slot: CosmeticSlot; label: string }[] = [
  { slot: 'outfit', label: 'Outfit' },
  { slot: 'hair', label: 'Hair' },
  { slot: 'accessory', label: 'Accessory' },
];

/** an in-flight drag: the item plus its live (clamped) draft placement */
interface Drag {
  id: string;
  pos: Placement;
}

export function RoomView({ state }: RoomViewProps) {
  const [panel, setPanel] = useState<Panel>('customize');
  const [arranging, setArranging] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // grab offset between the pointer and the item's placement, in scene px
  const grabRef = useRef({ dx: 0, dy: 0 });
  const [resetArmed, fireReset] = useArmedConfirm();

  const hasMovable = itemsByCategory('room').some((i) => i.surface && state.owned[i.id]);

  // Esc backs out one layer at a time: first an in-flight drag, then the mode.
  useEscape(() => {
    if (drag) setDrag(null);
    else setArranging(false);
  }, arranging);

  /** client px → scene coords (160×144 viewBox), via rect ratios */
  function toScene(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = stageRef.current?.querySelector('svg');
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 160,
      y: ((e.clientY - rect.top) / rect.height) * 144,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!arranging || e.button !== 0) return;
    const target = (e.target as Element).closest('[data-item]');
    const id = target?.getAttribute('data-item');
    const item = id ? getItem(id) : null;
    const at = toScene(e);
    if (!id || !item?.anchor || !item.surface || !at) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic events (tests) have no active pointer to capture
    }
    const pos = state.placements[id] ?? item.anchor;
    grabRef.current = { dx: at.x - pos.x, dy: at.y - pos.y };
    setDrag({ id, pos });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const item = getItem(drag.id);
    const at = toScene(e);
    if (!item || !at) return;
    const snap = (v: number) => Math.round(v / 2) * 2;
    const pos = clampPlacement(
      item,
      snap(at.x - grabRef.current.dx),
      snap(at.y - grabRef.current.dy),
      perchCtx(state),
    );
    if (pos && (pos.x !== drag.pos.x || pos.y !== drag.pos.y)) setDrag({ id: drag.id, pos });
  }

  function onPointerUp() {
    if (!drag) return;
    store.placeItem(drag.id, drag.pos.x, drag.pos.y);
    play('switch');
    setDrag(null);
  }

  const scenePlacements = drag
    ? { ...state.placements, [drag.id]: drag.pos }
    : state.placements;

  return (
    <div className="room-view">
      <div className={`room-stage card ${arranging ? 'is-arranging' : ''}`}>
        <div
          ref={stageRef}
          className={`arrange-stage ${drag ? 'is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
        >
          <RoomScene
            owned={state.owned}
            equipped={state.equipped}
            den={state.den}
            character={state.character}
            placements={scenePlacements}
            width={480}
            className="room-scene-lg"
            title="Your focus den — the big view"
            interactive={arranging}
          />
        </div>
        <div className="arrange-bar">
          {arranging ? (
            <>
              <span className="muted arrange-hint">
                {hasMovable
                  ? 'Swap the free furniture beside the scene, and drag to rearrange — desk items slide along the desk; floor and wall pieces roam their area. The cat hops between desk, floor, sill and shelf.'
                  : 'Swap the free furniture beside the scene — movable items from the shop can also be dragged here.'}
              </span>
              <button
                className={`btn btn-sm btn-danger ${resetArmed ? 'is-armed' : ''}`}
                data-sound="none"
                onClick={() => fireReset(() => store.resetPlacements())}
              >
                {resetArmed ? 'Really reset the layout?' : 'Reset layout'}
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setArranging(false)}>
                Done ✓
              </button>
            </>
          ) : (
            <button
              className="btn btn-sm"
              title="Redecorate — swap free furniture and move your things"
              onClick={() => {
                setArranging(true);
                setPanel('customize'); // the free chips live in the customize panel
              }}
            >
              ⠿ Arrange
            </button>
          )}
        </div>
      </div>

      <div className="room-controls">
        <div className="subtabs" role="tablist" aria-label="Room panel">
          <button
            role="tab"
            aria-selected={panel === 'customize'}
            className={`subtab ${panel === 'customize' ? 'is-active' : ''}`}
            onClick={() => setPanel('customize')}
            data-sound="none"
          >
            Customize
          </button>
          <button
            role="tab"
            aria-selected={panel === 'shop'}
            className={`subtab ${panel === 'shop' ? 'is-active' : ''}`}
            onClick={() => setPanel('shop')}
            data-sound="none"
          >
            Shop
          </button>
        </div>

        {panel === 'customize' ? (
          <Customize state={state} arranging={arranging} onBrowseShop={() => setPanel('shop')} />
        ) : (
          <Shop state={state} embedded />
        )}
      </div>
    </div>
  );
}

function Customize({
  state,
  arranging,
  onBrowseShop,
}: {
  state: State;
  arranging: boolean;
  onBrowseShop: () => void;
}) {
  // Arrange mode is the redecorating mode: the free furniture and character
  // basics take over the panel; day to day it stays compact (cosmetics,
  // props, shop).
  if (arranging) {
    return (
      <>
        <section className="card">
          <div className="card-head">
            <h2>Your den</h2>
            <span className="muted">all free</span>
          </div>
          {DEN_PARTS.map((part) => (
            <div key={part} className="equip-row">
              <span className="equip-label">{DEN_PART_LABELS[part]}</span>
              <div className="equip-options">
                {DEN_OPTIONS[part].map((id) => (
                  <button
                    key={id}
                    className={`btn btn-sm chip-toggle ${state.den[part] === id ? 'is-on' : ''}`}
                    aria-pressed={state.den[part] === id}
                    data-sound="switch"
                    onClick={() => store.setDenPart(part, id as DenConfig[typeof part])}
                  >
                    {VARIANT_LABELS[id] ?? id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Character</h2>
            <span className="muted">all free</span>
          </div>
          <div className="equip-row">
            <span className="equip-label">Body</span>
            <div className="equip-options">
              {BODY_IDS.map((b) => (
                <button
                  key={b}
                  className={`btn btn-sm chip-toggle ${state.character.body === b ? 'is-on' : ''}`}
                  aria-pressed={state.character.body === b}
                  onClick={() => store.setBody(b)}
                >
                  {BODY_LABELS[b]}
                </button>
              ))}
            </div>
          </div>
          <div className="equip-row">
            <span className="equip-label">Shirt</span>
            <div className="equip-options">
              {SHIRT_IDS.map((s) => (
                <button
                  key={s}
                  className={`swatch ${state.character.shirt === s ? 'is-on' : ''}`}
                  style={{ background: SHIRT_COLORS[s].body }}
                  aria-pressed={state.character.shirt === s}
                  aria-label={`Shirt color ${s.replace('shirt_', '')}`}
                  title={s.replace('shirt_', '')}
                  data-sound="switch"
                  onClick={() => store.setShirt(s)}
                />
              ))}
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Character</h2>
        </div>
        {SLOTS.map(({ slot, label }) => {
          const options = ownedCosmetics(state.owned, slot);
          const equipped = state.equipped[slot];
          return (
            <div key={slot} className="equip-row">
              <span className="equip-label">{label}</span>
              {options.length === 0 ? (
                <span className="muted">None owned yet</span>
              ) : (
                <div className="equip-options">
                  <button
                    className={`btn btn-sm chip-toggle ${equipped === null ? 'is-on' : ''}`}
                    aria-pressed={equipped === null}
                    onClick={() => store.equip(slot, null)}
                  >
                    None
                  </button>
                  {options.map((item) => (
                    <button
                      key={item.id}
                      className={`btn btn-sm chip-toggle ${equipped === item.id ? 'is-on' : ''}`}
                      aria-pressed={equipped === item.id}
                      onClick={() => store.equip(slot, item.id)}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Room</h2>
        </div>
        <ul className="prop-list">
          {itemsByCategory('room').map((item) => {
            const owned = !!state.owned[item.id];
            return (
              <li key={item.id} className={owned ? 'prop-owned' : ''}>
                <span className="prop-name">{item.name}</span>
                <span className={`prop-status ${owned ? 'is-placed' : 'is-shop'}`}>
                  {owned ? 'Placed ✓' : 'In shop'}
                </span>
              </li>
            );
          })}
        </ul>
        <button className="btn btn-ghost btn-block" onClick={onBrowseShop}>
          Browse shop ›
        </button>
        <p className="muted arrange-nudge">
          ⠿ Arrange (under the scene) swaps the free furniture, walls, floors and your look —
          and lets you drag things around.
        </p>
      </section>
    </>
  );
}
