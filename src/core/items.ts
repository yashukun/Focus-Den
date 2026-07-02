/**
 * The full Focus Den shop catalog. Item ids are stable strings used as keys in
 * `owned` / `equipped` (and read by the SVG renderer), so renaming an id is a
 * breaking change — add new ones instead.
 *
 * Character cosmetics equip into one of three slots (outfit / hair / accessory);
 * room props show in the scene once owned; perks change app behaviour (handled
 * in the store + core, not here).
 */

import type { CosmeticSlot, Item, ItemCategory } from './types';

export const ITEMS: Item[] = [
  // ── Character · outfits ────────────────────────────────────────────────
  { id: 'outfit_hoodie', name: 'Hoodie', description: 'A soft green hoodie with a hood.', price: 150, category: 'character', kind: 'cosmetic', slot: 'outfit' },
  { id: 'outfit_blazer', name: 'Blazer', description: 'Sharp navy blazer for meeting days.', price: 150, category: 'character', kind: 'cosmetic', slot: 'outfit' },
  { id: 'outfit_denim', name: 'Denim Jacket', description: 'Classic blue denim with a collar.', price: 150, category: 'character', kind: 'cosmetic', slot: 'outfit' },
  { id: 'outfit_glow', name: 'Glow Outfit', description: 'A neon outfit with a soft pulsing aura.', price: 800, category: 'character', kind: 'cosmetic', slot: 'outfit', animated: true },

  // ── Character · hair ───────────────────────────────────────────────────
  { id: 'hair_long', name: 'Long Hair', description: 'Flowing shoulder-length hair.', price: 120, category: 'character', kind: 'cosmetic', slot: 'hair' },
  { id: 'hair_spiky', name: 'Spiky Hair', description: 'Bold spikes on top.', price: 120, category: 'character', kind: 'cosmetic', slot: 'hair' },

  // ── Character · accessories ────────────────────────────────────────────
  { id: 'acc_glasses', name: 'Glasses', description: 'Slim reading glasses.', price: 100, category: 'character', kind: 'cosmetic', slot: 'accessory' },
  { id: 'acc_headphones', name: 'Headphones', description: 'Big over-ear cans for deep focus.', price: 100, category: 'character', kind: 'cosmetic', slot: 'accessory' },
  { id: 'acc_cap', name: 'Cap', description: 'A comfy baseball cap.', price: 100, category: 'character', kind: 'cosmetic', slot: 'accessory' },

  // ── Room props ─────────────────────────────────────────────────────────
  { id: 'room_mug', name: 'Coffee Mug', description: 'A steamy mug on the desk.', price: 100, category: 'room', kind: 'prop' },
  { id: 'room_plant', name: 'Potted Plant', description: 'A leafy friend for the corner.', price: 150, category: 'room', kind: 'prop' },
  { id: 'room_posters', name: 'Wall Posters', description: 'A couple of framed posters.', price: 180, category: 'room', kind: 'prop' },
  { id: 'room_lamp', name: 'Desk Lamp', description: 'A warm pool of light on the desk.', price: 200, category: 'room', kind: 'prop' },
  { id: 'room_rug', name: 'Rug', description: 'A patterned rug to warm the floor.', price: 250, category: 'room', kind: 'prop' },
  { id: 'room_keyboard', name: 'Mechanical Keyboard', description: 'Clacky keys in front of the monitor.', price: 300, category: 'room', kind: 'prop' },
  { id: 'room_bookshelf', name: 'Bookshelf', description: 'A little shelf of colourful books.', price: 400, category: 'room', kind: 'prop' },
  { id: 'room_dualmon', name: 'Dual Monitor', description: 'A second screen for extra real estate.', price: 600, category: 'room', kind: 'prop' },
  { id: 'room_string_lights', name: 'String Lights', description: 'Fairy lights that gently twinkle.', price: 900, category: 'room', kind: 'prop', animated: true },
  { id: 'room_cat', name: 'Desk Cat', description: 'A cat that blinks and flicks its tail.', price: 1500, category: 'room', kind: 'prop', animated: true },
  { id: 'room_rain', name: 'Rain Window', description: 'Rain streaks down a darker sky.', price: 2000, category: 'room', kind: 'prop', animated: true },

  // ── Perks (functional — see store + core) ──────────────────────────────
  { id: 'perk_streak_freeze', name: 'Streak Freeze', description: 'Mark one missed Mon–Sat day complete. Consumable.', price: 400, category: 'perks', kind: 'perk', consumable: true },
  { id: 'perk_soundscape', name: 'Soundscape Pack', description: 'Ambient rain / café / lo-fi while you focus.', price: 300, category: 'perks', kind: 'perk' },
  { id: 'perk_theme_midnight', name: 'Midnight Theme', description: 'A deep indigo color theme.', price: 250, category: 'perks', kind: 'perk' },
  { id: 'perk_theme_sunrise', name: 'Sunrise Theme', description: 'A warm peach color theme.', price: 250, category: 'perks', kind: 'perk' },
  { id: 'perk_grace', name: 'Break Grace +1 min', description: 'Adds 60s of grace to every break. Permanent.', price: 600, category: 'perks', kind: 'perk' },
  { id: 'perk_deepwork', name: 'Deep Work Mode', description: 'A focus overlay: just the timer and your task.', price: 500, category: 'perks', kind: 'perk' },
];

export const ITEMS_BY_ID: Record<string, Item> = Object.fromEntries(
  ITEMS.map((i) => [i.id, i]),
);

export const CATEGORY_ORDER: ItemCategory[] = ['character', 'room', 'perks'];

export const CATEGORY_LABELS: Record<ItemCategory, string> = {
  character: 'Character',
  room: 'Room',
  perks: 'Perks',
};

export const SLOT_LABELS: Record<CosmeticSlot, string> = {
  outfit: 'Outfit',
  hair: 'Hair',
  accessory: 'Accessory',
};

export function getItem(id: string): Item | undefined {
  return ITEMS_BY_ID[id];
}

export function itemsByCategory(category: ItemCategory): Item[] {
  return ITEMS.filter((i) => i.category === category);
}

/** Owned cosmetics for a given slot (used to populate the equip controls). */
export function ownedCosmetics(
  owned: Record<string, boolean>,
  slot: CosmeticSlot,
): Item[] {
  return ITEMS.filter((i) => i.kind === 'cosmetic' && i.slot === slot && owned[i.id]);
}
