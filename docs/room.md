# The pixel room (`src/room/`, catalog in `src/core/items.ts`)

The den is drawn entirely in code — no sprite assets — and since v2.7 it is
**data-driven**: `RoomScene.tsx` composes base furniture from `DenConfig`
(`parts.tsx` — 34 free variants across desk/window/computer/drawers/chair/
floor/wallpaper), the avatar from `CharacterConfig` (`character.tsx` — two
body presets sharing every outfit, five starter shirts), and movable props
(`props.tsx`) inside translate groups positioned by `state.placements`.
The same component powers the Home hero, the Dashboard "Your den" widget
(width 260) and the big Den view (width 480); the viewBox is fixed
**160×144** and consumers set only `width`. `interactive` (arrange mode)
adds `data-item` attributes to movable prop groups plus an invisible
footprint-sized grab rect inside each — necessary because the full-scene
overlays (night tint, vignette, glows) paint ABOVE the props and would win
SVG hit-testing; arrange-mode CSS makes everything but `[data-item]`
subtrees pointer-transparent. The drag layer itself
lives in `RoomView.tsx` (see ui.md), which previews via a draft placements
map and commits through `store.placeItem` on drop. `Prop` stays module-scope
on purpose: an inline component would change identity per render and remount
every prop's DOM subtree on each drag frame.

Variant rules: `_classic` ids are the pre-v2.7 art verbatim; floor/wall
patterns draw over the theme tokens so all four themes work untouched;
computers export their screen glow geometry; chairs keep the seat line at
y≈104. Depth with free placement: rug flat first, floor props standing at
y≤118 behind the desk, deeper ones in front of the character, dual monitor
behind the main computer, cat in front. The cat perches on desk, front
floor, window sill or shelf top (nearest-perch snapping in core/den.ts) —
its front-layer draw order works for all four, which is why its floor
perch is limited to IN FRONT of the desk. **Art audit grid**: run dev and open
`/?den-audit` — every variant, body, shirt and outfit-fit in one page.

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
