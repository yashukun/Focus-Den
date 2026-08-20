import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { addDays, dateString, isDateEditable, ticketsFor, weekDates } from '../core';
import { store } from './store';

function installStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

beforeEach(() => {
  installStorage();
  store.resetAll(); // fresh state between tests
});

afterEach(() => {
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('store: adding intentions', () => {
  it('rejects duplicate titles on the same day (case-insensitive)', () => {
    const today = dateString(Date.now());
    expect(store.addPlanTicket(today, { title: 'Read a chapter' })).toBe('added');
    expect(store.addPlanTicket(today, { title: '  read a CHAPTER ' })).toBe('duplicate');
    expect(ticketsFor(store.getState().plan, today)).toHaveLength(1);
    // Same title on another day is fine.
    expect(store.addPlanTicket(addDays(today, 1), { title: 'Read a chapter' })).toBe('added');
  });

  it('rejects empty titles and locked days', () => {
    const today = dateString(Date.now());
    expect(store.addPlanTicket(today, { title: '   ' })).toBe('invalid');
    expect(store.addPlanTicket(addDays(today, -1), { title: 'Too late' })).toBe('invalid');
  });
});

describe('store: task fields (rich description)', () => {
  it('stores and clears the description through add/update', () => {
    const today = dateString(Date.now());
    store.addPlanTicket(today, { title: 'Spec', descHtml: '<p>hello</p>' });
    let t = ticketsFor(store.getState().plan, today)[0];
    expect(t.descHtml).toBe('<p>hello</p>');

    store.updatePlanTicket(today, t.id, { descHtml: undefined });
    t = ticketsFor(store.getState().plan, today)[0];
    expect(t.descHtml).toBeUndefined();
  });
});

describe('store: status changes', () => {
  it('statuses flip freely — no shift or timer required', () => {
    const today = dateString(Date.now());
    store.addPlanTicket(today, { title: 'Deep work' });
    const id = ticketsFor(store.getState().plan, today)[0].id;

    store.setPlanStatus(today, id, 'in_progress');
    expect(ticketsFor(store.getState().plan, today)[0].status).toBe('in_progress');

    store.setPlanStatus(today, id, 'blocked');
    expect(ticketsFor(store.getState().plan, today)[0].status).toBe('blocked');
  });
});

describe('store: end-of-day carry (move unfinished to tomorrow)', () => {
  it('moves only not-done intentions, leaving completed ones as the record', () => {
    const today = dateString(Date.now());
    const tomorrow = addDays(today, 1);
    store.addPlanTicket(today, { title: 'Done thing' });
    store.addPlanTicket(today, { title: 'Missed thing' });
    const doneId = ticketsFor(store.getState().plan, today)[0].id;
    store.setPlanStatus(today, doneId, 'done');

    const moved = store.moveUnfinishedToNextDay(today);

    expect(moved).toBe(1);
    expect(ticketsFor(store.getState().plan, today).map((t) => t.title)).toEqual(['Done thing']);
    expect(ticketsFor(store.getState().plan, tomorrow).map((t) => t.title)).toEqual(['Missed thing']);
  });

  it('skips intentions tomorrow already has (by title) and reports 0 when nothing moves', () => {
    const today = dateString(Date.now());
    const tomorrow = addDays(today, 1);
    store.addPlanTicket(today, { title: 'Repeat' });
    store.addPlanTicket(tomorrow, { title: 'repeat' }); // same title, case-insensitive

    expect(store.moveUnfinishedToNextDay(today)).toBe(0);
    expect(ticketsFor(store.getState().plan, today)).toHaveLength(1); // stays put
    expect(ticketsFor(store.getState().plan, tomorrow)).toHaveLength(1); // no duplicate
  });
});

describe('store: Today-page layout', () => {
  it('replaces the layout, dropping unknown ids and duplicates, keeping focus', () => {
    store.setDashWidgets(['clock', 'note', 'clock']);
    expect(store.getState().settings.dashWidgets).toEqual(['focus', 'clock', 'note']);

    store.setDashWidgets(['den', 'focus', 'week']);
    expect(store.getState().settings.dashWidgets).toEqual(['den', 'focus', 'week']);
  });

  it('stores and caps the sticky note', () => {
    store.setDashNote('milk, eggs');
    expect(store.getState().settings.dashNote).toBe('milk, eggs');
    store.setDashNote('y'.repeat(5000));
    expect(store.getState().settings.dashNote.length).toBe(2000);
  });
});

describe('store: plan duplication', () => {
  it('copies a day to the next day', () => {
    const today = dateString(Date.now());
    const tomorrow = addDays(today, 1);
    store.addPlanTicket(today, { title: 'A' });
    store.addPlanTicket(today, { title: 'B' });

    store.copyPlanDayToNextDay(today);

    expect(ticketsFor(store.getState().plan, today)).toHaveLength(2); // source untouched
    expect(ticketsFor(store.getState().plan, tomorrow).map((t) => t.title)).toEqual(['A', 'B']);
    // copies are fresh "to do"
    expect(ticketsFor(store.getState().plan, tomorrow).every((t) => t.status === 'todo')).toBe(true);
  });

  it('does not create duplicates when copied repeatedly (idempotent)', () => {
    const today = dateString(Date.now());
    const tomorrow = addDays(today, 1);
    store.addPlanTicket(today, { title: 'A' });
    store.addPlanTicket(today, { title: 'B' });

    store.copyPlanDayToNextDay(today);
    const second = store.copyPlanDayToNextDay(today); // same titles already there

    expect(second.tickets).toBe(0);
    expect(ticketsFor(store.getState().plan, tomorrow)).toHaveLength(2); // not 4

    // Copy → week is likewise idempotent.
    store.copyPlanDayToWeek(today);
    store.copyPlanDayToWeek(today);
    for (const day of weekDates(today)) {
      if (day === today || !isDateEditable(day, today)) continue;
      expect(ticketsFor(store.getState().plan, day).length).toBeLessThanOrEqual(2);
    }
  });

  it('copies a day to the week WITHOUT touching past days', () => {
    const today = dateString(Date.now());
    store.addPlanTicket(today, { title: 'A' });

    store.copyPlanDayToWeek(today);

    const plan = store.getState().plan;
    for (const day of weekDates(today)) {
      const count = ticketsFor(plan, day).length;
      if (day === today) {
        expect(count).toBe(1); // source unchanged
      } else if (isDateEditable(day, today)) {
        expect(count).toBe(1); // upcoming day got a copy
      } else {
        expect(count).toBe(0); // past day untouched
      }
    }
  });
});

describe('store: den personalization', () => {
  it('swaps furniture variants with whitelist validation', () => {
    store.setDenPart('desk', 'desk_white');
    expect(store.getState().den.desk).toBe('desk_white');
    store.setDenPart('desk', 'desk_spaceship' as never); // bogus → ignored
    expect(store.getState().den.desk).toBe('desk_white');
    store.setBody('fem');
    expect(store.getState().character.body).toBe('fem');
  });

  it('places movable items clamped to their surface zone', () => {
    store.placeItem('room_mug', 500, 20); // desk item: x clamps, y locks
    expect(store.getState().placements.room_mug).toEqual({ x: 122, y: 75 });
    store.placeItem('room_posters', 10, 40); // wall: free 2D within the wall
    expect(store.getState().placements.room_posters).toEqual({ x: 10, y: 40 });
    store.placeItem('room_string_lights', 5, 5); // not movable → ignored
    expect(store.getState().placements.room_string_lights).toBeUndefined();
    store.resetPlacements();
    expect(store.getState().placements).toEqual({});
  });

  it('marks the den creator as completed once', () => {
    expect(store.getState().settings.denSetUp).toBe(false);
    store.completeDenSetup();
    expect(store.getState().settings.denSetUp).toBe(true);
  });
});
