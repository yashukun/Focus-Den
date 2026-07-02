# Focus Den

A single-user, focus-driven shift tracker with a cozy pixel room. Track a
12-hour shift with Slack-style status switching, earn points for focused work,
and spend them on a pixel avatar + room that visibly grows.

Built with **React + TypeScript + Vite**, plus a small **Node + TypeScript
backend** (Fastify) so a profile's data **syncs across devices**. The app is
**local-first**: `localStorage` is the instant, offline working copy, and the
server is the cross-device source of truth (last-write-wins).

## Run it

```bash
npm install                 # frontend deps
npm install --prefix server # backend deps (once)

npm run dev:all   # web (http://localhost:5173) + api (http://localhost:8787)
# or separately: `npm run dev` and `npm run server`

npm test                    # frontend tests
npm test --prefix server    # backend tests
npm run build               # typecheck + production build
```

Vite proxies `/api` → the local server, so there's no CORS setup in dev.

## Sign in & sync

On first launch you create a **profile** (name + password) against the backend.
Passwords are hashed server-side with **scrypt + a per-user salt** (never stored
in plaintext); the client keeps a JWT and a small local account cache so a
returning user can also sign in **offline**. Each profile has its own den,
points, planner, and history; sign out / delete from **Settings → Account**.

Changes save to `localStorage` instantly and push to the server (debounced); on
sign-in / reconnect the app pulls and adopts whichever copy is newer. You can
keep working fully **offline** — edits sync when you're back online.

Sync conflicts are resolved last-write-wins by edit time, using a
**server-corrected clock**: the client estimates its clock offset against the
server (midpoint method on `/api/health`) and the server clamps timestamps that
claim to be from its future — so a device with a skewed clock can't silently win
every conflict.

The server keeps the **last 30 accepted states per profile** as revisions;
restore any of them from **Settings → Server backups** (the restored copy is
re-stamped as newest and propagates to all devices).

Security note: the server is a *validated document store* scoped per user, not a
rules engine — game-rule enforcement stays client-side. That's fine for a
personal app or a **trusted circle** (each profile is fully isolated; nobody can
read or affect anyone else's data), but not for competitive/public features —
see the plan for that hardening. Persistence sits behind a small interface
(`server/src/store.ts`): **SQLite by default** (via Node's built-in
`node:sqlite` — still zero external deps), with the legacy JSON-file store
available by pointing `DB_PATH` at a `.json` file. A fresh SQLite db imports an
existing `data/db.json` once.

## Deploy (Level 1 — a trusted circle)

The server ships deploy-ready for small groups: strict per-IP rate limits on
the auth routes, a body-size cap on state uploads, tokens die with their
account, it refuses to start in production without a real `JWT_SECRET`, and it
serves the built frontend itself — **one small box runs the whole app**.

```bash
# Fly.io (simplest; HTTPS + volume included)
fly launch --copy-config --no-deploy   # rename `app` in fly.toml first
fly volumes create focus_den_data --size 1
fly secrets set JWT_SECRET="$(openssl rand -hex 32)"
fly deploy

# …or any Docker host
docker build -t focus-den .
docker run -d -p 8787:8787 -v focus-den-data:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" focus-den
```

Put HTTPS in front (Fly does this for you; on a VPS use Caddy/nginx). For
off-box backups, stream the SQLite file to any S3-compatible bucket with
**Litestream** — see `server/litestream.yml.example`.

Forgotten passwords (no email flow at this tier) are reset by the admin on the
host: `npm --prefix server run reset-password -- <name> <new-password>`.

## How it works

- **Clock in** to start a 12-hour shift anchored to your actual clock-in time.
  One shift per calendar day; the day locks after clock-out until tomorrow.
- **Switch status** (Working / Break 1 / Break 2 / Lunch / Offline) with one
  tap. Each switch commits the elapsed time in the previous status.
- **Breaks** are single-use: Break 1 = 20m, Break 2 = 20m, Lunch = 50m. A 3-min
  grace applies — overrun it and you're auto-moved to **Offline** (the shift is
  no longer "clean"); tap Working to resume earning. A warning (and optional
  browser notification) fires ~2 minutes before the cutoff.
- **Points** (credited at clock-out): 10 / whole worked hour, +50 clean shift,
  +20 for 3+ tasks, +200 for a perfect week (all of Mon–Sat; Sunday is off).
  A live "earned today" preview shows during the shift.
- **Tasks**: log timestamped tasks; edit or delete them (timestamps preserved).

## Shop & room

- **Character** cosmetics across three slots — outfit / hair / accessory (one
  equipped each). Includes an animated **Glow Outfit**.
- **Room** props that appear in the scene once owned, from a coffee mug up to a
  dual monitor, plus animated **String Lights**, **Desk Cat**, and **Rain
  Window**. Animated items use subtle CSS motion and fall back to a static frame
  under `prefers-reduced-motion`.
- **Perks** (functional):
  - **Streak Freeze** (consumable) — from History, restore a missed Mon–Sat day;
    re-evaluates the perfect-week bonus.
  - **Soundscape Pack** — ambient rain / café / lo-fi / fireplace / forest /
    waves / wind, all generated with the WebAudio API (no audio files), with a
    volume slider. Toggle on the Dashboard and in Deep Work.
  - **Midnight / Sunrise themes** — selectable color themes (CSS variables).
  - **Break Grace +1 min** — permanently widens the auto-offline threshold.
  - **Deep Work Mode** — a focus overlay showing only the timer and current task.

The shop lives **inside the Room page** (a Customize / Shop toggle) rather than a
separate tab — so the scene stays beside the catalog and buying or equipping
anything updates it immediately. The same render function powers the small
Dashboard preview and the large Room view.

## Plan (calendar)

A day planner for predetermined goals/tickets — separate from the during-shift
task log. A month calendar lets you pick any day; add / edit / delete tickets,
give each an optional duration and priority, and set a status (**To do → In
progress → Done**).

- **Timer synced to the shift.** Setting a ticket to *In progress* starts a
  timer that only accrues while you're clocked in **and Working** — it pauses on
  break/offline and resumes when you're back to Working. You can't start a
  ticket unless you're Working on today. When a ticket reaches its planned
  duration it fires a notification; marking it **Done** logs it to the shift's
  task list.
- **Duplicate / move.** Copy a day's tickets to the **next day** or the whole
  **week**, move a single ticket to the next day, or **clear** a day.
- **Past days are locked** (view-only); only current and upcoming days change.

Tickets and tracked time persist per profile.

## Screens

Dashboard · Plan · Room (customize + shop) · History (with hand-rolled SVG
analytics: worked hours this week, cumulative points, break-budget usage) ·
Settings (account,
themes, soundscape + volume, JSON export/import, reset, testing tools). A
first-run onboarding explains the loop and is replayable from Settings.

## Architecture

The domain logic is deliberately isolated so a FastAPI/Postgres backend can be
added later without touching it.

```
src/
  core/        Pure, framework-agnostic engine — shift, points, week, dates,
               items catalog, streak-freeze, grace math, formatting. Fully
               unit-tested. No React, no storage, no clock reads.
  state/       Persisted store (localStorage adapter) + React hooks. Versioned
               state with a v1 -> v2 migration.
  room/        The pixel-SVG room scene (cosmetics + props + animated layers).
  audio.ts     SFX + ambient soundscapes, synthesized (no files).
  components/  Dashboard, Shop, RoomView, History, Charts, Settings, DeepWork,
               Onboarding, SummaryModal, WeekStreak.
  App.tsx      Shell: header, tabs, theme + sound, per-second heartbeat.
```

`core/` never reads the clock or storage — every function takes an explicit
`now`, which keeps it deterministic and testable (`src/core/core.test.ts`).

## Phase 2 status

Milestones 1–3 (full catalog + animated items, functional perks, refinement &
polish) are complete. **Milestone 4 (FastAPI + Postgres backend)** is optional
and not yet built — the persistence seam (`src/state/persist.ts`) is where the
localStorage adapter would be swapped for an API client.
