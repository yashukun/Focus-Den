# Desktop packaging (.dmg / .exe)

**Status: LIVE since 2026-08-19** — Tauri v2 shell in `src-tauri/`, built for
macOS + Windows by `.github/workflows/desktop.yml` on every `v*` tag.
Decisions (user-confirmed): Tauri v2 · CI-built installers · macOS unsigned
for now · built-in auto-updater via GitHub Releases.

## Working on it

```bash
npx tauri dev      # runs Vite + opens the desktop window (hot reload)
npx tauri build    # release .app/.dmg locally (needs the updater key env
                   #   vars to sign update artifacts — see CI workflow)
npx tauri icon <1024.png>   # regenerate all icons from a new source
```

Rust toolchain via rustup (`~/.cargo/bin`). The shell is deliberately thin
(`src-tauri/src/lib.rs`): two commands (`save_state_file`/`load_state_file`
— atomic write to the app data dir) plus the updater + process plugins.
Frontend touchpoints: `src/state/desktop.ts` (disk mirror: restore a
fresh-looking start from disk, debounce-mirror every save) and
`components/DesktopUpdate.tsx` (Settings card; desktop-only, dynamic
imports). The updater keypair lives at `~/.tauri/focus-den-updater.key`
(private — also in the repo secrets `TAURI_SIGNING_PRIVATE_KEY` /
`..._PASSWORD`); its pubkey is in `tauri.conf.json`. **Losing that key means
shipped apps can never self-update again — keep a backup.**

## Already desktop-ready (kept true on purpose)

- **Fully local**: no accounts, no network calls at runtime; the server is
  irrelevant to a desktop build.
- **Relative asset base**: `vite.config.ts` sets `base: './'`, so `dist/`
  loads from a webview custom protocol as-is.
- **Zero assets**: all art is inline SVG, all sound is synthesized WebAudio —
  nothing to bundle or path-fix.
- **No native dialogs**: `window.confirm`/`alert` (unsupported or unreliable
  in webviews) are banned — destructive actions use `useArmedConfirm`.
- **Guarded web APIs**: `Notification` and `matchMedia` are feature-checked;
  missing APIs degrade, never crash.
- **Single-file state**: the whole den is one JSON doc with export/import in
  Settings — trivially portable into any future storage backend.

## Done (2026-08-19)

- **Storage hardening** — `src/state/desktop.ts` mirrors the state doc to
  `app_data_dir/focus-den.json` (atomic temp+rename in Rust) and restores it
  when localStorage comes up pristine.
- **Scaffold** — `src-tauri/` with window config (1180×800, min 760×600),
  `frontendDist: ../dist`, dev against Vite 5173.
- **Icons** — pixel-window icon (canvas-drawn 1024 source in scratchpad →
  `tauri icon`); regenerate from any new 1024 PNG.
- **Updater** — `tauri-plugin-updater` against
  `Focus-Den/releases/latest/download/latest.json`, UI in Settings.
- **CI** — `desktop.yml`: macOS universal + Windows matrix on `v*` tags,
  attaches installers + `latest.json` to the GitHub Release.

## Also done (2026-08-19, second pass)

- **Durability**: `save_state_file` rolls a ~daily `focus-den.backup.json`
  restore point before overwriting the mirror; the JS restore chain tries
  main mirror → backup, only when localStorage came up pristine. Updates
  never touch the app data dir, so the den (and the schedule) survives
  updates, storage eviction, and a corrupted save.
- **Now-playing widget** (`media` widget id, side rail, desktop-only — the
  web hides it from the tray entirely). Rust commands `media_now_playing` /
  `media_control(app, action)`; polled every 2 s by
  `components/MediaCard.tsx`. **Both platforms read the SYSTEM media
  session, so browsers count** (YouTube etc. via the Media Session API):
  - macOS primary: JXA under `osascript` reading MediaRemote's synchronous
    `MRNowPlayingRequest` + `MRMediaRemoteSendCommand` (2/4/5 =
    toggle/next/prev). Since macOS 15.4 MediaRemote only answers Apple
    platform binaries — osascript qualifies, our own process does NOT
    (verified: PID/isPlaying answer, GetNowPlayingInfo times out). No Apple
    Events → no Automation prompt. Verified end-to-end on macOS 26 against
    Chrome (read + pause + next). Expect Apple to shift this again — the
    AppleScript Spotify/Music path remains as automatic fallback (its app
    snippets MUST go through `run script`; a direct `tell application
    "Spotify"` block is a compile-time syntax error without Spotify
    installed).
  - Windows: GSMTC WinRT — sees everything including browsers; note
    windows-future 0.3 renamed the blocking `.get()` to `.join()`. Windows
    code is cross-compile-checked via a probe crate (full-tree
    `cargo check --target x86_64-pc-windows-msvc` fails on ring's C build;
    checking the media code alone works).

## Remaining / later

1. **macOS signing & notarization** (Apple Developer, $99/yr) — until then,
   first launch is right-click → Open. Wire the cert into `desktop.yml` when
   available. Windows SmartScreen similarly wants a cert eventually.
2. **Menu/UX niceties**: quit/hide accelerators, open-at-login, optional
   tray timer.
3. **Homebrew cask** for the .dmg (the existing formula builds the web
   server from source — different audience).

## Constraints to preserve meanwhile

- Don't introduce runtime network dependencies or absolute `/` asset URLs.
- Keep new browser-API usage feature-checked (Safari's WKWebView is the
  lowest common denominator — test WebAudio changes there).
- Keep everything storage-related flowing through `persist.ts`.
