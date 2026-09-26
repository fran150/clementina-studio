# Audio: sounds, songs and instruments

How Studio models MIA's audio, why it has two audio editors, and exactly what
a song and a sound effect become. This is to audio what [model.md](model.md)
is to graphics. The hardware sources are clementina-mia's
`src/mia/audio/audio.c`, `docs/audio.md`, `docs/audio-sequencer.md` and
`docs/audio-programmer-guide.md`, and clementina-rom's `docs/basic-sound.md`.

## What the hardware has

MIA's audio is a small programmable sound generator, not sample playback:
four voices mixed to stereo 10-bit PWM at 24 000 samples a second. Each voice
is a 16-byte register record at `$12010 + 16·v`:

| Register | Range | Meaning |
| --- | --- | --- |
| `FREQ_L`/`FREQ_H` | 0–65535 | Frequency in Hz × 16 (12.4 fixed point), under 4096 Hz |
| `WAVEFORM` | 0–4 | Sine, pulse, saw, triangle, noise (noise is pitched) |
| `PULSE_WIDTH` | 0–255 | The pulse's duty; 128 is square |
| `ATTACK_DECAY`, `SUSTAIN_RELEASE` | four nibbles | Attack, decay and release are rates (2 ms to 24 s); sustain is a level |
| `VOLUME` | 0–255 | A linear trim after the envelope |
| `PAN` | −64–63 | A linear balance |
| `CONTROL` | gate, reset phase | The gate's rising edge starts the attack, its falling edge the release |

A master `AUDIO_VOLUME`, 0–15, scales the mix.

A voice is driven one of two ways:

- **The background sequencer.** Each voice can run a *track*: bytes in MIA
  RAM of `NOTE` (frequency and duration) and `REST` (duration), where
  durations are 24-bit sample counts, and the zero-duration opcodes
  `SET_WAVE`, `SET_ADSR`, `SET_PULSE`, `SET_VOL` and `SET_PAN`. A track ends
  with `END`, or loops with a `JUMP`. Once `AUDIO_SEQ_START` starts the
  tracks, MIA plays them on its own. The 6502 pays nothing per note.
- **Program writes.** A program writes a voice's registers through its
  index. The writes reach the engine through a 63-entry queue, 16 of them at
  the top of each sample. `AUDIO_VOICE_TAKE` (`VTAKE`) freezes a voice's
  track, without silencing it, so a program can drive the voice.
  `AUDIO_VOICE_RELEASE` (`VGIVE`) hands the voice back, caught up to where
  its track would be had it kept running.

Three details of the firmware shape everything below.

1. **A `NOTE` sets the gate, and an envelope restarts only on the gate's
   rising edge.** Two `NOTE`s in a row therefore slide from one pitch to the
   next under one envelope. A note that should attack again needs the gate
   to fall first. `NOTE` also resets the oscillator's phase every time.
2. **The sequencer holds an event for its duration field plus one sample.**
   The next event is decoded on the sample after the countdown reaches zero.
   clementina-6502's `audio_sequencer_test.go` asserts the same timing.
3. **Nothing on the sequencer changes a frequency except `NOTE`.** So a
   sequenced pitch move resets the phase at every step. A program writing
   `FREQ_L`/`FREQ_H` directly slides smoothly.

## Two editors, one engine

Music and sound effects are made of the same voice registers. The hardware
plays them through two different paths, though, and that difference decides
what each one is:

- A **song** runs on the sequencer: up to four voices at once, notes on a
  musical grid, a loop, no cost to the game. It cannot move a register in
  the middle of a note.
- A **sound effect** is what a program writes to one voice, frame by frame:
  pitch sweeps, volume and pulse-width moves, a noise burst turning into a
  tone. It is written by a small driver, on a voice the song leaves free or
  on one it takes with `VTAKE` for a moment.

So Studio has a **Sounds** editor, which edits registers per frame on lanes,
and a **Music** editor, which edits notes on a piano roll. What they share
is real:

- **One engine.** Both preview on `MiaEngine` in `packages/assets/audio.ts`,
  a port of `audio.c`.
- **One envelope.** Both editors show the envelope as the engine runs it.
- **One vocabulary.** Voice, frame, wave, pulse, volume and pan mean the same
  in both, and the register names in this document.

## Naming

| Studio term | Means | Hardware |
| --- | --- | --- |
| voice | one of four, numbered 0–3 | a register record; one track |
| instrument | waveform, pulse width, envelope and volume, named | what `SET_WAVE`, `SET_ADSR`, `SET_PULSE` and `SET_VOL` put on a voice |
| song | four voices of notes on a step grid, a tempo and a loop | four tracks started together |
| note | a pitch, a start and a length in steps, an instrument, legato or not | a `NOTE`, after a one-sample `REST` when it restarts the envelope |
| sound | one voice's registers for each 60 Hz frame, with one envelope and pan | what a driver writes to the voice it takes |
| frame | 1/60 s: 400 samples | one tick of `TI`, the machine's 60 Hz clock |

Pitches are semitones from C0 to B7 (0–95), the ROM's `NOTE` range. Studio
tunes them in exact equal temperament with A4 = 440 Hz: `round(Hz × 16)`,
the values in clementina-mia's programmer guide. The ROM builds its `NOTE`
table by doubling a rounded octave 0, which drifts a few cents sharp in the
top octaves.

## Songs

A song has a tempo in beats per minute (20–400), a number of steps per beat
(1, 2, 3, 4, 6 or 8), beats per bar for the grid, a length of up to 4096
steps, and an optional loop start. It always has four voices, since MIA has
four. Each voice has a pan and a list of notes that never overlap: a voice
plays one note at a time. A voice without notes compiles to nothing and stays
free for sound effects.

`compileSong` turns a song into one track per voice, which is the whole
recipe for its bytes:

- **Time.** Steps become samples once, at the song's tempo. Each step
  boundary is rounded, rather than each duration, so every voice keeps the
  same clock: a boundary falls on the same sample in every track. Every
  event's duration field is its length in samples minus one, because of the
  extra sample the sequencer holds. Events longer than 2²⁴ samples are
  split.
- **Pan.** A `SET_PAN` opens each track.
- **Instruments.** Before each note come the `SET_*` opcodes for what its
  instrument changes on the voice. Nothing is assumed at the start of a
  track, nor at the loop start, where playback arrives from two places.
- **Articulation.** A note that restarts its envelope is preceded by a
  one-sample `REST`, so the gate falls and rises again. A **legato** note
  skips it and slides from the note before, the way a tied note would.
- **Loop.** A note held across the loop start is split there. The track
  ends with a `JUMP` back to the loop start, or with `END`. The loop body
  has the same length in samples in every voice, so the voices stay
  together through every pass.

The Song panel shows each voice's size in bytes as it would sit in MIA RAM.

## Sound effects

A sound has an envelope, a pan, and 1 to 600 frames. Each frame holds a
frequency, a volume, a pulse width, a waveform and the gate. `soundWrites`
is what a driver writes, frame by frame:

- On the first frame, the whole register record.
- On each later frame, only the registers that change.
- Raising the gate also resets the phase, as the ROM's `NOTE` does, so each
  attack starts the same way.
- After the last frame, the gate falls, and the release plays out.

The Generate buttons make the effects games ask for most, sfxr-style: blip,
coin, jump, laser, explosion, hit, power-up and random. Each click is a new
take, from a new seed. `generateSound(preset, seed)` makes the same sound
again from the same seed.

## Preview fidelity

`MiaEngine` reproduces `audio.c` sample for sample:

- the sine table, the oscillators and the noise generator;
- the envelope's rate and level tables;
- the fixed-point gain, pan and master stages, and the 10-bit clamp;
- the live-write queue;
- the sequencer, with its budgets and the `VOICE_RELEASE` catch-up.

`npm run test:firmware` holds it to that. It compiles clementina-mia's own
`audio.c` on the desktop, against the stub headers in `tests/firmware/`, and
plays every scenario in `tests/firmware/audio-scenarios.mjs` on both the
firmware and the engine. It compares every sample. The scenarios exercise
each waveform, envelopes, pan and master volume, the write queue, compiled
songs with legato and loops, every generated sound, and a sound taking a
voice from a song and giving it back. The firmware's output hashes are
recorded in `tests/audio.test.mjs`, so `npm test` checks the engine without
the firmware checkout. Rerun the cross-check when the firmware's audio
changes.

Not modeled: the PWM output stage and its filtering, and the timing of the
6502 that issues the commands. A song played from partway through is first
run silently from its start up to that point, so every register and envelope
is where the chip would have it. Muting a voice while previewing leaves its
track unloaded.

## Authoring versus output

Stored in the project: instruments, songs and sounds.

To be exported, once the build step exists:

- each song's tracks, with the bytes `compileSong` produces;
- each sound's frames, with a driver that writes them as `soundWrites` does.

Not exported: which voice is being drawn on, mutes, the cursor, zoom, and
snap. They are editor state.

## Build step

Not written yet. For audio it will:

- choose track bases in the free RAM at `$14000–$3FFFF`;
- issue `AUDIO_SEQ_SET_BASE<v>` and `AUDIO_SEQ_LOAD`, then start the voices
  together;
- include the sound-effect driver in the runtime routine library.

Which voices a scene's song leaves free for its sound effects is a scene
decision.

## Findings for the firmware and ROM

Found while building this; recorded here rather than worked around silently.

- **`docs/audio-sequencer.md` says a `NOTE` holds for `dur` samples; the
  interrupt holds `dur + 1`.** Studio writes one less. `TRACK` writes
  `ticks × 150`, so each of its events runs one sample long. Its voices
  therefore drift apart by one sample per event: a sixteenth-note part
  against a whole-note part slips about 0.6 ms a bar.
- **`TRACK` never lowers the gate between notes.** Rule 1 above then makes
  every run of notes one slide under one envelope. Under a plucked envelope
  with sustain 0, only the first note of `"C D E F"` is heard. Studio avoids
  this with a one-sample `REST` before each note that should attack again.
- **The sequencer has no way to move a frequency without `NOTE`.** A
  zero-duration `SET_FREQ` opcode, with no gate and no phase reset, would
  let sound effects run on the sequencer with their sweeps intact, at no
  6502 cost. It would also give songs true portamento.

## Editors

**Sounds.** A library of sounds on the left. The frames run across five
lanes:

- pitch, on a log scale that snaps to semitones while Snap is on;
- volume and pulse width, dimmed on frames whose waveform is not pulse;
- waveform;
- gate.

The pencil (B) draws values, the line (L) drags an even ramp (an even pitch
sweep, a volume fade), and the eraser (E) and a painting tool's right button
write 0. The Select tool (S) takes a range of frames to copy, cut, paste,
duplicate or delete. The right rail reverses the frames (Shift+H), inverts
their pitch (Shift+V) and transposes them (↑ and ↓; Shift for an octave);
these act on the whole sound when no frames are selected. The Sound panel on
the right holds the envelope with its curve, the pan, the length, the
Generate buttons, and a readout of the frame under the pointer.

**Music.** Songs and instruments are libraries on the left. The main area
holds:

- a voice strip, which picks the voice to draw on (1–4) and mutes voices for
  the preview;
- a piano roll, where the other voices show dimmed behind the one being
  drawn on;
- a transport under the roll.

The pencil adds a note of the last length, and dragging sizes it. It drags
a note to move it and its end to resize it; right-click erases. Notes placed
on a voice cut whatever they land on, since a voice plays one note at a
time. The Select tool (S) boxes notes. ← and → move them a step; ↑ and ↓
transpose them (Shift for an octave); Shift+H reverses them in time and
Shift+V inverts them; L makes them legato, drawn joined to the note before.
Clicking an instrument gives it to the selected notes.

The ruler sets the cursor that playing and pasting start from. Its
right-click menu plays from there or sets the loop. The Song panel holds the
tempo, step size, meter, length, loop, each voice's pan and the sequencer
sizes. The Instrument panel holds the waveform, pulse width, volume and
envelope. Click the roll's keyboard to hear the instrument. A song plays on
from wherever it is when it is edited.

Space plays and stops in both editors when tapped, and pans while held, as
it does on every canvas.
