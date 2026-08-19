# State layer (`src/state/`)

The glue between the pure core and React. **Every state change flows through
`store.ts`**: action → core function → new immutable state → `setState`
(persist to localStorage + notify subscribers). Never mutate state objects.

## The store (`store.ts`)

A tiny framework-agnostic emitter holding:

- `state: State` — the persisted document
- `summary: ShiftSummary | null` — transient end-of-day modal payload
  (deliberately NOT persisted; `dismissSummary()` clears it)

`getSnapshot()` returns a stable `{ state, summary }` object identity for
`useSyncExternalStore`. Ticket ids come from `nextTicketId()`
(time36 + counter). `Date.now()` is allowed **here** (and only here / in
components) — it is passed *into* core as `now`.

### Action groups

- **Day**: `clockIn`, `switchStatus`, `addTask`/`editTask`/`deleteTask` (wins),
  `endShift`, `tick`, `dismissSummary`.
- **Shop**: `buy` (consumables restock, cosmetics auto-equip, perks apply via
  `applyPerkPurchase`), `equip`, `applyFreeze`.
- **Planner**: `addPlanTicket` (dedupes by title per day → returns
  `'added' | 'duplicate' | 'invalid'`), `updatePlanTicket`, `setPlanStatus`
  (marking done also logs a win while a shift is active), `removePlanTicket`,
  `movePlanTicketNextDay`/`ToDay` (week-grid drag), `copyPlanDayToDay/NextDay/Week`
  (idempotent — skip titles the target already has), `clearPlanDay`,
  `moveUnfinishedToNextDay` (end-of-day carry: MOVES not-done tickets, dedupes).
- **Settings**: theme/appearance/soundscape/volume/deep-work/onboarding,
  `setDashWidgets` (whitelists ids, dedupes, forces `focus` back in),
  `setDashNote` (capped 2000 chars).
- **Data**: `exportJSON`, `importJSON` (through `coerceState` — invalid blobs
  rejected), `resetAll`.

### The heartbeat (`tick`)

`useNow()` calls `store.tick(now)` every second. It enforces the two rules
that must fire without user input: breather grace → auto-offline, and the 12 h
auto wrap-up. It is a strict no-op (no persist, no notify) when nothing
crosses a threshold — the common case — so the per-second interval is cheap.

## Persistence (`persist.ts`)

localStorage, single profile:

- Key: `focus-den/state/local`
- Legacy adoption: on first load after the accounts era, any
  `focus-den/state/<userId>` profile (preferring the one named by
  `focus-den/session`) is adopted into the local key so nobody lost their den
  in the v2.0.0 local-only pivot.
- Every load parses through `coerceState`; save failures (quota/private mode)
  degrade silently.
- The SFX mute lives separately under `focus-den/sound` (see sound.md) —
  it is a device preference, not part of the document.

## React bindings (`hooks.ts`)

- `useStore()` — `useSyncExternalStore` over the store.
- `useNow(intervalMs = 1000)` — live epoch ms; also re-syncs immediately on
  tab visibility/focus (background timers are throttled) and drives the
  heartbeat. One instance at the App root serves the whole tree.

## Tests

`plan-store.test.ts` covers store behavior with a stubbed localStorage:
dedupe rules, locked days, status changes, copy idempotence, end-of-day carry,
dashboard layout setters.
