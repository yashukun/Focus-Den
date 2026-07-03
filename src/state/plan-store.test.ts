import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addDays, dateString, isDateEditable, ticketsFor, weekDates } from '../core';
import { signup } from './auth';
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

// Stub the backend so signup works (auth is API-backed); state endpoints 404 so
// the background pull/push no-op — this test only exercises the store's copy logic.
function installFetch() {
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (String(url).endsWith('/api/auth/signup')) {
      const id = String(body.name).trim().toLowerCase();
      return { ok: true, status: 200, json: async () => ({ token: `t.${id}`, userId: id, name: body.name }) } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({ error: 'nf' }) } as unknown as Response;
  });
}

let seq = 0;

beforeEach(async () => {
  installStorage();
  installFetch();
  const res = await signup(`user${seq}`, `user${seq}@t.dev`, 'pass1234');
  seq += 1;
  if (res.userId) store.signIn(res.userId);
});

afterEach(() => {
  store.signOut(); // clears the debounced sync timer + resets state between tests
  vi.unstubAllGlobals();
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
