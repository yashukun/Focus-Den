# Sound (`src/audio.ts`)

Everything is synthesized with the Web Audio API — **no audio files anywhere**
(a house rule; keeps the app zero-asset). Two independent systems share one
lazily-created `AudioContext`: short SFX and looping ambient soundscapes.

## Context & mute

- The `AudioContext` is created on the first sound (always follows a user
  gesture → satisfies autoplay policies) with a master gain of **0.5**.
- SFX mute is a device preference persisted at localStorage key
  `focus-den/sound` (`'off'`/`'on'`) — separate from the state document.
  The header 🔊 button toggles it. Soundscapes ignore the SFX mute; they have
  their own on/off + volume in `settings` (persisted in the document).

## SFX

`play(name)` — soft sine/triangle blips ("cute, not loud"), built from
`note(freq, at, dur)` envelopes (8 ms attack, exponential decay):

| Name | Cue | Recipe |
|---|---|---|
| `click` | any button (default) | 720 Hz triangle, 60 ms, gain .045 |
| `task` | logging a win / intention | 900 Hz triangle pop |
| `switch` | status switch, check-offs | 523→659 Hz two-note rise |
| `coin` | shop purchase | 988→1319 Hz triangle |
| `start` | settle in / Focus CTA | 523-659-784 arpeggio |
| `success` | day finalized | 4-note fanfare (fires from App on summary appear) |
| `alert` | breather overran → Away | 440→330 Hz descend (fires from App on `clean` flip) |

### Click routing policy

A single `document`-level click listener in `App.tsx` plays for every
`<button>`: `data-sound="<name>"` picks a richer cue, `data-sound="none"`
silences (used when a handler plays imperatively — `TaskLog`, the plan
composers — or for quiet controls like calendar cells and edit-mode tools).
Buttons with no attribute get `click`.

## Ambient soundscapes

`setSoundscape(id | null)` builds a WebAudio graph per scene inside
`createAmbient`; `stop()` fades out over ~0.7 s then tears the graph down.
Volume = `baseGain × settings.soundscapeVolume`, ramped smoothly.

Building blocks: a 2 s looped noise buffer (`makeNoise`, white or leaky-
integrator brown), biquad filters, sine LFOs, `setInterval`-scheduled bursts.

| Scene | Graph |
|---|---|
| rain | white noise → bandpass 1300 Hz (Q .6) |
| cafe | brown noise → lowpass 620 Hz |
| lofi | white noise → lowpass 900 Hz + constant 220/277 Hz sine pad |
| fireplace | brown noise → lowpass 420 Hz + random highpass crackle bursts every ~170 ms |
| forest | white noise → bandpass 3.4 kHz, gain LFO .15 Hz + occasional two-note chirps |
| waves | brown noise → lowpass 500 Hz, gain LFO .1 Hz (swell) |
| wind | white noise → lowpass 700 Hz, filter-freq LFO .07 Hz ±400 Hz |

## Known weaknesses (diagnosed 2026-08; fix planned, not yet done)

Quality:
1. **2 s noise loop is audible** (repeating "swish", no seam crossfade) — the
   single biggest cheapness. Fix: 8–10 s buffers with crossfaded seams.
2. **One source + one filter per scene** — rain has no droplets/rumble, café
   no murmur. Fix: 2–3 layers per scene.
3. **`setInterval` scheduling** — crackles/chirps stall in background tabs
   (timer throttling) and jitter. Fix: audio-clock lookahead scheduler.
4. **Each crackle allocates a fresh 2 s buffer** (~350 KB, ×4/s) — GC churn.
   Fix: one shared burst buffer.
5. **Pure-sine LFOs** sound synthetic (waves/wind). Fix: noise-driven or
   multi-rate modulation. Also: everything is **mono** (no stereo width), no
   limiter (fireplace can clip), noise not peak-normalized (scene loudness
   varies).

Consistency:
6. **First-click latency** — the context is created/resumed lazily, so the
   first sound after load/sleep can lag 50–300 ms or drop. Fix: eagerly
   create + resume on first `pointerdown`.
7. **Policy drift** — default-on click sound + 37 scattered `data-sound="none"`
   opt-outs means every new button makes a decision implicitly. Fix under
   consideration: invert to opt-in.
8. Equal gain ≠ equal loudness across cues (1319 Hz triangle ≫ 523 Hz sine
   perceptually); cues need loudness-matching by ear.
