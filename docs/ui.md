# UI (`src/App.tsx`, `src/components/`, `src/fx/`)

One file per screen/overlay. All components are props-down (they receive
`state`/`now`) and call `store.*` actions directly — no context, no prop
drilling of callbacks beyond tab switches.

## App shell (`App.tsx`)

Two views: `home` (landing) and `den` (the app). Inside the den: header
(brand → back home, live status pill, balance, theme + sound toggles), tab bar
(`Today / Plan / Den / Journal / Settings`), the active screen (`key={tab}`
remounts it so the entrance animation replays), the summary modal, onboarding,
and the deep-work overlay. The single `useNow()` here keeps the engine live on
every screen. A document-level click listener plays button sounds — see
[sound.md](sound.md) for the routing policy.

## Screens

- **Home.tsx** — landing page; hero renders the visitor's real den
  (`RoomScene`), one CTA (`Focus`), feature grid, version stamp.
- **Dashboard.tsx** — the Today page, built from arrangeable widget cards.
  Layout lives in `settings.dashWidgets` (order = arrangement, presence =
  enabled); wide cards fill the main column, small ones the side rail
  (`WIDGET_META.side`). Widgets: `focus` (settle-in / live shift / done hero;
  never hideable), `plan` (see below), `breathers`, `wins` (both active-shift
  only), `points`, `week`, `den`, `clock`, `note` (free text →
  `settings.dashNote`). "✎ Customize" toggles edit mode: move ↑↓ within a
  column, hide ✕, add from the tray, reset. Layout mutations read
  `store.getState()` (not render-time props) so rapid clicks can't act on a
  stale list. The `plan` widget shows today's tickets (check-off, quick-add,
  jump to planner); once the day is `ended` it becomes **Today's report**
  (done vs. not, carry-unfinished-to-tomorrow) plus tomorrow's plan.
- **PlanView.tsx** — the planner. Day mode: mini month calendar (left), the
  day's list with composer + status popover (middle), detail panel for the
  selected ticket (right: status/priority segs, deadline, scheduled slot,
  length, rich description, delete). Week mode: `WeekGrid`. Past days are
  locked read-only everywhere.
- **WeekGrid.tsx** — seven 24 h columns; a ticket with `startMin` is a slot
  (height = `durationMin`). Click empty space to create, drag to move across
  time/days (15 min snap), drag the bottom edge to resize, overlapping slots
  share lanes (greedy interval partitioning). Pointer-event based with a 5 px
  click/drag threshold.
- **History.tsx** — Journal (redesigned 2026-08): an all-time stat strip
  (count-up via fx), the current week (streak dots + streak freeze side by
  side), "Rhythms" (`Charts.tsx`: width-capped SVG bars with a peak-only
  label + hover titles, a self-drawing points line, HTML breather meters),
  and "Day by day" — week-grouped rows where each day draws its hours in
  flow as a green ribbon on a shared scale (the meta column is fixed-width
  so ribbons stay comparable). Older weeks reveal on demand. Entrance is one
  orchestrated sequence of `jr-*` CSS animations, frozen under reduced
  motion. Charts must stay width-capped — a full-width SVG scales its text
  huge (the original bug).
- **RoomView.tsx** — big `RoomScene` + Customize (equip cosmetics per slot,
  prop checklist) / **Shop.tsx** (embedded; cards celebrate purchases via fx).
- **Settings.tsx** — theme/appearance, soundscape picker + volume, export/
  import JSON, replay onboarding, armed reset.
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

## fx (`src/fx/`) — one-shot animation

anime.js v4, and the only place it's imported. Contract (`effects.ts` header):
fire-and-forget, null-safe targets, no-op under `prefers-reduced-motion`
(`motionOK()`), touch only transform/opacity. Effects: `popIn`, `bump`,
`cheer`, `sparkleBurst` (throwaway particles), `countUp`, `zoomFromRect`
(FLIP zoom, used day-cell → week view), `modalEnter`. Hooks: `useBumpOnChange`,
`useCelebrateOnIncrease` (both return callback refs), `useFxLayoutEffect`
(SSR-safe layout effect). Ambient loops (cat tail, rain, string lights) are
CSS keyframes in `styles.css`, not fx.
