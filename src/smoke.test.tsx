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
import { Home } from './components/Home';
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

  it('renders the full App (opens on the landing page)', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Focus');
    expect(html).toContain('A cozy corner for deep focus');
  });

  it('renders the Home landing page with the Focus call to action', () => {
    const html = renderToString(<Home state={idleState()} onFocus={() => {}} />);
    expect(html).toContain('Focus');
    expect(html).toContain('One gentle ritual');
  });

  it('renders the Dashboard in idle and active states', () => {
    const idle = renderToString(
      <Dashboard state={idleState()} now={NOW} onGoToRoom={() => {}} onGoToPlan={() => {}} />,
    );
    expect(idle).toContain('Your den is ready');
    expect(idle).toContain('Settle in');
    expect(idle).toContain('Today’s plan'); // the plan widget shows before settling in
    expect(idle).not.toContain('Breathers'); // mid-day cards sleep while idle

    const active: State = { ...idleState(), shift: activeShift() };
    const html = renderToString(
      <Dashboard state={active} now={NOW} onGoToRoom={() => {}} onGoToPlan={() => {}} />,
    );
    expect(html).toContain('In flow');
    expect(html).toContain('Breathers');
    expect(html).toContain('Wins');
    expect(html).toContain('Today’s plan');
  });

  it('renders today’s planned tasks, and the report + tomorrow once the day ends', () => {
    const planned: State = {
      ...idleState(),
      plan: {
        tickets: {
          '2026-01-05': [
            { id: 'a', title: 'Ship the fix', status: 'done', priority: 'high', createdAt: 1 },
            { id: 'b', title: 'Write the doc', status: 'todo', priority: 'med', createdAt: 2 },
          ],
          '2026-01-06': [
            { id: 'c', title: 'Plan sprint', status: 'todo', priority: 'med', createdAt: 3, startMin: 540 },
          ],
        },
      },
    };

    const midday = renderToString(
      <Dashboard state={planned} now={NOW} onGoToRoom={() => {}} onGoToPlan={() => {}} />,
    );
    expect(midday).toContain('Ship the fix');
    expect(midday).toContain('1 of 2 completed');

    const ended: State = {
      ...planned,
      shift: { ...activeShift(), status: 'ended', statusStart: null },
    };
    const done = renderToString(
      <Dashboard state={ended} now={NOW} onGoToRoom={() => {}} onGoToPlan={() => {}} />,
    );
    expect(done).toContain('Today’s report');
    expect(done).toContain('Not completed');
    expect(done).toContain('Write the doc');
    expect(done).toContain('Move to tomorrow');
    expect(done).toContain('Tomorrow');
    expect(done).toContain('Plan sprint');
  });

  it('renders the customize mode widgets (clock + note) when enabled', () => {
    const s = idleState();
    const custom: State = {
      ...s,
      settings: {
        ...s.settings,
        dashWidgets: ['focus', 'clock', 'note'],
        dashNote: 'remember the milk',
      },
    };
    const html = renderToString(
      <Dashboard state={custom} now={NOW} onGoToRoom={() => {}} onGoToPlan={() => {}} />,
    );
    expect(html).toContain('clock-time');
    expect(html).toContain('remember the milk');
    expect(html).not.toContain('Today’s plan'); // hidden widgets stay hidden
    expect(html).toContain('Customize');
  });

  it('renders Shop, RoomView and the Journal', () => {
    const s = idleState();
    expect(renderToString(<Shop state={s} />)).toContain('Shop');
    const room = renderToString(<RoomView state={s} />);
    expect(room).toContain('Character');
    expect(room).toContain('Customize');
    expect(room).toContain('Shop');
    expect(renderToString(<History state={s} now={NOW} />)).toContain('Journal');
  });

  it('renders the Plan calendar, composer and empty state', () => {
    const html = renderToString(<PlanView state={idleState()} now={NOW} />);
    expect(html).toContain('Mo'); // weekday header
    expect(html).toContain('Add a task');
    expect(html).toContain('Nothing here yet');
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
    expect(html).toContain('Day complete');
    expect(html).toContain('Perfect week');
  });

  it('renders Settings and the deep-work overlay', () => {
    const s: State = {
      ...idleState(),
      perks: { ...idleState().perks, themeMidnight: true, deepWork: true },
    };
    const settings = renderToString(<Settings state={s} />);
    expect(settings).toContain('Settings');
    expect(settings).toContain('Soundscape');
    expect(settings).toContain('Reset everything');

    const active: State = { ...s, settings: { ...s.settings, deepWork: true }, shift: activeShift() };
    expect(renderToString(<DeepWork state={active} now={NOW} />)).toContain('Deep work');
  });

  it('renders Journal analytics with completed days', () => {
    const s: State = {
      ...idleState(),
      perks: { ...idleState().perks, streakFreeze: 1 },
    };
    const html = renderToString(<History state={s} now={NOW} />);
    expect(html).toContain('Rhythms');
    expect(html).toContain('Streak freeze');
    expect(html).toContain('Day by day');
    expect(html).toContain('days settled in'); // the all-time stat strip
  });
});
