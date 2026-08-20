/**
 * Now playing — desktop-only Today-page widget. Polls the Rust
 * `media_now_playing` command every 2 s while mounted and offers
 * prev / play-pause / next. Both platforms read the SYSTEM media session, so
 * browsers (YouTube, YouTube Music…) count too: macOS via MediaRemote under
 * osascript, Windows via GSMTC. Renders a quiet empty state when nothing is
 * playing; the Dashboard hides the widget entirely on the web.
 */

import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../state/desktop';

export interface NowPlaying {
  title: string;
  artist: string;
  app: string;
  playing: boolean;
}

const POLL_MS = 2000;

export interface MediaCardProps {
  /** notified when a media session appears/disappears (Dashboard uses this
   * to sink the idle card to the bottom of its column) */
  onActiveChange?: (active: boolean) => void;
}

export function MediaCard({ onActiveChange }: MediaCardProps = {}) {
  const [np, setNp] = useState<NowPlaying | null>(null);
  const alive = useRef(true);

  const notify = useRef(onActiveChange);
  notify.current = onActiveChange;
  useEffect(() => {
    notify.current?.(np !== null);
  }, [np]);
  // On unmount, report inactive so a hidden card doesn't pin a stale order.
  useEffect(() => () => notify.current?.(false), []);

  useEffect(() => {
    alive.current = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const v = await invoke<NowPlaying | null>('media_now_playing');
        if (alive.current) setNp(v);
      } catch {
        if (alive.current) setNp(null);
      }
      if (alive.current) timer = window.setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      alive.current = false;
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  async function control(action: 'prev' | 'playpause' | 'next') {
    if (!np) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('media_control', { app: np.app, action });
      // Optimistic flip so play/pause feels instant; the next poll corrects.
      if (action === 'playpause') setNp({ ...np, playing: !np.playing });
    } catch {
      // controls are best-effort
    }
  }

  return (
    <section className="card media-card">
      <div className="card-head">
        <h2>Now playing</h2>
        {np && <span className="muted media-app">{prettyApp(np.app)}</span>}
      </div>

      {np ? (
        <>
          <div className="media-track">
            {np.playing && (
              <span className="media-eq" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
            <span className="media-title" title={np.title}>{np.title}</span>
          </div>
          {np.artist && <div className="media-artist muted">{np.artist}</div>}
          <div className="media-controls" role="group" aria-label="Playback controls">
            <button className="btn btn-sm" data-sound="none" aria-label="Previous track" onClick={() => void control('prev')}>
              ⏮
            </button>
            <button
              className="btn btn-sm btn-primary media-play"
              data-sound="none"
              aria-label={np.playing ? 'Pause' : 'Play'}
              onClick={() => void control('playpause')}
            >
              {np.playing ? '⏸' : '▶'}
            </button>
            <button className="btn btn-sm" data-sound="none" aria-label="Next track" onClick={() => void control('next')}>
              ⏭
            </button>
          </div>
        </>
      ) : (
        <p className="muted">
          {isTauri()
            ? 'Nothing playing — start something in Spotify, Music, or any browser tab.'
            : 'Available in the desktop app.'}
        </p>
      )}
    </section>
  );
}

/** "Spotify.exe" / AUMIDs → a friendly name; already-friendly names pass through. */
function prettyApp(app: string): string {
  const lower = app.toLowerCase();
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('music')) return 'Music';
  if (lower.includes('chrome')) return 'Chrome';
  if (lower.includes('edge')) return 'Edge';
  if (lower.includes('firefox')) return 'Firefox';
  return app;
}
