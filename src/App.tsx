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
import { STATUS_META } from './components/statusMeta';
import { applyTheme, resolvedAppearance } from './theme';

type Tab = 'dashboard' | 'plan' | 'room' | 'history' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⏱' },
  { id: 'plan', label: 'Plan', icon: '🗓' },
  { id: 'room', label: 'Room', icon: '🛋' },
  { id: 'history', label: 'History', icon: '✓' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const now = useNow();
  const { state, summary, session } = useStore();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [soundOn, setSoundOn] = useState(() => !isMuted());

  const { settings, perks } = state;

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
  if (!session) return <Login />;

  const appearance = resolvedAppearance(settings.theme, settings.appearance);

  function toggleTheme() {
    const next = appearance === 'dark' ? 'light' : 'dark';
    store.setTheme('cozy');
    store.setAppearance(next);
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
          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${appearance === 'dark' ? 'light' : 'dark'} mode`}
            title="Toggle light / dark"
            data-sound="none"
          >
            {appearance === 'dark' ? '☀' : '🌙'}
          </button>
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
