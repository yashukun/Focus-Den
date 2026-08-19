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
  | { id: 'installing' }
  | { id: 'error'; message: string };

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
    setPhase({ id: 'installing' });
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setPhase({ id: 'current' });
        return;
      }
      await update.downloadAndInstall();
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
        <p className="muted">Updating — the den will restart itself…</p>
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
            <span className="muted setting-msg">Couldn’t check right now — try again later.</span>
          )}
        </div>
      )}
    </section>
  );
}
