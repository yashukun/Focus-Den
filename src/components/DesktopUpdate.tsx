/**
 * Desktop-only Settings card: check GitHub Releases for a newer build and
 * self-update (Tauri updater plugin, artifacts signed with the project's
 * updater key). Renders nothing on the web. All plugin imports are dynamic so
 * the web bundle never loads them.
 */

import { useEffect, useState } from 'react';
import { isTauri } from '../state/desktop';

type Phase =
  | { id: 'idle' }
  | { id: 'checking' }
  | { id: 'current' }
  | { id: 'available'; version: string }
  | { id: 'installing'; progress: number | null }
  | { id: 'error'; message: string };

/** Progress payload from the updater plugin (structural — no plugin import). */
interface DownloadEvent {
  event: 'Started' | 'Progress' | 'Finished';
  data?: { contentLength?: number; chunkLength?: number };
}

export function DesktopUpdate() {
  const [phase, setPhase] = useState<Phase>({ id: 'idle' });

  // Quietly look for an update when Settings opens.
  useEffect(() => {
    if (!isTauri()) return;
    void check(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);

  if (!isTauri()) return null;

  async function check(silent = false) {
    if (!silent) setPhase({ id: 'checking' });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      setPhase(update ? { id: 'available', version: update.version } : { id: 'current' });
    } catch (e) {
      if (!silent) setPhase({ id: 'error', message: String(e) });
    }
  }

  async function install() {
    setPhase({ id: 'installing', progress: null });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setPhase({ id: 'current' });
        return;
      }
      let total = 0;
      let got = 0;
      await update.downloadAndInstall((e: DownloadEvent) => {
        if (e.event === 'Started') total = e.data?.contentLength ?? 0;
        else if (e.event === 'Progress') {
          got += e.data?.chunkLength ?? 0;
          if (total > 0) setPhase({ id: 'installing', progress: Math.min(1, got / total) });
        } else if (e.event === 'Finished') setPhase({ id: 'installing', progress: 1 });
      });
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch (e) {
      setPhase({ id: 'error', message: String(e) });
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Desktop app</h2>
        <span className="muted">{__APP_VERSION__}</span>
      </div>
      {phase.id === 'available' ? (
        <>
          <p className="muted">Focus Den {phase.version} is ready.</p>
          <button className="btn btn-sm btn-primary" onClick={() => void install()}>
            Update &amp; restart
          </button>
        </>
      ) : phase.id === 'installing' ? (
        <p className="muted">
          {phase.progress === null
            ? 'Updating — contacting GitHub…'
            : phase.progress >= 1
              ? 'Installing — the den will restart itself…'
              : `Updating — downloading ${Math.round(phase.progress * 100)}%…`}
        </p>
      ) : (
        <div className="manage-row">
          <button
            className="btn btn-sm"
            disabled={phase.id === 'checking'}
            onClick={() => void check()}
          >
            {phase.id === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
          {phase.id === 'current' && <span className="muted setting-msg">You’re up to date ✓</span>}
          {phase.id === 'error' && (
            <span className="muted setting-msg">
              Couldn’t reach GitHub (slow or offline) — try again in a moment.
            </span>
          )}
        </div>
      )}
    </section>
  );
}
