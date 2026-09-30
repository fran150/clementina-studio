// MIA audio as Studio authors it: the voice model, instruments, songs and
// sound effects, and the engine that previews them. The compiler that turns a
// song into the MIA background sequencer's bytecode, and a sound into its
// register writes, is @clementina/assets' - the SDK builds the game's files
// with the same code Studio previews. See docs/audio.md.
//
// The engine is clementina-mia src/mia/audio/audio.c, bit for bit: the same
// sine table, oscillators and noise generator, envelope rate and level
// tables, fixed-point gain chain, pan law and 10-bit output clamp — and the
// same sequencer, timing included. The sequencer holds a NOTE or REST for its
// duration field *plus one* tick: audio_seq_step decodes the next event on
// the tick after its countdown reaches zero (clementina-6502's
// audio_sequencer_test.go asserts the same), so the compiler writes one less
// than the ticks an event should last. A preview is what the chip
// plays, sample for sample, before its PWM output stage.
//
// The renderer loads this module as it is; editor.html's import map resolves
// @clementina/assets/audio, which itself imports nothing.
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

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Engine: audio.c's voices, mix and sequencer
// ---------------------------------------------------------------------------

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
const RELEASE = 0,
  ATTACK = 1,
  DECAY = 2,
  SUSTAIN = 3;
/** Output is a 10-bit PWM level around its center. */
const OUT_MIN = -512,
  OUT_MAX = 511,
  OUT_SCALE = 512;

interface Voice {
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
interface Sequencer {
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
const RECORD_SIZE = [0, 6, 4, 2, 3, 2, 2, 2, 4];
const read24 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) >>> 0;

/** MIA's audio block and sequencer, as audio.c runs them in its 48 kHz interrupt (a 24 kHz tick). */
export class MiaEngine {
  /** Each voice's 16-byte register record, as MIA RAM holds it. */
  readonly regs = new Uint8Array(16 * VOICE_COUNT);
  /** AUDIO_VOLUME as MIA RAM holds it, and as the engine last applied it. */
  masterRegister = 15;
  master = 15;
  /** Free-running sample counter (audio_seq_clock). */
  clock = 0;
  /** How many tracks have reached their end (each would raise IRQ_AUDIO_SEQ_DONE). */
  finishedTracks = 0;
  private voices: Voice[] = [];
  private seqs: Sequencer[] = [];
  constructor() {
    this.reset();
  }

  /** AUDIO_RESET then AUDIO_ENABLE: every voice at the firmware's defaults, synced, and no tracks. */
  reset(): void {
    this.regs.fill(0);
    this.masterRegister = this.master = 15;
    this.clock = 0;
    this.finishedTracks = 0;
    this.voices = [];
    this.seqs = [];
    this.queue = [];
    this.overflow = false;
    for (let v = 0; v < VOICE_COUNT; v++) {
      const b = v * 16;
      this.regs[b + REG.PULSE_WIDTH] = 128;
      this.regs[b + REG.SUSTAIN_RELEASE] = 0xf5;
      this.regs[b + REG.WAVEFORM] = WAVE_PULSE;
      this.regs[b + REG.VOLUME] = 255;
      this.voices.push({
        freq: 0,
        inc: 0,
        pulse: 128,
        volume: 255,
        attack: 0,
        decay: 0,
        sustain: 15,
        release: 5,
        wave: WAVE_PULSE,
        control: 0,
        panL: 64,
        panR: 64,
        sample: 0,
        adsr: RELEASE,
        vol: 0,
        phase: 0,
        noise1: (0x67452301 + v * 0x11111111) >>> 0,
        noise2: (0xefcdab89 - v * 0x01010101) >>> 0,
      });
      this.seqs.push(emptySequencer());
    }
  }

  /**
   * A program's write to a voice register. It lands in MIA RAM at once and
   * reaches the engine through the live-write queue (mia_audio_core1_on_write):
   * 63 entries, 16 applied at the top of each sample.
   */
  write(voice: number, field: number, value: number): void {
    value &= 255;
    this.regs[voice * 16 + field] = value;
    this.enqueue(16 + voice * 16 + field, value);
  }
  /** A program's write to the header's AUDIO_VOLUME, 0-15. */
  setMaster(value: number): void {
    this.masterRegister = value & 255;
    this.enqueue(1, this.masterRegister);
  }
  private queue: number[] = [];
  private overflow = false;
  private enqueue(loc: number, value: number): void {
    if (this.queue.length >= 2 * 63) this.overflow = true;
    else this.queue.push(loc, value);
  }
  // audio_drain_queue: an overflow drops the queue and resyncs from RAM.
  private drain(): void {
    if (this.overflow) {
      this.master = this.masterRegister;
      for (let v = 0; v < VOICE_COUNT; v++) this.sync(v);
      this.queue = [];
      this.overflow = false;
      return;
    }
    for (let n = 0; n < 16 && this.queue.length; n++) {
      const loc = this.queue.shift()!,
        value = this.queue.shift()!;
      if (loc === 1) this.master = value;
      else if (loc >= 16 && loc < 16 + 16 * VOICE_COUNT)
        this.apply((loc - 16) >> 4, (loc - 16) & 15, value);
    }
  }
  // audio_sync_voice_registers.
  private sync(voice: number): void {
    const b = voice * 16;
    for (const field of [
      REG.FREQ_L,
      REG.PULSE_WIDTH,
      REG.VOLUME,
      REG.ATTACK_DECAY,
      REG.SUSTAIN_RELEASE,
      REG.WAVEFORM,
      REG.PAN,
      REG.CONTROL,
    ])
      this.apply(voice, field, this.regs[b + field]);
  }
  /** Applies a register value to the voice (audio_apply_register); the sequencer's writes come straight here. */
  private apply(voice: number, field: number, value: number): void {
    const b = voice * 16;
    this.regs[b + field] = value;
    const s = this.voices[voice];
    switch (field) {
      case REG.FREQ_L:
      case REG.FREQ_H:
        s.freq = this.regs[b] | (this.regs[b + 1] << 8);
        // (freq_q4 << 32) / (OUTPUT_RATE * 16), exactly: 2^32 / 768000 is 2^21 / 375.
        s.inc = s.freq ? Math.floor((s.freq * 2097152) / 375) : 0;
        break;
      case REG.PULSE_WIDTH:
        s.pulse = value;
        break;
      case REG.VOLUME:
        s.volume = value;
        break;
      case REG.ATTACK_DECAY:
        s.attack = value >> 4;
        s.decay = value & 15;
        break;
      case REG.SUSTAIN_RELEASE:
        s.sustain = value >> 4;
        s.release = value & 15;
        break;
      case REG.WAVEFORM:
        s.wave = value & 15;
        break;
      case REG.PAN: {
        const pan = Math.max(PAN_MIN, Math.min(PAN_MAX, (value << 24) >> 24));
        s.panL = 64 - pan;
        s.panR = 64 + pan;
        break;
      }
      case REG.CONTROL: {
        const was = s.control & CONTROL_GATE,
          now = value & CONTROL_GATE;
        if (value & CONTROL_RESET_PHASE) s.phase = 0;
        if (!was && now) {
          s.adsr = ATTACK;
          s.vol = 0;
        } else if (was && !now) s.adsr = RELEASE;
        s.control = value;
        break;
      }
    }
  }

  /** A track's bytes, as if written at its voice's track_base, then AUDIO_SEQ_LOAD. */
  loadTrack(voice: number, bytes: Uint8Array): void {
    this.seqs[voice] = { ...emptySequencer(), bytes, hasTrack: true };
  }
  start(mask: number): void {
    this.each(mask, (s) => {
      if (!s.hasTrack) return;
      s.running = true;
      s.taken = false;
      s.catchingUp = false;
    });
  }
  stop(mask: number): void {
    this.each(mask, (s, v) => {
      s.running = false;
      s.taken = false;
      s.catchingUp = false;
      this.gate(v, false);
    });
  }
  /** AUDIO_VOICE_TAKE: freeze a voice's track without silencing it. */
  take(mask: number): void {
    this.each(mask, (s) => {
      s.taken = true;
      s.takenAt = this.clock;
    });
  }
  /** AUDIO_VOICE_RELEASE: hand a voice back, caught up to where its track would be. */
  release(mask: number): void {
    this.each(mask, (s) => {
      if (!s.taken) return;
      s.taken = false;
      if (!s.running) return;
      const total = s.eventDuration - s.countdown + ((this.clock - s.takenAt) >>> 0);
      if (total < s.eventDuration) s.countdown = s.eventDuration - total;
      else {
        s.catchingUp = true;
        s.catchupRemaining = total - s.eventDuration;
      }
    });
  }
  isRunning(voice: number): boolean {
    return this.seqs[voice].running;
  }
  /** CUE(v): notes and rests decoded since the track was loaded. */
  noteIndex(voice: number): number {
    return this.seqs[voice].noteIndex & 0xffff;
  }
  /** Whether every voice has finished its release. */
  silent(): boolean {
    return this.voices.every((s) => s.adsr === RELEASE && s.vol === 0);
  }
  /** A voice's envelope level, 0-256. */
  level(voice: number): number {
    return this.voices[voice].vol >>> 16;
  }

  /**
   * Runs `count` ticks: each is audio_irq_handler's control step (register
   * writes, sequencer, envelopes) and then its OUTPUT_PER_TICK samples,
   * written as floats in [-1, 1) from sample `offset * OUTPUT_PER_TICK` in
   * `left` and `right` when given.
   */
  render(count: number, left?: Float32Array, right?: Float32Array, offset = 0): void {
    const voices = this.voices;
    for (let n = 0; n < count; n++) {
      this.clock = (this.clock + 1) >>> 0;
      if (this.queue.length || this.overflow) this.drain();
      for (let v = 0; v < VOICE_COUNT; v++) this.step(v);
      for (let v = 0; v < VOICE_COUNT; v++) envelopeStep(voices[v]);
      const gain = (this.master & 15) * 17;
      for (let k = 0; k < OUTPUT_PER_TICK; k++) {
        let l = 0,
          r = 0;
        for (let v = 0; v < VOICE_COUNT; v++) {
          const s = voices[v];
          let x = next(s);
          x = (x * (s.vol >>> 16)) >> 8;
          x = (x * s.volume) >> 8;
          l += (x * s.panL) >> 7;
          r += (x * s.panR) >> 7;
        }
        l = (l * gain) >> 8;
        r = (r * gain) >> 8;
        const at = (offset + n) * OUTPUT_PER_TICK + k;
        if (left) left[at] = Math.max(OUT_MIN, Math.min(OUT_MAX, l)) / OUT_SCALE;
        if (right) right[at] = Math.max(OUT_MIN, Math.min(OUT_MAX, r)) / OUT_SCALE;
      }
    }
  }

  private each(mask: number, fn: (s: Sequencer, voice: number) => void): void {
    for (let v = 0; v < VOICE_COUNT; v++) if (mask & (1 << v)) fn(this.seqs[v], v);
  }
  private gate(voice: number, on: boolean): void {
    this.apply(voice, REG.CONTROL, on ? CONTROL_GATE | CONTROL_RESET_PHASE : 0);
  }
  private finish(voice: number): void {
    const s = this.seqs[voice];
    s.running = false;
    s.catchingUp = false;
    this.gate(voice, false);
    this.finishedTracks++;
  }
  private note(voice: number, at: number): void {
    const b = this.seqs[voice].bytes;
    this.apply(voice, REG.FREQ_L, b[at + 1]);
    this.apply(voice, REG.FREQ_H, b[at + 2]);
    this.gate(voice, true);
  }
  private config(voice: number, at: number, op: number): void {
    const b = this.seqs[voice].bytes;
    switch (op) {
      case OP.SET_WAVE:
        this.apply(voice, REG.WAVEFORM, b[at + 1]);
        break;
      case OP.SET_ADSR:
        this.apply(voice, REG.ATTACK_DECAY, b[at + 1]);
        this.apply(voice, REG.SUSTAIN_RELEASE, b[at + 2]);
        break;
      case OP.SET_PAN:
        this.apply(voice, REG.PAN, b[at + 1]);
        break;
      case OP.SET_VOL:
        this.apply(voice, REG.VOLUME, b[at + 1]);
        break;
      case OP.SET_PULSE:
        this.apply(voice, REG.PULSE_WIDTH, b[at + 1]);
        break;
    }
  }
  /** Starts the event at the cursor: a NOTE gates on, a REST gates off. */
  private event(voice: number, op: number, size: number, duration: number): void {
    const s = this.seqs[voice];
    if (op === OP.NOTE) this.note(voice, s.cursor);
    else this.gate(voice, false);
    s.noteIndex++;
    s.eventDuration = duration;
    s.countdown = duration;
    s.cursor += size;
  }
  private step(voice: number): void {
    const s = this.seqs[voice];
    if (!s.running || s.taken) return;
    if (s.catchingUp) this.catchup(voice);
    else if (s.countdown > 0) s.countdown--;
    else this.advance(voice);
  }
  // audio_seq_advance: zero-duration opcodes apply at once, up to a budget of 32.
  private advance(voice: number): void {
    const s = this.seqs[voice];
    for (let budget = 32; ; budget--) {
      if (s.cursor < 0 || s.cursor >= s.bytes.length) {
        this.finish(voice);
        return;
      }
      const op = s.bytes[s.cursor],
        size = RECORD_SIZE[op] ?? 0;
      if (!size) {
        this.finish(voice);
        return;
      }
      if (op === OP.NOTE || op === OP.REST) {
        this.event(voice, op, size, read24(s.bytes, s.cursor + (op === OP.NOTE ? 3 : 1)));
        return;
      }
      if (op === OP.JUMP) s.cursor = jumpTarget(s.bytes, s.cursor);
      else {
        this.config(voice, s.cursor, op);
        s.cursor += size;
      }
      if (budget === 0) {
        this.finish(voice);
        return;
      }
    }
  }
  // audio_seq_catchup_step: skips events wholly in the past, 8 per sample.
  private catchup(voice: number): void {
    const s = this.seqs[voice];
    for (let budget = 8; budget > 0 && s.catchingUp; budget--) {
      if (s.cursor < 0 || s.cursor >= s.bytes.length) {
        this.finish(voice);
        return;
      }
      const op = s.bytes[s.cursor],
        size = RECORD_SIZE[op] ?? 0;
      if (!size) {
        this.finish(voice);
        return;
      }
      if (op === OP.JUMP) {
        s.cursor = jumpTarget(s.bytes, s.cursor);
        continue;
      }
      if (op === OP.NOTE || op === OP.REST) {
        const duration = read24(s.bytes, s.cursor + (op === OP.NOTE ? 3 : 1));
        if (duration <= s.catchupRemaining) {
          s.catchupRemaining -= duration;
          s.noteIndex++;
          s.cursor += size;
          continue;
        }
        s.catchingUp = false;
        this.event(voice, op, size, duration);
        return;
      }
      this.config(voice, s.cursor, op);
      s.cursor += size;
    }
  }
}
function emptySequencer(): Sequencer {
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
function jumpTarget(b: Uint8Array, at: number): number {
  return at + 4 + ((read24(b, at + 1) << 8) >> 8);
}
function next(s: Voice): number {
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
function envelopeStep(s: Voice): void {
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

// ---------------------------------------------------------------------------
// Songs: samples back to steps (stepSample and compileSong are the SDK's)
// ---------------------------------------------------------------------------

/** The fractional step a sample falls on. */
export function sampleStep(song: Pick<Song, 'bpm' | 'stepsPerBeat'>, sample: number): number {
  return (sample * song.bpm * song.stepsPerBeat) / (SAMPLE_RATE * 60);
}
/** Where in the song a sample played from its start lands, following the loop. */
export function songSample(
  song: Pick<Song, 'bpm' | 'stepsPerBeat' | 'length' | 'loopStart'>,
  sample: number,
): number {
  const end = stepSample(song, song.length);
  if (sample < end) return sample;
  if (song.loopStart === undefined) return end;
  const loop = stepSample(song, song.loopStart);
  return loop + ((sample - loop) % (end - loop));
}

// ---------------------------------------------------------------------------
// Streams: what the editors play
// ---------------------------------------------------------------------------

export interface AudioStream {
  /**
   * Renders up to `count` ticks from tick `offset` into both channels,
   * OUTPUT_PER_TICK samples each; returns how many ticks, 0 once finished.
   */
  render(left: Float32Array, right: Float32Array, count: number, offset?: number): number;
  /** Ticks rendered so far. */
  readonly position: number;
  readonly finished: boolean;
}
/** The longest a release is heard after its sound or song ends. */
const TAIL_SAMPLES = 4 * SAMPLE_RATE;

/** Timed register writes on one engine: a sound effect, or a note auditioning an instrument. */
class WriteStream implements AudioStream {
  position = 0;
  finished = false;
  private engine = new MiaEngine();
  private index = 0;
  constructor(
    private writes: Array<{ at: number; voice: number; field: number; value: number }>,
    private until: number,
  ) {}
  render(left: Float32Array, right: Float32Array, count: number, offset = 0): number {
    let done = 0;
    while (done < count && !this.finished) {
      while (this.index < this.writes.length && this.writes[this.index].at <= this.position) {
        const w = this.writes[this.index++];
        this.engine.write(w.voice, w.field, w.value);
      }
      const nextWrite = this.index < this.writes.length ? this.writes[this.index].at : Infinity;
      const n = Math.min(count - done, nextWrite - this.position, FRAME_SAMPLES);
      this.engine.render(n, left, right, offset + done);
      this.position += n;
      done += n;
      if (
        this.index >= this.writes.length &&
        this.position >= this.until &&
        (this.engine.silent() || this.position >= this.until + TAIL_SAMPLES)
      )
        this.finished = true;
    }
    return done;
  }
}
/** A sound effect, played the way a driver would play it on voice 0. */
export function soundStream(sound: Sound): AudioStream {
  const writes = soundWrites(sound).flatMap((frame, i) =>
    frame.map(([field, value]) => ({ at: i * FRAME_SAMPLES, voice: 0, field, value })),
  );
  return new WriteStream(writes, sound.frames.length * FRAME_SAMPLES);
}
/** One note on an instrument, held for `hold` samples and then released. */
export function noteStream(
  instrument: Omit<Instrument, 'id' | 'name'>,
  pitch: number,
  hold = SAMPLE_RATE / 3,
  pan = 0,
): AudioStream {
  const f = noteFrequency(pitch);
  const regs: Array<[number, number]> = [
    [REG.FREQ_L, f & 255],
    [REG.FREQ_H, f >> 8],
    [REG.PULSE_WIDTH, instrument.pulse],
    [REG.ATTACK_DECAY, (instrument.attack << 4) | instrument.decay],
    [REG.SUSTAIN_RELEASE, (instrument.sustain << 4) | instrument.release],
    [REG.WAVEFORM, instrument.wave],
    [REG.PAN, pan & 255],
    [REG.VOLUME, instrument.volume],
    [REG.CONTROL, CONTROL_GATE | CONTROL_RESET_PHASE],
  ];
  return new WriteStream(
    [
      ...regs.map(([field, value]) => ({ at: 0, voice: 0, field, value })),
      { at: hold, voice: 0, field: REG.CONTROL, value: 0 },
    ],
    hold,
  );
}

/** A song on the sequencer: its compiled tracks loaded and started together, as BAND 1 would. */
class SongStream implements AudioStream {
  position = 0;
  finished = false;
  private engine = new MiaEngine();
  private loops: boolean;
  private end: number;
  constructor(song: Song, instruments: Instrument[], from: number, mutes: boolean[]) {
    const compiled = compileSong(song, instruments);
    let mask = 0;
    compiled.voices.forEach((v, i) => {
      if (v && !mutes[i]) {
        this.engine.loadTrack(i, v.bytes);
        mask |= 1 << i;
      }
    });
    this.engine.start(mask);
    this.loops = compiled.loopSample !== null && mask !== 0;
    this.end = compiled.samples;
    // Playing from partway in runs the song silently up to there, so every
    // envelope and register is where the chip would have it.
    for (let left = from; left > 0; left -= SAMPLE_RATE)
      this.engine.render(Math.min(left, SAMPLE_RATE));
    this.position = 0;
    this.origin = from;
  }
  /** The sample in the song the stream started from. */
  readonly origin: number;
  render(left: Float32Array, right: Float32Array, count: number, offset = 0): number {
    if (this.finished) return 0;
    this.engine.render(count, left, right, offset);
    this.position += count;
    const at = this.origin + this.position;
    if (!this.loops && at >= this.end && (this.engine.silent() || at >= this.end + TAIL_SAMPLES))
      this.finished = true;
    return count;
  }
}
/** A song from sample `from`, with any voice in `mutes` left unloaded. */
export function songStream(
  song: Song,
  instruments: Instrument[],
  { from = 0, mutes = [] as boolean[] } = {},
): AudioStream & { origin: number } {
  return new SongStream(song, instruments, from, mutes);
}

// ---------------------------------------------------------------------------
// Generated sound effects
// ---------------------------------------------------------------------------

export const SOUND_PRESETS = [
  'blip',
  'coin',
  'jump',
  'laser',
  'explosion',
  'hit',
  'powerup',
  'random',
] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number];
export const SOUND_PRESET_NAMES: Record<SoundPreset, string> = {
  blip: 'Blip',
  coin: 'Coin',
  jump: 'Jump',
  laser: 'Laser',
  explosion: 'Explosion',
  hit: 'Hit',
  powerup: 'Power-up',
  random: 'Random',
};

/** A seeded generator, so the same preset and seed make the same sound. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * The kinds of sound a game asks for most, sfxr-style: each seed is a
 * different take on the same idea. Everything is written as frames — pitch
 * sweeps, arpeggios, volume and pulse-width moves — the way a driver would
 * write them.
 */
export function generateSound(preset: SoundPreset, seed: number): Omit<Sound, 'id' | 'name'> {
  const r = random(seed),
    pick = (lo: number, hi: number) => lo + r() * (hi - lo),
    int = (lo: number, hi: number) => Math.floor(pick(lo, hi + 1));
  const frames: SoundFrame[] = [];
  const add = (count: number, frame: (i: number, t: number) => Partial<SoundFrame>) => {
    for (let i = 0; i < count; i++) {
      const f = {
        freq: 440,
        volume: 200,
        pulse: 128,
        wave: WAVE_PULSE,
        gate: true,
        ...frame(i, count > 1 ? i / (count - 1) : 0),
      };
      frames.push({
        freq: hzToFrequency(f.freq),
        volume: Math.round(Math.max(0, Math.min(255, f.volume))),
        pulse: Math.round(Math.max(0, Math.min(255, f.pulse))),
        wave: f.wave,
        gate: f.gate,
      });
    }
  };
  // Frequencies here are in Hz; `add` converts them.
  const sweep = (from: number, to: number, t: number) => from * (to / from) ** t;
  switch (preset) {
    case 'blip': {
      const hz = pick(500, 1400),
        pw = int(48, 160),
        n = int(4, 8);
      add(n, (i, t) => ({ freq: hz, pulse: pw, volume: 230 - 110 * t }));
      return { attack: 0, decay: 3, sustain: 10, release: 2, pan: 0, frames };
    }
    case 'coin': {
      const hz = pick(700, 1200),
        jump = 2 ** (int(4, 7) / 12),
        a = int(3, 5),
        b = int(10, 16);
      add(a, () => ({ freq: hz, volume: 230 }));
      add(b, (i, t) => ({ freq: hz * jump, volume: 230 * (1 - t) ** 1.5, gate: i < b - 1 }));
      return { attack: 0, decay: 0, sustain: 15, release: 3, pan: 0, frames };
    }
    case 'jump': {
      const from = pick(160, 320),
        to = from * pick(1.8, 3.2),
        pw = int(48, 128),
        n = int(9, 15);
      add(n, (i, t) => ({
        freq: sweep(from, to, t),
        pulse: pw,
        volume: 230 - 90 * t,
        gate: i < n - 2,
      }));
      return { attack: 0, decay: 2, sustain: 12, release: 3, pan: 0, frames };
    }
    case 'laser': {
      const from = pick(1400, 3200),
        to = from / pick(4, 10),
        wave = r() < 0.6 ? WAVE_PULSE : WAVE_SAW,
        n = int(8, 15);
      add(n, (i, t) => ({
        freq: sweep(from, to, t ** 0.7),
        wave,
        pulse: 40 + 170 * t,
        volume: 255 - 150 * t,
      }));
      return { attack: 0, decay: 4, sustain: 9, release: 2, pan: 0, frames };
    }
    case 'explosion': {
      const from = pick(1200, 2600),
        to = pick(50, 140),
        n = int(30, 48);
      add(n, (i, t) => ({
        freq: sweep(from, to, t ** 0.6),
        wave: WAVE_NOISE,
        volume: 255 * (1 - t) ** 1.2,
        gate: i < n * 0.6,
      }));
      return { attack: 0, decay: 9, sustain: 7, release: 8, pan: 0, frames };
    }
    case 'hit': {
      const noise = pick(1500, 3200),
        tone = pick(140, 320),
        n = int(6, 10),
        pw = int(32, 96);
      add(2, () => ({ freq: noise, wave: WAVE_NOISE, volume: 255 }));
      add(n, (i, t) => ({
        freq: sweep(tone, tone / 2, t),
        wave: WAVE_PULSE,
        pulse: pw,
        volume: 220 * (1 - t),
      }));
      return { attack: 0, decay: 3, sustain: 7, release: 2, pan: 0, frames };
    }
    case 'powerup': {
      const base = pick(300, 520),
        step = int(2, 3),
        rounds = int(2, 4),
        chord = r() < 0.5 ? [0, 4, 7, 12] : [0, 5, 9, 12],
        pw = int(64, 128);
      for (let k = 0; k < rounds; k++)
        for (const interval of chord)
          add(step, () => ({
            freq: base * 2 ** ((interval + k * 2) / 12),
            pulse: pw,
            volume: 210,
          }));
      add(8, (i, t) => ({
        freq: base * 2 ** ((12 + rounds * 2 - 2) / 12),
        pulse: pw,
        volume: 210 * (1 - t),
        gate: i < 7,
      }));
      return { attack: 0, decay: 0, sustain: 15, release: 4, pan: 0, frames };
    }
    default: {
      const wave = int(0, 4),
        from = pick(80, 2400),
        to = from * 2 ** pick(-3, 2),
        n = int(6, 40),
        pw = int(16, 240),
        arp = r() < 0.3 ? 2 ** (int(3, 12) / 12) : 1,
        arpAt = int(2, 8);
      add(n, (i, t) => ({
        freq: sweep(from, to, t) * (i >= arpAt ? arp : 1),
        wave,
        pulse: pw + (240 - pw) * t * r(),
        volume: 240 * (1 - t * pick(0.3, 1)),
        gate: i < n - 1,
      }));
      return {
        attack: int(0, 2),
        decay: int(1, 8),
        sustain: int(4, 13),
        release: int(1, 6),
        pan: 0,
        frames,
      };
    }
  }
}
