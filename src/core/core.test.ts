import { describe, it, expect } from 'vitest';

import {
  addTask,
  applyBreakGrace,
  applyStreakFreeze,
  BREAK_LIMITS,
  breakThreshold,
  canApplyFreeze,
  canClockIn,
  canEnterBreak,
  clockIn,
  commit,
  computePoints,
  dateString,
  dayIndexMonSat,
  defaultState,
  earnedPreview,
  effectiveGrace,
  finalizeShift,
  GRACE_MS,
  HOUR_MS,
  isBreakConsumed,
  liveAcc,
  MINUTE_MS,
  shouldAutoEnd,
  switchStatus,
  weekKey,
  type State,
} from './index';

// A known Monday: 2026-01-05 is a Monday (2026-01-01 is a Thursday).
const MON = new Date(2026, 0, 5, 11, 30).getTime(); // Mon 11:30 local

function clockedIn(at = MON): State {
  return clockIn(defaultState(), at);
}

describe('dates', () => {
  it('formats local date strings', () => {
    expect(dateString(MON)).toBe('2026-01-05');
  });

  it('maps Mon..Sat to 0..5 and Sunday to -1', () => {
    expect(dayIndexMonSat(new Date(2026, 0, 5).getTime())).toBe(0); // Mon
    expect(dayIndexMonSat(new Date(2026, 0, 10).getTime())).toBe(5); // Sat
    expect(dayIndexMonSat(new Date(2026, 0, 11).getTime())).toBe(-1); // Sun
  });

  it('keys a week by its Monday', () => {
    expect(weekKey(new Date(2026, 0, 8).getTime())).toBe('2026-01-05'); // Thu -> Mon
    expect(weekKey(new Date(2026, 0, 11).getTime())).toBe('2026-01-05'); // Sun -> prev Mon
    expect(weekKey(new Date(2026, 0, 12).getTime())).toBe('2026-01-12'); // next Mon
  });
});

describe('clock-in / day lock', () => {
  it('starts a working shift at clock-in', () => {
    const s = clockedIn();
    expect(s.shift.status).toBe('working');
    expect(s.shift.clockIn).toBe(MON);
    expect(s.shift.statusStart).toBe(MON);
    expect(s.shift.date).toBe('2026-01-05');
    expect(s.shift.clean).toBe(true);
  });

  it('cannot clock in while active', () => {
    const s = clockedIn();
    expect(canClockIn(s, MON + HOUR_MS)).toBe(false);
  });

  it('locks the day after clock-out and unlocks the next day', () => {
    const ended = finalizeShift(clockedIn(), MON + 8 * HOUR_MS).state;
    expect(ended.shift.status).toBe('ended');
    expect(canClockIn(ended, MON + 9 * HOUR_MS)).toBe(false); // same day
    const nextDay = new Date(2026, 0, 6, 11, 30).getTime();
    expect(canClockIn(ended, nextDay)).toBe(true);
  });
});

describe('status switching commits time', () => {
  it('commits elapsed time into the prior status on switch', () => {
    let shift = clockedIn().shift;
    // 30 min working, then switch to lunch
    shift = switchStatus(shift, 'lunch', MON + 30 * MINUTE_MS);
    expect(shift.acc.working).toBe(30 * MINUTE_MS);
    expect(shift.status).toBe('lunch');
    expect(shift.statusStart).toBe(MON + 30 * MINUTE_MS);

    // 10 min lunch, back to working
    shift = switchStatus(shift, 'working', MON + 40 * MINUTE_MS);
    expect(shift.acc.lunch).toBe(10 * MINUTE_MS);
    expect(shift.breakUsed.lunch).toBe(10 * MINUTE_MS);
    expect(shift.status).toBe('working');
  });

  it('cannot manually switch to offline (auto-only status)', () => {
    const shift = clockedIn().shift; // working
    expect(switchStatus(shift, 'offline', MON + 5 * MINUTE_MS)).toBe(shift); // no-op
    expect(switchStatus(shift, 'offline', MON + 5 * MINUTE_MS).status).toBe('working');
  });

  it('tracks live (uncommitted) time via liveAcc', () => {
    const shift = clockedIn().shift; // working since MON
    const live = liveAcc(shift, MON + 45 * MINUTE_MS);
    expect(live.working).toBe(45 * MINUTE_MS);
    expect(shift.acc.working).toBe(0); // not yet committed
  });
});

describe('breaks: single-use', () => {
  it('disables a break once any time has been spent in it', () => {
    let shift = clockedIn().shift;
    shift = switchStatus(shift, 'break1', MON + 1 * MINUTE_MS);
    shift = switchStatus(shift, 'working', MON + 6 * MINUTE_MS); // only 5 of 20 min used
    expect(shift.breakUsed.break1).toBe(5 * MINUTE_MS);
    expect(isBreakConsumed(shift, 'break1')).toBe(true);
    expect(canEnterBreak(shift, 'break1')).toBe(false);
    // re-entering a consumed break is a no-op
    const tryReenter = switchStatus(shift, 'break1', MON + 10 * MINUTE_MS);
    expect(tryReenter.status).toBe('working');
  });
});

describe('breaks: limit + grace auto-offline', () => {
  it('auto-flips to offline exactly at limit + grace and marks not clean', () => {
    let shift = clockedIn().shift;
    shift = switchStatus(shift, 'break1', MON); // enter break1 at MON
    const threshold = BREAK_LIMITS.break1 + GRACE_MS; // 23 min
    const { shift: after, autoOfflined } = applyBreakGrace(shift, MON + threshold);
    expect(autoOfflined).toBe(true);
    expect(after.status).toBe('offline');
    expect(after.clean).toBe(false);
    expect(after.acc.break1).toBe(threshold);
    expect(after.breakUsed.break1).toBe(threshold);
    expect(after.acc.offline).toBe(0);
    expect(isBreakConsumed(after, 'break1')).toBe(true);
  });

  it('caps the break at limit + grace and moves overflow to offline', () => {
    let shift = clockedIn().shift;
    shift = switchStatus(shift, 'lunch', MON);
    const threshold = BREAK_LIMITS.lunch + GRACE_MS; // 53 min
    const elapsed = threshold + 7 * MINUTE_MS; // ran 7 min over the threshold
    const { shift: after } = applyBreakGrace(shift, MON + elapsed);
    expect(after.acc.lunch).toBe(threshold);
    expect(after.acc.offline).toBe(7 * MINUTE_MS);
    expect(after.status).toBe('offline');
    expect(after.clean).toBe(false);
  });

  it('does not trigger before the threshold', () => {
    let shift = clockedIn().shift;
    shift = switchStatus(shift, 'break2', MON);
    const { autoOfflined } = applyBreakGrace(shift, MON + BREAK_LIMITS.break2); // at limit, within grace
    expect(autoOfflined).toBe(false);
  });
});

describe('points', () => {
  it('awards 10 pts per whole worked hour, floored', () => {
    expect(computePoints({ workedMs: 8.5 * HOUR_MS, clean: false, taskCount: 0 }).workedPoints).toBe(80);
    expect(computePoints({ workedMs: 59 * MINUTE_MS, clean: false, taskCount: 0 }).workedPoints).toBe(0);
  });

  it('adds clean and task bonuses', () => {
    const p = computePoints({ workedMs: 8 * HOUR_MS, clean: true, taskCount: 3 });
    expect(p.cleanBonus).toBe(50);
    expect(p.taskBonus).toBe(20);
    expect(p.subtotal).toBe(80 + 50 + 20);
  });

  it('no task bonus below the threshold', () => {
    expect(computePoints({ workedMs: 0, clean: true, taskCount: 2 }).taskBonus).toBe(0);
  });

  it('earnedPreview reflects live working time + projected bonuses', () => {
    let shift = clockedIn().shift;
    shift = addTask(shift, 'a', MON);
    shift = addTask(shift, 'b', MON);
    shift = addTask(shift, 'c', MON);
    const preview = earnedPreview(shift, MON + 2 * HOUR_MS);
    expect(preview.workedPoints).toBe(20); // 2h
    expect(preview.cleanBonus).toBe(50);
    expect(preview.taskBonus).toBe(20);
    expect(preview.subtotal).toBe(90);
  });
});

describe('tasks', () => {
  it('logs trimmed, timestamped tasks and ignores blanks', () => {
    let shift = clockedIn().shift;
    shift = addTask(shift, '  ship it  ', MON + MINUTE_MS);
    shift = addTask(shift, '   ', MON + 2 * MINUTE_MS);
    expect(shift.tasks).toHaveLength(1);
    expect(shift.tasks[0]).toEqual({ time: MON + MINUTE_MS, text: 'ship it' });
  });
});

describe('finalize: clock-out', () => {
  it('computes points exactly and credits the balance once', () => {
    let s = clockedIn();
    s = { ...s, shift: addTask(s.shift, 'x', MON) };
    s = { ...s, shift: addTask(s.shift, 'y', MON) };
    s = { ...s, shift: addTask(s.shift, 'z', MON) };
    const { state, summary } = finalizeShift(s, MON + 8 * HOUR_MS);
    expect(summary).not.toBeNull();
    expect(summary!.workedMs).toBe(8 * HOUR_MS);
    expect(summary!.points.subtotal).toBe(80 + 50 + 20); // worked + clean + tasks
    expect(state.points).toBe(150);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].date).toBe('2026-01-05');
    expect(state.week.days[0]).toBe(true); // Monday completed
  });

  it('a not-clean shift loses the clean bonus', () => {
    let shift = clockedIn().shift;
    shift = switchStatus(shift, 'break1', MON);
    const over = applyBreakGrace(shift, MON + BREAK_LIMITS.break1 + GRACE_MS).shift; // -> offline, not clean
    const { summary } = finalizeShift({ ...defaultState(), shift: over }, MON + 8 * HOUR_MS);
    expect(summary!.clean).toBe(false);
    expect(summary!.points.cleanBonus).toBe(0);
  });
});

describe('auto-end at clockIn + 12h', () => {
  it('reports it should auto-end and clamps accrual to the window', () => {
    const shift = clockedIn().shift;
    expect(shouldAutoEnd(shift, MON + 12 * HOUR_MS)).toBe(true);
    expect(shouldAutoEnd(shift, MON + 12 * HOUR_MS - 1)).toBe(false);
    // finalize far past the window: working time is capped at 12h
    const { summary } = finalizeShift(clockedIn(), MON + 20 * HOUR_MS);
    expect(summary!.workedMs).toBe(12 * HOUR_MS);
    expect(summary!.points.workedPoints).toBe(120);
  });
});

describe('week streak + perfect week', () => {
  it('marks Mon..Sat and awards +200 once', () => {
    let s = defaultState();
    const days = [5, 6, 7, 8, 9, 10]; // Mon..Sat 2026-01
    let balanceFromWork = 0;
    for (const d of days) {
      const at = new Date(2026, 0, d, 11, 30).getTime();
      expect(canClockIn(s, at)).toBe(true);
      s = clockIn(s, at);
      const res = finalizeShift(s, at + 8 * HOUR_MS); // 80 + 50 clean = 130/day
      s = res.state;
      balanceFromWork += 130;
    }
    expect(s.week.perfectAwarded).toBe(true);
    // 6 days * 130 + 200 perfect-week bonus
    expect(s.points).toBe(balanceFromWork + 200);
    // perfect-week bonus credited only on the final (Saturday) day
    expect(s.history[5].points).toBe(130 + 200);
    expect(s.history[4].points).toBe(130);
  });

  it('resets the week the following Monday', () => {
    let s = clockIn(defaultState(), MON);
    s = finalizeShift(s, MON + 8 * HOUR_MS).state;
    const nextMon = new Date(2026, 0, 12, 11, 30).getTime();
    s = clockIn(s, nextMon);
    expect(s.week.key).toBe('2026-01-12');
    expect(s.week.days[0]).toBeUndefined();
    expect(s.week.perfectAwarded).toBe(false);
  });
});

describe('commit edge cases', () => {
  it('is a no-op when there is nothing to commit', () => {
    const shift = defaultState().shift; // idle, statusStart null
    expect(commit(shift, MON)).toBe(shift);
  });
});

describe('grace bonus perk (+1 min)', () => {
  it('shifts the auto-offline threshold without changing the base rule', () => {
    expect(effectiveGrace(0)).toBe(GRACE_MS);
    expect(effectiveGrace(60 * 1000)).toBe(GRACE_MS + 60 * 1000);
    expect(breakThreshold('break1', 60 * 1000)).toBe(BREAK_LIMITS.break1 + GRACE_MS + 60 * 1000);

    let shift = clockedIn().shift;
    shift = switchStatus(shift, 'break1', MON);
    const baseThreshold = BREAK_LIMITS.break1 + GRACE_MS; // 23 min, no bonus

    // With +1 min bonus, the base threshold no longer trips it…
    expect(applyBreakGrace(shift, MON + baseThreshold, 60 * 1000).autoOfflined).toBe(false);
    // …but one minute later it does.
    const tripped = applyBreakGrace(shift, MON + baseThreshold + 60 * 1000, 60 * 1000);
    expect(tripped.autoOfflined).toBe(true);
    expect(tripped.shift.acc.break1).toBe(baseThreshold + 60 * 1000);
    // Base rule unchanged when no bonus is passed.
    expect(applyBreakGrace(shift, MON + baseThreshold, 0).autoOfflined).toBe(true);
  });
});

describe('streak freeze perk', () => {
  const weekState = {
    key: '2026-01-05',
    days: { 0: true, 1: true, 2: true, 3: true, 4: true } as Record<number, boolean>,
    perfectAwarded: false,
  };

  function withFreezes(n: number): State {
    return { ...defaultState(), perks: { ...defaultState().perks, streakFreeze: n }, week: weekState };
  }

  it('requires a freeze in stock and an incomplete day', () => {
    expect(canApplyFreeze(withFreezes(0), 5, MON)).toBe(false); // no stock
    expect(canApplyFreeze(withFreezes(1), 0, MON)).toBe(false); // already done
    expect(canApplyFreeze(withFreezes(1), 5, MON)).toBe(true);
  });

  it('restores a day, decrements stock, and re-awards the perfect week once', () => {
    const res = applyStreakFreeze(withFreezes(2), 5, MON);
    expect(res.bonusAwarded).toBe(200); // completes Mon–Sat
    expect(res.state.week.days[5]).toBe(true);
    expect(res.state.week.frozen?.[5]).toBe(true);
    expect(res.state.week.perfectAwarded).toBe(true);
    expect(res.state.perks.streakFreeze).toBe(1);
    expect(res.state.points).toBe(200);
  });

  it('is a no-op without stock', () => {
    const s = withFreezes(0);
    expect(applyStreakFreeze(s, 5, MON).state).toBe(s);
  });

  it('does not double-award the perfect week', () => {
    const already = {
      ...withFreezes(1),
      week: { ...weekState, perfectAwarded: true },
    };
    const res = applyStreakFreeze(already, 5, MON);
    expect(res.bonusAwarded).toBe(0);
    expect(res.state.points).toBe(0);
  });
});
