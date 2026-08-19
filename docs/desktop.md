# Desktop packaging (.dmg / .exe) — readiness & plan

Goal: ship Focus Den as a signed macOS `.dmg` and Windows `.exe` later,
without forking the codebase.

## Recommendation: Tauri v2

The app is a fully local, zero-asset SPA — the ideal Tauri case. Tauri wraps
the existing `dist/` in the OS webview (WKWebView / WebView2): installers are
~5–10 MB with no bundled Node/Chromium, and `tauri build` produces `.dmg` and
NSIS `.exe` from one config. Electron is the fallback if we ever need
Chromium-exact rendering or heavy Node integration — at ~10× the size.

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

## Remaining work (in order)

1. **Storage hardening** — the den lives in webview `localStorage`, which the
   OS can evict. Before shipping, mirror saves to disk: a `save()` hook in
   `src/state/persist.ts` that (when running under Tauri) also writes the JSON
   doc via the fs plugin, and restores from it when localStorage is empty.
   `persist.ts` is the single choke point; nothing else changes.
2. **Scaffold**: `npm create tauri-app` pointing at the existing Vite app
   (`beforeBuildCommand: npm run build`, `frontendDist: ../dist`); window
   config (min size ~1000×700 to match the 1000 px breakpoint, title, theme).
3. **Icons**: generate the icon set from the brand mark (`tauri icon`).
4. **Menu/UX niceties**: quit/hide accelerators, open-at-login toggle,
   optional tray timer later.
5. **Signing & distribution**: macOS Developer ID + notarization for the
   `.dmg`; Windows code-signing cert for the `.exe`; `tauri-plugin-updater`
   if we want auto-update, otherwise Homebrew cask + GitHub Releases.
6. **CI**: a `tauri build` matrix job (macos-latest / windows-latest)
   uploading installers to the GitHub release for each `v*` tag — slots into
   the existing tag-driven release flow.

## Constraints to preserve meanwhile

- Don't introduce runtime network dependencies or absolute `/` asset URLs.
- Keep new browser-API usage feature-checked (Safari's WKWebView is the
  lowest common denominator — test WebAudio changes there).
- Keep everything storage-related flowing through `persist.ts`.
