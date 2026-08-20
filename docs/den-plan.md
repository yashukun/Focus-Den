# Den personalization — implementation plan (2026-08-20)

Goal: the den stops being the same illustration for everyone. New users build
their own den on first launch; every user can redecorate and rearrange it.

Decisions (user-confirmed):
- **Drag model**: free drag within surface zones (desk band / floor area /
  wall area), pixel-grid snapping, clamped to the zone, z-order by depth.
- **First-run**: den creator for FRESH installs only (pristine state).
  Existing dens are untouched; they get the same options via Den → Customize.
- **Character**: two light body presets sharing the outfit system (every
  outfit fits both, now and forever). Ids `masc` / `fem`.
- **Economy**: base furniture, body presets and starter shirts are free
  forever; decorative props and premium outfits stay shop purchases.

Progress: Phases 1–4 DONE (built, unit-tested, browser-verified light+dark:
creator surprise/finish/persistence/reset-reoffer; arrange drag/zone
clamps/Esc-cancel/reset-layout). Phase 5 (ship) remains.

## Phase 1 — state model (no visual change) ✅ DONE

- `types.ts`: `DenConfig { desk, window, computer, drawers, chair, floor,
  wallpaper }` (string-union ids), `character: { body: 'masc' | 'fem' }`,
  `placements: Record<itemId, { x, y }>` (absolute scene coords of the
  item's anchor), `settings.denSetUp: boolean`.
- Defaults reproduce today's den EXACTLY: `desk_classic`, `window_classic`,
  `computer_desktop`, `drawers_classic`, `chair_office`, `floor_planks`,
  `wall_plain`, body `masc`, empty placements.
- Item metadata (`items.ts`): movable items gain `surface: 'desk' | 'floor'
  | 'wall'`, `anchor {x,y}` (today's hardcoded position) and a footprint for
  clamping. Movable: mug, keyboard, lamp, cat, dualmon (desk); plant,
  bookshelf, rug (floor); posters (wall, moves as one unit). Fixed: string
  lights, rain window (wired/window-bound), sticky notes (base art).
- Surface zones as constants (`SURFACE_ZONES`) + pure `clampPlacement(item,
  x, y)` in core.
- Starter shirts: 5 free outfit items (`outfit_shirt_*`, price 0).
- Coercion: whitelist all variant ids, clamp placement coords to the
  160×144 viewBox, drop placements for unknown/immovable items, cap entry
  count. `denSetUp` defaults false — the creator additionally requires a
  PRISTINE state (no history/plan/points/shift), so existing users never
  see it and a full reset re-offers it.
- Store actions: `setDenPart(part, id)`, `setBody(body)`, `placeItem(id, x,
  y)` (clamped), `resetPlacements()`, `completeDenSetup()`.
- Tests: coerce hostile-doc + clampPlacement + store actions.

## Phase 2 — data-driven scene + variant art (the big lift) ✅ DONE

- Refactor `RoomScene` into part renderers selected by `DenConfig`; movable
  props render inside `<g transform>` groups offset by placement (shadows
  inside the group; lamp glow/cone follow the lamp's placement; floor items
  painter-sorted by y).
- Character block parameterized by body preset (build/silhouette/default
  hair); outfits keep rendering on both.
- Art inventory (pixel style, house lighting rules):
  - desks ×5 · windows ×5 · computers ×5 (single monitor / laptop /
    ultrawide / all-in-one / retro CRT) · drawers ×4 · chairs ×5 (office /
    gaming / armchair-sofa / stool / bean bag) · floors ×5 · wallpapers ×5
  - bodies ×2 · shirt colors ×5
- Chair variants carry a seat anchor so the character sits right on each.
- Customize panel gains furniture + character sections (free, instant).

## Phase 3 — first-run den creator ✅ DONE

- Full-screen wizard before the landing page when `!denSetUp && pristine`.
- Steps: character & shirt → desk & computer → chair & drawers → window,
  wallpaper & floor → done. Live RoomScene preview updates per pick;
  back/next; "Surprise me" randomizer; skippable (skip = defaults).
- Completing or skipping sets `denSetUp`; edits write straight to the store.

## Phase 4 — arrange mode (drag) ✅ DONE

- Den view gains an "Arrange" toggle: movable owned items highlight; pointer
  drag (mouse + touch) with live preview, zone clamp, 2 px grid snap;
  persist on drop; Esc/Done exits; "Reset layout". Coordinate math mirrors
  WeekGrid (viewBox scale + html zoom).

## Phase 5 — polish & ship

- Docs (room.md rewrite, ui.md, core.md), smoke tests, browser verification
  light/dark/small-preview, desktop build check.
- Release incrementally: variants+customize (v2.7), creator (v2.8),
  arrange (v2.9) — or bundle when stable.
