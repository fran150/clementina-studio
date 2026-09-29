// The sound canvas's geometry: where each lane and frame sits, which lane,
// frame and value a pointer is over, and the horizontal scroll and fit.
import { clamp } from '../domain/geometry.js';
import { interpolate, semitoneFreq as freqForSemitone } from '../domain/sounds.js';
import { $ } from '../dom.js';
import {
  A,
  FRAME_W,
  GAP,
  LABEL_W,
  LANES,
  PITCH_HIGH,
  PITCH_LOW,
  RULER_H,
  frames,
  sf,
} from './model.js';

export const canvas = $('sfCanvas');

/** A frame's width on screen at the current zoom. */
export const frameW = () => FRAME_W * sf.zoom;
/** Every lane with its top and height; the pitch lane takes the spare height. */
export function lanes() {
  const h = canvas.clientHeight || 400,
    fixed = LANES.slice(1).reduce((n, l) => n + l.height, 0);
  let top = RULER_H + 8;
  return LANES.map((lane, i) => {
    const height = i ? lane.height : Math.max(110, h - top - fixed - GAP * LANES.length - 4),
      out = { ...lane, top, height };
    top += height + GAP;
    return out;
  });
}
/** A frame's left edge on the canvas. */
export const frameX = (f) => LABEL_W + f * frameW() - sf.scrollX;
/** The frame under a pointer; kept within the sound unless `inside` is false. */
export function frameAt(clientX, inside = true) {
  const r = canvas.getBoundingClientRect(),
    f = Math.floor((clientX - r.left - LABEL_W + sf.scrollX) / frameW());
  return inside ? clamp(f, 0, frames().length - 1) : f;
}
/** The lane under a pointer, or null. */
export function laneAt(clientY) {
  const r = canvas.getBoundingClientRect(),
    y = clientY - r.top;
  return lanes().find((l) => y >= l.top - GAP / 2 && y < l.top + l.height + GAP / 2) ?? null;
}
/** The register value for semitone `s`. */
const semitoneFreq = (s) => freqForSemitone(A(), s);
// A lane's position, 0 at the top and 1 at the bottom, for a pointer.
function laneT(lane, clientY) {
  const r = canvas.getBoundingClientRect();
  return clamp((clientY - r.top - lane.top) / lane.height, 0, 1);
}
/** The value a pointer at `clientY` draws in `lane`. */
export function valueAt(lane, clientY) {
  const t = laneT(lane, clientY);
  switch (lane.key) {
    case 'freq': {
      const s = PITCH_HIGH - t * (PITCH_HIGH - PITCH_LOW);
      return semitoneFreq(sf.snap ? Math.round(s) : s);
    }
    case 'wave':
      return Math.min(4, Math.floor(t * 5));
    case 'gate':
      return true;
    default:
      return Math.round(255 * (1 - t));
  }
}
/** Interpolates along a lane: pitch in semitones, so a line is an even sweep. */
export const between = (key, a, b, t) => interpolate(A(), key, a, b, t, sf.snap);
/** Keeps the scroll within the frames, with a little room past the end. */
export function clampScroll(x) {
  const max = Math.max(0, frames().length * frameW() - (canvas.clientWidth - LABEL_W) + 40);
  return clamp(x, 0, max);
}
// Frames are a time axis, not pixel art, so they fit the width exactly.
export const fitLevel = () =>
  clamp((canvas.clientWidth - LABEL_W - 32) / (frames().length * FRAME_W), 0.5, 4);
