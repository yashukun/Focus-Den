/**
 * Weekly streak dots: Mon–Sat (Sunday is off and not shown as a shift day).
 * A filled dot is a completed day; the outlined dot is today.
 */

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface WeekStreakProps {
  days: Record<number, boolean>;
  /** 0=Mon..5=Sat for today, or -1 on Sunday */
  todayIndex: number;
  completed: number;
}

export function WeekStreak({ days, todayIndex, completed }: WeekStreakProps) {
  return (
    <div className="streak">
      <div className="streak-dots" role="list" aria-label="Weekly streak, Monday to Saturday">
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
      <p className="streak-caption">
        {completed} / 6 days · {completed >= 6 ? 'perfect week! 🏆' : 'Sun is off'}
      </p>
    </div>
  );
}
