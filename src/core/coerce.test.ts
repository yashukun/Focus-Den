import { describe, expect, it } from 'vitest';
import { coerceState } from './coerce';
import { clampPlacement, type PerchCtx } from './den';
import { getItem } from './items';
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
            { id: 't1', title: 'Write report', status: 'in_progress', priority: 'high', durationMin: 60, createdAt: 1_700_000_000_000 },
          ],
        },
      },
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
    expect(s.settings.appearance).toBe('light'); // light is the default look
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

  it('accepts the blocked status and critical priority, defaults the rest', () => {
    const s = coerceState({
      v: 2,
      plan: {
        tickets: {
          '2026-07-02': [
            { id: 't1', title: 'A', status: 'blocked', priority: 'critical', createdAt: 1 },
          ],
        },
      },
    })!;
    expect(s.plan.tickets['2026-07-02'][0].status).toBe('blocked');
    expect(s.plan.tickets['2026-07-02'][0].priority).toBe('critical');
  });

  it('bounds descHtml and drops retired fields (sanitization is a UI concern)', () => {
    const s = coerceState({
      v: 2,
      plan: {
        tickets: {
          '2026-07-02': [
            {
              id: 't1',
              title: 'A',
              status: 'todo',
              priority: 'med',
              createdAt: 1,
              descHtml: `<p>ok</p>${'x'.repeat(500_000)}`,
              deadlineMs: 1_754_000_000_000, // retired feature — never survives
            },
            {
              id: 't2',
              title: 'B',
              status: 'todo',
              priority: 'med',
              createdAt: 1,
              descHtml: 42,
            },
            {
              id: 't3',
              title: 'C',
              status: 'todo',
              priority: 'med',
              createdAt: 1,
              descHtml: '   ',
            },
          ],
        },
      },
    })!;
    const [a, b, c] = s.plan.tickets['2026-07-02'];
    expect(a.descHtml!.length).toBeLessThanOrEqual(400_000);
    expect(a).not.toHaveProperty('deadlineMs');
    expect(b.descHtml).toBeUndefined();
    expect(c.descHtml).toBeUndefined(); // whitespace-only collapses away
  });

  it('clamps scheduled start times into the day and drops garbage ones', () => {
    const base = { title: 'A', status: 'todo', priority: 'med', createdAt: 1 };
    const s = coerceState({
      v: 2,
      plan: {
        tickets: {
          '2026-07-02': [
            { ...base, id: 't1', startMin: 555.4 },
            { ...base, id: 't2', startMin: 99_999 },
            { ...base, id: 't3', startMin: -30 },
            { ...base, id: 't4', startMin: '9am' },
            { ...base, id: 't5', startMin: Infinity },
            { ...base, id: 't6' },
          ],
        },
      },
    })!;
    const [a, b, c, d, e, f] = s.plan.tickets['2026-07-02'];
    expect(a.startMin).toBe(555); // rounded
    expect(b.startMin).toBe(1439); // clamped to the last minute of the day
    expect(c.startMin).toBe(0);
    expect(d.startMin).toBeUndefined();
    expect(e.startMin).toBeUndefined();
    expect(f.startMin).toBeUndefined();
  });

  it('whitelists Today-page widgets, dedupes, and always keeps the focus hero', () => {
    const s = coerceState({
      v: 2,
      settings: { dashWidgets: ['clock', 'banana', 'clock', 42, 'note', { evil: 1 }] },
    })!;
    expect(s.settings.dashWidgets).toEqual(['focus', 'clock', 'note']);

    // Garbage shapes fall back to the default layout.
    expect(coerceState({ v: 2, settings: { dashWidgets: 'all of them' } })!.settings.dashWidgets)
      .toEqual(defaultState().settings.dashWidgets);
    expect(coerceState({ v: 2 })!.settings.dashWidgets).toEqual(defaultState().settings.dashWidgets);

    // An explicitly empty layout still gets the focus hero back.
    expect(coerceState({ v: 2, settings: { dashWidgets: [] } })!.settings.dashWidgets).toEqual(['focus']);
  });

  it('caps the Today-page note and drops non-string notes', () => {
    const long = coerceState({ v: 2, settings: { dashNote: 'x'.repeat(9000) } })!;
    expect(long.settings.dashNote.length).toBe(2000);
    expect(coerceState({ v: 2, settings: { dashNote: 42 } })!.settings.dashNote).toBe('');
    expect(coerceState({ v: 2, settings: { dashNote: 'keep me' } })!.settings.dashNote).toBe('keep me');
  });

  it('whitelists den variants, body preset, and clamps placements to zones', () => {
    const s = coerceState({
      v: 2,
      den: { desk: 'desk_walnut', chair: 'chair_spaceship', window: 42 },
      character: { body: 'fem' },
      placements: {
        room_mug: { x: 500, y: -80 },            // clamps into the desk band
        room_plant: { x: 40, y: 500 },           // clamps to the floor zone
        room_cat: { x: 0, y: 140 },              // snaps to its nearest perch
        room_string_lights: { x: 10, y: 10 },    // not movable — dropped
        nonsense_item: { x: 1, y: 1 },           // unknown — dropped
        room_lamp: { x: 'left', y: 60 },         // garbage coords — dropped
      },
    })!;
    expect(s.den.desk).toBe('desk_walnut');
    expect(s.den.chair).toBe('chair_office'); // bogus id fell back
    expect(s.den.window).toBe('window_classic');
    expect(s.character.body).toBe('fem');
    expect(s.placements.room_mug).toEqual({ x: 122, y: 75 }); // 132 - w(10), desk y locked
    expect(s.placements.room_plant.y).toBe(108); // floor standY2(142) - h(34)
    expect(s.placements.room_cat).toEqual({ x: 2, y: 124 }); // front-floor perch
    expect(s.placements.room_string_lights).toBeUndefined();
    expect(s.placements.nonsense_item).toBeUndefined();
    expect(s.placements.room_lamp).toBeUndefined();
  });

  it('whitelists the Today-page layout overrides (cols, sizes, focus mode)', () => {
    const s = coerceState({
      v: 2,
      settings: {
        dashCols: { clock: 'main', den: 'sideways', nonsense: 'main', week: 42 },
        dashSizes: { clock: 'sm', plan: 'xl' },
        focusTimer: 'card',
      },
    })!;
    expect(s.settings.dashCols).toEqual({ clock: 'main' });
    expect(s.settings.dashSizes).toEqual({ clock: 'sm' });
    expect(s.settings.focusTimer).toBe('card');
    // garbage → defaults
    const d = coerceState({ v: 2, settings: { dashCols: 'no', focusTimer: 'huge' } })!;
    expect(d.settings.dashCols).toEqual({});
    expect(d.settings.focusTimer).toBe('dock');
  });

  it('keeps the dock corner + landing flag, and drops nonsense ones', () => {
    const s = coerceState({ v: 2, settings: { focusDockPos: 'right', homeSeen: true } })!;
    expect(s.settings.focusDockPos).toBe('right');
    expect(s.settings.homeSeen).toBe(true);
    const d = coerceState({ v: 2, settings: { focusDockPos: 'ceiling', homeSeen: 'yes' } })!;
    expect(d.settings.focusDockPos).toBe('left');
    expect(d.settings.homeSeen).toBe(false);
  });

  it('keeps a sane presence stamp on the shift and drops garbage', () => {
    const at = 1_754_000_000_000;
    expect(coerceState({ v: 2, shift: { status: 'working', lastSeen: at } })!.shift.lastSeen).toBe(at);
    expect(coerceState({ v: 2, shift: { status: 'working', lastSeen: 'now' } })!.shift.lastSeen)
      .toBeUndefined();
    expect(coerceState({ v: 2, shift: { status: 'working', lastSeen: Infinity } })!.shift.lastSeen)
      .toBeUndefined();
  });

  it('snaps the cat to its nearest perch (desk / floor / sill / shelf)', () => {
    const cat = getItem('room_cat')!;
    const ctx: PerchCtx = { windowId: 'window_classic', shelfAt: { x: 135, y: 54 } };
    // near the desk band → sits on the desk at sitting height
    expect(clampPlacement(cat, 60, 70, ctx)).toEqual({ x: 60, y: 68 });
    // low and central → stands on the open floor in front of the desk
    expect(clampPlacement(cat, 60, 120, ctx)).toEqual({ x: 60, y: 120 });
    // up by the window → the sill (y = sill top 52 − h 18)
    expect(clampPlacement(cat, 20, 30, ctx)).toEqual({ x: 20, y: 34 });
    // up by the bookshelf → its top, slight overhang allowed
    expect(clampPlacement(cat, 140, 30, ctx)).toEqual({ x: 135, y: 36 });
    // no shelf owned → the same drop point falls back to another perch
    const noShelf = clampPlacement(cat, 140, 30, { ...ctx, shelfAt: null })!;
    expect(noShelf.y).not.toBe(36);
    // no ctx at all (legacy callers) → plain desk behavior
    expect(clampPlacement(cat, 60, 120)).toEqual({ x: 60, y: 68 });
  });

  it('defaults den config + placements for older saves (the classic den)', () => {
    const s = coerceState({ v: 2, points: 10 })!;
    expect(s.den).toEqual(defaultState().den);
    expect(s.character).toEqual({ body: 'masc', shirt: 'shirt_tan' });
    expect(s.placements).toEqual({});
    expect(s.settings.denSetUp).toBe(false);
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

  it('keeps the task stopwatch fields, drops the truly retired ones', () => {
    const s = coerceState({
      v: 2,
      tracking: { dateKey: '2026-07-02', ticketId: 't1', anchorMs: 5 },
      plan: {
        tickets: {
          '2026-07-02': [
            {
              id: 't1',
              title: 'A',
              status: 'in_progress',
              priority: 'med',
              createdAt: 1,
              spentMs: 9000,
              inProgressSince: 1_700_000_000_000,
              notified: true,
            },
            // hostile stopwatch values clamp/drop
            { id: 't2', title: 'B', status: 'todo', priority: 'med', createdAt: 1, spentMs: -5, inProgressSince: Infinity },
          ],
        },
      },
    })!;
    expect('tracking' in s).toBe(false);
    const [a, b] = s.plan.tickets['2026-07-02'];
    expect(a.spentMs).toBe(9000); // spentMs came back in v2.7 (the task stopwatch)
    expect(a.inProgressSince).toBe(1_700_000_000_000);
    expect((a as unknown as Record<string, unknown>).notified).toBeUndefined();
    expect(b.spentMs).toBeUndefined(); // clamped to 0 -> omitted
    expect(b.inProgressSince).toBeUndefined();
  });

  it('migrates a bare v1 blob to a full valid state', () => {
    const s = coerceState({ v: 1, points: 300 })!;
    expect(s.v).toBe(2);
    expect(s.points).toBe(300);
    expect(s.plan).toEqual({ tickets: {} });
    expect(s.perks).toEqual(defaultState().perks);
  });
});
