/**
 * App shell: header (brand, live status pill, balance, theme + sound toggles),
 * tab nav, the active screen, the end-of-shift summary, and (when unlocked) the
 * deep-work overlay. A single `useNow` drives the per-second re-render and the
 * store heartbeat (break grace + auto clock-out), so the engine stays live.
 */

import { useEffect, useRef, useState } from 'react';
import { isActive } from './core';
import { isMuted, play, setMuted, setSoundscape, setSoundscapeVolume } from './audio';
import { useNow, useStore } from './state/hooks';
import { confirmEmail } from './state/auth';
import { store } from './state/store';
import { Dashboard } from './components/Dashboard';
import { RoomView } from './components/RoomView';
import { PlanView } from './components/PlanView';
import { History } from './components/History';
import { Settings } from './components/Settings';
import { SummaryModal } from './components/SummaryModal';
import { DeepWork } from './components/DeepWork';
import { Onboarding } from './components/Onboarding';
import { Login } from './components/Login';
import { ResetPassword } from './components/ResetPassword';
import { STATUS_META } from './components/statusMeta';
import { applyTheme, resolvedAppearance } from './theme';

type Tab = 'dashboard' | 'plan' | 'room' | 'history' | 'settings';

/** Tokens arriving via email links (/?reset=… or /?verify=…), captured once. */
function takeUrlToken(param: 'reset' | 'verify'): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get(param);
  if (value) {
    params.delete(param);
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
  }
  return value;
}

const SYNC_LABELS = {
  synced: 'Synced with your server',
  pending: 'Saving to your server…',
  offline: 'Offline — changes saved on this device, will sync later',
  expired: 'Session expired — sign in to resume syncing',
  incompatible:
    'This device runs an outdated app version — reload the page to update and resume syncing',
} as const;

/** Inline re-login: keeps all local work, resumes syncing on success. */
function SessionExpiredBar() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setError(null);
    const res = await store.reauthenticate(password);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'Sign-in failed.');
  }

  return (
    <form className="expired-bar" onSubmit={submit}>
      <span>Your session expired — your work is safe on this device. Sign in to resume syncing:</span>
      <input
        className="input"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        aria-label="Password"
      />
      <button className="btn btn-sm btn-primary" type="submit" disabled={busy || !password}>
        {busy ? '…' : 'Sign in'}
      </button>
      {error && <span className="login-error">{error}</span>}
    </form>
  );
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⏱' },
  { id: 'plan', label: 'Plan', icon: '🗓' },
  { id: 'room', label: 'Room', icon: '🛋' },
  { id: 'history', label: 'History', icon: '✓' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const now = useNow();
  const { state, summary, session, syncStatus } = useStore();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [soundOn, setSoundOn] = useState(() => !isMuted());
  const [resetToken, setResetToken] = useState<string | null>(() => takeUrlToken('reset'));
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const { settings, perks } = state;

  // Handle an email-verification link (works signed in or out).
  useEffect(() => {
    const token = takeUrlToken('verify');
    if (!token) return;
    void confirmEmail(token).then((res) => {
      setVerifyMsg(res.ok ? 'Email verified ✓' : res.error ?? 'Verification failed.');
      if (res.ok) void store.refreshAccount();
      window.setTimeout(() => setVerifyMsg(null), 6000);
    });
  }, []);

  // Apply the active theme + appearance.
  useEffect(() => {
    applyTheme(settings.theme, settings.appearance);
  }, [settings.theme, settings.appearance]);

  // Keep the ambient volume in sync (declared first so a fresh soundscape
  // starts at the right level).
  useEffect(() => {
    setSoundscapeVolume(settings.soundscapeVolume);
  }, [settings.soundscapeVolume]);

  // Start/stop the ambient soundscape.
  useEffect(() => {
    if (perks.soundscape && settings.soundscapeOn) setSoundscape(settings.soundscape);
    else setSoundscape(null);
  }, [perks.soundscape, settings.soundscapeOn, settings.soundscape]);

  // Cozy click feedback for every button — data-sound picks a richer cue.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement | null)?.closest('button');
      if (!btn || (btn as HTMLButtonElement).disabled) return;
      const name = btn.dataset.sound;
      if (name === 'none') return;
      play((name as Parameters<typeof play>[0]) || 'click');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  // Chime when a shift finalizes (manual or auto clock-out).
  const hadSummary = useRef(false);
  useEffect(() => {
    const has = summary !== null;
    if (has && !hadSummary.current) play('success');
    hadSummary.current = has;
  }, [summary]);

  // Soft nudge the moment a break overruns and the shift goes not-clean.
  const wasClean = useRef(state.shift.clean);
  useEffect(() => {
    if (wasClean.current && !state.shift.clean) play('alert');
    wasClean.current = state.shift.clean;
  }, [state.shift.clean]);

  // Auth gate — all hooks above run unconditionally so order stays stable.
  // A reset link takes precedence over everything (it must work signed out).
  if (resetToken) return <ResetPassword token={resetToken} onDone={() => setResetToken(null)} />;
  if (!session) return <Login />;

  const appearance = resolvedAppearance(settings.theme, settings.appearance);

  // Only meaningful on Cozy — Midnight/Sunrise are fixed palettes, so the
  // header toggle is hidden for them (Settings disables appearance the same way).
  function toggleTheme() {
    store.setAppearance(appearance === 'dark' ? 'light' : 'dark');
  }

  function toggleSound() {
    const next = !soundOn;
    setMuted(!next);
    setSoundOn(next);
    if (next) play('click');
  }

  const active = isActive(state.shift.status);
  const meta = STATUS_META[state.shift.status];

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Focus&nbsp;Den</span>
        </div>

        <div className="header-right">
          <span
            className={`sync-dot sync-${syncStatus}`}
            title={SYNC_LABELS[syncStatus]}
            role="status"
            aria-label={SYNC_LABELS[syncStatus]}
          />
          <button
            className="header-user"
            onClick={() => setTab('settings')}
            title={`Signed in as ${session.name} — account settings`}
            data-sound="none"
          >
            <span className="header-user-dot" aria-hidden="true" />
            <span className="header-user-name">{session.name}</span>
          </button>
          {active && (
            <span className={`status-pill tone-${meta.tone}`}>
              <span className="status-dot" aria-hidden="true" />
              {meta.label}
            </span>
          )}
          <span className="header-balance mono tone-points" title="Points balance">
            ◈ {state.points}
          </span>
          {settings.theme === 'cozy' && (
            <button
              className="btn btn-ghost btn-icon"
              onClick={toggleTheme}
              aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}
              title="Toggle light / dark"
              data-sound="none"
            >
              {appearance === 'dark' ? '☀' : '🌙'}
            </button>
          )}
          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? 'Mute sounds' : 'Unmute sounds'}
            title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
            data-sound="none"
          >
            {soundOn ? '🔊' : '🔇'}
          </button>
        </div>
      </header>

      {syncStatus === 'expired' && <SessionExpiredBar />}
      {verifyMsg && <div className="verify-banner">{verifyMsg}</div>}

      <nav className="tabbar" aria-label="Primary">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'is-active' : ''}`}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon" aria-hidden="true">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="screen">
        {tab === 'dashboard' && (
          <Dashboard state={state} now={now} onGoToRoom={() => setTab('room')} />
        )}
        {tab === 'plan' && <PlanView state={state} now={now} />}
        {tab === 'room' && <RoomView state={state} />}
        {tab === 'history' && <History state={state} now={now} />}
        {tab === 'settings' && <Settings state={state} session={session} />}
      </main>

      {!settings.onboarded && <Onboarding />}
      {summary && <SummaryModal summary={summary} onClose={() => store.dismissSummary()} />}
      {settings.deepWork && <DeepWork state={state} now={now} />}
    </div>
  );
}
