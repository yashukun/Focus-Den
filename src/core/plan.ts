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
import type { PlanState, PlanTicket, TicketStatus, TrackingState } from './types';

export function freshPlan(): PlanState {
  return { tickets: {} };
}

/**
 * Time spent on a ticket including the live, in-progress slice when it is the
 * actively-tracked ticket and currently accruing (anchorMs set ⇒ Working).
 */
export function liveSpentMs(
  ticket: PlanTicket,
  tracking: TrackingState | null,
  dateKey: string,
  now: number,
): number {
  const base = ticket.spentMs ?? 0;
  if (
    tracking &&
    tracking.ticketId === ticket.id &&
    tracking.dateKey === dateKey &&
    tracking.anchorMs != null
  ) {
    return base + Math.max(0, now - tracking.anchorMs);
  }
  return base;
}

/** Whether this ticket is the one currently being timed (and accruing). */
export function isTiming(
  ticket: PlanTicket,
  tracking: TrackingState | null,
  dateKey: string,
): boolean {
  return (
    !!tracking &&
    tracking.ticketId === ticket.id &&
    tracking.dateKey === dateKey &&
    tracking.anchorMs != null
  );
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
  Pick<PlanTicket, 'title' | 'notes' | 'status' | 'priority' | 'durationMin'>
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

export function setTicketStatus(
  plan: PlanState,
  dateKey: string,
  id: string,
  status: TicketStatus,
  todayKey: string,
): PlanState {
  return updateTicket(plan, dateKey, id, { status }, todayKey);
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

/** Move a ticket to the following day (both ends are current/future). */
export function moveTicketToNextDay(
  plan: PlanState,
  dateKey: string,
  id: string,
  todayKey: string,
): PlanState {
  if (!isDateEditable(dateKey, todayKey)) return plan;
  const list = ticketsFor(plan, dateKey);
  const ticket = list.find((t) => t.id === id);
  if (!ticket) return plan;
  const nextKey = addDays(dateKey, 1);
  return {
    ...plan,
    tickets: {
      ...plan.tickets,
      [dateKey]: list.filter((t) => t.id !== id),
      [nextKey]: [...ticketsFor(plan, nextKey), ticket],
    },
  };
}
