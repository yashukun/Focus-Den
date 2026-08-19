# The core engine (`src/core/`)

Pure, deterministic, framework-agnostic. **Nothing in `core/` reads the clock,
touches storage, or imports React** — every function takes an explicit `now`
(epoch ms) and returns new immutable state or a derived value. That is why the
engine's tests need no mocks and why the same code validates documents on the
server (`server/src/app.ts` imports `coerceState` from here).

## The one state document (`types.ts`)

Everything the app persists is a single versioned object, `State` (currently
`v: 2`), stored as one JSON blob:

| Field | What |
|---|---|
| `points` | the balance |
| `owned` | `itemId → true` for bought items |
| `equipped` | one cosmetic per slot: `outfit` / `hair` / `accessory` |
| `perks` | functional unlocks: `streakFreeze` (count), `graceBonusMs`, `deepWork`, themes… |
| `settings` | preferences incl. Today-page layout (`dashWidgets`, `dashNote`) |
| `shift` | the live day (see below) |
| `week` | streak for the current week, keyed by its Monday |
| `history` | one `HistoryEntry` per finalized day |
| `plan` | day planner: `tickets[YYYY-MM-DD] → PlanTicket[]` |

Adding a field ⇒ extend the type + `defaultSettings()`/`defaultState()`
(`shift.ts`) + `coerceState` (`coerce.ts`) + hostile-doc tests
(`coerce.test.ts`). Never rename persisted ids (item ids, widget ids, break
keys) — add new ones.

## Shift machine (`shift.ts`, rules in `constants.ts`)

Statuses: `idle → working ⇄ break1/break2/lunch ⇄ offline → ended`.

- One shift per calendar day (`canClockIn`); the day runs **12 h** (`SHIFT_MS`)
  from clock-in, then auto-finalizes (`shouldAutoEnd` → `finalizeShift`).
- `acc`/`breakUsed` hold only **committed** time; the live slice since
  `statusStart` is added by `liveAcc`/`liveBreakUsed` and committed on every
  status switch (`commit`).
- Breathers are single-use with budgets: Stretch 20 m, Recharge 20 m, Lunch
  50 m (`BREAK_LIMITS`, labels in `BREAK_LABELS`). Overrunning a budget plus
  grace (3 min + optional 1 min perk, `breakThreshold`/`effectiveGrace`)
  auto-flips to `offline` and marks the day not `clean`
  (`applyBreakGrace`).
- `finalizeShift` computes the summary, credits points (plus the perfect-week
  bonus when the week completes), appends history, marks the week day done.

## Points (`points.ts`) & week (`week.ts`)

`POINTS`: 10/worked hour (floored), +50 clean day, +20 at ≥3 wins, +200
perfect week. Weeks are Mon–Sat (`SHIFT_DAYS_PER_WEEK = 6`, Sunday off),
keyed by Monday (`weekKey`); `alignWeek` resets a stale week, `applyStreakFreeze`
(in `shift.ts`) consumes a freeze perk to backfill a missed day.

## Day planner (`plan.ts`)

Tickets per `YYYY-MM-DD`; **past days are locked** (`isDateEditable` — ISO keys
compare lexicographically). Mutations (`addTicket`, `updateTicket`,
`removeTicket`, `moveTicketToDay/NextDay`) are no-ops on locked days. A ticket:
`status` (`todo/in_progress/blocked/done`), `priority`
(`critical/high/med/low`), optional `deadlineMs`, `startMin` (slot on the week
grid), `durationMin`, rich `descHtml`. Shared display order + labels:
`TICKET_STATUS_IDS/LABELS`, `TICKET_PRIORITY_IDS/LABELS` (`constants.ts`).
Shared derivations: `sortDayTickets` (scheduled first), `isTicketOverdue`.

## Dates & formatting (`dates.ts`, `format.ts`)

Local-calendar helpers (`dateString`, `weekKey`, `addDays`, `monthMatrix`…) and
pure formatters (`formatHMS/HM/MS/Clock/SlotTime/DateLabel`, `fmtDeadline`,
`pad2`). All take explicit instants — no `Date.now()` anywhere in core.

## Deep validation (`coerce.ts`)

`coerceState(raw)` turns any parsed blob into a valid v2 `State` or `null`.
It is **deep** validation: every number clamped to a finite range, every enum
whitelisted (soundscapes, widget ids, ticket statuses/priorities), every
string/array capped, `__proto__`/`constructor` keys never copied. A hostile
imported backup can crash nothing — at worst it loses its own invalid fields.
v1 blobs migrate forward. Caps live at the top of the file (`MAX_*`).
Tests: `coerce.test.ts` (round-trips, Infinity/negative clamps, enum
fallbacks, cap enforcement, prototype-pollution).

## Shop catalog (`items.ts`)

`ITEMS`: cosmetics (slotted), room props, perks (some consumable). Item ids are
persisted keys **and** the SVG renderer reads them — stable forever. Helpers:
`getItem`, `itemsByCategory`, `ownedCosmetics`. Perk *effects* live in
`store.ts#applyPerkPurchase` + wherever core consumes them (`graceBonusMs`
etc.), not here.
