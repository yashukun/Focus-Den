import { describe, expect, it } from 'vitest';

import {
  addTicket,
  freshPlan,
  isDateEditable,
  isTiming,
  liveSpentMs,
  moveTicketToNextDay,
  removeTicket,
  ticketsFor,
  updateTicket,
  type PlanState,
  type PlanTicket,
  type TrackingState,
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

describe('plan: live time tracking', () => {
  it('adds the live slice only for the actively-timed ticket', () => {
    const ticket = tk('a', { spentMs: 60_000 });
    const anchor = 1_000_000;
    const tracking: TrackingState = { dateKey: TODAY, ticketId: 'a', anchorMs: anchor };

    // Active + accruing → base + (now - anchor).
    expect(liveSpentMs(ticket, tracking, TODAY, anchor + 30_000)).toBe(90_000);
    expect(isTiming(ticket, tracking, TODAY)).toBe(true);

    // Paused (anchorMs null) → just the committed spent.
    const paused: TrackingState = { ...tracking, anchorMs: null };
    expect(liveSpentMs(ticket, paused, TODAY, anchor + 30_000)).toBe(60_000);
    expect(isTiming(ticket, paused, TODAY)).toBe(false);

    // A different tracked ticket doesn't affect this one.
    const other: TrackingState = { dateKey: TODAY, ticketId: 'b', anchorMs: anchor };
    expect(liveSpentMs(ticket, other, TODAY, anchor + 30_000)).toBe(60_000);
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
