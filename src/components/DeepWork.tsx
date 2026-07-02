/**
 * Deep Work overlay (perk) — a full-screen focus surface showing only the live
 * status timer and the current task. Everything else is hidden. Exit returns to
 * the normal app. The ambient soundscape toggle is available here too.
 */

import { useEffect } from 'react';
import { formatHMS, isActive, type State } from '../core';
import { store } from '../state/store';
import { STATUS_META } from './statusMeta';

export interface DeepWorkProps {
  state: State;
  now: number;
}

export function DeepWork({ state, now }: DeepWorkProps) {
  const { shift } = state;
  const active = isActive(shift.status);
  const meta = STATUS_META[shift.status];
  const stint = shift.statusStart != null ? Math.max(0, now - shift.statusStart) : 0;
  const currentTask = shift.tasks.length ? shift.tasks[shift.tasks.length - 1].text : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.setDeepWork(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className={`deepwork tone-${meta.tone}`} role="dialog" aria-label="Deep work mode">
      <button
        className="btn btn-ghost deepwork-exit"
        onClick={() => store.setDeepWork(false)}
        data-sound="none"
      >
        Exit focus ✕
      </button>

      {active ? (
        <div className="deepwork-body">
          <div className="deepwork-status">
            <span className="status-dot" aria-hidden="true" /> {meta.label}
          </div>
          <div className="deepwork-timer mono">{formatHMS(stint)}</div>
          <div className="deepwork-task">
            {currentTask ? (
              <>
                <span className="deepwork-task-label">Current task</span>
                <span className="deepwork-task-text">{currentTask}</span>
              </>
            ) : (
              <span className="muted">No task logged yet — log one to focus on.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="deepwork-body">
          <div className="deepwork-timer mono">--:--:--</div>
          <p className="muted">Clock in to start a focus session.</p>
        </div>
      )}

      {state.perks.soundscape && (
        <button
          className={`btn btn-ghost deepwork-sound ${state.settings.soundscapeOn ? 'is-on' : ''}`}
          onClick={() => store.setSoundscapeOn(!state.settings.soundscapeOn)}
          aria-pressed={state.settings.soundscapeOn}
        >
          {state.settings.soundscapeOn ? '♪ Soundscape on' : '♪ Soundscape off'}
        </button>
      )}
    </div>
  );
}
