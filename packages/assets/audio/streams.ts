// What the editors play: a song's samples back to steps, and streams that
// render a sound, an auditioned note or a song through the engine.
import { compileSong, noteFrequency, soundWrites, stepSample } from '@clementina/assets/audio';
import {
  CONTROL_GATE,
  CONTROL_RESET_PHASE,
  FRAME_SAMPLES,
  Instrument,
  REG,
  SAMPLE_RATE,
  Song,
  Sound,
} from './model.js';
import { MiaEngine } from './engine.js';

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
