# Server (`server/`)

A small Fastify app in its own npm workspace (`server/package.json`,
`npm --prefix server …`). **Since the v2.0.0 local-only pivot its only live
job is serving the built frontend** (`dist/`) on a deployed box — Docker /
AWS Lightsail / Homebrew installs. Nothing in the client calls its API
anymore.

## What's in it

| File | What |
|---|---|
| `src/app.ts` | All routes. Health, static serving, and the vestigial sync API: signup/login/logout(-all), change-password, delete-account, GET/PUT state with last-write-wins reconcile + revision history. Every incoming doc is validated with the **same `coerceState` the client uses** (imported cross-package from `../../src/core`). Global rate limit; strict `AUTH_RATE` (10/min/IP) on password-touching routes; 512 KB body cap. |
| `src/auth.ts` | scrypt password hashing + hand-rolled HS256 JWT (`tv` claim = token-version revocation). |
| `src/env.ts` | All env vars with dev defaults: `JWT_SECRET` (refuses to start in production without one), `DB_PATH`, `ADMIN_USER`, `PORT`/`HOST`/`TRUST_PROXY`/`CORS_ORIGIN`/`STATIC_DIR`. |
| `src/store.ts` | `StateStore` interface + JSON-file impl (tests/legacy). |
| `src/sqlite-store.ts` | Default store (`node:sqlite`, needs Node ≥ 22.5): users/states/revisions. |
| `src/store-factory.ts` | SQLite by default; a `.json` `DB_PATH` selects the JSON store; one-time legacy `db.json` import. |
| `src/reconcile.ts` | Pure last-write-wins decision. |

House rule: the server re-validates but **never re-referees** — game rules run
client-side (trusted-circle model). Server tests (`server/test/app.test.ts`)
run against **both** store engines via `describe.each`; a new `StateStore`
method must land in both stores and be covered there.

Ops: `npm --prefix server run reset-password -- <name> <pw>` (admin reset,
revokes sessions). Deploy runbook: [DEPLOY-AWS.md](DEPLOY-AWS.md); the
production DB snapshot flow lives in the app repo's local `CLAUDE.md`
(gitignored).

## Status / open question

The sync API (auth, reconcile, revisions — roughly 700 lines with tests) is
kept tested but dark. `PLAN.md` carries the open question of deleting it.
Arguments to delete: it's the single biggest dead-code mass; desktop packaging
(see [desktop.md](desktop.md)) needs no server at all; static hosting needs
~30 lines. Arguments to keep: sync may return, and it exercises the
`coerceState` sharing seam. Decide before any server-side feature work.
