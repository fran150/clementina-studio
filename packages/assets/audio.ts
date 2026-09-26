// MIA audio as Studio authors it: the voice model, instruments, songs and
// sound effects; the engine that previews them; and the compiler that turns a
// song into the MIA background sequencer's bytecode. See docs/audio.md.
//
// The engine is clementina-mia src/mia/audio/audio.c, bit for bit: the same
// sine table, oscillators and noise generator, envelope rate and level
// tables, fixed-point gain chain, pan law and 10-bit output clamp — and the
// same sequencer, timing included. The sequencer holds a NOTE or REST for its
// duration field *plus one* sample: audio_seq_step decodes the next event on
// the sample after its countdown reaches zero (clementina-6502's
// audio_sequencer_test.go asserts the same), so the compiler below writes one
// less than the samples an event should last. A preview is what the chip
// plays, sample for sample, before its PWM output stage.
//
// No runtime imports: the renderer loads this module as it is (editor.html).

export const SAMPLE_RATE = 24000, VOICE_COUNT = 4, FRAME_RATE = 60, FRAME_SAMPLES = SAMPLE_RATE / FRAME_RATE;
/** C0 to B7: the ROM's `NOTE` range, and all of it fits the 12.4 frequency register. */
export const NOTE_COUNT = 96, MAX_FREQ = 0xFFFF;
export const WAVE_SINE = 0, WAVE_PULSE = 1, WAVE_SAW = 2, WAVE_TRIANGLE = 3, WAVE_NOISE = 4;
export const WAVES = ['Sine', 'Pulse', 'Saw', 'Triangle', 'Noise'] as const;
/** Envelope rate nibbles, in milliseconds (docs/audio.md, the tables in audio.c). */
export const ATTACK_MS = [2, 8, 16, 24, 38, 56, 68, 80, 100, 250, 500, 800, 1000, 3000, 5000, 8000];
export const DECAY_RELEASE_MS = [6, 24, 48, 72, 114, 168, 204, 240, 300, 750, 1500, 2400, 3000, 9000, 15000, 24000];
export const PAN_MIN = -64, PAN_MAX = 63;
export const MAX_SOUND_FRAMES = 600, MAX_SONG_STEPS = 4096, MIN_BPM = 20, MAX_BPM = 400;
export const STEPS_PER_BEAT = [1, 2, 3, 4, 6, 8];
export const MAX_AUDIO_ASSETS = 255;

/** Sequencer opcodes (audio.h MIA_SEQ_OP_*). */
export const OP = { END: 0, NOTE: 1, REST: 2, SET_WAVE: 3, SET_ADSR: 4, SET_PAN: 5, SET_VOL: 6, SET_PULSE: 7, JUMP: 8 } as const;
/** Offsets in a voice's 16-byte register record. */
export const REG = { FREQ_L: 0, FREQ_H: 1, PULSE_WIDTH: 2, ATTACK_DECAY: 3, SUSTAIN_RELEASE: 4, WAVEFORM: 5, PAN: 6, CONTROL: 7, VOLUME: 8 } as const;
export const CONTROL_GATE = 1, CONTROL_RESET_PHASE = 2;
/** The longest event one NOTE or REST can hold: a 24-bit duration field, plus the sequencer's extra sample. */
const MAX_EVENT_SAMPLES = 0x1000000;

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * An instrument is what the sequencer's SET_* opcodes can put on a voice
 * between notes: everything in the register record except the frequency,
 * the pan and the gate.
 */
export interface Instrument {
 id: string; name: string;
 wave: number; pulse: number;
 attack: number; decay: number; sustain: number; release: number;
 volume: number;
}
/** One note on one voice: a semitone (0 = C0) held from `step` for `length` steps. */
export interface SongNote { step: number; length: number; pitch: number; instrumentId: string; legato?: boolean }
/** A voice is one of MIA's four; its notes never overlap, since a voice plays one at a time. */
export interface SongVoice { pan: number; notes: SongNote[] }
/**
 * A song is up to four voices on a step grid. Steps are resolved to samples
 * when it compiles, so the sequencer never sees tempo; `loopStart` is the
 * step the song jumps back to at its end, or absent to play once.
 */
export interface Song {
 id: string; name: string;
 bpm: number; stepsPerBeat: number; beatsPerBar: number; length: number;
 loopStart?: number;
 voices: SongVoice[];
}
/** One 60 Hz frame of a sound effect: what the driver writes to its voice that frame. */
export interface SoundFrame { freq: number; volume: number; pulse: number; wave: number; gate: boolean }
/** A sound effect: one voice's registers, frame by frame, under one envelope and pan. */
export interface Sound {
 id: string; name: string;
 attack: number; decay: number; sustain: number; release: number; pan: number;
 frames: SoundFrame[];
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** The frequency register value (Hz × 16) of a semitone, equal temperament with A4 = 440 Hz. */
export function noteFrequency(note: number): number { return Math.min(MAX_FREQ, Math.max(0, Math.round(440 * 2 ** ((note - 57) / 12) * 16))); }
export function noteName(note: number): string { const n = Math.round(note); return NAMES[((n % 12) + 12) % 12] + Math.floor(n / 12); }
/** The fractional semitone a frequency register value sounds, C0 = 0; -Infinity for 0 Hz. */
export function frequencyNote(freq: number): number { return freq > 0 ? 57 + 12 * Math.log2(freq / 16 / 440) : -Infinity; }
export function frequencyHz(freq: number): number { return freq / 16; }
export function hzToFrequency(hz: number): number { return Math.min(MAX_FREQ, Math.max(0, Math.round(hz * 16))); }

const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
function range(n: unknown, min: number, max: number): boolean { return Number.isInteger(n) && Number(n) >= min && Number(n) <= max; }
function named(list: Array<{ id: string; name: string }>, what: string): void {
 const ids = new Set<string>(), names = new Set<string>();
 for (const item of list) {
  if (!item || typeof item.id !== 'string' || !item.id.length || ids.has(item.id)) throw Error(`${what} identities must be unique`);
  ids.add(item.id);
  if (typeof item.name !== 'string' || !IDENTIFIER.test(item.name) || names.has(item.name.toUpperCase())) throw Error(`${what} names must be unique assembly identifiers (1–32 characters)`);
  names.add(item.name.toUpperCase());
 }
}
function envelope(e: { attack: number; decay: number; sustain: number; release: number }): boolean {
 return range(e.attack, 0, 15) && range(e.decay, 0, 15) && range(e.sustain, 0, 15) && range(e.release, 0, 15);
}

export function validateInstruments(instruments: Instrument[]): void {
 if (!Array.isArray(instruments) || instruments.length > MAX_AUDIO_ASSETS) throw Error(`At most ${MAX_AUDIO_ASSETS} instruments are supported`);
 named(instruments, 'Instrument');
 for (const i of instruments) {
  if (!range(i.wave, 0, 4) || !range(i.pulse, 0, 255) || !envelope(i) || !range(i.volume, 0, 255)) throw Error(`Invalid instrument "${i.name}"`);
 }
}

export function validateSongs(songs: Song[], instruments: Instrument[] = []): void {
 if (!Array.isArray(songs) || songs.length > MAX_AUDIO_ASSETS) throw Error(`At most ${MAX_AUDIO_ASSETS} songs are supported`);
 named(songs, 'Song');
 const instrumentIds = new Set(instruments.map(i => i.id));
 for (const song of songs) {
  if (!range(song.bpm, MIN_BPM, MAX_BPM) || !STEPS_PER_BEAT.includes(song.stepsPerBeat) || !range(song.beatsPerBar, 1, 16)) throw Error(`Invalid tempo in "${song.name}"`);
  if (!range(song.length, 1, MAX_SONG_STEPS)) throw Error(`A song is 1 to ${MAX_SONG_STEPS} steps long`);
  if (song.loopStart !== undefined && !range(song.loopStart, 0, song.length - 1)) throw Error(`The loop in "${song.name}" starts outside the song`);
  // MIA has four voices, so a song has four: a voice without notes is left
  // free for sound effects.
  if (!Array.isArray(song.voices) || song.voices.length !== VOICE_COUNT) throw Error(`A song has exactly ${VOICE_COUNT} voices`);
  for (const voice of song.voices) {
   if (!voice || !range(voice.pan, PAN_MIN, PAN_MAX) || !Array.isArray(voice.notes) || voice.notes.length > MAX_SONG_STEPS) throw Error(`Invalid voice in "${song.name}"`);
   let end = 0;
   for (const note of voice.notes) {
    if (!note || !range(note.step, 0, song.length - 1) || !range(note.length, 1, song.length - note.step) || !range(note.pitch, 0, NOTE_COUNT - 1)) throw Error(`Invalid note in "${song.name}"`);
    if (!instrumentIds.has(note.instrumentId)) throw Error(`A note in "${song.name}" names an instrument that is not in the project`);
    if (note.legato !== undefined && typeof note.legato !== 'boolean') throw Error(`Invalid note in "${song.name}"`);
    // A voice plays one note at a time.
    if (note.step < end) throw Error(`Notes on one voice of "${song.name}" overlap or are out of order`);
    end = note.step + note.length;
   }
  }
 }
}

export function validateSounds(sounds: Sound[]): void {
 if (!Array.isArray(sounds) || sounds.length > MAX_AUDIO_ASSETS) throw Error(`At most ${MAX_AUDIO_ASSETS} sounds are supported`);
 named(sounds, 'Sound');
 for (const sound of sounds) {
  if (!envelope(sound) || !range(sound.pan, PAN_MIN, PAN_MAX)) throw Error(`Invalid sound "${sound.name}"`);
  if (!Array.isArray(sound.frames) || sound.frames.length < 1 || sound.frames.length > MAX_SOUND_FRAMES) throw Error(`A sound holds 1 to ${MAX_SOUND_FRAMES} frames`);
  for (const f of sound.frames) {
   if (!f || !range(f.freq, 0, MAX_FREQ) || !range(f.volume, 0, 255) || !range(f.pulse, 0, 255) || !range(f.wave, 0, 4) || typeof f.gate !== 'boolean') throw Error(`Invalid frame in "${sound.name}"`);
  }
 }
}

/** A starting set, so a first song has something to draw with. */
export function defaultInstruments(id: () => string): Instrument[] {
 return [
  { id: id(), name: 'Lead', wave: WAVE_PULSE, pulse: 128, attack: 0, decay: 6, sustain: 10, release: 5, volume: 200 },
  { id: id(), name: 'Bass', wave: WAVE_TRIANGLE, pulse: 128, attack: 0, decay: 4, sustain: 12, release: 3, volume: 255 },
  { id: id(), name: 'Keys', wave: WAVE_SAW, pulse: 128, attack: 0, decay: 7, sustain: 6, release: 6, volume: 170 },
  { id: id(), name: 'Drum', wave: WAVE_NOISE, pulse: 128, attack: 0, decay: 2, sustain: 0, release: 3, volume: 230 },
 ];
}
/** Four bars of four beats in sixteenths at 120 BPM, looping from the top. */
export function newSong(id: string, name: string): Song {
 return { id, name, bpm: 120, stepsPerBeat: 4, beatsPerBar: 4, length: 64, loopStart: 0, voices: Array.from({ length: VOICE_COUNT }, () => ({ pan: 0, notes: [] })) };
}
/** An A4 pulse held for twelve frames, then released. */
export function newSound(id: string, name: string): Sound {
 return { id, name, attack: 0, decay: 5, sustain: 10, release: 4, pan: 0,
  frames: Array.from({ length: 16 }, (_, i) => ({ freq: noteFrequency(57), volume: 200, pulse: 128, wave: WAVE_PULSE, gate: i < 12 })) };
}

// ---------------------------------------------------------------------------
// Engine: audio.c's voices, mix and sequencer
// ---------------------------------------------------------------------------

const ENV_MAX = 256 * 65536;
const rate = (ms: number) => Math.floor(ENV_MAX * 1000 / (SAMPLE_RATE * ms));
const ATTACK_RATES = ATTACK_MS.map(rate), DECAY_RATES = DECAY_RELEASE_MS.map(rate);
const LEVELS = [0, 17, 34, 51, 68, 85, 102, 119, 137, 154, 171, 188, 205, 222, 239, 256].map(v => v * 65536);
const lround = (v: number) => v < 0 ? -Math.round(-v) : Math.round(v);
const SINE = Int8Array.from({ length: 256 }, (_, i) => lround(Math.sin(Math.PI * 2 / 256 * i) * 127));
const RELEASE = 0, ATTACK = 1, DECAY = 2, SUSTAIN = 3;
/** Output is a 10-bit PWM level around its center. */
const OUT_MIN = -512, OUT_MAX = 511, OUT_SCALE = 512;

interface Voice {
 freq: number; inc: number; pulse: number; volume: number;
 attack: number; decay: number; sustain: number; release: number;
 wave: number; control: number; panL: number; panR: number;
 sample: number; adsr: number; vol: number; phase: number; noise1: number; noise2: number;
}
interface Sequencer {
 running: boolean; taken: boolean; catchingUp: boolean; bytes: Uint8Array;
 cursor: number; countdown: number; eventDuration: number; catchupRemaining: number; takenAt: number; noteIndex: number;
}
const RECORD_SIZE = [0, 6, 4, 2, 3, 2, 2, 2, 4];
const read24 = (b: Uint8Array, at: number) => (b[at] | b[at + 1] << 8 | b[at + 2] << 16) >>> 0;

/** MIA's audio block and sequencer, as audio.c runs them in its 24 kHz interrupt. */
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
 constructor() { this.reset(); }

 /** AUDIO_RESET then AUDIO_ENABLE: every voice at the firmware's defaults, synced, and no tracks. */
 reset(): void {
  this.regs.fill(0); this.masterRegister = this.master = 15; this.clock = 0; this.finishedTracks = 0;
  this.voices = []; this.seqs = []; this.queue = []; this.overflow = false;
  for (let v = 0; v < VOICE_COUNT; v++) {
   const b = v * 16;
   this.regs[b + REG.PULSE_WIDTH] = 128; this.regs[b + REG.SUSTAIN_RELEASE] = 0xF5;
   this.regs[b + REG.WAVEFORM] = WAVE_PULSE; this.regs[b + REG.VOLUME] = 255;
   this.voices.push({ freq: 0, inc: 0, pulse: 128, volume: 255, attack: 0, decay: 0, sustain: 15, release: 5, wave: WAVE_PULSE, control: 0,
    panL: 64, panR: 64, sample: 0, adsr: RELEASE, vol: 0, phase: 0,
    noise1: (0x67452301 + v * 0x11111111) >>> 0, noise2: (0xEFCDAB89 - v * 0x01010101) >>> 0 });
   this.seqs.push(emptySequencer());
  }
 }

 /**
  * A program's write to a voice register. It lands in MIA RAM at once and
  * reaches the engine through the live-write queue (mia_audio_core1_on_write):
  * 63 entries, 16 applied at the top of each sample.
  */
 write(voice: number, field: number, value: number): void { value &= 255; this.regs[voice * 16 + field] = value; this.enqueue(16 + voice * 16 + field, value); }
 /** A program's write to the header's AUDIO_VOLUME, 0-15. */
 setMaster(value: number): void { this.masterRegister = value & 255; this.enqueue(1, this.masterRegister); }
 private queue: number[] = [];
 private overflow = false;
 private enqueue(loc: number, value: number): void { if (this.queue.length >= 2 * 63) this.overflow = true; else this.queue.push(loc, value); }
 // audio_drain_queue: an overflow drops the queue and resyncs from RAM.
 private drain(): void {
  if (this.overflow) { this.master = this.masterRegister; for (let v = 0; v < VOICE_COUNT; v++) this.sync(v); this.queue = []; this.overflow = false; return; }
  for (let n = 0; n < 16 && this.queue.length; n++) {
   const loc = this.queue.shift()!, value = this.queue.shift()!;
   if (loc === 1) this.master = value;
   else if (loc >= 16 && loc < 16 + 16 * VOICE_COUNT) this.apply((loc - 16) >> 4, (loc - 16) & 15, value);
  }
 }
 // audio_sync_voice_registers.
 private sync(voice: number): void {
  const b = voice * 16;
  for (const field of [REG.FREQ_L, REG.PULSE_WIDTH, REG.VOLUME, REG.ATTACK_DECAY, REG.SUSTAIN_RELEASE, REG.WAVEFORM, REG.PAN, REG.CONTROL]) this.apply(voice, field, this.regs[b + field]);
 }
 /** Applies a register value to the voice (audio_apply_register); the sequencer's writes come straight here. */
 private apply(voice: number, field: number, value: number): void {
  const b = voice * 16; this.regs[b + field] = value;
  const s = this.voices[voice];
  switch (field) {
   case REG.FREQ_L: case REG.FREQ_H:
    s.freq = this.regs[b] | this.regs[b + 1] << 8;
    // (freq_q4 << 32) / (24000 * 16), exactly: 2^32 / 384000 is 2^22 / 375.
    s.inc = s.freq ? Math.floor(s.freq * 4194304 / 375) : 0; break;
   case REG.PULSE_WIDTH: s.pulse = value; break;
   case REG.VOLUME: s.volume = value; break;
   case REG.ATTACK_DECAY: s.attack = value >> 4; s.decay = value & 15; break;
   case REG.SUSTAIN_RELEASE: s.sustain = value >> 4; s.release = value & 15; break;
   case REG.WAVEFORM: s.wave = value & 15; break;
   case REG.PAN: { const pan = Math.max(PAN_MIN, Math.min(PAN_MAX, (value << 24) >> 24)); s.panL = 64 - pan; s.panR = 64 + pan; break; }
   case REG.CONTROL: {
    const was = s.control & CONTROL_GATE, now = value & CONTROL_GATE;
    if (value & CONTROL_RESET_PHASE) s.phase = 0;
    if (!was && now) { s.adsr = ATTACK; s.vol = 0; } else if (was && !now) s.adsr = RELEASE;
    s.control = value; break;
   }
  }
 }

 /** A track's bytes, as if written at its voice's track_base, then AUDIO_SEQ_LOAD. */
 loadTrack(voice: number, bytes: Uint8Array): void { this.seqs[voice] = { ...emptySequencer(), bytes }; }
 start(mask: number): void { this.each(mask, s => { s.running = true; s.taken = false; s.catchingUp = false; }); }
 stop(mask: number): void { this.each(mask, (s, v) => { s.running = false; s.taken = false; s.catchingUp = false; this.gate(v, false); }); }
 /** AUDIO_VOICE_TAKE: freeze a voice's track without silencing it. */
 take(mask: number): void { this.each(mask, s => { s.taken = true; s.takenAt = this.clock; }); }
 /** AUDIO_VOICE_RELEASE: hand a voice back, caught up to where its track would be. */
 release(mask: number): void {
  this.each(mask, s => {
   if (!s.taken) return;
   s.taken = false;
   if (!s.running) return;
   const total = s.eventDuration - s.countdown + ((this.clock - s.takenAt) >>> 0);
   if (total < s.eventDuration) s.countdown = s.eventDuration - total;
   else { s.catchingUp = true; s.catchupRemaining = total - s.eventDuration; }
  });
 }
 isRunning(voice: number): boolean { return this.seqs[voice].running; }
 /** CUE(v): notes and rests decoded since the track was loaded. */
 noteIndex(voice: number): number { return this.seqs[voice].noteIndex & 0xFFFF; }
 /** Whether every voice has finished its release. */
 silent(): boolean { return this.voices.every(s => s.adsr === RELEASE && s.vol === 0); }
 /** A voice's envelope level, 0-256. */
 level(voice: number): number { return this.voices[voice].vol >>> 16; }

 /**
  * Runs `count` samples, writing them as floats in [-1, 1) from `offset` in
  * `left` and `right` when given. The body is audio_irq_handler.
  */
 render(count: number, left?: Float32Array, right?: Float32Array, offset = 0): void {
  const voices = this.voices;
  for (let n = 0; n < count; n++) {
   this.clock = (this.clock + 1) >>> 0;
   if (this.queue.length || this.overflow) this.drain();
   for (let v = 0; v < VOICE_COUNT; v++) this.step(v);
   let l = 0, r = 0;
   for (let v = 0; v < VOICE_COUNT; v++) {
    const s = voices[v];
    let x = next(s);
    envelopeStep(s);
    x = (x * (s.vol >>> 16)) >> 8;
    x = (x * s.volume) >> 8;
    l += (x * s.panL) >> 7; r += (x * s.panR) >> 7;
   }
   const gain = (this.master & 15) * 17;
   l = (l * gain) >> 8; r = (r * gain) >> 8;
   if (left) left[offset + n] = Math.max(OUT_MIN, Math.min(OUT_MAX, l)) / OUT_SCALE;
   if (right) right[offset + n] = Math.max(OUT_MIN, Math.min(OUT_MAX, r)) / OUT_SCALE;
  }
 }

 private each(mask: number, fn: (s: Sequencer, voice: number) => void): void { for (let v = 0; v < VOICE_COUNT; v++) if (mask & (1 << v)) fn(this.seqs[v], v); }
 private gate(voice: number, on: boolean): void { this.apply(voice, REG.CONTROL, on ? CONTROL_GATE | CONTROL_RESET_PHASE : 0); }
 private finish(voice: number): void { const s = this.seqs[voice]; s.running = false; s.catchingUp = false; this.gate(voice, false); this.finishedTracks++; }
 private note(voice: number, at: number): void { const b = this.seqs[voice].bytes; this.apply(voice, REG.FREQ_L, b[at + 1]); this.apply(voice, REG.FREQ_H, b[at + 2]); this.gate(voice, true); }
 private config(voice: number, at: number, op: number): void {
  const b = this.seqs[voice].bytes;
  switch (op) {
   case OP.SET_WAVE: this.apply(voice, REG.WAVEFORM, b[at + 1]); break;
   case OP.SET_ADSR: this.apply(voice, REG.ATTACK_DECAY, b[at + 1]); this.apply(voice, REG.SUSTAIN_RELEASE, b[at + 2]); break;
   case OP.SET_PAN: this.apply(voice, REG.PAN, b[at + 1]); break;
   case OP.SET_VOL: this.apply(voice, REG.VOLUME, b[at + 1]); break;
   case OP.SET_PULSE: this.apply(voice, REG.PULSE_WIDTH, b[at + 1]); break;
  }
 }
 /** Starts the event at the cursor: a NOTE gates on, a REST gates off. */
 private event(voice: number, op: number, size: number, duration: number): void {
  const s = this.seqs[voice];
  if (op === OP.NOTE) this.note(voice, s.cursor); else this.gate(voice, false);
  s.noteIndex++; s.eventDuration = duration; s.countdown = duration; s.cursor += size;
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
   if (s.cursor < 0 || s.cursor >= s.bytes.length) { this.finish(voice); return; }
   const op = s.bytes[s.cursor], size = RECORD_SIZE[op] ?? 0;
   if (!size) { this.finish(voice); return; }
   if (op === OP.NOTE || op === OP.REST) { this.event(voice, op, size, read24(s.bytes, s.cursor + (op === OP.NOTE ? 3 : 1))); return; }
   if (op === OP.JUMP) s.cursor = jumpTarget(s.bytes, s.cursor);
   else { this.config(voice, s.cursor, op); s.cursor += size; }
   if (budget === 0) { this.finish(voice); return; }
  }
 }
 // audio_seq_catchup_step: skips events wholly in the past, 8 per sample.
 private catchup(voice: number): void {
  const s = this.seqs[voice];
  for (let budget = 8; budget > 0 && s.catchingUp; budget--) {
   if (s.cursor < 0 || s.cursor >= s.bytes.length) { this.finish(voice); return; }
   const op = s.bytes[s.cursor], size = RECORD_SIZE[op] ?? 0;
   if (!size) { this.finish(voice); return; }
   if (op === OP.JUMP) { s.cursor = jumpTarget(s.bytes, s.cursor); continue; }
   if (op === OP.NOTE || op === OP.REST) {
    const duration = read24(s.bytes, s.cursor + (op === OP.NOTE ? 3 : 1));
    if (duration <= s.catchupRemaining) { s.catchupRemaining -= duration; s.noteIndex++; s.cursor += size; continue; }
    s.catchingUp = false; this.event(voice, op, size, duration); return;
   }
   this.config(voice, s.cursor, op); s.cursor += size;
  }
 }
}
function emptySequencer(): Sequencer { return { running: false, taken: false, catchingUp: false, bytes: new Uint8Array(0), cursor: 0, countdown: 0, eventDuration: 0, catchupRemaining: 0, takenAt: 0, noteIndex: 0 }; }
/** A JUMP's signed 24-bit offset is relative to the byte after its own record. */
function jumpTarget(b: Uint8Array, at: number): number { return at + 4 + ((read24(b, at + 1) << 8) >> 8); }
function next(s: Voice): number {
 const old = s.phase; s.phase = (s.phase + s.inc) >>> 0;
 const p = s.phase >>> 24;
 switch (s.wave) {
  case WAVE_SINE: return SINE[p];
  case WAVE_PULSE: return p < s.pulse ? 127 : -127;
  case WAVE_SAW: return 127 - p;
  case WAVE_TRIANGLE: return p < 128 ? p * 2 - 128 : 127 - (p - 128) * 2;
  case WAVE_NOISE:
   if (s.phase < old) { s.noise1 = (s.noise1 ^ s.noise2) >>> 0; s.noise2 = (s.noise2 + s.noise1) >>> 0; s.sample = ((s.noise2 & 255) << 24) >> 24; }
   return s.sample;
  default: return 0;
 }
}
function envelopeStep(s: Voice): void {
 const target = LEVELS[s.sustain];
 switch (s.adsr) {
  case ATTACK: s.vol += ATTACK_RATES[s.attack]; if (s.vol >= ENV_MAX) { s.vol = ENV_MAX; s.adsr = DECAY; } break;
  case DECAY: {
   const r = DECAY_RATES[s.decay];
   if (s.vol <= target || s.vol <= target + r) { s.vol = target; s.adsr = SUSTAIN; } else s.vol -= r;
   break;
  }
  case SUSTAIN: s.vol = target; break;
  default: { const r = DECAY_RATES[s.release]; s.vol = s.vol <= r ? 0 : s.vol - r; }
 }
}

// ---------------------------------------------------------------------------
// Songs: steps to samples, and the sequencer bytecode
// ---------------------------------------------------------------------------

/** The sample a step starts on. Rounding each boundary, not each duration, keeps every voice on the same clock. */
export function stepSample(song: Pick<Song, 'bpm' | 'stepsPerBeat'>, step: number): number {
 return Math.round(step * SAMPLE_RATE * 60 / (song.bpm * song.stepsPerBeat));
}
/** The fractional step a sample falls on. */
export function sampleStep(song: Pick<Song, 'bpm' | 'stepsPerBeat'>, sample: number): number {
 return sample * song.bpm * song.stepsPerBeat / (SAMPLE_RATE * 60);
}
/** Where in the song a sample played from its start lands, following the loop. */
export function songSample(song: Pick<Song, 'bpm' | 'stepsPerBeat' | 'length' | 'loopStart'>, sample: number): number {
 const end = stepSample(song, song.length);
 if (sample < end) return sample;
 if (song.loopStart === undefined) return end;
 const loop = stepSample(song, song.loopStart);
 return loop + (sample - loop) % (end - loop);
}

export interface CompiledVoice {
 /** The track, as it would be written at the voice's track_base. */
 bytes: Uint8Array;
 /** Offset of the byte the song's closing JUMP returns to, or null when it ends. */
 loop: number | null;
 notes: number;
}
export interface CompiledSong {
 /** One per MIA voice; null where the song leaves the voice free. */
 voices: Array<CompiledVoice | null>;
 samples: number;
 loopSample: number | null;
}

/**
 * A song as four sequencer tracks. Per voice, in time order: a SET_PAN, then
 * for each note the SET_* opcodes its instrument changes, a one-sample REST
 * when the note must restart the envelope, and the NOTE; RESTs fill the
 * gaps; a JUMP back to the loop start, or END.
 *
 * The one-sample REST exists because the sequencer's NOTE sets the gate, and
 * an envelope only restarts on the gate's rising edge (audio_apply_register):
 * two NOTEs in a row slide from one pitch to the next under one envelope.
 * That slide is what a legato note asks for, so it skips the REST.
 */
export function compileSong(song: Song, instruments: Instrument[]): CompiledSong {
 const byId = new Map(instruments.map(i => [i.id, i]));
 const at = (step: number) => stepSample(song, step), end = at(song.length);
 const loop = song.loopStart;
 const voices = song.voices.map(voice => voice.notes.length ? compileVoice(voice, byId, at, song.length, loop) : null);
 return { voices, samples: end, loopSample: loop === undefined ? null : at(loop) };
}

type Segment = { from: number; to: number; note?: SongNote; continued?: boolean };
function compileVoice(voice: SongVoice, byId: Map<string, Instrument>, at: (step: number) => number, length: number, loop: number | undefined): CompiledVoice {
 // Notes and the rests between them, split where the loop begins.
 const segments: Segment[] = [];
 let cursor = 0;
 for (const note of voice.notes) {
  if (note.step > cursor) segments.push({ from: cursor, to: note.step });
  segments.push({ from: note.step, to: note.step + note.length, note });
  cursor = note.step + note.length;
 }
 if (cursor < length) segments.push({ from: cursor, to: length });
 let body = 0;
 if (loop !== undefined) {
  const i = segments.findIndex(s => s.from < loop && s.to > loop);
  if (i >= 0) segments.splice(i, 1, { ...segments[i], to: loop }, { ...segments[i], from: loop, continued: true });
  body = segments.findIndex(s => s.from >= loop);
 }

 const out: number[] = [];
 const push24 = (n: number) => out.push(n & 255, (n >> 8) & 255, (n >> 16) & 255);
 // An event that lasts `samples` holds for its duration field plus one.
 const rest = (samples: number) => { for (; samples > 0; samples -= MAX_EVENT_SAMPLES) { out.push(OP.REST); push24(Math.min(samples, MAX_EVENT_SAMPLES) - 1); } };
 const tone = (freq: number, samples: number) => { for (; samples > 0; samples -= MAX_EVENT_SAMPLES) { out.push(OP.NOTE, freq & 255, freq >> 8); push24(Math.min(samples, MAX_EVENT_SAMPLES) - 1); } };
 out.push(OP.SET_PAN, voice.pan & 255);
 // What the voice holds, as far as the track knows. Nothing is known at the
 // start — a sound effect may have left the voice gated — nor where playback
 // arrives from two places, the loop start.
 let state: Record<string, number> = {}, gate: boolean | undefined, loopOffset: number | null = null, notes = 0;
 segments.forEach((segment, i) => {
  if (loop !== undefined && i === body) { loopOffset = out.length; state = {}; gate = undefined; }
  const samples = at(segment.to) - at(segment.from);
  if (!segment.note) { rest(samples); gate = false; return; }
  const note = segment.note, instrument = byId.get(note.instrumentId);
  const retrigger = !segment.continued && !note.legato && gate !== false;
  if (retrigger) rest(1);
  if (instrument) for (const [key, op, ...values] of instrumentOps(instrument)) {
   if (state[key] === values[0] * 256 + (values[1] ?? 0)) continue;
   state[key] = values[0] * 256 + (values[1] ?? 0); out.push(op, ...values);
  }
  tone(noteFrequency(note.pitch), samples - (retrigger ? 1 : 0));
  gate = true; if (!segment.continued) notes++;
 });
 if (loopOffset !== null) { out.push(OP.JUMP); push24(loopOffset - (out.length + 3)); } else out.push(OP.END);
 return { bytes: Uint8Array.from(out), loop: loopOffset, notes };
}
/** The SET_* opcodes that put an instrument on a voice. */
function instrumentOps(i: Instrument): Array<[string, number, ...number[]]> {
 return [['wave', OP.SET_WAVE, i.wave], ['adsr', OP.SET_ADSR, i.attack << 4 | i.decay, i.sustain << 4 | i.release], ['pulse', OP.SET_PULSE, i.pulse], ['volume', OP.SET_VOL, i.volume]];
}

// ---------------------------------------------------------------------------
// Sound effects: what a 60 Hz driver writes to the voice it takes
// ---------------------------------------------------------------------------

/**
 * The register writes a sound makes, per frame, as a program driving a
 * voice it has taken (VTAKE) writes them: the whole record on the first
 * frame, then only what changes. Gating on also resets the phase, as the
 * ROM's NOTE does. The entry after the last frame releases the gate.
 */
export function soundWrites(sound: Sound): Array<Array<[number, number]>> {
 const out: Array<Array<[number, number]>> = [];
 let last: SoundFrame | null = null;
 for (const f of sound.frames) {
  const w: Array<[number, number]> = [];
  if (!last || last.freq !== f.freq) w.push([REG.FREQ_L, f.freq & 255], [REG.FREQ_H, f.freq >> 8]);
  if (!last || last.pulse !== f.pulse) w.push([REG.PULSE_WIDTH, f.pulse]);
  if (!last) w.push([REG.ATTACK_DECAY, sound.attack << 4 | sound.decay], [REG.SUSTAIN_RELEASE, sound.sustain << 4 | sound.release]);
  if (!last || last.wave !== f.wave) w.push([REG.WAVEFORM, f.wave]);
  if (!last) w.push([REG.PAN, sound.pan & 255]);
  if (!last || last.volume !== f.volume) w.push([REG.VOLUME, f.volume]);
  if (!last || last.gate !== f.gate) w.push([REG.CONTROL, f.gate ? CONTROL_GATE | CONTROL_RESET_PHASE : 0]);
  out.push(w); last = f;
 }
 out.push(last?.gate ? [[REG.CONTROL, 0]] : []);
 return out;
}

// ---------------------------------------------------------------------------
// Streams: what the editors play
// ---------------------------------------------------------------------------

export interface AudioStream {
 /** Renders up to `count` samples into both channels from `offset`; returns how many, 0 once finished. */
 render(left: Float32Array, right: Float32Array, count: number, offset?: number): number;
 /** Samples rendered so far. */
 readonly position: number;
 readonly finished: boolean;
}
/** The longest a release is heard after its sound or song ends. */
const TAIL_SAMPLES = 4 * SAMPLE_RATE;

/** Timed register writes on one engine: a sound effect, or a note auditioning an instrument. */
class WriteStream implements AudioStream {
 position = 0; finished = false;
 private engine = new MiaEngine();
 private index = 0;
 constructor(private writes: Array<{ at: number; voice: number; field: number; value: number }>, private until: number) {}
 render(left: Float32Array, right: Float32Array, count: number, offset = 0): number {
  let done = 0;
  while (done < count && !this.finished) {
   while (this.index < this.writes.length && this.writes[this.index].at <= this.position) { const w = this.writes[this.index++]; this.engine.write(w.voice, w.field, w.value); }
   const nextWrite = this.index < this.writes.length ? this.writes[this.index].at : Infinity;
   const n = Math.min(count - done, nextWrite - this.position, FRAME_SAMPLES);
   this.engine.render(n, left, right, offset + done);
   this.position += n; done += n;
   if (this.index >= this.writes.length && this.position >= this.until && (this.engine.silent() || this.position >= this.until + TAIL_SAMPLES)) this.finished = true;
  }
  return done;
 }
}
/** A sound effect, played the way a driver would play it on voice 0. */
export function soundStream(sound: Sound): AudioStream {
 const writes = soundWrites(sound).flatMap((frame, i) => frame.map(([field, value]) => ({ at: i * FRAME_SAMPLES, voice: 0, field, value })));
 return new WriteStream(writes, sound.frames.length * FRAME_SAMPLES);
}
/** One note on an instrument, held for `hold` samples and then released. */
export function noteStream(instrument: Omit<Instrument, 'id' | 'name'>, pitch: number, hold = SAMPLE_RATE / 3, pan = 0): AudioStream {
 const f = noteFrequency(pitch);
 const regs: Array<[number, number]> = [[REG.FREQ_L, f & 255], [REG.FREQ_H, f >> 8], [REG.PULSE_WIDTH, instrument.pulse], [REG.ATTACK_DECAY, instrument.attack << 4 | instrument.decay],
  [REG.SUSTAIN_RELEASE, instrument.sustain << 4 | instrument.release], [REG.WAVEFORM, instrument.wave], [REG.PAN, pan & 255], [REG.VOLUME, instrument.volume], [REG.CONTROL, CONTROL_GATE | CONTROL_RESET_PHASE]];
 return new WriteStream([...regs.map(([field, value]) => ({ at: 0, voice: 0, field, value })), { at: hold, voice: 0, field: REG.CONTROL, value: 0 }], hold);
}

/** A song on the sequencer: its compiled tracks loaded and started together, as BAND 1 would. */
class SongStream implements AudioStream {
 position = 0; finished = false;
 private engine = new MiaEngine();
 private loops: boolean;
 private end: number;
 constructor(song: Song, instruments: Instrument[], from: number, mutes: boolean[]) {
  const compiled = compileSong(song, instruments);
  let mask = 0;
  compiled.voices.forEach((v, i) => { if (v && !mutes[i]) { this.engine.loadTrack(i, v.bytes); mask |= 1 << i; } });
  this.engine.start(mask);
  this.loops = compiled.loopSample !== null && mask !== 0;
  this.end = compiled.samples;
  // Playing from partway in runs the song silently up to there, so every
  // envelope and register is where the chip would have it.
  for (let left = from; left > 0; left -= SAMPLE_RATE) this.engine.render(Math.min(left, SAMPLE_RATE));
  this.position = 0; this.origin = from;
 }
 /** The sample in the song the stream started from. */
 readonly origin: number;
 render(left: Float32Array, right: Float32Array, count: number, offset = 0): number {
  if (this.finished) return 0;
  this.engine.render(count, left, right, offset);
  this.position += count;
  const at = this.origin + this.position;
  if (!this.loops && at >= this.end && (this.engine.silent() || at >= this.end + TAIL_SAMPLES)) this.finished = true;
  return count;
 }
}
/** A song from sample `from`, with any voice in `mutes` left unloaded. */
export function songStream(song: Song, instruments: Instrument[], { from = 0, mutes = [] as boolean[] } = {}): AudioStream & { origin: number } {
 return new SongStream(song, instruments, from, mutes);
}

// ---------------------------------------------------------------------------
// Generated sound effects
// ---------------------------------------------------------------------------

export const SOUND_PRESETS = ['blip', 'coin', 'jump', 'laser', 'explosion', 'hit', 'powerup', 'random'] as const;
export type SoundPreset = typeof SOUND_PRESETS[number];
export const SOUND_PRESET_NAMES: Record<SoundPreset, string> = { blip: 'Blip', coin: 'Coin', jump: 'Jump', laser: 'Laser', explosion: 'Explosion', hit: 'Hit', powerup: 'Power-up', random: 'Random' };

/** A seeded generator, so the same preset and seed make the same sound. */
function random(seed: number): () => number {
 let a = seed >>> 0;
 return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/**
 * The kinds of sound a game asks for most, sfxr-style: each seed is a
 * different take on the same idea. Everything is written as frames — pitch
 * sweeps, arpeggios, volume and pulse-width moves — the way a driver would
 * write them.
 */
export function generateSound(preset: SoundPreset, seed: number): Omit<Sound, 'id' | 'name'> {
 const r = random(seed), pick = (lo: number, hi: number) => lo + r() * (hi - lo), int = (lo: number, hi: number) => Math.floor(pick(lo, hi + 1));
 const frames: SoundFrame[] = [];
 const add = (count: number, frame: (i: number, t: number) => Partial<SoundFrame>) => {
  for (let i = 0; i < count; i++) {
   const f = { freq: 440, volume: 200, pulse: 128, wave: WAVE_PULSE, gate: true, ...frame(i, count > 1 ? i / (count - 1) : 0) };
   frames.push({ freq: hzToFrequency(f.freq), volume: Math.round(Math.max(0, Math.min(255, f.volume))), pulse: Math.round(Math.max(0, Math.min(255, f.pulse))), wave: f.wave, gate: f.gate });
  }
 };
 // Frequencies here are in Hz; `add` converts them.
 const sweep = (from: number, to: number, t: number) => from * (to / from) ** t;
 switch (preset) {
  case 'blip': {
   const hz = pick(500, 1400), pw = int(48, 160), n = int(4, 8);
   add(n, (i, t) => ({ freq: hz, pulse: pw, volume: 230 - 110 * t }));
   return { attack: 0, decay: 3, sustain: 10, release: 2, pan: 0, frames };
  }
  case 'coin': {
   const hz = pick(700, 1200), jump = 2 ** (int(4, 7) / 12), a = int(3, 5), b = int(10, 16);
   add(a, () => ({ freq: hz, volume: 230 }));
   add(b, (i, t) => ({ freq: hz * jump, volume: 230 * (1 - t) ** 1.5, gate: i < b - 1 }));
   return { attack: 0, decay: 0, sustain: 15, release: 3, pan: 0, frames };
  }
  case 'jump': {
   const from = pick(160, 320), to = from * pick(1.8, 3.2), pw = int(48, 128), n = int(9, 15);
   add(n, (i, t) => ({ freq: sweep(from, to, t), pulse: pw, volume: 230 - 90 * t, gate: i < n - 2 }));
   return { attack: 0, decay: 2, sustain: 12, release: 3, pan: 0, frames };
  }
  case 'laser': {
   const from = pick(1400, 3200), to = from / pick(4, 10), wave = r() < 0.6 ? WAVE_PULSE : WAVE_SAW, n = int(8, 15);
   add(n, (i, t) => ({ freq: sweep(from, to, t ** 0.7), wave, pulse: 40 + 170 * t, volume: 255 - 150 * t }));
   return { attack: 0, decay: 4, sustain: 9, release: 2, pan: 0, frames };
  }
  case 'explosion': {
   const from = pick(1200, 2600), to = pick(50, 140), n = int(30, 48);
   add(n, (i, t) => ({ freq: sweep(from, to, t ** 0.6), wave: WAVE_NOISE, volume: 255 * (1 - t) ** 1.2, gate: i < n * 0.6 }));
   return { attack: 0, decay: 9, sustain: 7, release: 8, pan: 0, frames };
  }
  case 'hit': {
   const noise = pick(1500, 3200), tone = pick(140, 320), n = int(6, 10), pw = int(32, 96);
   add(2, () => ({ freq: noise, wave: WAVE_NOISE, volume: 255 }));
   add(n, (i, t) => ({ freq: sweep(tone, tone / 2, t), wave: WAVE_PULSE, pulse: pw, volume: 220 * (1 - t) }));
   return { attack: 0, decay: 3, sustain: 7, release: 2, pan: 0, frames };
  }
  case 'powerup': {
   const base = pick(300, 520), step = int(2, 3), rounds = int(2, 4), chord = r() < 0.5 ? [0, 4, 7, 12] : [0, 5, 9, 12], pw = int(64, 128);
   for (let k = 0; k < rounds; k++) for (const interval of chord) add(step, () => ({ freq: base * 2 ** ((interval + k * 2) / 12), pulse: pw, volume: 210 }));
   add(8, (i, t) => ({ freq: base * 2 ** ((12 + rounds * 2 - 2) / 12), pulse: pw, volume: 210 * (1 - t), gate: i < 7 }));
   return { attack: 0, decay: 0, sustain: 15, release: 4, pan: 0, frames };
  }
  default: {
   const wave = int(0, 4), from = pick(80, 2400), to = from * 2 ** pick(-3, 2), n = int(6, 40), pw = int(16, 240), arp = r() < 0.3 ? 2 ** (int(3, 12) / 12) : 1, arpAt = int(2, 8);
   add(n, (i, t) => ({ freq: sweep(from, to, t) * (i >= arpAt ? arp : 1), wave, pulse: pw + (240 - pw) * t * r(), volume: 240 * (1 - t * pick(0.3, 1)), gate: i < n - 1 }));
   return { attack: int(0, 2), decay: int(1, 8), sustain: int(4, 13), release: int(1, 6), pan: 0, frames };
  }
 }
}
