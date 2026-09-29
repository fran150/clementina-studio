// Sound effects: a list of frames, one per 60 Hz tick, each setting a voice's
// registers: freq (the frequency register, 16ths of a hertz, 0 for silence),
// volume and pulse (0-255), wave (0-4) and gate. A frame range is
// {from, to}, `to` excluded. Pitch math goes through the MIA audio module
// (window.MiaAudio in the page), passed in as `audio`, so these functions use
// the same note and register conversions as the engine. Nothing here touches
// the page.
import { clamp } from './geometry.js';

/** What an erase writes to each register: its zero. */
export const ZERO = Object.freeze({ freq: 0, volume: 0, pulse: 0, wave: 0, gate: false });

/**
 * The value `t` (0 to 1) of the way from `a` to `b` on the register `key`.
 * Pitch moves in semitones, so a line is an even sweep, rounded to whole
 * semitones when `snap`; a sweep to or from silence jumps halfway. The gate
 * holds `a`.
 */
export function interpolate(audio, key, a, b, t, snap) {
  if (key === 'gate') return a;
  if (key === 'freq') {
    if (!a || !b) return t < 0.5 ? a : b;
    const s = audio.frequencyNote(a) + (audio.frequencyNote(b) - audio.frequencyNote(a)) * t;
    return audio.noteFrequency(snap ? Math.round(s) : s);
  }
  return Math.round(a + (b - a) * t);
}

/** Shifts every sounding frame in the range by `semitones`, in place. */
export function transposeFrames(audio, frames, { from, to }, semitones) {
  for (let f = from; f < to; f++) {
    const fr = frames[f];
    if (fr.freq) fr.freq = clamp(Math.round(fr.freq * 2 ** (semitones / 12)), 1, audio.MAX_FREQ);
  }
}

/** Plays the range backwards, in place. */
export function reverseFrames(frames, { from, to }) {
  frames.splice(from, to - from, ...frames.slice(from, to).reverse());
}

/**
 * The semitone the range's pitch mirrors about, doubled (lowest plus highest
 * sounding note), or null when nothing in the range sounds.
 */
export function inversionAxis(audio, frames, { from, to }) {
  const notes = frames
    .slice(from, to)
    .filter((f) => f.freq)
    .map((f) => audio.frequencyNote(f.freq));
  return notes.length ? Math.min(...notes) + Math.max(...notes) : null;
}

/** Turns the range's pitch upside down about `axis` (from inversionAxis), in place. */
export function invertFrames(audio, frames, { from, to }, axis) {
  for (let f = from; f < to; f++) {
    const fr = frames[f];
    if (fr.freq) fr.freq = audio.noteFrequency(axis - audio.frequencyNote(fr.freq));
  }
}

/** Changes the length to `n` frames, in place: growing repeats the last frame. */
export function resizeFrames(frames, n) {
  while (frames.length < n) frames.push({ ...frames.at(-1) });
  frames.length = n;
}
