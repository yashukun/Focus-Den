import { describe, expect, it } from 'vitest';
import { coerceState } from './coerce';
import { defaultState } from './shift';
import type { State } from './types';

describe('coerceState (deep validation)', () => {
  it('round-trips a default state unchanged', () => {
    const state = defaultState();
    expect(coerceState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('round-trips a realistic populated state', () => {
    const state: State = {
      ...defaultState(),
      points: 1240,
      owned: { outfit_hoodie: true, room_mug: true },
      equipped: { outfit: 'outfit_hoodie', hair: null, accessory: null },
      history: [
        { date: '2026-07-01', worked: 3_600_000, offline: 0, breaks: 1_200_000, tasks: 3, points: 90, clean: true },
      ],
      plan: {
        tickets: {
          '2026-07-02': [
            { id: 't1', title: 'Write report', status: 'in_progress', priority: 'high', durationMin: 60, spentMs: 120_000, createdAt: 1_700_000_000_000 },
          ],
        },
      },
      tracking: { dateKey: '2026-07-02', ticketId: 't1', anchorMs: null },
    };
    expect(coerceState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('rejects non-objects and unknown versions', () => {
    expect(coerceState(null)).toBeNull();
    expect(coerceState('hi')).toBeNull();
    expect(coerceState([])).toBeNull();
    expect(coerceState({})).toBeNull();
    expect(coerceState({ v: 99 })).toBeNull();
  });

  it('clamps hostile numbers (Infinity from JSON 1e999, negatives, huge)', () => {
    const s = coerceState({ v: 2, points: Number.POSITIVE_INFINITY })!;
    expect(Number.isFinite(s.points)).toBe(true);
    expect(coerceState({ v: 2, points: -50 })!.points).toBe(0);
    expect(coerceState({ v: 2, points: 1e30 })!.points).toBe(1_000_000_000);
    const shift = coerceState({ v: 2, shift: { acc: { working: 1e308 } } })!.shift;
    expect(shift.acc.working).toBeLessThanOrEqual(40 * 24 * 3_600_000);
  });

  it('whitelists enums (bogus status/theme fall back to defaults)', () => {
    const s = coerceState({
      v: 2,
      shift: { status: 'banana' },
      settings: { theme: 'neon', appearance: 'x-ray', soundscape: 'dubstep' },
    })!;
    expect(s.shift.status).toBe('idle');
    expect(s.settings.theme).toBe('cozy');
    expect(s.settings.appearance).toBe('system');
    expect(s.settings.soundscape).toBe('rain');
  });

  it('caps oversized arrays and drops malformed entries', () => {
    const history = Array.from({ length: 5100 }, (_, i) => ({
      date: '2026-01-01', worked: 1, offline: 0, breaks: 0, tasks: 0, points: i, clean: true,
    }));
    const s = coerceState({ v: 2, history })!;
    expect(s.history.length).toBe(5000);
    expect(s.history[s.history.length - 1]?.points).toBe(5099); // keeps the most recent

    const tasks = [
      { time: 1, text: 'ok' },
      { time: 2, text: '' }, // dropped: empty
      { time: 3, text: 'x'.repeat(9000) }, // sliced
      'garbage', // dropped: not an object
    ];
    const shift = coerceState({ v: 2, shift: { tasks } })!.shift;
    expect(shift.tasks.length).toBe(2);
    expect(shift.tasks[1].text.length).toBeLessThanOrEqual(500);
  });

  it('drops malformed tickets and non-date plan keys', () => {
    const s = coerceState({
      v: 2,
      plan: {
        tickets: {
          '2026-07-02': [
            { id: 't1', title: 'Valid', status: 'todo', priority: 'med', createdAt: 1 },
            { id: '', title: 'No id', status: 'todo', priority: 'med', createdAt: 1 },
            { id: 't3', title: '   ', status: 'todo', priority: 'med', createdAt: 1 },
            { id: 't4', title: 'Bad status', status: 'exploded', priority: 'urgent', createdAt: 1 },
          ],
          'not-a-date': [{ id: 'x', title: 'Nope', status: 'todo', priority: 'med', createdAt: 1 }],
        },
      },
    })!;
    expect(Object.keys(s.plan.tickets)).toEqual(['2026-07-02']);
    const list = s.plan.tickets['2026-07-02'];
    expect(list.map((t) => t.id)).toEqual(['t1', 't4']);
    expect(list[1].status).toBe('todo'); // bogus enum defaulted
    expect(list[1].priority).toBe('med');
  });

  it('never copies __proto__/constructor keys from untrusted records', () => {
    const s = coerceState({
      v: 2,
      owned: JSON.parse('{"__proto__": true, "constructor": true, "room_mug": true}'),
      plan: { tickets: JSON.parse('{"__proto__": []}') },
    })!;
    expect(Object.keys(s.owned)).toEqual(['room_mug']);
    expect(Object.keys(s.plan.tickets)).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('nulls tracking when its target is malformed', () => {
    expect(coerceState({ v: 2, tracking: { dateKey: 'nope', ticketId: 't1' } })!.tracking).toBeNull();
    expect(coerceState({ v: 2, tracking: { dateKey: '2026-07-02' } })!.tracking).toBeNull();
    expect(coerceState({ v: 2, tracking: 'garbage' })!.tracking).toBeNull();
  });

  it('migrates a bare v1 blob to a full valid state', () => {
    const s = coerceState({ v: 1, points: 300 })!;
    expect(s.v).toBe(2);
    expect(s.points).toBe(300);
    expect(s.plan).toEqual({ tickets: {} });
    expect(s.perks).toEqual(defaultState().perks);
  });
});
