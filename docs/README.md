# Focus Den docs

Per-subsystem deep dives. `CLAUDE.md` (local, gitignored) and `DEVELOPMENT.md`
stay short; the full detail lives here — one file per area, kept current when
that area changes.

| File | Covers |
|---|---|
| [core.md](core.md) | The pure engine: state document, shift machine, points, week streak, day planner, deep validation |
| [state.md](state.md) | The store, actions, heartbeat, localStorage persistence, React bindings, export/import |
| [ui.md](ui.md) | App shell, every screen/component, the fx animation system |
| [sound.md](sound.md) | All sound: SFX synthesis, click routing policy, ambient soundscape graphs, known weaknesses |
| [styles.md](styles.md) | The one stylesheet: theme tokens, conventions, section map, responsive + reduced motion |
| [room.md](room.md) | The pixel SVG scene, the shop catalog, how items/cosmetics/perks land |
| [server.md](server.md) | The Fastify server: what it does today, the vestigial sync API, both store engines |
| [desktop.md](desktop.md) | Path to .dmg / .exe packaging: what's ready, what's left, Tauri vs Electron |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Contributor quick start: commands, code map, house rules |
| [DEPLOY-AWS.md](DEPLOY-AWS.md) | Production deploy runbook (Lightsail + Docker) |
