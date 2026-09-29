// Pointer input on the sound canvas: the painting tools (pencil, line,
// eraser) draw values into a lane, Select drags across frames, Pan (or
// Space, or the middle button) scrolls, and right-click opens the menu.
// Right-click and the eraser write ZERO, the register's 0, the way a
// painting tool's right button paints color 0 elsewhere.
import { ZERO } from '../domain/sounds.js';
import { markDirty } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import {
  copyFrames,
  cutFrames,
  duplicateFrames,
  invert,
  pasteFrames,
  removeFrames,
  reverse,
  selectAll,
  transpose,
} from './editing.js';
import { between, canvas, clampScroll, frameAt, laneAt, valueAt } from './geometry.js';
import { checkpoint, frames, sf, sound } from './model.js';
import { draw, sync } from './view.js';

/** Whether the active tool paints values. */
const painting = () => ['pencil', 'line', 'eraser'].includes(sf.tool);
/** Writes `value` into lane `lane` at frame `f`. */
function paint(lane, f, value) {
  const fr = frames()[f];
  if (fr) fr[lane.key] = value;
}
/** Continues a paint stroke to a pointer, filling every frame it skipped. */
function strokeTo(clientX, clientY) {
  const f = frameAt(clientX, false),
    value = sf.drag.erase ? ZERO[sf.drag.lane.key] : valueAt(sf.drag.lane, clientY);
  const from = sf.drag.last ?? { f, value },
    steps = Math.abs(f - from.f);
  for (let i = 0; i <= steps; i++) {
    const at = from.f + Math.sign(f - from.f) * i;
    if (at >= 0 && at < frames().length)
      paint(
        sf.drag.lane,
        at,
        steps ? between(sf.drag.lane.key, from.value, value, i / steps) : value,
      );
  }
  sf.drag.last = { f, value };
  draw();
  sync();
}
/** Ends a drag: a line writes its ramp, and the editor redraws. */
function endDrag(e) {
  const d = sf.drag;
  sf.drag = null;
  canvas.style.cursor = '';
  if (!d) return;
  if (d.kind === 'line') {
    const f = frameAt(e.clientX),
      value = valueAt(d.lane, e.clientY),
      span = Math.abs(f - d.f);
    for (let i = 0; i <= span; i++)
      paint(
        d.lane,
        Math.min(d.f, f) + i,
        span
          ? between(d.lane.key, f < d.f ? value : d.value, f < d.f ? d.value : value, i / span)
          : value,
      );
  }
  if (d.kind === 'paint' || d.kind === 'line') markDirty();
  sf.render();
}

/** Wires the pointer on the sound canvas. */
export function canvasPointer() {
  canvas.onpointerdown = (e) => {
    if (!sound()) return;
    e.preventDefault();
    canvas.focus();
    if (sf.space || e.button === 1 || (sf.tool === 'pan' && e.button === 0)) {
      sf.drag = { kind: 'pan', x: e.clientX, scroll: sf.scrollX };
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 2 && !painting()) return;
    const lane = laneAt(e.clientY),
      f = frameAt(e.clientX);
    if (sf.tool === 'select') {
      const anchor =
        e.shiftKey && sf.selection
          ? f < sf.selection.from
            ? sf.selection.to - 1
            : sf.selection.from
          : f;
      sf.drag = { kind: 'select', anchor };
      sf.selection = { from: Math.min(anchor, f), to: Math.max(anchor, f) + 1 };
      canvas.setPointerCapture(e.pointerId);
      sf.render();
      return;
    }
    if (!lane) return;
    // A painting tool's stroke drops the selection, as in the grid editors.
    sf.selection = null;
    const erase = e.button === 2 || sf.tool === 'eraser';
    checkpoint(
      erase ? `Clear the ${lane.label.toLowerCase()}` : `Draw the ${lane.label.toLowerCase()}`,
    );
    markDirty();
    if (sf.tool === 'line' && !erase) {
      const r = canvas.getBoundingClientRect();
      sf.drag = {
        kind: 'line',
        lane,
        f,
        value: valueAt(lane, e.clientY),
        x0: e.clientX - r.left,
        y0: e.clientY - r.top,
        x1: e.clientX - r.left,
        y1: e.clientY - r.top,
      };
      canvas.setPointerCapture(e.pointerId);
      draw();
      return;
    }
    sf.drag = { kind: 'paint', lane, erase, last: null };
    canvas.setPointerCapture(e.pointerId);
    strokeTo(e.clientX, e.clientY);
  };
  canvas.onpointermove = (e) => {
    if (!sound()) return;
    const f = frameAt(e.clientX, false);
    sf.hover = f >= 0 && f < frames().length ? f : null;
    if (!sf.drag) {
      canvas.style.cursor =
        sf.tool === 'pan' || sf.space ? 'grab' : sf.tool === 'select' ? 'col-resize' : 'crosshair';
      draw();
      sync();
      return;
    }
    if (sf.drag.kind === 'pan') {
      sf.scrollX = clampScroll(sf.drag.scroll - (e.clientX - sf.drag.x));
      draw();
      return;
    }
    if (sf.drag.kind === 'select') {
      const at = frameAt(e.clientX);
      sf.selection = { from: Math.min(sf.drag.anchor, at), to: Math.max(sf.drag.anchor, at) + 1 };
      draw();
      sync();
      return;
    }
    if (sf.drag.kind === 'line') {
      const r = canvas.getBoundingClientRect();
      sf.drag.x1 = e.clientX - r.left;
      sf.drag.y1 = e.clientY - r.top;
      draw();
      return;
    }
    strokeTo(e.clientX, e.clientY);
  };
  canvas.onpointerup = endDrag;
  canvas.onpointercancel = () => {
    sf.drag = null;
    sf.render();
  };
  canvas.onpointerleave = () => {
    sf.hover = null;
    draw();
    sync();
  };
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    if (!sound() || painting()) return;
    const sel = !!sf.selection,
      paste = StudioShell.clipboard.has('soundFrames');
    StudioShell.contextMenu(e.clientX, e.clientY, [
      { label: 'Cut', hint: 'Mod+X', disabled: !sel, run: cutFrames },
      { label: 'Copy', hint: 'Mod+C', disabled: !sel, run: copyFrames },
      { label: 'Paste', hint: 'Mod+V', disabled: !paste, run: pasteFrames },
      { label: 'Duplicate', hint: 'Mod+D', disabled: !sel, run: duplicateFrames },
      { label: 'Delete', hint: 'Delete', disabled: !sel, run: removeFrames },
      '-',
      { label: 'Reverse', hint: 'Shift+H', run: reverse },
      { label: 'Invert pitch', hint: 'Shift+V', run: invert },
      { label: 'Transpose up', hint: '↑', run: () => transpose(1) },
      { label: 'Transpose down', hint: '↓', run: () => transpose(-1) },
      '-',
      { label: 'Select all', hint: 'Mod+A', run: selectAll },
      {
        label: 'Deselect',
        hint: 'Esc',
        disabled: !sel,
        run: () => {
          sf.selection = null;
          sf.render();
        },
      },
    ]);
  };
}
