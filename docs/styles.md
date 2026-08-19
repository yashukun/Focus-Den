# Styles (`src/styles.css`)

One hand-written stylesheet (~2200 lines), no preprocessor, no utility
framework. Ordered roughly top-of-app → features; every block starts with a
`/* ── Section ─── */` banner — `grep -n "── " src/styles.css` prints the map.

## Theming

All color is CSS custom properties. The palette blocks sit at the top of the
file keyed off `data-theme` on `<html>` (applied by `src/theme.ts`):

- *(no attribute)* — Cozy following system `prefers-color-scheme`
- `data-theme="light"` / `"dark"` — Cozy forced
- `data-theme="midnight"` — fixed dark indigo (shop perk)
- `data-theme="sunrise"` — fixed warm light (shop perk)

Key tokens: surfaces `--paper` `--surface` `--surface-2`, text `--ink`
`--ink-soft`, lines `--line` `--line-strong`, brand `--accent`, semantic tones
`--work` (flow/green) `--break` `--offline` `--idle` `--points` `--danger`,
focus ring `--focus`, radii `--radius`/`--radius-sm`, spacing `--space-*`,
button edge `--btn-edge`, and the room scene's `--scene-*` set. New UI should
compose these tokens — never hard-code colors (the four themes come free).

## Conventions

- **Tone classes** — `tone-work` etc. set `--tone`/color on status pills,
  cards, switch buttons; `st-*` (ticket status) and `prio-*` (priority) set
  `--st`/`--prio` tokens consumed by chips, badges, slots and borders.
- **Cards** — `.card` + `.card-head`; buttons are chunky with a pressed
  transform: `.btn` + `-primary/-danger/-ghost/-sm/-xl/-block/-icon`;
  `.btn-danger.is-armed` is the two-step confirm state.
- **Inputs** — `.input`; segmented controls `.seg`; chips `.chip-toggle`,
  `.meta-chip`, `.break-chip`, `.tagchip`.
- Dashboard widget chrome: `.dash-widget[-bar/-tools]`, `.dash-toolbar`,
  `.dash-tray`, plan-widget rows `.tplan-*`, report `.report-*`.

## Motion

Ambient loops (cat blink/tail, rain, string-light twinkle, monitor cursor,
`home-rise` entrances, `screen-enter`) are **CSS keyframes here** — one-shot
"juice" lives in `src/fx` (anime.js). A global
`prefers-reduced-motion: reduce` block freezes every animation/transition to
~0 ms, so both systems degrade together.

## Responsive

Two breakpoints: **1000 px** (dashboard + room collapse to one column, side
rail unsticks) and **700 px** (tab labels → icons, switcher 2×2, chips stack,
week grid tweaks in the phase-2 block near the end). Wide content (history
table) scrolls inside `.table-wrap`.

## Gotchas

- The section map's line numbers drift — trust the banners, not memory.
- Some sections were appended later (Responsive phase-2, easing, landing,
  composer, cursor blink live *after* the first Responsive/Reduced-motion
  blocks) — search before adding a duplicate section.
- `zoom` is set on `html` for the pixel aesthetic — `fx/effects.ts#zoomFromRect`
  divides it out when translating viewport rects; do the same for any new
  getBoundingClientRect math.
