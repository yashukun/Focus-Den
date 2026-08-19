# Developing Focus Den

Deep dives per subsystem live in this directory — see the
[docs index](README.md) (core, state, ui, sound, styles, room, server,
desktop packaging). This file is the short contributor guide.

## Quick start

```bash
# Node ≥ 22.5 required (node:sqlite). `nvm use` picks it up from .nvmrc.
npm install && npm install --prefix server
npm run dev            # → open http://localhost:5173
```

The app is fully local (no accounts, no sync) — dev is just Vite with hot
reload. The Fastify server exists to serve the built frontend on a deployed
box; `npm run dev:all` runs both when you're working on that setup.

## Commands

| Command | What |
|---|---|
| `npm run dev` | the app with hot reload |
| `npm run dev:all` | frontend + server together |
| `npm run check` | everything CI runs: both typechecks + both test suites |
| `npm test` / `npm test --prefix server` | frontend / server tests |
| `npm run test:watch` | frontend tests on save |
| `npm run build` | typecheck + production bundle → `dist/` |

CI (GitHub Actions) runs typecheck + tests + build + a production-dependency
audit on every push/PR to `main`.

## Code map

```
src/
  core/        THE RULES. Pure functions only — no React, no storage, no
               Date.now(). Every function takes an explicit `now`.
               shift.ts (state machine) · points.ts · week.ts · plan.ts ·
               items.ts (shop catalog) · coerce.ts (deep validation, shared
               with the server) · types.ts (State — the one persisted doc)
  state/       Store + persistence. store.ts (actions, sequences core calls)
               · persist.ts (localStorage adapter) · hooks.ts (React
               subscriptions)
  fx/          One-shot animation effects (anime.js) + React hooks. Fire-and-
               forget, no-op under prefers-reduced-motion; ambient loops stay
               CSS keyframes in styles.css.
  components/  One file per screen/overlay. statusMeta.ts maps status → UI.
  room/        The pixel-SVG scene (cosmetics + props render here).
  audio.ts     All sound, synthesized — no audio files.

server/src/    (static host for the built app; the routes below are the
                sync-era API the current client no longer calls)
  app.ts       All routes. Validates every doc with the SAME coerceState the
               client uses (imported from ../../src/core).
  auth.ts      scrypt hashing + hand-rolled HS256 JWT (tv claim = revocation).
  store.ts     StateStore interface + JSON-file impl (tests/legacy).
  sqlite-store.ts  Default store (node:sqlite): users/states/revisions.
  reconcile.ts Last-write-wins decision, pure.
```

## House rules (the invariants that keep this codebase nice)

1. **`core/` never reads the clock or storage.** Pass `now` in. This is why
   the engine is deterministic and the tests need no mocks.
2. **All state changes flow through `store.ts`** → core function → new
   immutable state → `setState` (persists + notifies React).
   Never mutate state objects.
3. **The whole game is one versioned document** (`State`, currently v2).
   Adding fields ⇒ extend `coerceState` (and its hostile-doc tests) so old and
   malicious blobs both coerce safely. Renaming item ids is a breaking change —
   add new ids instead.
4. **The server re-validates but doesn't re-referee.** Game rules run
   client-side by design (trusted-circle model). Don't add server logic that
   duplicates a core rule — either it's client-side, or (multi-user someday)
   it moves server-side wholesale (see PLAN.md Phase 1+ / tier notes).
5. **Server tests run against both store engines** (`describe.each` in
   `server/test/app.test.ts`). A new store method must be implemented in both
   and covered there.
6. **No new runtime dependencies without a reason** — the app is deliberately
   zero-asset (SVG + WebAudio) and the server is 5 packages. Every dependency
   is attack surface and upgrade debt. The frontend extras are exactly two:
   animejs (only `src/fx`, one-shot effects) and dompurify (only
   `components/RichText.tsx`, description sanitizing).
7. **No `window.confirm`/`alert`** — browsers can suppress them and desktop
   webviews don't support them. Destructive actions use `useArmedConfirm`
   (two-step inline confirm). Keep asset URLs relative and web APIs
   feature-checked — the same build must run in a desktop webview
   (see [desktop.md](desktop.md)).

## Adding things (worked examples)

- **A shop item:** add one entry in `core/items.ts` (stable new id) → render
  it in `room/RoomScene.tsx` (cosmetic/prop) or wire its effect in
  `store.ts#applyPerkPurchase` (perk). Owned/equip plumbing is generic.
- **A settings toggle:** extend `Settings` type + `defaultSettings()` +
  `coerceSettings` → a `store.setX()` action → UI in
  `components/Settings.tsx`.
- **A server route:** add to `app.ts` with `preHandler: requireAuth`, keep it
  a thin store call, and add a test in `server/test/app.test.ts` (it runs
  against both engines automatically).
- **A one-shot animation:** use a hook from `src/fx` for the common cases
  (`useBumpOnChange`, `useCelebrateOnIncrease` — both return a callback ref),
  or compose named effects inside `useFxLayoutEffect` for bespoke sequences
  (see `WeekStreak.tsx`). New effects go in `fx/effects.ts` and follow its
  contract comment: fire-and-forget, null-safe, reduced-motion-gated,
  transform/opacity only.

## Deploying

See [DEPLOY-AWS.md](DEPLOY-AWS.md). Roadmap: [../PLAN.md](../PLAN.md).
