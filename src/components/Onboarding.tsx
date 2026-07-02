/**
 * First-run onboarding — a short explainer of the shift, breaks, and points.
 * Shown until dismissed; replayable from Settings.
 */

import { useEffect, useRef } from 'react';
import { store } from '../state/store';

const STEPS = [
  {
    emoji: '⏱',
    title: 'Clock in for a 12-hour shift',
    body: 'Your shift runs 12 hours from when you clock in. One per day, Mon–Sat (Sunday is off).',
  },
  {
    emoji: '☕',
    title: 'Take your breaks',
    body: 'Break 1 (20m), Break 2 (20m) and Lunch (50m) are single-use. Overrun the 3-min grace and you auto-go Offline — tap Working to resume.',
  },
  {
    emoji: '◈',
    title: 'Earn points, grow your den',
    body: '10 pts per worked hour, +50 for a clean shift, +20 for 3+ tasks, +200 for a perfect week. Spend them in the Shop on your room and avatar.',
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
        <p className="muted">A cozy way to track your shift and grow a little pixel room.</p>

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
