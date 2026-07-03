/**
 * Render smoke tests: every screen must render to markup without throwing,
 * across idle / active / done states and with owned cosmetics + history. This
 * guards against prop / hook crashes that unit tests on the core won't catch.
 */

import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';

import { defaultState, HOUR_MS, MINUTE_MS, type ShiftState, type State } from './core';
import { Dashboard } from './components/Dashboard';
import { Shop } from './components/Shop';
import { RoomView } from './components/RoomView';
import { PlanView } from './components/PlanView';
import { History } from './components/History';
import { SummaryModal } from './components/SummaryModal';
import { Settings } from './components/Settings';
import { DeepWork } from './components/DeepWork';
import { Login } from './components/Login';
import { RoomScene } from './room/RoomScene';
import App from './App';

const NOW = new Date(2026, 0, 5, 14, 0).getTime(); // Mon 2pm

function idleState(): State {
  return {
    ...defaultState(),
    points: 230,
    owned: { room_plant: true, acc_headphones: true },
    equipped: { outfit: null, hair: null, accessory: 'acc_headphones' },
    week: { key: '2026-01-05', days: { 0: true, 1: true }, perfectAwarded: false },
    history: [
      { date: '2026-01-03', worked: 8 * HOUR_MS, offline: 0, breaks: 40 * MINUTE_MS, tasks: 4, points: 130, clean: true },
    ],
  };
}

function activeShift(): ShiftState {
  return {
    date: '2026-01-05',
    status: 'working',
    clockIn: NOW - 2 * HOUR_MS,
    statusStart: NOW - 10 * MINUTE_MS,
    acc: { working: 90 * MINUTE_MS, break1: 5 * MINUTE_MS, break2: 0, lunch: 0, offline: 0 },
    breakUsed: { break1: 5 * MINUTE_MS, break2: 0, lunch: 0 },
    tasks: [
      { time: NOW - 80 * MINUTE_MS, text: 'Reviewed PR' },
      { time: NOW - 30 * MINUTE_MS, text: 'Shipped fix' },
    ],
    clean: true,
  };
}

describe('render smoke', () => {
  it('renders the room scene with and without cosmetics', () => {
    expect(
      renderToString(<RoomScene owned={{}} equipped={{ outfit: null, hair: null, accessory: null }} />),
    ).toContain('<svg');
    const full = renderToString(
      <RoomScene
        owned={{
          room_plant: true,
          room_lamp: true,
          room_rug: true,
          room_cat: true,
          room_string_lights: true,
          room_rain: true,
          room_dualmon: true,
          room_bookshelf: true,
        }}
        equipped={{ outfit: 'outfit_glow', hair: 'hair_long', accessory: 'acc_headphones' }}
      />,
    );
    expect(full).toContain('<svg');
  });

  it('renders the full App (shows the login gate when signed out)', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Focus');
    expect(html).toContain('Create account');
  });

  it('renders the Login screen', () => {
    const html = renderToString(<Login />);
    expect(html).toContain('Sign in');
    expect(html).toContain('Password');
  });

  it('renders the Dashboard in idle and active states', () => {
    const idle = renderToString(<Dashboard state={idleState()} now={NOW} onGoToRoom={() => {}} />);
    expect(idle).toContain('Ready to focus');

    const active: State = { ...idleState(), shift: activeShift() };
    const html = renderToString(<Dashboard state={active} now={NOW} onGoToRoom={() => {}} />);
    expect(html).toContain('Working');
    expect(html).toContain('Breaks');
  });

  it('renders Shop, RoomView and History', () => {
    const s = idleState();
    expect(renderToString(<Shop state={s} />)).toContain('Shop');
    const room = renderToString(<RoomView state={s} />);
    expect(room).toContain('Character');
    expect(room).toContain('Customize');
    expect(room).toContain('Shop');
    expect(renderToString(<History state={s} now={NOW} />)).toContain('History');
  });

  it('renders the Plan calendar', () => {
    const html = renderToString(<PlanView state={idleState()} now={NOW} />);
    expect(html).toContain('Mon');
    expect(html).toContain('Goal for the day');
  });

  it('renders the summary modal', () => {
    const html = renderToString(
      <SummaryModal
        summary={{
          date: '2026-01-05',
          workedMs: 9 * HOUR_MS,
          offlineMs: 12 * MINUTE_MS,
          breakMs: { break1: 20 * MINUTE_MS, break2: 18 * MINUTE_MS, lunch: 50 * MINUTE_MS },
          taskCount: 5,
          clean: false,
          points: { workedPoints: 90, cleanBonus: 0, taskBonus: 20, subtotal: 110 },
          perfectWeekBonus: 200,
          totalPoints: 310,
          newBalance: 540,
        }}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('Shift complete');
    expect(html).toContain('Perfect week');
  });

  it('renders Settings (with owned perks) and the deep-work overlay', () => {
    const s: State = {
      ...idleState(),
      perks: { ...idleState().perks, soundscape: true, themeMidnight: true, deepWork: true },
    };
    const settings = renderToString(
      <Settings state={s} session={{ userId: 'sam', name: 'Sam', isAdmin: true, email: 'sam@t.dev', emailVerified: true }} />,
    );
    expect(settings).toContain('Settings');
    expect(settings).toContain('Sign out');
    expect(settings).toContain('Reset everything');

    const active: State = { ...s, settings: { ...s.settings, deepWork: true }, shift: activeShift() };
    expect(renderToString(<DeepWork state={active} now={NOW} />)).toContain('Deep work');
  });

  it('renders History analytics with completed shifts', () => {
    const s: State = {
      ...idleState(),
      perks: { ...idleState().perks, streakFreeze: 1 },
    };
    const html = renderToString(<History state={s} now={NOW} />);
    expect(html).toContain('Analytics');
    expect(html).toContain('Streak freeze');
  });
});
