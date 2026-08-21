/**
 * The notification → task hand-off. When a reminder fires, the sender records
 * WHICH ticket it was about; when the user arrives (a web notification click,
 * or the window regaining focus after a desktop notification click), the app
 * consumes the record, navigates to the task and flashes it briefly.
 *
 * The record expires after a couple of minutes so that focusing the app hours
 * later for unrelated reasons never yanks the view around.
 */

export interface TaskAttention {
  dateKey: string;
  ticketId: string;
}

/** Fired on `window` when attention should be acted on NOW (app is visible). */
export const ATTENTION_EVENT = 'fd:attention';

const FRESH_MS = 2 * 60 * 1000;

let pending: (TaskAttention & { at: number }) | null = null;

export function setPendingAttention(dateKey: string, ticketId: string): void {
  pending = { dateKey, ticketId, at: Date.now() };
}

export function hasFreshAttention(): boolean {
  return pending !== null && Date.now() - pending.at <= FRESH_MS;
}

/** Read-and-clear. Returns null when nothing fresh is waiting. */
export function consumeAttention(): TaskAttention | null {
  if (!hasFreshAttention()) {
    pending = null;
    return null;
  }
  const { dateKey, ticketId } = pending!;
  pending = null;
  return { dateKey, ticketId };
}

/** Peek without clearing (App routes on it; PlanView consumes it). */
export function peekAttention(): TaskAttention | null {
  return hasFreshAttention() ? { dateKey: pending!.dateKey, ticketId: pending!.ticketId } : null;
}

/** Tell a mounted listener to act (the app is already open and visible). */
export function announceAttention(): void {
  window.dispatchEvent(new CustomEvent(ATTENTION_EVENT));
}
