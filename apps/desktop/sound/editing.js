// The sound editor's edits on frames: transpose, reverse and invert (the
// selection, or the whole sound), delete, the clipboard, the length, and
// selecting all. Each is one undoable step.
import {
  invertFrames,
  inversionAxis,
  resizeFrames,
  reverseFrames,
  transposeFrames,
} from '../domain/sounds.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { A, edit, frames, setTool, sf, sound } from './model.js';

/** The frames an edit works on: the selection, or the whole sound. */
const inRange = () => sf.selection ?? { from: 0, to: frames().length };
/** Runs `fn(sound)` as one undoable edit labeled `label`. */
function setFrames(label, fn) {
  const s = sound();
  if (!s) return;
  edit(label, () => fn(s));
}
/** Moves the pitch by `semitones`. */
export function transpose(semitones) {
  const { from, to } = inRange();
  setFrames(semitones > 0 ? 'Transpose up' : 'Transpose down', (s) =>
    transposeFrames(A(), s.frames, { from, to }, semitones),
  );
}
/** Plays the frames backwards. */
export function reverse() {
  const { from, to } = inRange();
  setFrames('Reverse the frames', (s) => reverseFrames(s.frames, { from, to }));
}
/** Mirrors the pitch between its lowest and highest notes. */
export function invert() {
  const range = inRange(),
    axis = inversionAxis(A(), frames(), range);
  if (axis === null) return;
  setFrames('Invert the pitch', (s) => invertFrames(A(), s.frames, range, axis));
}
/** Deletes the selected frames; false when there are none, or they are every frame. */
export function removeFrames() {
  if (!sf.selection) return false;
  if (sf.selection.to - sf.selection.from >= frames().length) {
    setStatus('A sound keeps at least one frame.');
    return false;
  }
  const { from, to } = sf.selection;
  setFrames('Delete frames', (s) => {
    s.frames.splice(from, to - from);
    sf.selection = null;
  });
  return true;
}
/** Inserts copies of `list` at frame `at`, selected; false if it would not fit. */
function insertFrames(list, at, label) {
  if (!sound() || !list?.length) return false;
  if (frames().length + list.length > A().MAX_SOUND_FRAMES) {
    setStatus(`A sound holds at most ${A().MAX_SOUND_FRAMES} frames.`);
    return false;
  }
  setFrames(label, (s) => {
    s.frames.splice(at, 0, ...structuredClone(list));
    sf.selection = { from: at, to: at + list.length };
  });
  return true;
}
/** Copies the selected frames to the app clipboard; false if none. */
export function copyFrames() {
  if (!sf.selection) return false;
  StudioShell.clipboard.set('soundFrames', frames().slice(sf.selection.from, sf.selection.to));
  return true;
}
/** Copies, then deletes, the selected frames. */
export function cutFrames() {
  return copyFrames() && removeFrames();
}
/** Pastes the clipboard's frames after the selection, or at the end. */
export const pasteFrames = () =>
  insertFrames(
    StudioShell.clipboard.get('soundFrames'),
    sf.selection?.to ?? frames().length,
    'Paste frames',
  );
/** Duplicates the selected frames right after them. */
export const duplicateFrames = () =>
  !!sf.selection &&
  insertFrames(
    frames().slice(sf.selection.from, sf.selection.to),
    sf.selection.to,
    'Duplicate frames',
  );
/** Sets the length to `n` frames: growing repeats the last frame; shrinking cuts from the end. */
export function setLength(n) {
  const s = sound();
  if (!s || !Number.isInteger(n) || n < 1 || n > A().MAX_SOUND_FRAMES || n === s.frames.length) {
    sf.render();
    return;
  }
  // Growing repeats the last frame; shrinking cuts from the end.
  setFrames('Change the length', (x) => {
    resizeFrames(x.frames, n);
    if (sf.selection && sf.selection.to > n) sf.selection = null;
  });
}
/** Selects every frame, with the Select tool. */
export function selectAll() {
  if (!sound()) return;
  setTool('select');
  sf.selection = { from: 0, to: frames().length };
  sf.render();
}
