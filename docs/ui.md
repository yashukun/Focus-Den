# UI (`src/App.tsx`, `src/components/`, `src/fx/`)

One file per screen/overlay. All components are props-down (they receive
`state`/`now`) and call `store.*` actions directly — no context, no prop
drilling of callbacks beyond tab switches.

## App shell (`App.tsx`)

Two views: `home` (landing) and `den` (the app). The landing page is shown
once: entering the den sets `settings.homeSeen`, and from then on the app
opens straight on Today (the brand button still goes back). Before either:
on a fresh install (`!settings.denSetUp && isPristineState`) the shell
renders **DenCreator** full-screen instead — existing dens never see it, and
a full reset re-offers it. Inside the den: header
(brand → back home, live status pill, balance, theme + sound toggles), tab bar
(`Today / Plan / Den / Stats / Settings`), the active screen (`key={tab}`
remounts it so the entrance animation replays), the summary modal, onboarding,
and the deep-work overlay. The tab bar is sticky and condenses into a
floating icon pill after ~48 px of scroll (hysteresis so it never flaps);
the compact pill rises INTO the sticky header row, centered between the
brand and the header controls (sticky `top` swaps 3.4rem → 0.45rem with a
transition; z-index above the header; below 880 px it stays under the
header — no free middle). In compact mode only the active tab keeps its
label, and App.tsx drives a macOS-dock-style hover magnification (per-icon
gaussian scale by cursor distance, gated by `motionOK`). The single `useNow()` here keeps the engine
live on every screen, and `useTaskReminders` (mounted once here) sends OS
notifications when a scheduled task's time arrives and when a breather is
about to overrun — web Notification API in the browser, the Tauri
notification plugin on desktop (`src/notify.ts`). A clicked reminder is a
hand-off through `state/attention.ts`: App routes to the planner on
focus/attention, PlanView consumes the record, jumps to the day and flashes
the task row for 2.5 s (`.is-noticed`). Settings → Notifications has the
toggle (`settings.taskReminders`) and a test button. A document-level click listener plays button sounds —
see [sound.md](sound.md) for the routing policy.

## Screens

- **Home.tsx** — landing page; hero renders the visitor's real den
  (`RoomScene`), one CTA (`Focus`), feature grid, version stamp. Feature
  cards reveal on first scroll into view (IntersectionObserver adds
  `.is-revealed` once, then unobserves — cards animate exactly once).
- **Dashboard.tsx** — the Today page, built from arrangeable widget cards.
  Layout = `settings.dashWidgets` (one ordered list; presence = enabled) +
  `settings.dashCols` (per-widget column override; default from
  `WIDGET_META.side`) + `settings.dashSizes` ('lg' default / 'sm' compact —
  the `dash-sm` wrapper class trims each widget's secondary content).
  Default: plan/breathers in the main column; media → den → clock →
  soundscape in the side rail (points/week wait in the tray). Widgets:
  `focus`, `plan` (see below), `breathers` (active-shift only), `points`,
  `week`, `den`, `clock`, `note` (free text → `settings.dashNote`),
  `soundscape` (animated pixel ambience picker — `SoundscapeCard.tsx`;
  motion pauses while the sound is off; wins log automatically from
  checked-off plan intentions, the old manual Wins widget is gone), `media`
  (Now playing — desktop only, hidden from the web's tray entirely;
  `MediaCard.tsx` polls the Rust media commands and reports activity up —
  an idle media card sinks to the bottom of its column outside edit mode).
  "✎ Customize" toggles edit mode: move ↑↓ within a column, ◂▸ across
  columns, ⊞⊟ size, hide ✕, add from the tray, reset (`store.resetDash`).
  Layout mutations read `store.getState()` (not render-time props) so rapid
  clicks can't act on a stale list. The focus timer renders per
  `settings.focusTimer`: **'dock'** (default) = `FocusDock`, a collapsible
  pill+panel that parks in a bottom corner — drag the pill and it snaps to
  the nearest third of the viewport (`settings.focusDockPos`:
  left/center/right); a drag swallows the click that follows so it never
  toggles the panel by accident. Drag math divides pointer coords by the
  effective `currentCSSZoom` (the app runs under `html { zoom: 1.25 }` —
  raw clientX would overshoot the screen) and clamps so the pill never
  leaves the viewport. The pill itself is quiet liquid glass (frosted
  translucency, hairline border, top sheen) and deliberately never changes
  shape — no press transform, unlike the app's chunky buttons. App.tsx renders it as a SIBLING of `<main>` (the
  screen-entrance animation retains a transform, which would otherwise trap
  `position: fixed` inside the screen); **'card'** = the hero stays in the
  grid, compact (`.focus-compact`). Choice lives in Settings → Today page. The `plan` widget shows today's tickets (check-off, quick-add,
  jump to planner); once the day is `ended` it becomes **Today's report**
  (done vs. not, carry-unfinished-to-tomorrow) plus tomorrow's plan.
- **PlanView.tsx** — the planner. Day mode: mini month calendar (left,
  navigation + per-day task counts only), the day's list with composer +
  status popover (middle), detail panel for the selected ticket (right:
  status/priority segs, length — presets + a custom h/min entry — rich
  description, delete). There is no deadline feature (retired; coercion
  silently drops `deadlineMs` from old saves) and no "Scheduled" row in the
  panel — slotting a ticket at a time of day is the week grid's job
  (`startMin` persists as before). Opening a ticket animates the whole
  grid: `.plan.has-detail` transitions `grid-template-columns` (rail
  compresses 300→240, detail column 0→360 — the app shell is capped at
  980px, so all three columns must share) while the panel slides in; the
  always-rendered `.plan-detail-col` wrapper is what makes the track
  animatable. Below 1375px the panel is a fixed right sheet instead. Day ↔
  Week switches remount with a `plan-enter` rise (same motion as tab
  changes). Week mode: `WeekGrid`. Past days are locked read-only
  everywhere. Esc closes the detail panel and the copy-day picker.
- **WeekGrid.tsx** — seven 24 h columns; a ticket with `startMin` is a slot
  (height = `durationMin`). Unscheduled tickets show as at most TWO chips in
  the day header (open ones first) plus a "+N more" chip that opens the Day
  view — bounded by design, no inner scrollbars. Click empty space to create, drag to move across
  time/days (15 min snap), drag the bottom edge to resize, overlapping slots
  share lanes (greedy interval partitioning). Pointer-event based with a 5 px
  click/drag threshold.
- **History.tsx** — Statistics (né Journal; tab label "Stats"): an all-time stat strip
  (count-up via fx), the current week (streak dots + streak freeze side by
  side), "Rhythms" (`Charts.tsx`: width-capped SVG bars with a peak-only
  label + hover titles, a self-drawing points line, HTML breather meters),
  "Task times" (finished tasks with their tracked In-progress time — the
  task stopwatch lives in core/plan.ts statusPatch), and "Day by day" — week-grouped rows where each day draws its hours in
  flow as a green ribbon on a shared scale (the meta column is fixed-width
  so ribbons stay comparable). Older weeks reveal on demand. Entrance is one
  orchestrated sequence of `jr-*` CSS animations, frozen under reduced
  motion. Charts must stay width-capped — a full-width SVG scales its text
  huge (the original bug).
- **RoomView.tsx** — big `RoomScene` + Customize / **Shop.tsx** (embedded;
  cards celebrate purchases via fx). The Customize panel is split by mode:
  day to day it is just the prop checklist + shop link (with a nudge toward
  Arrange); ARRANGE mode is the one place the den AND character are edited —
  den parts (7 chip rows over `DEN_OPTIONS`), character basics (body chips +
  shirt `.swatch` buttons) and the equip-per-slot owned cosmetics all live
  there. Entering Arrange also forces the Customize subtab. Labels live in **denLabels.ts**, shared with
  the creator. The stage's
  "⠿ Arrange" toggle turns on drag: movable owned props (highlighted via
  `[data-item]` + drop-shadow) follow the pointer as a LOCAL draft placement
  (2 px snap, zone-clamped through core `clampPlacement`); the store — and
  localStorage — is written once, on drop (`placeItem`). Pointer math is
  rect-ratio based like WeekGrid (zoom-immune). Esc cancels an in-flight
  drag first, then exits the mode; "Reset layout" is an armed confirm.
- **DenCreator.tsx** — the first-run build-your-den wizard (see App shell for
  the gate). Four steps (character & shirt → desk & computer → chair &
  drawers → window, wallpaper & floor) over a live `RoomScene` preview;
  every pick writes straight to the store, so there is no local draft.
  "🎲 Surprise me" randomizes all parts + body + shirt; Skip and
  "That's my den ✓" both just call `store.completeDenSetup()`.
- **Settings.tsx** — theme/appearance, soundscape picker + volume, export/
  import JSON, replay onboarding, armed reset. **DesktopUpdate.tsx** renders
  a "Desktop app" card (self-update via the Tauri updater) only when running
  in the desktop shell — it returns null on the web.
- **SummaryModal.tsx** — end-of-day stats; entrance timeline + points
  roll-up (`countUp`).
- **Onboarding.tsx** — first-run explainer; `DeepWork.tsx` — full-screen
  timer overlay (perk), Esc exits.
- **RichText.tsx** — contentEditable editor + viewer for ticket descriptions.
  Sanitization is DOMPurify with a strict allowlist (tags, `src/alt/href`
  only) plus an `afterSanitizeAttributes` hook enforcing house rules: images
  must be `data:image/*;base64` (pasted screenshots are recompressed to
  bounded JPEG data URLs), links must be https and get
  `rel=noreferrer target=_blank`. Sanitize runs on save AND render; the
  editor is uncontrolled (remount via React `key` per ticket) with debounced
  emit. SSR fallback strips all tags.
- **statusMeta.ts** — shift status → label/tone. **WeekStreak.tsx** — the
  M–S dot row (celebrates via fx on completion).
- **useArmedConfirm.ts** — the app-wide two-step confirm (arm → auto-disarm
  in 4 s → fire). Used for wrap-up, reset, clear-day, delete. There is
  deliberately **no `window.confirm` anywhere** — browsers can suppress it
  and desktop webviews don't support it.
- **useEscape.ts** — Esc-to-close for every layer: plan detail panel,
  copy-day picker, Dashboard customize mode, deep-work overlay, summary
  modal, onboarding, the week-grid composer. New panels/modes must wire it
  up — nobody should need the ✕.

## fx (`src/fx/`) — one-shot animation

anime.js v4, and the only place it's imported. Contract (`effects.ts` header):
fire-and-forget, null-safe targets, no-op under `prefers-reduced-motion`
(`motionOK()`), touch only transform/opacity. Effects: `popIn`, `bump`,
`cheer`, `sparkleBurst` (throwaway particles), `countUp`, `modalEnter`.
Hooks: `useBumpOnChange`,
`useCelebrateOnIncrease` (both return callback refs), `useFxLayoutEffect`
(SSR-safe layout effect). Ambient loops (cat tail, rain, string lights) are
CSS keyframes in `styles.css`, not fx.
