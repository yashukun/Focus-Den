# Focus Den

A single-user, focus-driven shift tracker with a cozy pixel room. Track a
12-hour shift with Slack-style status switching, earn points for focused work,
and spend them on a pixel avatar + room that visibly grows.

Built with **React + TypeScript + Vite**. The app is **fully local** — no
accounts, no cloud: your den lives in the browser's `localStorage`, and
Settings offers one-click JSON export/import for backups or moving devices. A
small **Node + TypeScript** (Fastify) server is bundled purely to host the
built app on your own box (Docker, AWS, or Homebrew).

## Run it

```bash
npm install                 # frontend deps
npm install --prefix server # backend deps (once)

npm run dev       # the app, at http://localhost:5173

npm test                    # frontend tests
npm test --prefix server    # server tests
npm run build               # typecheck + production build
```

The server is only needed when testing the production single-box setup:
`npm run dev:all` runs web + server together (Vite proxies `/api` → 8787).

More for contributors in **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** (code
map, house rules, worked examples). CI runs typecheck + tests + build on every
push; deployed servers can auto-deploy the newest CI-green commit (see the
deploy guide).

## Your data

Everything lives in this browser's `localStorage` — there are no accounts and
nothing leaves your machine. Every change persists instantly, and the state is
one versioned document that's deeply validated on load, so old or hand-edited
backups coerce safely instead of crashing the app.

**Settings → Export JSON** downloads your whole den as a single file;
**Import** restores it (that's also how you move to another browser or
machine). Clearing the browser's site data deletes the den, so export
occasionally.

> Earlier versions synced profiles to the bundled server behind
> username/password accounts. That client-side sync layer was removed for the
> simpler local-only model; the implementation (and the server's still-present
> sync API) lives in git history if it's ever wanted again.

## Host it yourself

The bundled server's remaining job is to serve the built frontend — **one
small box runs the whole app**, and your den still stays in each browser.

Easiest on a Mac, via [Homebrew](https://github.com/yashukun/homebrew-focus-den):

```bash
brew tap yashukun/focus-den
brew install focus-den
brew services start focus-den   # then open http://localhost:8787
```

Full AWS walkthrough with best practices (Lightsail, HTTPS, day-2 ops):
**[docs/DEPLOY-AWS.md](docs/DEPLOY-AWS.md)** — or the short version, on
the server: `./deploy/aws-setup.sh focus.yourdomain.com` (idempotent; also how
you update). Runs on any Docker host:

```bash
docker build --build-arg GIT_SHA="$(git rev-parse --short HEAD)" -t focus-den .
docker run -d --name focus-den --restart unless-stopped \
  -p 127.0.0.1:8787:8787 -v focus-den-data:/data \
  -e JWT_SECRET="$(openssl rand -hex 32)" focus-den
```

Put HTTPS in front with Caddy (automatic certificates) or nginx:

```
focus.example.com {
    reverse_proxy localhost:8787
}
```

Update a running deploy with `git pull`, rebuild the image (build command
above), then `docker rm -f focus-den` and re-run the `docker run` command.
Your den's data is in the browser, not on the box — there's nothing
server-side to back up. (`JWT_SECRET` and the data volume are legacy
requirements of the bundled server's sync-era API, which still refuses to
start in production without them.)

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

Home (landing) · Today · Plan · Den (customize + shop) · Journal (with
hand-rolled SVG analytics: worked hours this week, cumulative points,
break-budget usage) · Settings (themes, soundscape + volume, JSON
export/import, reset, testing tools). A first-run onboarding explains the loop
and is replayable from Settings.

## Architecture

The domain logic is deliberately isolated from React, storage and the clock.

```
src/
  core/        Pure, framework-agnostic engine — shift, points, week, dates,
               items catalog, streak-freeze, grace math, formatting. Fully
               unit-tested. No React, no storage, no clock reads.
  state/       Persisted store (localStorage adapter) + React hooks. Versioned
               state with a v1 -> v2 migration.
  fx/          One-shot animation effects (anime.js) + hooks. Fire-and-forget,
               no-op under prefers-reduced-motion.
  room/        The pixel-SVG room scene (cosmetics + props + animated layers).
  audio.ts     SFX + ambient soundscapes, synthesized (no files).
  components/  Home, Dashboard, Shop, RoomView, History, Charts, Settings,
               DeepWork, Onboarding, SummaryModal, WeekStreak.
  App.tsx      Shell: landing/den views, header, tabs, theme + sound,
               per-second heartbeat.
```

`core/` never reads the clock or storage — every function takes an explicit
`now`, which keeps it deterministic and testable (`src/core/core.test.ts`).
