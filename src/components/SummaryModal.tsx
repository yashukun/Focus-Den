/**
 * End-of-shift summary, shown after a manual end or the 12h auto clock-out.
 */

import { useEffect, useRef } from 'react';
import { BREAK_LABELS, formatDateLabel, formatHM, type BreakKey, type ShiftSummary } from '../core';

const BREAK_ORDER: BreakKey[] = ['break1', 'break2', 'lunch'];

export interface SummaryModalProps {
  summary: ShiftSummary;
  onClose: () => void;
}

export function SummaryModal({ summary, onClose }: SummaryModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { points } = summary;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="summary-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="summary-title" className="modal-title">
          Shift complete
        </h2>
        <p className="muted">{formatDateLabel(summary.date)}</p>

        <div className="summary-grid">
          <div className="summary-stat">
            <span className="summary-stat-label">Worked</span>
            <span className="summary-stat-value tone-work">{formatHM(summary.workedMs)}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Offline</span>
            <span className="summary-stat-value tone-offline">{formatHM(summary.offlineMs)}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Tasks</span>
            <span className="summary-stat-value">{summary.taskCount}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Clean shift</span>
            <span className="summary-stat-value">{summary.clean ? 'Yes ✓' : 'No'}</span>
          </div>
        </div>

        <div className="summary-breaks">
          {BREAK_ORDER.map((k) => (
            <div key={k} className="summary-break">
              <span>{BREAK_LABELS[k]}</span>
              <span className="mono">{formatHM(summary.breakMs[k])}</span>
            </div>
          ))}
        </div>

        <div className="summary-points">
          <h3>Points earned</h3>
          <ul className="points-lines">
            <li>
              <span>Worked time</span>
              <span className="mono">+{points.workedPoints}</span>
            </li>
            <li className={summary.clean ? '' : 'line-muted'}>
              <span>Clean-shift bonus</span>
              <span className="mono">+{points.cleanBonus}</span>
            </li>
            <li className={points.taskBonus ? '' : 'line-muted'}>
              <span>3+ tasks bonus</span>
              <span className="mono">+{points.taskBonus}</span>
            </li>
            {summary.perfectWeekBonus > 0 && (
              <li className="line-bonus">
                <span>Perfect week! 🏆</span>
                <span className="mono">+{summary.perfectWeekBonus}</span>
              </li>
            )}
            <li className="points-total">
              <span>Total</span>
              <span className="mono tone-points">+{summary.totalPoints}</span>
            </li>
          </ul>
          <p className="muted balance-line">
            New balance: <strong className="mono tone-points">{summary.newBalance}</strong> pts
          </p>
        </div>

        <button ref={closeRef} className="btn btn-primary btn-block" onClick={onClose}>
          Nice work
        </button>
      </div>
    </div>
  );
}
