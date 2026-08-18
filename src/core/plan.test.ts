import { describe, expect, it } from 'vitest';

import {
  addTicket,
  freshPlan,
  isDateEditable,
  moveTicketToDay,
  moveTicketToNextDay,
  removeTicket,
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
