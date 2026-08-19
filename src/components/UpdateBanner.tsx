/**
 * Desktop-only update nudge. Checks GitHub Releases on launch and every few
 * hours while the app is open; when a newer build exists, a quiet dismissible
 * toast offers "Update & restart". Never interrupts: no auto-restart, and
 * "Later" hides it until the next launch. Settings keeps its manual card
 * (DesktopUpdate) for on-demand checks.
 */

import { useEffect, useState } from 'react';
import { isTauri } from '../state/desktop';

const RECHECK_MS = 4 * 60 * 60 * 1000;

type Phase = 'idle' | 'available' | 'installing' | 'dismissed';

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const check = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (alive && update) {
          setVersion(update.version);
          setPhase((p) => (p === 'dismissed' || p === 'installing' ? p : 'available'));
        }
      } catch {
        // offline / rate-limited — try again next cycle
      }
    };
    void check();
    const id = window.setInterval(() => void check(), RECHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  if (!isTauri() || phase === 'idle' || phase === 'dismissed') return null;

  async function install() {
    setPhase('installing');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setPhase('dismissed');
        return;
      }
      await update.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setPhase('available'); // failed — leave the offer up for another try
    }
  }

  return (
    <div className="update-banner" role="status">
      {phase === 'installing' ? (
        <span className="update-banner-text">Updating — the den will restart itself…</span>
      ) : (
        <>
          <span className="update-banner-text">Focus Den {version} is ready.</span>
          <button className="btn btn-sm btn-primary" onClick={() => void install()}>
            Update &amp; restart
          </button>
          <button className="btn btn-sm" data-sound="none" onClick={() => setPhase('dismissed')}>
            Later
          </button>
        </>
      )}
    </div>
  );
}
