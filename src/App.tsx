/**
 * App shell: the landing page (Home) and the den itself. Inside the den:
 * header (brand → back home, live status pill, balance, theme + sound
 * toggles), tab nav, the active screen, the end-of-day summary, and (when
 * unlocked) the deep-work overlay. A single `useNow` drives the per-second
 * re-render and the store heartbeat (breather grace + auto wrap-up), so the
 * engine stays live even while you're on the landing page.
 */

import { useEffect, useRef, useState } from 'react';
import { isActive, isPristineState } from './core';
import { motionOK } from './fx';
import { isMuted, play, setMuted, setSoundscape, setSoundscapeVolume, warmup } from './audio';
import { useNow, useStore } from './state/hooks';
import { store } from './state/store';
import { ATTENTION_EVENT, hasFreshAttention } from './state/attention';
import { useTaskReminders } from './components/useTaskReminders';
import { Home } from './components/Home';
import { Dashboard, FocusDock } from './components/Dashboard';
import { RoomView } from './components/RoomView';
import { PlanView } from './components/PlanView';
import { History } from './components/History';
import { Settings } from './components/Settings';
import { SummaryModal } from './components/SummaryModal';
import { DeepWork } from './components/DeepWork';
import { DenCreator } from './components/DenCreator';
import { Onboarding } from './components/Onboarding';
import { UpdateBanner } from './components/UpdateBanner';
import { STATUS_META } from './components/statusMeta';
import { applyTheme, resolvedAppearance } from './theme';

type Tab = 'dashboard' | 'plan' | 'room' | 'history' | 'settings';
type View = 'home' | 'den';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Today', icon: '⏱' },
  { id: 'plan', label: 'Plan', icon: '🗓' },
  { id: 'room', label: 'Den', icon: '🛋' },
  { id: 'history', label: 'Stats', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const now = useNow();
  const { state, summary } = useStore();
  // The landing page is a welcome, not a toll booth: once it has been passed,
  // opening the app drops you straight into Today (the brand still goes back).
  const [view, setView] = useState<View>(() =>
    store.getState().settings.homeSeen ? 'den' : 'home',
  );
  const [tab, setTab] = useState<Tab>('dashboard');
  const [soundOn, setSoundOn] = useState(() => !isMuted());

  // The tab bar stays put and condenses to a floating icon pill once you
  // scroll a little (hysteresis so it never flaps at the boundary).
  const [navCompact, setNavCompact] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onScroll = () => setNavCompact((c) => (c ? window.scrollY > 8 : window.scrollY > 48));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Dock-style magnification for the compact pill: each icon scales by its
  // distance to the cursor (gaussian falloff), like macOS with magnify on.
  function magnifyNav(e: React.MouseEvent) {
    if (!navCompact || !motionOK()) return;
    navRef.current?.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
      const r = t.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      const s = 1 + 0.3 * Math.exp(-((d / 90) ** 2));
      t.style.transform = `translateY(${(-(s - 1) * 7).toFixed(1)}px) scale(${s.toFixed(3)})`;
    });
  }
  function resetNavMagnify() {
    navRef.current?.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
      t.style.transform = '';
    });
  }
  useEffect(() => {
    if (!navCompact) resetNavMagnify();
  }, [navCompact]);

  const { settings } = state;

  // OS reminders (scheduled task starts + breather warnings) — mounted once
  // here so they fire no matter which screen is open.
  useTaskReminders(state, now);

  // A reminder was clicked (web: notification onclick; desktop: the click
  // focuses the window). Route to the planner — PlanView consumes the
  // attention record itself and flashes the task.
  useEffect(() => {
    const route = () => {
      if (!hasFreshAttention()) return;
      setView('den');
      setTab('plan');
    };
    window.addEventListener('focus', route);
    window.addEventListener(ATTENTION_EVENT, route);
    return () => {
      window.removeEventListener('focus', route);
      window.removeEventListener(ATTENTION_EVENT, route);
    };
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
    if (settings.soundscapeOn) setSoundscape(settings.soundscape);
    else setSoundscape(null);
  }, [settings.soundscapeOn, settings.soundscape]);

  // Wake the audio engine on every pointerdown (a valid gesture): the first
  // real cue then has zero create/resume latency, and a context the OS
  // suspended (sleep, Safari backgrounding) is back before it's needed.
  useEffect(() => {
    const onDown = () => warmup();
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

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

  // Chime when a day finalizes (manual or auto wrap-up).
  const hadSummary = useRef(false);
  useEffect(() => {
    const has = summary !== null;
    if (has && !hadSummary.current) play('success');
    hadSummary.current = has;
  }, [summary]);

  // Soft nudge the moment a breather overruns and the day goes not-smooth.
  const wasClean = useRef(state.shift.clean);
  useEffect(() => {
    if (wasClean.current && !state.shift.clean) play('alert');
    wasClean.current = state.shift.clean;
  }, [state.shift.clean]);

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

  function enterDen() {
    setTab('dashboard');
    setView('den');
    store.markHomeSeen();
  }

  // First run (or a full reset): build-your-den before anything else.
  // Existing dens are never interrupted — the pristine check guards them.
  if (!settings.denSetUp && isPristineState(state)) {
    return <DenCreator state={state} />;
  }

  // Landing page — the den keeps ticking behind it.
  if (view === 'home') {
    return (
      <>
        <Home state={state} onFocus={enterDen} />
        {summary && <SummaryModal summary={summary} onClose={() => store.dismissSummary()} />}
        <UpdateBanner />
      </>
    );
  }

  const active = isActive(state.shift.status);
  const meta = STATUS_META[state.shift.status];

  return (
    <div className="app">
      <header className="app-header">
        <button
          className="brand brand-btn"
          onClick={() => setView('home')}
          title="Back to the welcome page"
          data-sound="none"
        >
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Focus&nbsp;Den</span>
        </button>

        <div className="header-right">
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

      <nav
        ref={navRef}
        className={`tabbar ${navCompact ? 'is-compact' : ''}`}
        aria-label="Primary"
        onMouseMove={magnifyNav}
        onMouseLeave={resetNavMagnify}
      >
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

      {/* key={tab} re-runs the entrance animation on every switch */}
      <main className="screen screen-enter" key={tab}>
        {tab === 'dashboard' && (
          <Dashboard
            state={state}
            now={now}
            onGoToRoom={() => setTab('room')}
            onGoToPlan={() => setTab('plan')}
          />
        )}
        {tab === 'plan' && <PlanView state={state} now={now} />}
        {tab === 'room' && <RoomView state={state} />}
        {tab === 'history' && <History state={state} now={now} />}
        {tab === 'settings' && <Settings state={state} />}
      </main>

      {/* Sibling of <main> on purpose: its entrance animation retains a
          transform, which would trap a fixed dock inside the screen. */}
      {tab === 'dashboard' && settings.focusTimer === 'dock' && (
        <FocusDock state={state} now={now} />
      )}
      {!settings.onboarded && <Onboarding />}
      {summary && <SummaryModal summary={summary} onClose={() => store.dismissSummary()} />}
      {settings.deepWork && <DeepWork state={state} now={now} />}
      <UpdateBanner />
    </div>
  );
}
