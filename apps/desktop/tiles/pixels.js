// Working on selected pixels: selecting, moving, flipping and rotating,
// the clipboard and pasting, and clearing. Each change is one undoable step.
import { $ } from '../dom.js';
import { clamp, rectBetween } from '../domain/geometry.js';
import {
  applyPixels as domainApplyPixels,
  capturePixels as domainCapturePixels,
  clearPixels as domainClearPixels,
  transformPixels,
} from '../domain/tilesets.js';
import { paletteLibrary, setPaletteLibrary } from '../state.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { asset, mutate, tl } from './model.js';

/** Extends the selection being dragged out to pixel `p`. */
export function updatePixelSelection(p) {
  tl.pixelSelection = rectBetween(tl.selectStart[0], tl.selectStart[1], p[0], p[1]);
}
// Previews may bind palettes; they must not reach the project's library.
export function withScratchLibrary(fn) {
  const saved = paletteLibrary;
  setPaletteLibrary(structuredClone(saved));
  try {
    return fn();
  } finally {
    setPaletteLibrary(saved);
  }
}
// The drawing area's pixels, on the page being viewed; see domain/tilesets.js.
export function capturePixels(r) {
  return domainCapturePixels(asset(), tl.selection, r, tl.plane);
}
export function applyPixels(a, clip, at, opaque, source) {
  domainApplyPixels(a, tl.selection, clip, at, opaque, source, tl.plane);
}
export function clearPixels(a, r) {
  domainClearPixels(a, tl.selection, r, tl.plane);
}
/** Where a rectangle lands moved by (dx, dy), kept inside the drawing area. */
export function movePosition(dx, dy, r) {
  return [
    clamp(r.x + dx, 0, tl.selection.width * 8 - r.width),
    clamp(r.y + dy, 0, tl.selection.height * 8 - r.height),
  ];
}
/** Moves the pixels in `r` (captured as `clip`) to `at`. */
export function movePixels(r, clip, at) {
  if (at[0] === r.x && at[1] === r.y) {
    tl.render();
    return;
  }
  mutate('Move pixels', () => {
    clearPixels(asset(), r);
    applyPixels(asset(), clip, at, false, false);
    tl.pixelSelection = { ...r, x: at[0], y: at[1] };
  });
}
/** Flips ('horizontal', 'vertical') or rotates ('rotate') the selected pixels. */
export function transformSelection(kind) {
  if (!tl.pixelSelection) return;
  const r = tl.pixelSelection,
    clip = transformPixels(capturePixels(r), kind),
    rot = kind === 'rotate',
    w = clip.width,
    h = clip.height;
  if (r.x + w > tl.selection.width * 8 || r.y + h > tl.selection.height * 8) {
    setStatus(
      'The rotated selection does not fit. Move it away from the edge or select a larger drawing area.',
    );
    return;
  }
  mutate(rot ? 'Rotate pixels' : 'Flip pixels', () => {
    clearPixels(asset(), r);
    applyPixels(asset(), clip, [r.x, r.y], true, false);
    tl.pixelSelection = { ...r, width: w, height: h };
  });
}
/** Copies the selected pixels to the app clipboard. */
export function copySelection() {
  if (!asset() || !tl.pixelSelection) return;
  tl.pixelClipboard = capturePixels(tl.pixelSelection);
  StudioShell.clipboard.set('pixels', tl.pixelClipboard);
  tl.clipboardArea = 'pixels';
  setStatus(`Copied ${tl.pixelClipboard.width} × ${tl.pixelClipboard.height} pixels.`);
  tl.render();
}
/** Starts positioning the clipboard's pixels; a click places them. */
export function startPaste() {
  tl.pixelClipboard = StudioShell.clipboard.get('pixels');
  if (!asset() || !tl.pixelClipboard) return;
  tl.pasteAnchor = [
    Math.min(tl.lastPixel[0], tl.selection.width * 8 - 1),
    Math.min(tl.lastPixel[1], tl.selection.height * 8 - 1),
  ];
  tl.clipboardArea = 'pixels';
  setStatus(
    'Position the paste and click. Escape cancels. Paste options control transparency and palettes.',
  );
  tl.render();
}
// Rehearsed on a scratch library first so a rejected paste leaves no palettes behind.
export function commitPaste() {
  const [left, top] = tl.pasteAnchor,
    opaque = $('pasteOpaque').checked,
    source = $('pasteSource').checked;
  try {
    withScratchLibrary(() =>
      applyPixels(structuredClone(asset()), tl.pixelClipboard, tl.pasteAnchor, opaque, source),
    );
  } catch (e) {
    setStatus(e.message);
    return;
  }
  mutate('Paste pixels', () => {
    applyPixels(asset(), tl.pixelClipboard, [left, top], opaque, source);
    tl.pixelSelection = {
      x: left,
      y: top,
      width: Math.min(tl.pixelClipboard.width, tl.selection.width * 8 - left),
      height: Math.min(tl.pixelClipboard.height, tl.selection.height * 8 - top),
    };
    tl.pasteAnchor = null;
  });
}
/** Selects every pixel of the drawing area. */
export function selectAllPixels() {
  if (!asset()) return;
  tl.tool = 'select';
  tl.pasteAnchor = null;
  tl.pixelSelection = {
    x: 0,
    y: 0,
    width: tl.selection.width * 8,
    height: tl.selection.height * 8,
  };
  tl.render();
}
/** Drops the selection, and any move or paste in progress. */
export function dropPixelSelection() {
  tl.resizeDrag = null;
  tl.moveDrag = null;
  tl.pasteAnchor = null;
  tl.pixelSelection = null;
  tl.selectStart = null;
  tl.render();
}
// Cut and Delete leave color 0 behind, the way the eraser does.
export function clearSelection(label = 'Delete pixels') {
  if (asset() && tl.pixelSelection) mutate(label, () => clearPixels(asset(), tl.pixelSelection));
}
export function cutSelection() {
  if (!asset() || !tl.pixelSelection) return;
  copySelection();
  clearSelection('Cut pixels');
}
/** The fixed corner of a selection handle under the pointer, or null. */
export function selectionHandle(e) {
  if (!tl.pixelSelection || tl.zoom < 4) return null;
  const r = tl.pixelSelection,
    c = $('bankSelection').getBoundingClientRect(),
    x = (e.clientX - c.left) / tl.zoom,
    y = (e.clientY - c.top) / tl.zoom;
  for (const [hx, hy, ox, oy] of [
    [r.x, r.y, r.x + r.width - 1, r.y + r.height - 1],
    [r.x + r.width, r.y, r.x, r.y + r.height - 1],
    [r.x, r.y + r.height, r.x + r.width - 1, r.y],
    [r.x + r.width, r.y + r.height, r.x, r.y],
  ])
    if (Math.abs(x - hx) * tl.zoom <= 3 && Math.abs(y - hy) * tl.zoom <= 3) return [ox, oy];
  return null;
}
/** Resizes the selection to pixel `p` from the handle drag's fixed corner. */
export function resizeSelection(p) {
  tl.pixelSelection = rectBetween(tl.resizeDrag[0], tl.resizeDrag[1], p[0], p[1]);
}
