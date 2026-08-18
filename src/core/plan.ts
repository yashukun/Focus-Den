/**
 * Day planner — predetermined goals/tickets per calendar day (distinct from the
 * shift task log). Pure and framework-agnostic: every mutation takes an explicit
 * `todayKey` and enforces the core rule that **past days are locked** — only the
 * current and upcoming days can be changed.
 *
 * Id generation and "now" live in the store; these functions just validate and
 * transform immutable state.
 */

import { addDays } from './dates';
import type { PlanState, PlanTicket } from './types';

export function freshPlan(): PlanState {
  return { tickets: {} };
}

/** Tickets for a day (never null). */
export function ticketsFor(plan: PlanState, dateKey: string): PlanTicket[] {
  return plan.tickets[dateKey] ?? [];
}

/** Current or future days are editable; past days are locked. */
export function isDateEditable(dateKey: string, todayKey: string): boolean {
  return dateKey >= todayKey; // ISO date keys sort chronologically
}

function withDay(plan: PlanState, dateKey: string, list: PlanTicket[]): PlanState {
  return { ...plan, tickets: { ...plan.tickets, [dateKey]: list } };
}

/** Add a fully-formed ticket to a day (no-op on locked days). */
export function addTicket(
  plan: PlanState,
  dateKey: string,
  ticket: PlanTicket,
  todayKey: string,
): PlanState {
  if (!isDateEditable(dateKey, todayKey)) return plan;
  return withDay(plan, dateKey, [...ticketsFor(plan, dateKey), ticket]);
}

export type TicketPatch = Partial<
  Pick<
    PlanTicket,
    'title' | 'notes' | 'descHtml' | 'deadlineMs' | 'status' | 'priority' | 'durationMin' | 'startMin'
  >
>;

/** Patch a ticket in place (no-op on locked days / unknown id). */
export function updateTicket(
  plan: PlanState,
  dateKey: string,
  id: string,
  patch: TicketPatch,
  todayKey: string,
): PlanState {
  if (!isDateEditable(dateKey, todayKey)) return plan;
  const list = ticketsFor(plan, dateKey);
  if (!list.some((t) => t.id === id)) return plan;
  return withDay(
    plan,
    dateKey,
    list.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  );
}

/** Remove a ticket (no-op on locked days). */
export function removeTicket(
  plan: PlanState,
  dateKey: string,
  id: string,
  todayKey: string,
): PlanState {
  if (!isDateEditable(dateKey, todayKey)) return plan;
  const list = ticketsFor(plan, dateKey);
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return plan;
  return withDay(plan, dateKey, next);
}

/** Move a ticket to another day (both ends must be current/future). */
export function moveTicketToDay(
  plan: PlanState,
  fromKey: string,
  id: string,
  toKey: string,
  todayKey: string,
): PlanState {
  if (fromKey === toKey) return plan;
  if (!isDateEditable(fromKey, todayKey) || !isDateEditable(toKey, todayKey)) return plan;
  const list = ticketsFor(plan, fromKey);
  const ticket = list.find((t) => t.id === id);
  if (!ticket) return plan;
  return {
    ...plan,
    tickets: {
      ...plan.tickets,
      [fromKey]: list.filter((t) => t.id !== id),
      [toKey]: [...ticketsFor(plan, toKey), ticket],
    },
  };
}

/** Move a ticket to the following day (both ends are current/future). */
export function moveTicketToNextDay(
  plan: PlanState,
  dateKey: string,
  id: string,
  todayKey: string,
): PlanState {
  return moveTicketToDay(plan, dateKey, id, addDays(dateKey, 1), todayKey);
}
