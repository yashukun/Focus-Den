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

## Ambient soundscapes (engine reworked 2026-08)

`setSoundscape(id | null)` builds a WebAudio graph per scene via
`createAmbient(ctx, type, destination)`; `stop()` fades ~0.7 s then tears the
graph down. Volume = `baseGain × settings.soundscapeVolume`, ramped smoothly.
`createAmbient` deliberately takes any `BaseAudioContext` + destination so an
**OfflineAudioContext harness can render scenes and measure RMS** — that's how
the per-scene `baseGain`s were balanced (bright rain ≈ .008 RMS, darker scenes
proportionally under, lofi gentlest ≈ .004). Re-run that harness after any
gain change.

Engine rules (each one fixes a diagnosed weakness — keep them true):

1. **Beds loop a 10 s stereo noise buffer** with the tail crossfaded into the
   head (no audible pattern, no seam tick), per-channel independent noise
   (real stereo width), DC-removed and peak-normalized. Cached per sample
   rate in `noiseFor`.
2. **2–3 layers per scene** (body + air + detail) built with the `bed`/
   `biquad` helpers, never one filtered noise.
3. **Events ride the audio clock**: `on(delay, t => nextT)` layers are kept
   scheduled 2 s ahead by a 400 ms lookahead tick — rhythm survives
   background-tab timer throttling and main-thread jank.
4. **One shared burst buffer** for all noise one-shots (`burstAt`); long
   whooshes (waves) loop the 10 s bed instead. No per-event allocation.
5. **Modulation drifts** — two LFOs at incommensurate rates (`drift`), never
   a single metronomic sine. Events pan across the field (`panner`).
6. **A gentle DynamicsCompressor** on the scene bus stops stacked events
   clipping. Exponential envelopes always floor at 0.0001.

| Scene | Layers |
|---|---|
| rain | bandpass body (drifting) + high patter shimmer + brown low wash + scheduled panned droplets |
| cafe | brown murmur (breathing) + bandpass "voice" band whose center drifts like speech + rare cup clinks (sometimes double) |
| lofi | warm lowpass bed + vinyl crackle + a 4-chord pad cycle (detuned sine pairs, slow attack/decay) |
| fireplace | brown rumble (swelling) + faint air hiss + dense varied crackles with occasional double-cracks |
| forest | gusty bandpass leaves + brown breeze + 2–4-note gliding bird motifs alternating sides |
| waves | deep brown hum + each wave as an event: long swell, crest hiss, wash-out (6.5–11 s apart) |
| wind | lowpass main with wandering cutoff + gain gusts + a thin high-Q whistle riding the same gusts |

## Click-consistency fixes (2026-08)

- **Warmup**: `warmup()` (= ensure + resume the context) runs on every
  `pointerdown` via App — the first real cue has no create/resume latency and
  an OS-suspended context recovers before the next interaction.
- **SFX loudness-matched**: gains lean against the equal-loudness curve —
  bright triangles (coin 1319 Hz) get less gain, low/mid sines (switch/start)
  get more, so cues land at a similar perceived level.

## Remaining known gaps

- **Policy drift** — default-on click sound + scattered `data-sound="none"`
  opt-outs means every new button decides implicitly. Fix under
  consideration: invert to opt-in.
- Loudness balance is RMS-based (offline harness), not eartested — worth a
  human listening pass across scenes/volumes, especially lofi's pad level.
