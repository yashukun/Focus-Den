/**
 * Desktop-only update nudge. Checks GitHub Releases on launch, every few
 * hours while the app is open, AND whenever the window regains focus (a
 * release published while the app sat open used to go unnoticed for up to a
 * whole recheck cycle — now clicking back into the den is enough). Focus
 * checks are throttled so alt-tabbing doesn't hammer GitHub. When a newer
 * build exists, a quiet dismissible toast offers "Update & restart". Never
 * interrupts: no auto-restart, and "Later" hides it until the next launch.
 * Settings keeps its manual card (DesktopUpdate) for on-demand checks.
 */

import { useEffect, useState } from 'react';
import { isTauri } from '../state/desktop';

const RECHECK_MS = 4 * 60 * 60 * 1000;
/** minimum gap between focus-triggered checks */
const FOCUS_GAP_MS = 10 * 60 * 1000;

type Phase = 'idle' | 'available' | 'installing' | 'dismissed';

export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    let lastCheck = 0;
    const check = async (force: boolean) => {
      if (!force && Date.now() - lastCheck < FOCUS_GAP_MS) return;
      lastCheck = Date.now();
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
    void check(true);
    const id = window.setInterval(() => void check(true), RECHECK_MS);
    const onFocus = () => void check(false);
    const onVisible = () => {
      if (!document.hidden) void check(false);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
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
