/**
 * Display metadata for the day's statuses — shared by the dashboard, switcher
 * and summaries so labels and color tones stay consistent. The internal ids
 * (working / break1 / …) are persisted state and never change; only these
 * labels carry the cozy voice.
 */

import type { Status } from '../core';

export type Tone = 'work' | 'break' | 'offline' | 'idle' | 'points';

export interface StatusInfo {
  label: string;
  tone: Tone;
}

export const STATUS_META: Record<Status, StatusInfo> = {
  idle: { label: 'Resting', tone: 'idle' },
  working: { label: 'In flow', tone: 'work' },
  break1: { label: 'Stretch', tone: 'break' },
  break2: { label: 'Recharge', tone: 'break' },
  lunch: { label: 'Lunch', tone: 'break' },
  offline: { label: 'Away', tone: 'offline' },
  ended: { label: 'Day complete', tone: 'idle' },
};
