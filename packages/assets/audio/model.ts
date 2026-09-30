// The voice model as Studio authors it: the chip's constants and register
// layout, instruments, songs and sound effects, note names and frequency
// conversions, and new songs and sounds. See docs/audio.md.
import {
  AUDIO_SAMPLE_RATE,
  AUDIO_VOICE_COUNT,
  SEQ_OP,
  VOICE_REG,
  VOICE_CONTROL_GATE,
  VOICE_CONTROL_RESET_PHASE,
  compileSong,
  noteFrequency,
  soundWrites,
  stepSample,
} from '@clementina/assets/audio';

export { compileSong, noteFrequency, soundWrites, stepSample };
export type { CompiledSong, CompiledVoice } from '@clementina/assets/audio';

/**
 * SAMPLE_RATE is MIA's tick rate: the sequencer, the envelopes and register
 * writes step once per tick, and every time here (song positions, event
 * durations, write times) counts ticks. The chip plays OUTPUT_PER_TICK samples
 * per tick, at OUTPUT_RATE.
 */
export const SAMPLE_RATE = AUDIO_SAMPLE_RATE,
  OUTPUT_RATE = 48000,
  OUTPUT_PER_TICK = OUTPUT_RATE / SAMPLE_RATE,
  VOICE_COUNT = AUDIO_VOICE_COUNT,
  FRAME_RATE = 60,
  FRAME_SAMPLES = SAMPLE_RATE / FRAME_RATE;
/** C0 to B7: the ROM's `NOTE` range, and all of it fits the 12.4 frequency register. */
export const NOTE_COUNT = 96,
  MAX_FREQ = 0xffff;
export const WAVE_SINE = 0,
  WAVE_PULSE = 1,
  WAVE_SAW = 2,
  WAVE_TRIANGLE = 3,
  WAVE_NOISE = 4;
export const WAVES = ['Sine', 'Pulse', 'Saw', 'Triangle', 'Noise'] as const;
/** Envelope rate nibbles, in milliseconds (docs/audio.md, the tables in audio.c). */
export const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
export const DECAY_RELEASE_MS = [
  6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000,
];
export const PAN_MIN = -64,
  PAN_MAX = 63;
export const MAX_SOUND_FRAMES = 600,
  MAX_SONG_STEPS = 4096,
  MIN_BPM = 20,
  MAX_BPM = 400;
export const STEPS_PER_BEAT = [1, 2, 3, 4, 6, 8];
export const MAX_AUDIO_ASSETS = 255;

/** Sequencer opcodes (audio.h MIA_SEQ_OP_*). */
export const OP = SEQ_OP;
/** Offsets in a voice's 16-byte register record. */
export const REG = VOICE_REG;
export const CONTROL_GATE = VOICE_CONTROL_GATE,
  CONTROL_RESET_PHASE = VOICE_CONTROL_RESET_PHASE;

/**
 * An instrument is what the sequencer's SET_* opcodes can put on a voice
 * between notes: everything in the register record except the frequency,
 * the pan and the gate.
 */
export interface Instrument {
  id: string;
  name: string;
  wave: number;
  pulse: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  volume: number;
}
/** One note on one voice: a semitone (0 = C0) held from `step` for `length` steps. */
export interface SongNote {
  step: number;
  length: number;
  pitch: number;
  instrumentId: string;
  legato?: boolean;
}
/** A voice is one of MIA's four; its notes never overlap, since a voice plays one at a time. */
export interface SongVoice {
  pan: number;
  notes: SongNote[];
}
/**
 * A song is up to four voices on a step grid. Steps are resolved to samples
 * when it compiles, so the sequencer never sees tempo; `loopStart` is the
 * step the song jumps back to at its end, or absent to play once.
 */
export interface Song {
  id: string;
  name: string;
  bpm: number;
  stepsPerBeat: number;
  beatsPerBar: number;
  length: number;
  loopStart?: number;
  voices: SongVoice[];
}
/** One 60 Hz frame of a sound effect: what the driver writes to its voice that frame. */
export interface SoundFrame {
  freq: number;
  volume: number;
  pulse: number;
  wave: number;
  gate: boolean;
}
/** A sound effect: one voice's registers, frame by frame, under one envelope and pan. */
export interface Sound {
  id: string;
  name: string;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  pan: number;
  frames: SoundFrame[];
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(note: number): string {
  const n = Math.round(note);
  return NAMES[((n % 12) + 12) % 12] + Math.floor(n / 12);
}
/** The fractional semitone a frequency register value sounds, C0 = 0; -Infinity for 0 Hz. */
export function frequencyNote(freq: number): number {
  return freq > 0 ? 57 + 12 * Math.log2(freq / 16 / 440) : -Infinity;
}
export function frequencyHz(freq: number): number {
  return freq / 16;
}
export function hzToFrequency(hz: number): number {
  return Math.min(MAX_FREQ, Math.max(0, Math.round(hz * 16)));
}

// Validation shares the SDK's browser-safe audio contract with the project validator.
export {
  validateStudioInstruments as validateInstruments,
  validateStudioSongs as validateSongs,
  validateStudioSounds as validateSounds,
} from '@clementina/assets/audio';

/** A starting set, so a first song has something to draw with. */
export function defaultInstruments(id: () => string): Instrument[] {
  return [
    {
      id: id(),
      name: 'Lead',
      wave: WAVE_PULSE,
      pulse: 128,
      attack: 0,
      decay: 6,
      sustain: 10,
      release: 5,
      volume: 200,
    },
    {
      id: id(),
      name: 'Bass',
      wave: WAVE_TRIANGLE,
      pulse: 128,
      attack: 0,
      decay: 4,
      sustain: 12,
      release: 3,
      volume: 255,
    },
    {
      id: id(),
      name: 'Keys',
      wave: WAVE_SAW,
      pulse: 128,
      attack: 0,
      decay: 7,
      sustain: 6,
      release: 6,
      volume: 170,
    },
    {
      id: id(),
      name: 'Drum',
      wave: WAVE_NOISE,
      pulse: 128,
      attack: 0,
      decay: 2,
      sustain: 0,
      release: 3,
      volume: 230,
    },
  ];
}
/** Four bars of four beats in sixteenths at 120 BPM, looping from the top. */
export function newSong(id: string, name: string): Song {
  return {
    id,
    name,
    bpm: 120,
    stepsPerBeat: 4,
    beatsPerBar: 4,
    length: 64,
    loopStart: 0,
    voices: Array.from({ length: VOICE_COUNT }, () => ({ pan: 0, notes: [] })),
  };
}
/** An A4 pulse held for twelve frames, then released. */
export function newSound(id: string, name: string): Sound {
  return {
    id,
    name,
    attack: 0,
    decay: 5,
    sustain: 10,
    release: 4,
    pan: 0,
    frames: Array.from({ length: 16 }, (_, i) => ({
      freq: noteFrequency(57),
      volume: 200,
      pulse: 128,
      wave: WAVE_PULSE,
      gate: i < 12,
    })),
  };
}
