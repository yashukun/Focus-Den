/**
 * First-run den creator — a full-screen wizard shown ONCE, before the landing
 * page, when the state is pristine and the den hasn't been set up (see
 * App.tsx). Every pick writes straight to the store, so the scene preview at
 * the top is the real den updating live. Skipping keeps the classic den.
 * All choices here are free and remain editable later in Den → Customize.
 */

import { useState } from 'react';
import {
  BODY_IDS,
  DEN_OPTIONS,
  SHIRT_COLORS,
  SHIRT_IDS,
  type DenConfig,
  type DenPart,
  type State,
} from '../core';
import { store } from '../state/store';
import { RoomScene } from '../room/RoomScene';
import { BODY_LABELS, DEN_PART_LABELS, VARIANT_LABELS } from './denLabels';

interface Step {
  title: string;
  hint: string;
  parts: DenPart[];
  character?: boolean;
}

const STEPS: Step[] = [
  { title: 'Who’s settling in?', hint: 'Pick a body and a favorite shirt.', parts: [], character: true },
  { title: 'The desk setup', hint: 'Where the flow happens.', parts: ['desk', 'computer'] },
  { title: 'Take a seat', hint: 'Comfort is a productivity feature.', parts: ['chair', 'drawers'] },
  { title: 'The room itself', hint: 'Walls, floor and the view.', parts: ['window', 'wallpaper', 'floor'] },
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface DenCreatorProps {
  state: State;
}

export function DenCreator({ state }: DenCreatorProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  function surprise() {
    for (const part of Object.keys(DEN_OPTIONS) as DenPart[]) {
      store.setDenPart(part, pick(DEN_OPTIONS[part]) as DenConfig[typeof part]);
    }
    store.setBody(pick(BODY_IDS));
    store.setShirt(pick(SHIRT_IDS));
  }

  function finish() {
    store.completeDenSetup();
  }

  return (
    <div className="creator">
      <header className="creator-head">
        <div className="home-brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Focus&nbsp;Den</span>
        </div>
        <button className="btn btn-ghost btn-sm" data-sound="none" onClick={finish}>
          Skip — use the classic den
        </button>
      </header>

      <main className="creator-body">
        <h1 className="creator-title">Build your den</h1>
        <p className="muted creator-sub">
          This little room grows with every focused day. Make it yours — everything here is free,
          and you can redecorate anytime.
        </p>

        <div className="creator-scene">
          <RoomScene
            owned={state.owned}
            equipped={state.equipped}
            den={state.den}
            character={state.character}
            placements={state.placements}
            width={380}
            className="home-scene-svg"
            title="Your den in progress"
          />
        </div>

        <div className="creator-step" key={step}>
          <div className="creator-step-head">
            <h2>{current.title}</h2>
            <span className="muted">{current.hint}</span>
          </div>

          {current.character && (
            <>
              <div className="equip-row">
                <span className="equip-label">Body</span>
                <div className="equip-options">
                  {BODY_IDS.map((b) => (
                    <button
                      key={b}
                      className={`btn btn-sm chip-toggle ${state.character.body === b ? 'is-on' : ''}`}
                      aria-pressed={state.character.body === b}
                      data-sound="switch"
                      onClick={() => store.setBody(b)}
                    >
                      {BODY_LABELS[b]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="equip-row">
                <span className="equip-label">Shirt</span>
                <div className="equip-options">
                  {SHIRT_IDS.map((s) => (
                    <button
                      key={s}
                      className={`swatch ${state.character.shirt === s ? 'is-on' : ''}`}
                      style={{ background: SHIRT_COLORS[s].body }}
                      aria-pressed={state.character.shirt === s}
                      aria-label={`Shirt color ${s.replace('shirt_', '')}`}
                      data-sound="switch"
                      onClick={() => store.setShirt(s)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {current.parts.map((part) => (
            <div key={part} className="equip-row">
              <span className="equip-label">{DEN_PART_LABELS[part]}</span>
              <div className="equip-options">
                {DEN_OPTIONS[part].map((id) => (
                  <button
                    key={id}
                    className={`btn btn-sm chip-toggle ${state.den[part] === id ? 'is-on' : ''}`}
                    aria-pressed={state.den[part] === id}
                    data-sound="switch"
                    onClick={() => store.setDenPart(part, id as DenConfig[typeof part])}
                  >
                    {VARIANT_LABELS[id] ?? id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="creator-nav">
          <button className="btn btn-sm" data-sound="none" onClick={surprise}>
            🎲 Surprise me
          </button>
          <div className="creator-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <span key={i} className={`creator-dot ${i === step ? 'is-on' : ''}`} />
            ))}
          </div>
          <div className="creator-nav-btns">
            {step > 0 && (
              <button className="btn btn-sm" data-sound="none" onClick={() => setStep(step - 1)}>
                ‹ Back
              </button>
            )}
            {last ? (
              <button className="btn btn-primary" data-sound="start" onClick={finish}>
                That’s my den ✓
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setStep(step + 1)}>
                Next ›
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
