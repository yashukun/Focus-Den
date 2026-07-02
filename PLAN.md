# Focus Den — Roadmap

Two workstreams: **Phase 0** makes the current app safe to share; **Phases 1–4**
rebuild capture around an event log (zero-friction AUX tracking) while keeping
the game and the planner. Each phase ships usable on its own.

Locked decisions:
- **Game stays** — points/shop/streaks become a *derived lens* computed over
  events; capture itself has zero rules at tap-time.
- **Three states**: Working / Away / Break. `Meeting` added later only if
  mislabeling isn't a problem.
- **Manual tasks + planner tickets stay** alongside one-tap AUX.
- **Hotkey path** (OS shortcut vs Tauri tray app): deferred to Phase 4; the
  inbox endpoint built there serves both, so nothing is wasted.

---

## Phase 0 — Security hardening (before inviting anyone) ~1 day

Ordered by severity (from the 2026-07-02 security review):

1. **Dependency upgrades (critical/high CVEs)** — Fastify 4.28 → 5.9 with
   plugin majors: `@fastify/cors@^10`, `@fastify/rate-limit@^10`,
   `@fastify/static@^8`; add `@fastify/helmet` while at it. Server `vitest`
   2 → 4 (dev-only CVEs). Gate: full test suite + typecheck + prod smoke test.
2. **Deep `coerceState`** — clamp all numbers to finite ranges (points
   0..1e9, ms fields 0..40 days), whitelist enums (status, theme, soundscape,
   ticket status/priority), cap lengths (task text ≤ 500 chars, tasks ≤ 500,
   history ≤ 5000 entries, tickets ≤ 100/day, item ids ≤ 64 chars). Hostile-doc
   tests: Infinity, wrong types, giant arrays, unknown enums.
3. **Password minimum 4 → 8** (server + client mirror). Fix the login note
   (profiles are synced now, not device-only; keep the "don't reuse a real
   password" advice).
4. **Token revocation** — add `tokenVersion` to the users table (default 1),
   stamp it into the JWT, check in `requireAuth`, bump on password reset.
   Gives "sign out everywhere" for free later.
5. **Account deletion requires the password** in the request body, not just a
   bearer token (it destroys state + all revisions irreversibly).
6. **Low/hardening batch**: security headers via helmet (CSP, nosniff,
   frame-ancestors); `CORS_ORIGIN` env to pin the real domain in prod;
   `USER node` in the Dockerfile; offline-login cache SHA-256 → PBKDF2
   (re-cache lazily on next successful online login); restrict display names
   to printable characters; document TRUST_PROXY=false for proxy-less deploys.

---

## Phase 1 — Event-log core + one-tap AUX + backdate + timeline ~3–5 days

The structural rewrite everything else depends on. The current engine stores
*accumulated totals* and discards intervals — backdating and timelines are
impossible by construction. Phase 1 makes **events the source of truth**:

- **Model (state v3)**: a shift holds `events: {t, state, auto?}[]`
  (state ∈ working/away/break). All totals (`acc`, break usage, worked time)
  become a **pure fold** over events. Migration v2→v3: a live shift converts
  its current status into an open event; historical totals stay as-is
  (timelines exist only from the switch forward).
- **Game as derived lens**: `computePoints` unchanged in spirit, now fed by
  the fold. Break1/Break2/Lunch collapse into one **pooled break budget
  (90 min/day)** with per-excursion grace; `clean` = never blew
  budget+grace; auto-away insertion becomes an `auto: true` event. Streak,
  perfect week, shop, perks all survive unchanged.
- **One-tap AUX bar**: persistent Working / Away / Break bar replacing the
  5-status switcher. Clock-in/out unchanged. Manual task logging unchanged.
- **Backdated corrections**: adjust the last event's time or insert a missed
  away/back pair; refold validates monotonic, non-overlapping events.
- **Day timeline**: horizontal bar colored by state (hand-rolled SVG, like
  Charts). Segment retention: keep event detail for the last **90 days** in
  history entries; older days keep totals only.
- Tests: fold correctness, migration, backdating edge cases, grace-as-events.

## Phase 2 — Idle detection with prompt ~½ day

Activity tracking (keyboard/mouse/visibility) + heartbeat. Gap ≥ N minutes
(default 5, configurable) → on return, prompt "Idle 2:10–2:35 — mark as
Away?" → inserts a backdated away/back pair. Covers closed-laptop gaps too
(no heartbeat = gap). Modes: off / prompt (default) / auto.

## Phase 3 — Projects ~1–2 days

Project entity (name, color, archived). Recent-projects one-tap row; while
Working, segments carry a `projectId`; switching projects closes the previous
segment. Per-project daily/weekly breakdowns in History. Planner tickets can
optionally link to a project. Manual tasks/tickets unchanged.

## Phase 4 — Inbox endpoint + global hotkey ~½ day + setup

`POST /api/inbox {type, t?}` (token-authed, rate-limited): server queues
events; clients ingest + fold on next sync/visibility/heartbeat. Then bind an
OS-level shortcut (Raycast / Hammerspoon / macOS Shortcuts → curl) to toggle
Away/Back without opening the app. **Decision point**: if the hotkey habit
sticks, build the Tauri menu-bar app (true global hotkey + tray) on top of the
same endpoint.

---

## Open questions (decide when their phase starts)

- Pooled 90-min break budget vs. keeping distinct named breaks (Phase 1).
- Timeline retention window — 90 days proposed (Phase 1).
- Idle threshold default — 5 min proposed (Phase 2).
- Hotkey: OS-shortcut only vs. Tauri app (Phase 4).

## Later / unscheduled

- `Meeting` state; configurable shift length & schedule; sync-status
  indicator in header; PWA (manifest + service worker); per-event server sync
  (true multi-device merge); Level 2/3 multi-user hardening (email accounts,
  server-authoritative rules) per the tier plan.
