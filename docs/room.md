# The pixel room (`src/room/RoomScene.tsx`, catalog in `src/core/items.ts`)

The den is drawn entirely in code — one SVG render function, no sprite
assets. The same component powers the Home hero, the Dashboard "Your den"
widget (width 260) and the big Room view (width 480); the viewBox is fixed
**160×144** and consumers set only `width`.

## How it renders

- Pixel art uses `shape-rendering: crispEdges` (set on the root `<svg>`);
  lighting/shadow overlays (gradients, glows, vignette) opt out per element
  with `geometricPrecision`, so light stays soft while pixels stay crisp.
- Lighting is directional and consistent: cool daylight from the window
  (upper-left), warm lamp light (right), screen glow from the monitors, a
  vignette + character glow that pull the eye avatar → desk → décor.
- `useId()` prefixes every gradient/clip id, so multiple scenes on one page
  never collide.
- Theme hooks: wall/floor/sky/night colors come from `--scene-*` CSS tokens,
  so Midnight/dark render a night version of the same art.

## Items → scene

`owned` props render conditional SVG layers; `equipped` cosmetics swap the
character's outfit/hair/accessory drawing. **Item ids are read by name inside
`RoomScene`** (e.g. `room_cat`, `outfit_glow`) as well as persisted in state —
they are stable forever; add new ids, never rename.

Catalog (`core/items.ts`): outfits ×4 (one animated), hair ×2, accessories ×3,
room props ×11 (string lights / cat / rain window animated), perks ×5
(streak freeze consumable, two themes, +1 min grace, deep work). Prices span
100–2000 pts.

Animated items are **CSS keyframes in styles.css** (classes like
`.scene-cat-tail`, `.scene-rain`, `.scene-cursor`), frozen to a static frame
under `prefers-reduced-motion`. `animated: true` in the catalog is what shows
the "✨ animated" shop tag — the actual motion is hand-wired in the scene.

## Adding a shop item (worked example)

1. `core/items.ts` — add an entry with a **new** stable id.
2. Cosmetic/prop → draw it in `RoomScene.tsx` (gate on `owned[id]` /
   `equipped.slot === id`); animated bits get a class + keyframes in
   `styles.css` inside the animated-items section.
3. Perk → wire the effect in `store.ts#applyPerkPurchase` (and wherever core
   consumes it — e.g. `graceBonusMs` flows into `breakThreshold`).
4. Owned/equip plumbing, shop card, and celebration fx are generic — no
   further wiring.
