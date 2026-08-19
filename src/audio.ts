/**
 * All sound, synthesized with the Web Audio API (no audio files).
 *
 * Two systems share one lazily-created AudioContext:
 *  - SFX: soft sine/triangle blips at low gain — "cute, not loud". Gains are
 *    loudness-matched by ear-model (high triangles read louder than low sines,
 *    so they get less gain).
 *  - Ambient soundscapes: layered noise beds + scheduled one-shot events.
 *
 * Ambient engine rules (the fixes for the "sounds cheap" era — see
 * docs/sound.md for the history):
 *  - Noise beds loop a 10 s STEREO buffer whose tail is crossfaded into its
 *    head — no audible 2 s pattern, no seam tick. Buffers are peak-normalized
 *    and cached per sample rate; events reuse ONE shared burst buffer.
 *  - Every scene is 2–3 layers (body + air + detail), not one filtered noise.
 *  - Crackles / drips / chirps / clinks / waves are scheduled on the AUDIO
 *    clock via a lookahead loop (2 s horizon), so they keep their rhythm in
 *    throttled background tabs and never jitter with the main thread.
 *  - Slow modulation uses two LFOs at incommensurate rates — organic drift,
 *    not a metronomic sine swell.
 *  - The scene bus runs through a gentle compressor so stacked events can't
 *    clip, and `createAmbient` accepts any BaseAudioContext + destination so
 *    an OfflineAudioContext harness can render scenes and measure loudness.
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

/**
 * Create/resume the context ahead of the first sound. App calls this on every
 * pointerdown (a valid user gesture): the first real cue then plays with no
 * create/resume latency, and a context suspended by the OS (sleep, Safari
 * backgrounding) comes back before the next interaction needs it.
 */
export function warmup(): void {
  ensureCtx();
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

// Gains lean against the equal-loudness curve: bright triangles get less,
// low/mid sines get more, so every cue lands at a similar perceived level.
const SOUNDS: Record<SoundName, () => void> = {
  // soft little "tick" for any button
  click: () => note(720, 0, 0.06, { type: 'triangle', gain: 0.045 }),
  // slightly brighter pop when logging a task
  task: () => note(900, 0, 0.07, { type: 'triangle', gain: 0.04 }),
  // gentle two-note rise on status switch
  switch: () => seq([523, 659], 0.045, 0.07, { type: 'sine', gain: 0.06 }),
  // cute coin on purchase (bright — kept quiet)
  coin: () => seq([988, 1319], 0.06, 0.09, { type: 'triangle', gain: 0.034 }),
  // friendly arpeggio when clocking in
  start: () => seq([523, 659, 784], 0.07, 0.12, { type: 'sine', gain: 0.06 }),
  // little fanfare at clock-out
  success: () => seq([523, 659, 784, 1047], 0.09, 0.16, { type: 'triangle', gain: 0.042 }),
  // soft descending nudge when a break auto-offlines
  alert: () => seq([440, 330], 0.1, 0.16, { type: 'triangle', gain: 0.055 }),
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

// ── Ambient soundscapes ─────────────────────────────────────────────────────

interface Ambient {
  type: SoundscapeId;
  out: GainNode;
  /** the soundscape's intrinsic level before the user volume multiplier */
  baseGain: number;
  stop: () => void;
}

let ambient: Ambient | null = null;
let volume = 0.6; // user-controlled, 0..1

const NOISE_SECONDS = 10;
const SEAM_SECONDS = 0.5;
const LOOKAHEAD_S = 2;
const TICK_MS = 400;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Loopable noise: per-channel independent noise (decorrelated stereo = real
 * width), DC-removed, tail crossfaded into head, peak-normalized to 0.8.
 */
function makeNoiseBuffer(
  c: BaseAudioContext,
  brown: boolean,
  seconds: number,
  channels: number,
): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(channels, len, c.sampleRate);
  const fadeN = Math.floor(c.sampleRate * SEAM_SECONDS);
  for (let ch = 0; ch < channels; ch++) {
    const d = buf.getChannelData(ch);
    if (brown) {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last;
      }
      let mean = 0;
      for (let i = 0; i < len; i++) mean += d[i];
      mean /= len;
      for (let i = 0; i < len; i++) d[i] -= mean;
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    for (let i = 0; i < fadeN; i++) {
      const t = i / fadeN;
      d[len - fadeN + i] = d[len - fadeN + i] * (1 - t) + d[i] * t;
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) {
      const s = 0.8 / peak;
      for (let i = 0; i < len; i++) d[i] *= s;
    }
  }
  return buf;
}

interface NoiseCache {
  rate: number;
  white: AudioBuffer;
  brown: AudioBuffer;
  /** one shared 1 s burst source for crackles/drips/whooshes */
  burst: AudioBuffer;
}

let noiseCache: NoiseCache | null = null;

function noiseFor(c: BaseAudioContext): NoiseCache {
  if (!noiseCache || noiseCache.rate !== c.sampleRate) {
    noiseCache = {
      rate: c.sampleRate,
      white: makeNoiseBuffer(c, false, NOISE_SECONDS, 2),
      brown: makeNoiseBuffer(c, true, NOISE_SECONDS, 2),
      burst: makeNoiseBuffer(c, false, 1, 1),
    };
  }
  return noiseCache;
}

/**
 * Build a soundscape graph on any context. Exported so an OfflineAudioContext
 * harness can render scenes and measure their loudness — keep it pure over
 * (c, destination); only stop() may touch window.
 */
export function createAmbient(
  c: BaseAudioContext,
  type: SoundscapeId,
  destination: AudioNode = c.destination,
): Ambient {
  const noise = noiseFor(c);
  const out = c.createGain();
  out.gain.value = 0.0001;

  // Gentle safety compressor: stacked crackles/waves squeeze, never clip.
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 15;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.3;
  out.connect(comp);
  comp.connect(destination);

  const stoppers: Array<() => void> = [];

  // ── graph helpers ─────────────────────────────────────────────────────────

  /** A looping stereo noise bed: noise → filter chain → gain → out. */
  const bed = (brown: boolean, filters: BiquadFilterNode[], gain: number): GainNode => {
    const src = c.createBufferSource();
    src.buffer = brown ? noise.brown : noise.white;
    src.loop = true;
    const g = c.createGain();
    g.gain.value = gain;
    let node: AudioNode = src;
    for (const f of filters) {
      node.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(out);
    src.start(0, rand(0, NOISE_SECONDS));
    stoppers.push(() => src.stop());
    return g;
  };

  const biquad = (kind: BiquadFilterType, freq: number, q?: number): BiquadFilterNode => {
    const f = c.createBiquadFilter();
    f.type = kind;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  };

  const lfo = (freq: number, depth: number, target: AudioParam): void => {
    const o = c.createOscillator();
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = depth;
    o.connect(g);
    g.connect(target);
    o.start();
    stoppers.push(() => o.stop());
  };

  /** Two LFOs at incommensurate rates — drift instead of a metronome. */
  const drift = (target: AudioParam, slow: number, slowDepth: number, fast: number, fastDepth: number) => {
    lfo(slow, slowDepth, target);
    lfo(fast, fastDepth, target);
  };

  const panner = (p: number): StereoPannerNode => {
    const sp = c.createStereoPanner();
    sp.pan.value = p;
    return sp;
  };

  const env = (g: AudioParam, at: number, peak: number, attack: number, decay: number): void => {
    g.setValueAtTime(0.0001, at);
    g.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  };

  /** Shared-buffer noise one-shot: burst → filter → env gain → pan → out. */
  const burstAt = (
    at: number,
    opts: { rate?: number; filter?: BiquadFilterNode; peak: number; attack?: number; decay: number; pan?: number },
  ): void => {
    const dur = (opts.attack ?? 0.002) + opts.decay;
    const s = c.createBufferSource();
    // Short ticks slice the 1 s burst buffer; long whooshes (waves) loop the
    // seam-crossfaded 10 s bed so they never run out of noise.
    const long = dur > 0.8;
    s.buffer = long ? noise.white : noise.burst;
    s.loop = long;
    s.playbackRate.value = opts.rate ?? 1;
    const g = c.createGain();
    env(g.gain, at, opts.peak, opts.attack ?? 0.002, opts.decay);
    let node: AudioNode = s;
    if (opts.filter) {
      node.connect(opts.filter);
      node = opts.filter;
    }
    node.connect(g);
    g.connect(panner(opts.pan ?? 0)).connect(out);
    s.start(at, rand(0, (long ? NOISE_SECONDS : 1) - Math.min(dur, 0.9)));
    s.stop(at + dur + 0.05);
  };

  /** A short sine/triangle blip with optional frequency glide (birds, clinks). */
  const toneAt = (
    at: number,
    opts: { freq: number; glideTo?: number; type?: OscillatorType; peak: number; attack?: number; decay: number; pan?: number },
  ): void => {
    const o = c.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(opts.freq, at);
    if (opts.glideTo) o.frequency.exponentialRampToValueAtTime(opts.glideTo, at + (opts.attack ?? 0.02) + opts.decay * 0.6);
    const g = c.createGain();
    env(g.gain, at, opts.peak, opts.attack ?? 0.015, opts.decay);
    o.connect(g);
    g.connect(panner(opts.pan ?? 0)).connect(out);
    o.start(at);
    o.stop(at + (opts.attack ?? 0.015) + opts.decay + 0.05);
  };

  // ── audio-clock lookahead scheduler ───────────────────────────────────────
  // Each event layer is a function: "schedule your event at `t`, return the
  // time of the next one". A cheap timer keeps every layer scheduled up to
  // LOOKAHEAD_S ahead on the AUDIO clock, so background-tab timer throttling
  // (≥1 s) can never starve the rhythm or bunch events up.

  const events: Array<{ next: number; fn: (t: number) => number }> = [];
  const on = (initialDelay: number, fn: (t: number) => number): void => {
    events.push({ next: c.currentTime + initialDelay, fn });
  };

  // ── the scenes ────────────────────────────────────────────────────────────

  let baseGain = 0.07;

  switch (type) {
    case 'rain': {
      const body = bed(false, [biquad('bandpass', 1150, 0.5)], 0.5);
      drift(body.gain, 0.071, 0.06, 0.19, 0.03); // swelling sheets of rain
      bed(false, [biquad('highpass', 3800)], 0.17); // high patter shimmer
      bed(true, [biquad('lowpass', 280)], 0.28); // distant low wash
      // individual droplets, dense and scattered across the field
      on(0.3, (t) => {
        burstAt(t, {
          rate: rand(0.9, 1.8),
          filter: biquad('highpass', rand(2500, 4500)),
          peak: rand(0.05, 0.12),
          decay: rand(0.02, 0.05),
          pan: rand(-0.8, 0.8),
        });
        return t + rand(0.06, 0.35);
      });
      baseGain = 0.055;
      break;
    }

    case 'cafe': {
      const murmur = bed(true, [biquad('lowpass', 480)], 0.5);
      drift(murmur.gain, 0.053, 0.08, 0.13, 0.05); // the room breathes
      const chatter = biquad('bandpass', 1000, 1.2);
      bed(false, [chatter], 0.16); // wordless voice band…
      drift(chatter.frequency, 0.31, 160, 0.073, 90); // …that moves like speech
      // cups and spoons, rarely, off to the sides
      on(2, (t) => {
        const p = rand(-0.7, 0.7);
        toneAt(t, { freq: rand(2500, 3900), type: 'triangle', peak: 0.05, attack: 0.003, decay: rand(0.12, 0.2), pan: p });
        if (Math.random() < 0.3) {
          toneAt(t + rand(0.07, 0.12), { freq: rand(2500, 3900), type: 'triangle', peak: 0.03, attack: 0.003, decay: 0.1, pan: p });
        }
        return t + rand(3, 10);
      });
      baseGain = 0.06;
      break;
    }

    case 'lofi': {
      const bedG = bed(false, [biquad('lowpass', 650)], 0.42);
      drift(bedG.gain, 0.047, 0.04, 0.11, 0.02);
      // vinyl crackle
      on(0.2, (t) => {
        burstAt(t, {
          rate: rand(1.2, 2.2),
          filter: biquad('highpass', 3000),
          peak: rand(0.02, 0.05),
          decay: rand(0.01, 0.03),
          pan: rand(-0.5, 0.5),
        });
        return t + rand(0.25, 1.4);
      });
      // a slow chord cycle instead of one endless drone
      const CHORDS = [
        [220.0, 261.63, 329.63], // Am
        [174.61, 220.0, 349.23], // F
        [196.0, 246.94, 293.66], // G-ish
        [164.81, 220.0, 246.94], // Em-ish
      ];
      let chord = 0;
      on(0.5, (t) => {
        const freqs = CHORDS[chord];
        chord = (chord + 1) % CHORDS.length;
        freqs.forEach((f, i) => {
          const pan = (i - 1) * 0.35;
          // main + a softly detuned twin = warm, slightly wobbly pad
          toneAt(t, { freq: f, peak: 0.03, attack: 1.4, decay: 6.5, pan });
          toneAt(t, { freq: f * 1.0017, peak: 0.016, attack: 1.6, decay: 6.2, pan: -pan });
        });
        return t + rand(8.5, 10.5);
      });
      baseGain = 0.075;
      break;
    }

    case 'fireplace': {
      const rumble = bed(true, [biquad('lowpass', 340)], 0.55);
      drift(rumble.gain, 0.087, 0.1, 0.21, 0.04); // fire swells and settles
      bed(false, [biquad('bandpass', 6000, 0.8)], 0.05); // faint air
      // crackles: dense, varied, occasionally double-cracking
      on(0.15, (t) => {
        const crack = (at: number, scale: number) =>
          burstAt(at, {
            rate: rand(0.6, 1.7),
            filter: biquad('highpass', rand(1400, 2600)),
            peak: rand(0.08, 0.22) * scale,
            decay: rand(0.02, 0.07),
            pan: rand(-0.6, 0.6),
          });
        crack(t, 1);
        if (Math.random() < 0.25) crack(t + rand(0.03, 0.06), 0.6);
        return t + rand(0.12, 0.5);
      });
      baseGain = 0.06;
      break;
    }

    case 'forest': {
      const leaves = bed(false, [biquad('bandpass', 3300, 0.45)], 0.3);
      drift(leaves.gain, 0.11, 0.12, 0.043, 0.08); // gusty rustle
      bed(true, [biquad('lowpass', 380)], 0.24); // low breeze
      // bird motifs: 2–4 gliding notes, alternating sides
      let side = 1;
      on(1.5, (t) => {
        side = -side;
        const base = rand(1900, 3100);
        const notes = 2 + Math.floor(rand(0, 3));
        let at = t;
        for (let i = 0; i < notes; i++) {
          const f = base * rand(0.92, 1.12);
          toneAt(at, {
            freq: f,
            glideTo: f * (Math.random() < 0.5 ? 1.15 : 0.88),
            peak: rand(0.025, 0.05),
            attack: 0.02,
            decay: rand(0.08, 0.14),
            pan: side * rand(0.4, 0.8),
          });
          at += rand(0.13, 0.28);
        }
        return t + rand(3.5, 9);
      });
      baseGain = 0.055;
      break;
    }

    case 'waves': {
      bed(true, [biquad('lowpass', 240)], 0.38); // the sea floor hum
      // each wave is its own event: long swell in, hiss at the crest, wash out
      on(0.5, (t) => {
        const attack = rand(2, 3);
        burstAt(t, {
          rate: rand(0.85, 1.1),
          filter: biquad('lowpass', 1200),
          peak: rand(0.4, 0.55),
          attack,
          decay: rand(3, 4.5),
          pan: rand(-0.3, 0.3),
        });
        burstAt(t + attack - 0.2, {
          rate: rand(1.1, 1.4),
          filter: biquad('bandpass', 2400, 0.4),
          peak: rand(0.2, 0.3),
          attack: 0.18,
          decay: rand(1.5, 2.2),
          pan: rand(-0.4, 0.4),
        });
        return t + rand(6.5, 11);
      });
      baseGain = 0.075;
      break;
    }

    case 'wind': {
      const filter = biquad('lowpass', 600);
      const main = bed(false, [filter], 0.4);
      drift(filter.frequency, 0.051, 280, 0.13, 110); // wandering gusts
      drift(main.gain, 0.047, 0.1, 0.117, 0.05);
      const whistleF = biquad('bandpass', 1500, 8);
      bed(false, [whistleF], 0.035); // a thin whistle riding the gusts
      lfo(0.051, 350, whistleF.frequency);
      baseGain = 0.075;
      break;
    }
  }

  // Arm the scheduler (only scenes that registered events pay for it).
  if (events.length > 0) {
    const tick = () => {
      const horizon = c.currentTime + LOOKAHEAD_S;
      for (const e of events) {
        while (e.next < horizon) e.next = e.fn(e.next);
      }
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    stoppers.push(() => clearInterval(id));
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
          comp.disconnect();
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
