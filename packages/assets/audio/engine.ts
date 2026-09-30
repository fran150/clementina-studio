// The engine: clementina-mia src/mia/audio/audio.c, bit for bit — the same
// sine table, oscillators and noise generator, envelope rate and level
// tables, fixed-point gain chain, pan law and 10-bit output clamp, and the
// same sequencer, timing included. The sequencer holds a NOTE or REST for
// its duration field *plus one* tick: audio_seq_step decodes the next
// event on the tick after its countdown reaches zero (clementina-6502's
// audio_sequencer_test.go asserts the same), so the compiler writes one
// less than the ticks an event should last.
import {
  CONTROL_GATE,
  CONTROL_RESET_PHASE,
  OP,
  PAN_MAX,
  PAN_MIN,
  OUTPUT_PER_TICK,
  REG,
  VOICE_COUNT,
  WAVE_PULSE,
} from './model.js';
import {
  ATTACK,
  OUT_MAX,
  OUT_MIN,
  OUT_SCALE,
  RECORD_SIZE,
  RELEASE,
  Sequencer,
  Voice,
  emptySequencer,
  envelopeStep,
  jumpTarget,
  next,
  read24,
} from './voice.js';

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
