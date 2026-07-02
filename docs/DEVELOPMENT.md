# Developing Focus Den

## Quick start

```bash
# Node ≥ 22.5 required (node:sqlite). `nvm use` picks it up from .nvmrc.
npm install && npm install --prefix server
npm run dev:all        # → open http://localhost:5173
```

Two processes in dev: **Vite** (5173, the app with hot reload — the one you
open) and the **API** (8787, Fastify + SQLite — Vite proxies `/api` to it).
Deployed, there's only one: the server serves the built frontend itself.

## Commands

| Command | What |
|---|---|
| `npm run dev:all` | frontend + API together (dev) |
| `npm run check` | everything CI runs: both typechecks + both test suites |
| `npm test` / `npm test --prefix server` | frontend / server tests |
| `npm run test:watch` | frontend tests on save |
| `npm run build` | typecheck + production bundle → `dist/` |
| `npm --prefix server run reset-password -- <name> <pw>` | admin password reset (revokes sessions) |

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
  state/       Store + persistence + sync. store.ts (actions, sequences core
               calls) · persist.ts (localStorage) · sync.ts (debounced push,
               LWW pull, clock calibration) · auth.ts (login + offline cache)
               · api.ts (typed fetch client)
  components/  One file per screen/overlay. statusMeta.ts maps status → UI.
  room/        The pixel-SVG scene (cosmetics + props render here).
  audio.ts     All sound, synthesized — no audio files.

server/src/
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
   immutable state → `setState` (persists + schedules sync + notifies React).
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
   is attack surface and upgrade debt.

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

## Deploying

See [DEPLOY-AWS.md](DEPLOY-AWS.md). Roadmap: [../PLAN.md](../PLAN.md).
