/**
 * Display metadata for shift statuses — shared by the dashboard, switcher and
 * summaries so labels and color tones stay consistent.
 */

import type { Status } from '../core';

export type Tone = 'work' | 'break' | 'offline' | 'idle' | 'points';

export interface StatusInfo {
  label: string;
  tone: Tone;
}

export const STATUS_META: Record<Status, StatusInfo> = {
  idle: { label: 'Idle', tone: 'idle' },
  working: { label: 'Working', tone: 'work' },
  break1: { label: 'Break 1', tone: 'break' },
  break2: { label: 'Break 2', tone: 'break' },
  lunch: { label: 'Lunch', tone: 'break' },
  offline: { label: 'Offline', tone: 'offline' },
  ended: { label: 'Shift ended', tone: 'idle' },
};
