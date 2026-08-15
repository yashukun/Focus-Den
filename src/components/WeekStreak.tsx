/**
 * Weekly streak dots: Mon–Sat (Sunday is off and not shown as a shift day).
 * A filled dot is a completed day; the outlined dot is today.
 */

import { useRef } from 'react';
import { cheer, popIn, sparkleBurst, useFxLayoutEffect } from '../fx';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WeekStreakProps {
  days: Record<number, boolean>;
  /** 0=Mon..5=Sat for today, or -1 on Sunday */
  todayIndex: number;
  completed: number;
}

export function WeekStreak({ days, todayIndex, completed }: WeekStreakProps) {
  const dotsRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const prevCompleted = useRef(completed);

  // A day just completed: pop its dot; a perfect week gets the full parade.
  useFxLayoutEffect(() => {
    const before = prevCompleted.current;
    prevCompleted.current = completed;
    if (completed <= before) return;
    const dots = dotsRef.current?.querySelectorAll('.dot-done');
    const newest = dotsRef.current?.querySelector('.dot-today.dot-done') ?? dots?.[dots.length - 1];
    if (newest) {
      popIn(newest);
      sparkleBurst(newest, { count: 6, spread: 28 });
    }
    if (completed >= 6) {
      cheer(dots);
      sparkleBurst(captionRef.current, { count: 26, spread: 80 });
    }
  }, [completed]);

  return (
    <div className="streak">
      <div ref={dotsRef} className="streak-dots" role="list" aria-label="Weekly streak, Monday to Saturday">
        {DAY_LABELS.map((label, i) => {
          const done = !!days[i];
          const isToday = i === todayIndex;
          const cls = ['dot', done ? 'dot-done' : '', isToday ? 'dot-today' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={i}
              className={cls}
              role="listitem"
              aria-label={`${DAY_NAMES[i]}: ${done ? 'completed' : 'not yet'}${
                isToday ? ' (today)' : ''
              }`}
            >
              <span aria-hidden="true">{label}</span>
            </div>
          );
        })}
        <div className="dot dot-off" aria-label="Sunday: off" role="listitem">
          <span aria-hidden="true">S</span>
        </div>
      </div>
      <p ref={captionRef} className="streak-caption">
        {completed} / 6 days · {completed >= 6 ? 'perfect week! 🏆' : 'Sun is off'}
      </p>
    </div>
  );
}
