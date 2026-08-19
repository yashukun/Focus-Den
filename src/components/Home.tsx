/**
 * The landing page — what Focus Den is, its key features, and one way in:
 * the Focus button. The hero shows the visitor's real den, so a grown room
 * greets them every time they come back. Clicking the brand inside the app
 * returns here.
 */

import { useEffect, useRef } from 'react';
import { RoomScene } from '../room/RoomScene';
import type { State } from '../core';

export interface HomeProps {
  state: State;
  onFocus: () => void;
}

const FEATURES = [
  {
    emoji: '🕯️',
    title: 'One gentle ritual',
    body: 'Settle in once a day. Your den keeps time for 12 hours while you drift between flow, stretches and lunch.',
  },
  {
    emoji: '◈',
    title: 'Points that grow a place',
    body: 'Time in flow earns points. Spend them on plants, lamps, string lights — even a desk cat — for your pixel den.',
  },
  {
    emoji: '🗓',
    title: 'Soft plans, not tickets',
    body: 'Sketch a few intentions for the day, give one a time goal, and the timer quietly follows your focus.',
  },
  {
    emoji: '🎧',
    title: 'Soundscapes built in',
    body: 'Rain, café, fireplace, forest, waves — cozy ambience synthesized on the spot. No files, no streaming.',
  },
  {
    emoji: '🔥',
    title: 'A week of little wins',
    body: 'Six days make a streak, Sundays are off. A perfect week earns a bonus; a freeze forgives a missed day.',
  },
  {
    emoji: '🌙',
    title: 'Yours, and only yours',
    body: 'No accounts, no cloud. Your den lives in this browser — export it as a file whenever you like.',
  },
];

export function Home({ state, onFocus }: HomeProps) {
  // Feature cards reveal as they scroll into view — once each, then they stay
  // put (unobserved after the first reveal). Without IntersectionObserver
  // everything shows immediately.
  const featuresRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = featuresRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('.home-feature'));
    if (typeof IntersectionObserver === 'undefined') {
      cards.forEach((c) => c.classList.add('is-revealed'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-revealed');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-brand home-rise" style={{ animationDelay: '0ms' }}>
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Focus&nbsp;Den</span>
        </header>

        <section className="home-hero">
          <div className="home-scene home-rise" style={{ animationDelay: '60ms' }}>
            <RoomScene
              owned={state.owned}
              equipped={state.equipped}
              width={400}
              className="home-scene-svg"
              title="Your den, waiting for you"
            />
          </div>
          <h1 className="home-title home-rise" style={{ animationDelay: '140ms' }}>
            A cozy corner for deep focus
          </h1>
          <p className="home-tagline home-rise" style={{ animationDelay: '220ms' }}>
            Focus Den turns a day of deep work into a gentle ritual — settle in,
            stay in flow, and watch your little pixel den grow around you.
          </p>
          <div className="home-cta-row home-rise" style={{ animationDelay: '300ms' }}>
            <button className="btn btn-primary btn-xl home-cta" data-sound="start" onClick={onFocus}>
              Focus
            </button>
          </div>
          <p className="muted home-note home-rise" style={{ animationDelay: '380ms' }}>
            Everything stays on this device — no sign-up, nothing to configure.
          </p>
        </section>

        <section ref={featuresRef} className="home-features" aria-label="What Focus Den offers">
          {FEATURES.map((f, i) => (
            <article
              key={f.title}
              className="home-feature"
              style={{ animationDelay: `${(i % 3) * 80}ms` }}
            >
              <span className="home-feature-emoji" aria-hidden="true">{f.emoji}</span>
              <h2 className="home-feature-title">{f.title}</h2>
              <p className="home-feature-body">{f.body}</p>
            </article>
          ))}
        </section>

        <footer className="home-foot">
          <span className="app-version">Focus Den {__APP_VERSION__}</span>
        </footer>
      </div>
    </div>
  );
}
