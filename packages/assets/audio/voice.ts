// The engine's parts below the mix: audio.c's rate, level and sine tables,
// one voice's oscillator and envelope, and the sequencer's record decoding.
// engine.ts drives them.
import {
  ATTACK_MS,
  DECAY_RELEASE_MS,
  SAMPLE_RATE,
  WAVE_NOISE,
  WAVE_PULSE,
  WAVE_SAW,
  WAVE_SINE,
  WAVE_TRIANGLE,
} from './model.js';

const ENV_MAX = 256 * 65536;
const rate = (ms: number) => Math.floor((ENV_MAX * 1000) / (SAMPLE_RATE * ms));
const ATTACK_RATES = ATTACK_MS.map(rate),
  DECAY_RATES = DECAY_RELEASE_MS.map(rate);
const LEVELS = [0, 17, 34, 51, 68, 85, 102, 119, 137, 154, 171, 188, 205, 222, 239, 256].map(
  (v) => v * 65536,
);
const lround = (v: number) => (v < 0 ? -Math.round(-v) : Math.round(v));
const SINE = Int8Array.from({ length: 256 }, (_, i) =>
  lround(Math.sin(((Math.PI * 2) / 256) * i) * 127),
);
export const RELEASE = 0,
  ATTACK = 1,
  DECAY = 2,
  SUSTAIN = 3;
/** Output is a 10-bit PWM level around its center. */
export const OUT_MIN = -512,
  OUT_MAX = 511,
  OUT_SCALE = 512;

export interface Voice {
  freq: number;
  inc: number;
  pulse: number;
  volume: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  wave: number;
  control: number;
  panL: number;
  panR: number;
  sample: number;
  adsr: number;
  vol: number;
  phase: number;
  noise1: number;
  noise2: number;
}
export interface Sequencer {
  /** Whether a track base was set; without one, AUDIO_SEQ_START leaves the voice stopped. */
  hasTrack: boolean;
  running: boolean;
  taken: boolean;
  catchingUp: boolean;
  bytes: Uint8Array;
  cursor: number;
  countdown: number;
  eventDuration: number;
  catchupRemaining: number;
  takenAt: number;
  noteIndex: number;
}
export const RECORD_SIZE = [0, 6, 4, 2, 3, 2, 2, 2, 4];
export const read24 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) >>> 0;

export function emptySequencer(): Sequencer {
  return {
    hasTrack: false,
    running: false,
    taken: false,
    catchingUp: false,
    bytes: new Uint8Array(0),
    cursor: 0,
    countdown: 0,
    eventDuration: 0,
    catchupRemaining: 0,
    takenAt: 0,
    noteIndex: 0,
  };
}
/** A JUMP's signed 24-bit offset is relative to the byte after its own record. */
export function jumpTarget(b: Uint8Array, at: number): number {
  return at + 4 + ((read24(b, at + 1) << 8) >> 8);
}
export function next(s: Voice): number {
  const old = s.phase;
  s.phase = (s.phase + s.inc) >>> 0;
  const p = s.phase >>> 24;
  switch (s.wave) {
    case WAVE_SINE:
      return SINE[p];
    case WAVE_PULSE:
      return p < s.pulse ? 127 : -127;
    case WAVE_SAW:
      return 127 - p;
    case WAVE_TRIANGLE:
      return p < 128 ? p * 2 - 128 : 127 - (p - 128) * 2;
    case WAVE_NOISE:
      if (s.phase < old) {
        s.noise1 = (s.noise1 ^ s.noise2) >>> 0;
        s.noise2 = (s.noise2 + s.noise1) >>> 0;
        s.sample = ((s.noise2 & 255) << 24) >> 24;
      }
      return s.sample;
    default:
      return 0;
  }
}
export function envelopeStep(s: Voice): void {
  const target = LEVELS[s.sustain];
  switch (s.adsr) {
    case ATTACK:
      s.vol += ATTACK_RATES[s.attack];
      if (s.vol >= ENV_MAX) {
        s.vol = ENV_MAX;
        s.adsr = DECAY;
      }
      break;
    case DECAY: {
      const r = DECAY_RATES[s.decay];
      if (s.vol <= target || s.vol <= target + r) {
        s.vol = target;
        s.adsr = SUSTAIN;
      } else s.vol -= r;
      break;
    }
    case SUSTAIN:
      s.vol = target;
      break;
    default: {
      const r = DECAY_RATES[s.release];
      s.vol = s.vol <= r ? 0 : s.vol - r;
    }
  }
}
