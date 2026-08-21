import { describe, expect, it } from 'vitest';

import {
  addTicket,
  dueScheduledTickets,
  freshPlan,
  isDateEditable,
  liveSpentMs,
  moveTicketToDay,
  moveTicketToNextDay,
  removeTicket,
  sortDayTickets,
  statusPatch,
  ticketsFor,
  updateTicket,
  type PlanState,
  type PlanTicket,
} from './index';

const TODAY = '2026-06-30';
const FUTURE = '2026-07-01';
const PAST = '2026-06-29';

function tk(id: string, over: Partial<PlanTicket> = {}): PlanTicket {
  return { id, title: `task ${id}`, status: 'todo', priority: 'med', createdAt: 0, ...over };
}

describe('plan: editability', () => {
  it('locks past days, allows today and future', () => {
    expect(isDateEditable(TODAY, TODAY)).toBe(true);
    expect(isDateEditable(FUTURE, TODAY)).toBe(true);
    expect(isDateEditable(PAST, TODAY)).toBe(false);
  });
});

describe('plan: add / update / remove', () => {
  it('adds tickets to current/future days', () => {
    const p = addTicket(freshPlan(), FUTURE, tk('a'), TODAY);
    expect(ticketsFor(p, FUTURE).map((t) => t.id)).toEqual(['a']);
  });

  it('refuses to add to a past day (no-op)', () => {
    const base = freshPlan();
    expect(addTicket(base, PAST, tk('x'), TODAY)).toBe(base);
  });

  it('updates a ticket and sets status on editable days', () => {
    let p = addTicket(freshPlan(), TODAY, tk('a'), TODAY);
    p = updateTicket(p, TODAY, 'a', { title: 'renamed', status: 'in_progress' }, TODAY);
    expect(ticketsFor(p, TODAY)[0]).toMatchObject({ title: 'renamed', status: 'in_progress' });
  });

  it('cannot edit or delete a past day’s tickets', () => {
    const past: PlanState = { tickets: { [PAST]: [tk('a')] } };
    expect(updateTicket(past, PAST, 'a', { title: 'nope' }, TODAY)).toBe(past);
    expect(removeTicket(past, PAST, 'a', TODAY)).toBe(past);
  });

  it('removes a ticket on an editable day', () => {
    let p = addTicket(freshPlan(), TODAY, tk('a'), TODAY);
    p = addTicket(p, TODAY, tk('b'), TODAY);
    p = removeTicket(p, TODAY, 'a', TODAY);
    expect(ticketsFor(p, TODAY).map((t) => t.id)).toEqual(['b']);
  });
});

describe('plan: day-list order (done sinks)', () => {
  it('stacks open tasks first (scheduled by slot, then unscheduled), done at the bottom', () => {
    const list = [
      tk('doneEarly', { status: 'done', startMin: 8 * 60, createdAt: 1 }),
      tk('late', { startMin: 15 * 60, createdAt: 2 }),
      tk('anytimeB', { createdAt: 4 }),
      tk('early', { startMin: 9 * 60, createdAt: 3 }),
      tk('doneAnytime', { status: 'done', createdAt: 5 }),
      tk('anytimeA', { createdAt: 0 }),
    ];
    expect(sortDayTickets(list).map((t) => t.id)).toEqual([
      'early', // open + earliest slot
      'late',
      'anytimeA', // open, no slot — insertion order
      'anytimeB',
      'doneEarly', // completed sink, keeping their own slot order
      'doneAnytime',
    ]);
  });
});

describe('plan: due scheduled tickets (the reminder window)', () => {
  it('fires each start exactly once as the checked window advances', () => {
    const p: PlanState = {
      tickets: {
        [TODAY]: [
          tk('nine', { startMin: 9 * 60 }),
          tk('nineDone', { startMin: 9 * 60, status: 'done' }),
          tk('ten', { startMin: 10 * 60 }),
          tk('loose', {}), // unscheduled — never due
        ],
      },
    };
    // window ending exactly at 9:00 catches the 9:00 task (not the done one)
    expect(dueScheduledTickets(p, TODAY, 8 * 60 + 59, 9 * 60).map((t) => t.id)).toEqual(['nine']);
    // the next window starts where the last ended — 9:00 can't fire twice
    expect(dueScheduledTickets(p, TODAY, 9 * 60, 9 * 60 + 30)).toEqual([]);
    // a big catch-up window picks up everything crossed in between
    expect(dueScheduledTickets(p, TODAY, 9 * 60, 10 * 60).map((t) => t.id)).toEqual(['ten']);
    expect(dueScheduledTickets(p, '2026-01-01', 0, 24 * 60)).toEqual([]);
  });
});

describe('plan: move to next day', () => {
  it('moves a ticket from one day to the following day', () => {
    let p = addTicket(freshPlan(), TODAY, tk('a'), TODAY);
    p = moveTicketToNextDay(p, TODAY, 'a', TODAY);
    expect(ticketsFor(p, TODAY)).toHaveLength(0);
    expect(ticketsFor(p, FUTURE).map((t) => t.id)).toEqual(['a']); // 2026-07-01 is the next day
  });
});

describe('plan: move to an arbitrary day', () => {
  const LATER = '2026-07-04';

  it('moves a ticket between editable days, keeping its fields', () => {
    let p = addTicket(freshPlan(), TODAY, tk('a', { startMin: 540, durationMin: 90 }), TODAY);
    p = moveTicketToDay(p, TODAY, 'a', LATER, TODAY);
    expect(ticketsFor(p, TODAY)).toHaveLength(0);
    expect(ticketsFor(p, LATER)[0]).toMatchObject({ id: 'a', startMin: 540, durationMin: 90 });
  });

  it('refuses locked source or target days, unknown ids, and same-day moves', () => {
    const past: PlanState = { tickets: { [PAST]: [tk('a')] } };
    expect(moveTicketToDay(past, PAST, 'a', FUTURE, TODAY)).toBe(past);

    const p = addTicket(freshPlan(), TODAY, tk('a'), TODAY);
    expect(moveTicketToDay(p, TODAY, 'a', PAST, TODAY)).toBe(p);
    expect(moveTicketToDay(p, TODAY, 'missing', FUTURE, TODAY)).toBe(p);
    expect(moveTicketToDay(p, TODAY, 'a', TODAY, TODAY)).toBe(p);
  });
});

describe('plan: the task stopwatch (statusPatch / liveSpentMs)', () => {
  const T0 = new Date(2026, 5, 30, 9, 0).getTime();

  it('starts on entering In progress and banks the stint on leaving', () => {
    const t = tk('a');
    const start = statusPatch(t, 'in_progress', T0);
    expect(start).toEqual({ status: 'in_progress', inProgressSince: T0 });

    const running = { ...t, ...start } as PlanTicket;
    const stop = statusPatch(running, 'done', T0 + 25 * 60_000);
    expect(stop.status).toBe('done');
    expect(stop.spentMs).toBe(25 * 60_000);
    expect(stop.inProgressSince).toBeUndefined();
  });

  it('accumulates across stints (in progress -> blocked -> in progress -> done)', () => {
    let t = tk('a');
    t = { ...t, ...statusPatch(t, 'in_progress', T0) } as PlanTicket;
    t = { ...t, ...statusPatch(t, 'blocked', T0 + 10 * 60_000) } as PlanTicket;
    expect(t.spentMs).toBe(10 * 60_000);
    t = { ...t, ...statusPatch(t, 'in_progress', T0 + 60 * 60_000) } as PlanTicket;
    t = { ...t, ...statusPatch(t, 'done', T0 + 75 * 60_000) } as PlanTicket;
    expect(t.spentMs).toBe(25 * 60_000);
    expect(t.inProgressSince).toBeUndefined();
  });

  it('liveSpentMs adds the running stint only while In progress', () => {
    let t = tk('a');
    expect(liveSpentMs(t, T0)).toBe(0);
    t = { ...t, ...statusPatch(t, 'in_progress', T0) } as PlanTicket;
    expect(liveSpentMs(t, T0 + 5 * 60_000)).toBe(5 * 60_000);
    t = { ...t, ...statusPatch(t, 'done', T0 + 5 * 60_000) } as PlanTicket;
    expect(liveSpentMs(t, T0 + 60 * 60_000)).toBe(5 * 60_000); // frozen once done
  });

  it('re-entering In progress while already running keeps the original start', () => {
    let t = tk('a');
    t = { ...t, ...statusPatch(t, 'in_progress', T0) } as PlanTicket;
    const again = statusPatch(t, 'in_progress', T0 + 9 * 60_000);
    expect(again.inProgressSince).toBeUndefined(); // no restart
  });
});
