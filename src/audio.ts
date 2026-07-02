/**
 * Tiny cozy sound effects, synthesized with the Web Audio API (no audio files).
 *
 * Everything is soft sine/triangle blips at low gain — "cute, not loud". The
 * AudioContext is created lazily on the first sound (which always follows a user
 * gesture, satisfying autoplay rules) and a mute preference is persisted.
 */

import type { SoundscapeId } from './core';

type SoundName = 'click' | 'task' | 'switch' | 'coin' | 'start' | 'success' | 'alert';

const KEY = 'focus-den/sound';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = loadMuted();

function loadMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(KEY, next ? 'off' : 'on');
  } catch {
    // ignore
  }
}

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5; // overall softness
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface NoteOpts {
  type?: OscillatorType;
  gain?: number;
}

/** Play a single short note `at` seconds from now. */
function note(freq: number, at: number, dur: number, opts: NoteOpts = {}): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.value = freq;
  const peak = opts.gain ?? 0.07;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function seq(freqs: number[], step: number, dur: number, opts: NoteOpts): void {
  freqs.forEach((f, i) => note(f, i * step, dur, opts));
}

const SOUNDS: Record<SoundName, () => void> = {
  // soft little "tick" for any button
  click: () => note(720, 0, 0.06, { type: 'triangle', gain: 0.045 }),
  // slightly brighter pop when logging a task
  task: () => note(900, 0, 0.07, { type: 'triangle', gain: 0.045 }),
  // gentle two-note rise on status switch
  switch: () => seq([523, 659], 0.045, 0.07, { type: 'sine', gain: 0.05 }),
  // cute coin on purchase
  coin: () => seq([988, 1319], 0.06, 0.09, { type: 'triangle', gain: 0.05 }),
  // friendly arpeggio when clocking in
  start: () => seq([523, 659, 784], 0.07, 0.12, { type: 'sine', gain: 0.05 }),
  // little fanfare at clock-out
  success: () => seq([523, 659, 784, 1047], 0.09, 0.16, { type: 'triangle', gain: 0.05 }),
  // soft descending nudge when a break auto-offlines
  alert: () => seq([440, 330], 0.1, 0.16, { type: 'triangle', gain: 0.05 }),
};

/** Play a named sound (no-op when muted or audio is unavailable). */
export function play(name: SoundName): void {
  if (muted) return;
  if (!ensureCtx()) return;
  try {
    SOUNDS[name]();
  } catch {
    // never let audio break the UI
  }
}

// ── Ambient soundscapes (perk) ──────────────────────────────────────────────
//
// Generated entirely with the WebAudio API — filtered noise, slow LFOs, and a
// few scheduled bursts (fire crackle, bird chirps). No audio files. Independent
// of the SFX mute; controlled by its own on/off toggle + a volume setting.

interface Ambient {
  type: SoundscapeId;
  out: GainNode;
  /** the soundscape's intrinsic level before the user volume multiplier */
  baseGain: number;
  stop: () => void;
}

let ambient: Ambient | null = null;
let volume = 0.6; // user-controlled, 0..1

function makeNoise(c: AudioContext, brown: boolean): AudioBuffer {
  const len = Math.floor(c.sampleRate * 2);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  if (brown) {
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.2;
    }
  } else {
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  return buf;
}

function createAmbient(c: AudioContext, type: SoundscapeId): Ambient {
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.connect(c.destination);

  const stoppers: Array<() => void> = [];
  let baseGain = 0.07;

  const noiseSource = (brown = false) => {
    const s = c.createBufferSource();
    s.buffer = makeNoise(c, brown);
    s.loop = true;
    s.start();
    stoppers.push(() => s.stop());
    return s;
  };
  const biquad = (kind: BiquadFilterType, freq: number, q?: number) => {
    const f = c.createBiquadFilter();
    f.type = kind;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  };
  const lfo = (freq: number, depth: number, target: AudioParam) => {
    const o = c.createOscillator();
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start();
    stoppers.push(() => o.stop());
  };
  const every = (ms: number, fn: () => void) => {
    const id = setInterval(fn, ms);
    stoppers.push(() => clearInterval(id));
  };
  // a short shaped burst of filtered noise (used for fire crackle)
  const burst = (hp: number, peak: number, dur: number) => {
    const t0 = c.currentTime;
    const n = c.createBufferSource();
    n.buffer = makeNoise(c, false);
    const f = biquad('highpass', hp);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(f);
    f.connect(g);
    g.connect(out);
    n.start(t0);
    n.stop(t0 + dur + 0.02);
  };

  switch (type) {
    case 'rain': {
      noiseSource(false).connect(biquad('bandpass', 1300, 0.6)).connect(out);
      baseGain = 0.09;
      break;
    }
    case 'cafe': {
      noiseSource(true).connect(biquad('lowpass', 620)).connect(out);
      baseGain = 0.06;
      break;
    }
    case 'lofi': {
      noiseSource(false).connect(biquad('lowpass', 900)).connect(out);
      const pad = c.createGain();
      pad.gain.value = 0.02;
      pad.connect(out);
      [220, 277].forEach((f) => {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.connect(pad);
        o.start();
        stoppers.push(() => o.stop());
      });
      baseGain = 0.07;
      break;
    }
    case 'fireplace': {
      // warm low rumble + random crackles
      noiseSource(true).connect(biquad('lowpass', 420)).connect(out);
      baseGain = 0.05;
      every(170, () => {
        if (Math.random() < 0.7) burst(1800, 0.05 + Math.random() * 0.07, 0.03 + Math.random() * 0.05);
      });
      break;
    }
    case 'forest': {
      // rustling leaves (slowly modulated bandpass noise) + occasional chirp
      const rustle = c.createGain();
      rustle.gain.value = 0.5;
      noiseSource(false).connect(biquad('bandpass', 3400, 0.5)).connect(rustle);
      rustle.connect(out);
      lfo(0.15, 0.25, rustle.gain);
      baseGain = 0.05;
      every(2000, () => {
        if (Math.random() >= 0.25) return;
        const t0 = c.currentTime;
        [1900, 2500].forEach((fr, i) => {
          const o = c.createOscillator();
          o.type = 'sine';
          o.frequency.value = fr;
          const g = c.createGain();
          const at = t0 + i * 0.08;
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(0.03, at + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
          o.connect(g);
          g.connect(out);
          o.start(at);
          o.stop(at + 0.16);
        });
      });
      break;
    }
    case 'waves': {
      // low wash with a slow swelling tide
      const swell = c.createGain();
      swell.gain.value = 0.4;
      noiseSource(true).connect(biquad('lowpass', 500)).connect(swell);
      swell.connect(out);
      lfo(0.1, 0.32, swell.gain);
      baseGain = 0.08;
      break;
    }
    case 'wind': {
      // airy noise with a slowly sweeping filter
      const filter = biquad('lowpass', 700);
      noiseSource(false).connect(filter).connect(out);
      lfo(0.07, 400, filter.frequency);
      baseGain = 0.06;
      break;
    }
  }

  out.gain.setTargetAtTime(Math.max(0.0001, baseGain * volume), c.currentTime, 0.6);

  return {
    type,
    out,
    baseGain,
    stop() {
      out.gain.setTargetAtTime(0.0001, c.currentTime, 0.3);
      const fns = [...stoppers];
      window.setTimeout(() => {
        fns.forEach((s) => {
          try {
            s();
          } catch {
            // already stopped
          }
        });
        try {
          out.disconnect();
        } catch {
          // ignore
        }
      }, 700);
    },
  };
}

/** Start/stop/switch the ambient soundscape. Pass null to stop. */
export function setSoundscape(type: SoundscapeId | null): void {
  if (ambient && ambient.type === type) return;
  if (ambient) {
    ambient.stop();
    ambient = null;
  }
  if (!type) return;
  const c = ensureCtx();
  if (!c) return;
  ambient = createAmbient(c, type);
}

/** Set the ambient volume (0..1); applies live to a playing soundscape. */
export function setSoundscapeVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (ambient && ctx) {
    ambient.out.gain.setTargetAtTime(Math.max(0.0001, ambient.baseGain * volume), ctx.currentTime, 0.2);
  }
}
