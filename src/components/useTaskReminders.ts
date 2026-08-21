/**
 * The reminder engine — one hook, mounted once in App, alive on every screen.
 *
 * Watches the ticking clock and sends OS notifications for:
 *  1. Scheduled tasks — the moment a ticket's `startMin` arrives (planned on
 *     the week grid). Clicking the notification brings the app to that task
 *     and flashes it (see state/attention.ts).
 *  2. Breathers about to overrun — 2 minutes before a running break crosses
 *     limit + grace and would drift the day to Away. (This used to live in
 *     the focus card and only worked while that card was mounted.)
 *
 * Both respect `settings.taskReminders`. Fired ids are remembered in-memory
 * per day, so nothing double-fires within a session; the checked window
 * advances minute by minute, so a start is caught exactly once even across
 * throttled background timers.
 */

import { useEffect, useRef } from 'react';
import {
  BREAK_LABELS,
  breakThreshold,
  dateString,
  dueScheduledTickets,
  formatMS,
  formatSlotTime,
  isBreakKey,
  liveBreakUsed,
  type State,
} from '../core';
import { sendNotification } from '../notify';
import { announceAttention, setPendingAttention } from '../state/attention';

const BREAK_WARN_MS = 2 * 60 * 1000;

export function useTaskReminders(state: State, now: number): void {
  // (dateKey, minute) the last tick checked up to — starts at "now" so a
  // fresh launch doesn't replay the whole morning.
  const checked = useRef<{ dateKey: string; min: number } | null>(null);
  const firedTasks = useRef(new Set<string>());
  const firedBreaks = useRef(new Set<string>());

  const remindersOn = state.settings.taskReminders;

  useEffect(() => {
    if (!remindersOn) return;
    const d = new Date(now);
    const dateKey = dateString(now);
    const nowMin = d.getHours() * 60 + d.getMinutes();

    // Day rolled over (or first tick): reset the window and the fired sets.
    if (!checked.current || checked.current.dateKey !== dateKey) {
      checked.current = { dateKey, min: nowMin };
      firedTasks.current.clear();
      firedBreaks.current.clear();
      return;
    }
    if (nowMin === checked.current.min) return;

    const due = dueScheduledTickets(state.plan, dateKey, checked.current.min, nowMin);
    checked.current = { dateKey, min: nowMin };
    for (const t of due) {
      if (firedTasks.current.has(t.id)) continue;
      firedTasks.current.add(t.id);
      const start = t.startMin!;
      const end = start + (t.durationMin ?? 60);
      setPendingAttention(dateKey, t.id);
      void sendNotification(
        `Time for: ${t.title}`,
        `${formatSlotTime(start)} – ${formatSlotTime(end)} · tap to open the plan`,
        announceAttention,
      );
    }
  }, [now, remindersOn, state.plan]);

  // Breather about to overrun → Away (independent of which screen is open).
  useEffect(() => {
    if (!remindersOn) return;
    const shift = state.shift;
    if (!isBreakKey(shift.status)) return;
    const key = shift.status;
    const used = liveBreakUsed(shift, now)[key];
    const left = breakThreshold(key, state.perks.graceBonusMs) - used;
    if (left <= 0 || left > BREAK_WARN_MS) return;
    const fireKey = `${shift.date}:${key}`;
    if (firedBreaks.current.has(fireKey)) return;
    firedBreaks.current.add(fireKey);
    void sendNotification(
      'Breather almost done',
      `${BREAK_LABELS[key]} ends in ${formatMS(left)} — tap In flow to keep the day smooth.`,
    );
  }, [now, remindersOn, state.shift, state.perks.graceBonusMs]);
}
