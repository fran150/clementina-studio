// The piano roll's geometry: where steps and pitches sit on the canvas,
// which note a point is over, and the scroll, fit and centering.
import { NOTES, noteAt as noteUnder } from '../domain/songs.js';
import { $ } from '../dom.js';
import { KEYS_W, ROW_H, RULER_H, STEP_W, mu, notes, song } from './model.js';

export const canvas = $('muCanvas');

/** A step's width on screen; a song's steps per bar. */
export const stepW = () => STEP_W * mu.zoom,
  stepsPerBar = (s) => s.stepsPerBeat * s.beatsPerBar;
/** A step's left edge and a pitch's top edge on the canvas. */
export const stepX = (step) => KEYS_W + step * stepW() - mu.scrollX,
  pitchY = (p) => RULER_H + (NOTES - 1 - p) * ROW_H - mu.scrollY;
/** A pointer event's position on the canvas. */
export function point(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
/** The (fractional) step and the pitch at a canvas point. */
export const stepAt = (x) => (x - KEYS_W + mu.scrollX) / stepW(),
  pitchAt = (y) => NOTES - 1 - Math.floor((y - RULER_H + mu.scrollY) / ROW_H);
// The note under a canvas point on the voice being drawn on, or null.
export const noteAt = (x, y) => noteUnder(notes(), stepAt(x), pitchAt(y));
/** Keeps the scroll within the song and the pitch range. */
export function clampScroll() {
  const s = song();
  if (!s) return;
  mu.scrollX = Math.max(
    0,
    Math.min(mu.scrollX, Math.max(0, s.length * stepW() - (canvas.clientWidth - KEYS_W) + 60)),
  );
  mu.scrollY = Math.max(
    0,
    Math.min(mu.scrollY, Math.max(0, NOTES * ROW_H - (canvas.clientHeight - RULER_H))),
  );
}
// Steps are a time axis, not pixel art, so a song fits the width exactly.
export const fitLevel = () =>
  Math.max(
    0.25,
    Math.min(4, (canvas.clientWidth - KEYS_W - 40) / ((song()?.length ?? 64) * STEP_W)),
  );
// Opening a song shows its notes, or middle C when it has none.
export function center() {
  const all = song().voices.flatMap((v) => v.notes);
  const mid = all.length
    ? (Math.min(...all.map((n) => n.pitch)) + Math.max(...all.map((n) => n.pitch))) / 2
    : 60;
  mu.scrollY = (NOTES - 1 - mid) * ROW_H - (canvas.clientHeight - RULER_H) / 2;
  clampScroll();
}
