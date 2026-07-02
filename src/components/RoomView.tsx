/**
 * Room / Avatar view — the large pixel scene plus a Customize / Shop panel.
 * Owned room props appear automatically; owned character cosmetics can be
 * equipped one at a time per slot. The shop lives here too (no separate tab),
 * so buying an item visibly updates the scene right beside it.
 */

import { useState } from 'react';
import { itemsByCategory, ownedCosmetics, type CosmeticSlot, type State } from '../core';
import { store } from '../state/store';
import { RoomScene } from '../room/RoomScene';
import { Shop } from './Shop';

export interface RoomViewProps {
  state: State;
}

type Panel = 'customize' | 'shop';

const SLOTS: { slot: CosmeticSlot; label: string }[] = [
  { slot: 'outfit', label: 'Outfit' },
  { slot: 'hair', label: 'Hair' },
  { slot: 'accessory', label: 'Accessory' },
];

export function RoomView({ state }: RoomViewProps) {
  const [panel, setPanel] = useState<Panel>('customize');

  return (
    <div className="room-view">
      <div className="room-stage card">
        <RoomScene
          owned={state.owned}
          equipped={state.equipped}
          width={480}
          className="room-scene-lg"
          title="Your focus den — the big view"
        />
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
          <Customize state={state} onBrowseShop={() => setPanel('shop')} />
        ) : (
          <Shop state={state} embedded />
        )}
      </div>
    </div>
  );
}

function Customize({ state, onBrowseShop }: { state: State; onBrowseShop: () => void }) {
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
      </section>
    </>
  );
}
