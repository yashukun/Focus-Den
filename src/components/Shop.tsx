/**
 * Shop — items grouped by category. Buying deducts points and either unlocks a
 * cosmetic/prop (visible in the room), stocks a consumable, or activates a perk.
 */

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  SLOT_LABELS,
  itemsByCategory,
  type Item,
  type State,
} from '../core';
import { store } from '../state/store';

export interface ShopProps {
  state: State;
  /** when rendered inside the Room page, skip the big page header */
  embedded?: boolean;
}

export function Shop({ state, embedded }: ShopProps) {
  return (
    <div className="shop">
      {embedded ? (
        <p className="shop-balance muted">
          Balance <span className="mono tone-points">◈ {state.points}</span>
        </p>
      ) : (
        <header className="shop-head">
          <h1>Shop</h1>
          <div className="wallet mono tone-points" aria-label={`Balance ${state.points} points`}>
            ◈ {state.points}
          </div>
        </header>
      )}

      {CATEGORY_ORDER.map((cat) => (
        <section key={cat} className="shop-section">
          <h2 className="shop-section-title">{CATEGORY_LABELS[cat]}</h2>
          <div className="shop-grid">
            {itemsByCategory(cat).map((item) => (
              <ShopCard key={item.id} item={item} state={state} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function tag(item: Item): string | null {
  if (item.slot) return SLOT_LABELS[item.slot];
  if (item.kind === 'perk') return 'Perk';
  return null;
}

function ShopCard({ item, state }: { item: Item; state: State }) {
  const consumable = !!item.consumable;
  const qty = consumable && item.id === 'perk_streak_freeze' ? state.perks.streakFreeze : 0;
  const owned = !consumable && !!state.owned[item.id];
  const affordable = state.points >= item.price;
  const short = item.price - state.points;

  let button: React.ReactNode;
  if (item.comingSoon) {
    button = <button className="btn btn-sm" disabled>Coming soon</button>;
  } else if (owned) {
    button = <button className="btn btn-sm btn-owned" disabled>Owned ✓</button>;
  } else if (!affordable) {
    button = (
      <button className="btn btn-sm" disabled title={`Need ${short} more points`}>
        Need {short}
      </button>
    );
  } else {
    button = (
      <button className="btn btn-sm btn-primary" data-sound="coin" onClick={() => store.buy(item.id)}>
        {consumable ? 'Buy' : 'Buy'}
      </button>
    );
  }

  const label = tag(item);

  return (
    <article className={`shop-card ${owned ? 'is-owned' : ''} ${item.comingSoon ? 'is-soon' : ''}`}>
      <div className="shop-card-body">
        <div className="shop-card-tags">
          {label && <span className="tagchip">{label}</span>}
          {item.animated && <span className="tagchip tag-anim">✨ animated</span>}
          {qty > 0 && <span className="tagchip tag-qty">× {qty} owned</span>}
        </div>
        <h3>{item.name}</h3>
        <p className="muted shop-card-desc">{item.description}</p>
      </div>
      <div className="shop-card-foot">
        <span className="price mono tone-points">◈ {item.price}</span>
        {button}
      </div>
    </article>
  );
}
