//! Focus Den desktop shell. The web app stays the source of truth — this
//! crate only adds what a webview can't do alone: a durable copy of the state
//! document on disk (webview localStorage can be evicted by the OS) and the
//! self-updater. Keep it thin; game logic never lives here.

use tauri::Manager;

const STATE_FILE: &str = "focus-den.json";
const BACKUP_FILE: &str = "focus-den.backup.json";
/// Roll the backup roughly daily — a corrupted save can never overwrite a
/// restore point that's less than a day old.
const BACKUP_EVERY_SECS: u64 = 20 * 60 * 60;

fn read_optional(path: &std::path::Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Mirror the state document to the app data dir. Write temp + rename so a
/// crash mid-write can never truncate the previous good copy, and roll the
/// last good copy into a daily backup before overwriting it.
#[tauri::command]
fn save_state_file(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{STATE_FILE}.tmp"));
    let path = dir.join(STATE_FILE);
    let bak = dir.join(BACKUP_FILE);

    if path.exists() {
        let stale = std::fs::metadata(&bak)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .map(|age| age.as_secs() > BACKUP_EVERY_SECS)
            .unwrap_or(true);
        if stale {
            let _ = std::fs::copy(&path, &bak); // best-effort restore point
        }
    }

    std::fs::write(&tmp, json).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

/// The mirrored document, or None on a fresh install.
#[tauri::command]
fn load_state_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    read_optional(&dir.join(STATE_FILE))
}

/// The daily restore point (used only when the main mirror is missing/bad).
#[tauri::command]
fn load_state_backup(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    read_optional(&dir.join(BACKUP_FILE))
}

// ── Now-playing widget ──────────────────────────────────────────────────────
// macOS primary path: the system Now Playing session (same source as Control
// Center) read via JXA under `osascript` — an Apple platform binary, which is
// what MediaRemote's macOS 15.4+ entitlement gate requires. This sees
// EVERYTHING: browsers (YouTube etc. via the Media Session API), Spotify,
// Music, VLC… and sends no Apple Events, so there is no Automation prompt.
// Fallback: AppleScript against Spotify/Apple Music directly (prompts once).
// Windows: the public GlobalSystemMediaTransportControlsSession API.

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct NowPlaying {
    title: String,
    artist: String,
    app: String,
    playing: bool,
}

/// Run an inline JXA script through osascript; None on failure/empty output.
#[cfg(target_os = "macos")]
fn run_jxa(script: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new("osascript")
        .args(["-l", "JavaScript", "-e", script])
        .args(args)
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

/// System Now Playing via MediaRemote's synchronous MRNowPlayingRequest —
/// verified working on macOS 26 under osascript's platform-binary identity.
#[cfg(target_os = "macos")]
const JXA_NOW_PLAYING: &str = r#"
ObjC.import('Foundation');
function run() {
  const b = $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/');
  b.load;
  const R = $.NSClassFromString('MRNowPlayingRequest');
  if (R.isNil()) return 'null';
  const item = R.localNowPlayingItem;
  if (item.isNil()) return 'null';
  const info = item.nowPlayingInfo;
  if (info.isNil()) return 'null';
  const get = (k) => { const v = info.valueForKey(k); return v.isNil() ? '' : String(v.js); };
  const title = get('kMRMediaRemoteNowPlayingInfoTitle');
  if (!title) return 'null';
  let app = '';
  const path = R.localNowPlayingPlayerPath;
  if (!path.isNil() && !path.client.isNil()) {
    const dn = path.client.displayName;
    if (!dn.isNil()) app = String(dn.js);
  }
  return JSON.stringify({
    title,
    artist: get('kMRMediaRemoteNowPlayingInfoArtist'),
    app,
    playing: parseFloat(get('kMRMediaRemoteNowPlayingInfoPlaybackRate') || '0') > 0.01,
  });
}
"#;

/// Transport command to whatever owns the Now Playing session (browsers too).
#[cfg(target_os = "macos")]
const JXA_COMMAND: &str = r#"
ObjC.import('Foundation');
function run(argv) {
  const b = $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/');
  b.load;
  ObjC.bindFunction('MRMediaRemoteSendCommand', ['bool', ['int', 'id']]);
  const ok = $.MRMediaRemoteSendCommand(parseInt(argv[0], 10), $());
  $.NSThread.sleepForTimeInterval(0.15);
  return ok ? 'ok' : 'refused';
}
"#;

#[cfg(target_os = "macos")]
fn now_playing_impl() -> Option<NowPlaying> {
    if let Some(json) = run_jxa(JXA_NOW_PLAYING, &[]) {
        if json != "null" {
            if let Ok(np) = serde_json::from_str::<NowPlaying>(&json) {
                return Some(np);
            }
        }
    }
    now_playing_applescript()
}

/// Fallback: ask Spotify / Apple Music directly (prompts for Automation once).
#[cfg(target_os = "macos")]
fn now_playing_applescript() -> Option<NowPlaying> {
    // Prefer whichever player is actually playing. App-specific snippets go
    // through `run script` so this compiles even on machines where Spotify
    // isn't installed (direct `tell` blocks need the app's dictionary at
    // COMPILE time and would be a syntax error without it).
    const SCRIPT: &str = r#"
set out to ""
tell application "System Events"
    set hasSpotify to exists process "Spotify"
    set hasMusic to exists process "Music"
end tell
if hasSpotify then
    try
        set out to run script "tell application \"Spotify\" to return \"Spotify\" & linefeed & (player state as text) & linefeed & (name of current track) & linefeed & (artist of current track)"
    end try
end if
if hasMusic then
    try
        set m to run script "tell application \"Music\" to return \"Music\" & linefeed & (player state as text) & linefeed & (name of current track) & linefeed & (artist of current track)"
        if out is "" then
            set out to m
        else if (paragraph 2 of m) is "playing" and (paragraph 2 of out) is not "playing" then
            set out to m
        end if
    end try
end if
return out
"#;
    let output = std::process::Command::new("osascript")
        .args(["-e", SCRIPT])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let mut lines = text.lines();
    let app = lines.next()?.trim().to_string();
    let state = lines.next()?.trim().to_string();
    let title = lines.next()?.trim().to_string();
    let artist = lines.next().unwrap_or("").trim().to_string();
    if app.is_empty() || title.is_empty() {
        return None;
    }
    Some(NowPlaying {
        title,
        artist,
        app,
        playing: state == "playing",
    })
}

#[cfg(target_os = "macos")]
fn media_control_impl(app: &str, action: &str) -> Result<(), String> {
    // Primary: a MediaRemote transport command — controls whatever owns the
    // system session, browsers included.
    let code = match action {
        "playpause" => "2",
        "next" => "4",
        "prev" => "5",
        _ => return Err("unsupported action".into()),
    };
    if run_jxa(JXA_COMMAND, &[code]).as_deref() == Some("ok") {
        return Ok(());
    }
    media_control_applescript(app, action)
}

#[cfg(target_os = "macos")]
fn media_control_applescript(app: &str, action: &str) -> Result<(), String> {
    // Strict whitelist — both values become AppleScript verbatim. Wrapped in
    // `run script` for the same compile-safety as the polling script.
    let inner = match (app, action) {
        ("Spotify", "playpause") => "tell application \\\"Spotify\\\" to playpause",
        ("Spotify", "next") => "tell application \\\"Spotify\\\" to next track",
        ("Spotify", "prev") => "tell application \\\"Spotify\\\" to previous track",
        ("Music", "playpause") => "tell application \\\"Music\\\" to playpause",
        ("Music", "next") => "tell application \\\"Music\\\" to next track",
        ("Music", "prev") => "tell application \\\"Music\\\" to previous track",
        _ => return Err("unsupported app/action".into()),
    };
    let script = format!("run script \"{inner}\"");
    std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn now_playing_impl() -> Option<NowPlaying> {
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    let manager = Manager::RequestAsync().ok()?.join().ok()?;
    let session = manager.GetCurrentSession().ok()?;
    let props = session.TryGetMediaPropertiesAsync().ok()?.join().ok()?;
    let title = props.Title().map(|s| s.to_string()).unwrap_or_default();
    let artist = props.Artist().map(|s| s.to_string()).unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let playing = session
        .GetPlaybackInfo()
        .and_then(|i| i.PlaybackStatus())
        .map(|s| s == Status::Playing)
        .unwrap_or(false);
    let app = session
        .SourceAppUserModelId()
        .map(|s| s.to_string())
        .unwrap_or_default();
    Some(NowPlaying { title, artist, app, playing })
}

#[cfg(target_os = "windows")]
fn media_control_impl(_app: &str, action: &str) -> Result<(), String> {
    use windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager as Manager;
    let manager = Manager::RequestAsync()
        .map_err(|e| e.to_string())?
        .join()
        .map_err(|e| e.to_string())?;
    let session = manager.GetCurrentSession().map_err(|e| e.to_string())?;
    let op = match action {
        "playpause" => session.TryTogglePlayPauseAsync(),
        "next" => session.TrySkipNextAsync(),
        "prev" => session.TrySkipPreviousAsync(),
        _ => return Err("unsupported action".into()),
    };
    op.map_err(|e| e.to_string())?
        .join()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn now_playing_impl() -> Option<NowPlaying> {
    None
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn media_control_impl(_app: &str, _action: &str) -> Result<(), String> {
    Err("unsupported platform".into())
}

#[tauri::command]
async fn media_now_playing() -> Option<NowPlaying> {
    now_playing_impl()
}

#[tauri::command]
async fn media_control(app: String, action: String) -> Result<(), String> {
    media_control_impl(&app, &action)
}

/// Bring the main window back and focus it (dock click / re-open).
#[cfg(target_os = "macos")]
fn show_main(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            save_state_file,
            load_state_file,
            load_state_backup,
            media_now_playing,
            media_control
        ]);

    // macOS: closing the window hides the den instead of quitting it — the
    // shift keeps ticking and the dock icon brings it straight back (the
    // platform convention). Quitting for real is still ⌘Q, and the gap that
    // leaves is reconciled into Away time on the next launch.
    #[cfg(target_os = "macos")]
    let builder = builder.on_window_event(|window, event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
        }
    });

    #[cfg(target_os = "macos")]
    {
        builder
            .build(tauri::generate_context!())
            .expect("error while building Focus Den")
            .run(|app, event| {
                if let tauri::RunEvent::Reopen { .. } = event {
                    show_main(app);
                }
            });
    }

    // Windows / Linux have no dock to re-open a hidden window from, so the
    // close button keeps its normal meaning there.
    #[cfg(not(target_os = "macos"))]
    builder
        .run(tauri::generate_context!())
        .expect("error while running Focus Den");
}
