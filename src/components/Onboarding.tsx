/**
 * First-run onboarding — a short explainer of the day, breathers, and points.
 * Shown until dismissed; replayable from Settings.
 */

import { useEffect, useRef } from 'react';
import { store } from '../state/store';

const STEPS = [
  {
    emoji: '🕯️',
    title: 'Settle in, once a day',
    body: 'Your day unfolds over 12 hours from the moment you settle in. One day at a time, Mon–Sat (Sunday is off).',
  },
  {
    emoji: '☕',
    title: 'Take your breathers',
    body: 'Stretch (20m), Recharge (20m) and Lunch (50m) are each single-use. Overrun the 3-min grace and you drift Away — tap In flow to come back.',
  },
  {
    emoji: '◈',
    title: 'Gather points, grow your den',
    body: '10 pts per hour in flow, +50 for a smooth day, +20 for 3+ wins, +200 for a perfect week. Spend them on your room and avatar.',
  },
];

export function Onboarding() {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.completeOnboarding();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onClick={() => store.completeOnboarding()}>
      <div
        className="modal card onboard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="onboard-title" className="modal-title">Welcome to Focus Den</h2>
        <p className="muted">A cozy way to spend a focused day and grow a little pixel room.</p>

        <ul className="onboard-steps">
          {STEPS.map((s) => (
            <li key={s.title}>
              <span className="onboard-emoji" aria-hidden="true">{s.emoji}</span>
              <span>
                <span className="onboard-step-title">{s.title}</span>
                <br />
                <span className="onboard-step-body">{s.body}</span>
              </span>
            </li>
          ))}
        </ul>

        <button
          ref={ref}
          className="btn btn-primary btn-block"
          onClick={() => store.completeOnboarding()}
        >
          Let’s focus
        </button>
      </div>
    </div>
  );
}
