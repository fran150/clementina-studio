// Pointer input: on the canvas (select, move, box-select, pan, drag the origin
// or the resize corner, place tiles, the context menu, and tiles dropped from
// the tile picker) and on the tile picker's map (drag to pick tiles).
import {
  MAX_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  spriteAt,
  validSprites as valid,
} from '../domain/shapes.js';
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import {
  copySprites,
  cutSprites,
  duplicateSprites,
  flip,
  moveSelection,
  moveToEnd,
  pasteSprites,
  place,
  resizeCanvas,
  setOrigin,
} from './editing.js';
import { showGhost } from './ghost.js';
import { edit, height, hideGhost, ox, oy, sc, setMode, shape, spritesOf, width } from './model.js';
import { canvas, draw, drawBank, screen, world } from './view.js';

/** The topmost sprite under a canvas point, or -1. */
const hit = (pos) => spriteAt(shape(), pos);

/** Wires the pointer on the shape canvas. */
export function canvasPointer() {
  canvas.onpointerdown = (e) => {
    if (!shape()) return;
    e.preventDefault();
    canvas.focus();
    canvas.setPointerCapture(e.pointerId);
    if (sc.panMode && e.button === 0) {
      sc.drag = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, camera: { ...sc.camera } };
      draw();
      return;
    }
    const pos = world(e),
      corner = screen(width(), height()),
      cr = canvas.getBoundingClientRect(),
      origin = screen(ox(), oy());
    if (
      e.button === 0 &&
      !sc.space &&
      !sc.placing &&
      Math.hypot(e.clientX - cr.left - origin[0], e.clientY - cr.top - origin[1]) <= 11
    ) {
      sc.drag = { kind: 'origin', point: { x: ox(), y: oy() } };
      return;
    }
    if (
      e.button === 0 &&
      Math.abs(e.clientX - cr.left - corner[0]) < 8 &&
      Math.abs(e.clientY - cr.top - corner[1]) < 8
    ) {
      sc.drag = { kind: 'resize', size: { w: width(), h: height() } };
      return;
    }
    if (e.button === 2) {
      const i = hit(pos);
      if (i >= 0 && !sc.selected.has(i)) {
        sc.selected = new Set([i]);
        sc.render();
      }
      return;
    }
    if (sc.space || e.button === 1) {
      sc.drag = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, camera: { ...sc.camera } };
      return;
    }
    if (sc.originTool) {
      setOrigin(pos.x, pos.y);
      sc.originTool = false;
      sc.render();
      return;
    }
    if (sc.placing) {
      place(pos);
      return;
    }
    // Box select always drags a marquee, even starting on top of a sprite, so
    // overlapping or tightly packed sprites can still be rubber-banded together.
    if (sc.boxSelect) {
      if (!e.shiftKey) sc.selected.clear();
      sc.drag = { kind: 'marquee', start: pos, end: pos, initial: new Set(sc.selected) };
      draw();
      return;
    }
    const i = hit(pos);
    if (i >= 0) {
      if (e.shiftKey) {
        sc.selected.has(i) ? sc.selected.delete(i) : sc.selected.add(i);
        sc.render();
        return;
      }
      if (!sc.selected.has(i)) sc.selected = new Set([i]);
      const original = structuredClone(spritesOf());
      sc.drag = { kind: 'move', start: pos, original, sprites: original };
      sc.render();
    } else if (pos.x < 0 || pos.y < 0 || pos.x >= width() || pos.y >= height()) {
      if (!e.shiftKey) sc.selected.clear();
      sc.drag = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, camera: { ...sc.camera } };
      draw();
    } else {
      if (!e.shiftKey) sc.selected.clear();
      sc.drag = { kind: 'marquee', start: pos, end: pos, initial: new Set(sc.selected) };
      draw();
    }
  };
  canvas.onpointermove = (e) => {
    if (sc.placing) {
      showGhost(e);
      if (!sc.drag) return;
    }
    if (!sc.drag) {
      if (sc.panMode) return;
      const r = canvas.getBoundingClientRect(),
        p = screen(ox(), oy()),
        pos = world(e);
      canvas.style.cursor =
        Math.hypot(e.clientX - r.left - p[0], e.clientY - r.top - p[1]) <= 11
          ? 'move'
          : pos.x < 0 || pos.y < 0 || pos.x >= width() || pos.y >= height()
            ? 'grab'
            : 'default';
      return;
    }
    const pos = world(e);
    if (sc.drag.kind === 'origin') {
      sc.drag.point = {
        x: Math.max(0, Math.min(width(), pos.x)),
        y: Math.max(0, Math.min(height(), pos.y)),
      };
      draw();
      return;
    }
    if (sc.drag.kind === 'resize') {
      sc.drag.size = {
        w: Math.max(
          sc.units === 'tiles' ? 8 : 1,
          Math.min(MAX_CANVAS_WIDTH, sc.units === 'tiles' ? Math.round(pos.x / 8) * 8 : pos.x),
        ),
        h: Math.max(
          sc.units === 'tiles' ? 8 : 1,
          Math.min(MAX_CANVAS_HEIGHT, sc.units === 'tiles' ? Math.round(pos.y / 8) * 8 : pos.y),
        ),
      };
      draw();
      const ctx = canvas.getContext('2d'),
        at = screen(0, 0);
      ctx.strokeStyle = '#36c9d6';
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(at[0], at[1], sc.drag.size.w * sc.zoom, sc.drag.size.h * sc.zoom);
      $('scStatus').textContent = `Resize canvas: ${sc.drag.size.w} × ${sc.drag.size.h} px`;
      return;
    }
    if (sc.drag.kind === 'pan') {
      sc.camera = {
        x: sc.drag.camera.x - (e.clientX - sc.drag.start.x) / sc.zoom,
        y: sc.drag.camera.y - (e.clientY - sc.drag.start.y) / sc.zoom,
      };
      draw();
      return;
    }
    if (sc.drag.kind === 'move') {
      let dx = pos.x - sc.drag.start.x,
        dy = pos.y - sc.drag.start.y;
      if ($('scSnap').checked) {
        dx = Math.round(dx / 8) * 8;
        dy = Math.round(dy / 8) * 8;
      }
      const next = sc.drag.original.map((p, i) =>
        sc.selected.has(i) ? { ...p, x: p.x + dx, y: p.y + dy } : p,
      );
      if (valid(next)) sc.drag.sprites = next;
    } else {
      sc.drag.end = pos;
      sc.selected = new Set(sc.drag.initial);
      spritesOf().forEach((p, i) => {
        if (
          p.x + ox() + 8 > Math.min(pos.x, sc.drag.start.x) &&
          p.x + ox() < Math.max(pos.x, sc.drag.start.x) &&
          p.y + oy() + 8 > Math.min(pos.y, sc.drag.start.y) &&
          p.y + oy() < Math.max(pos.y, sc.drag.start.y)
        )
          sc.selected.add(i);
      });
    }
    draw();
  };
  canvas.onpointerup = () => {
    const d = sc.drag;
    sc.drag = null;
    if (d?.kind === 'origin') {
      if (d.point.x !== ox() || d.point.y !== oy()) setOrigin(d.point.x, d.point.y);
      else sc.render();
      return;
    }
    if (d?.kind === 'resize') {
      resizeCanvas(d.size.w, d.size.h);
      return;
    }
    if (d?.kind === 'move' && JSON.stringify(d.original) !== JSON.stringify(d.sprites))
      edit('Move sprites', () => (shape().sprites = d.sprites));
    else sc.render();
  };
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    if (!shape()) return;
    const sel = sc.selected.size > 0;
    StudioShell.contextMenu(e.clientX, e.clientY, [
      { label: 'Cut', hint: 'Mod+X', disabled: !sel, run: cutSprites },
      { label: 'Copy', hint: 'Mod+C', disabled: !sel, run: copySprites },
      {
        label: 'Paste',
        hint: 'Mod+V',
        disabled: !StudioShell.clipboard.has('sprites'),
        run: pasteSprites,
      },
      { label: 'Duplicate', hint: 'Mod+D', disabled: !sel, run: duplicateSprites },
      { label: 'Delete', hint: 'Delete', disabled: !sel, run: () => $('scRemove').click() },
      '-',
      { label: 'Flip horizontally', hint: 'Shift+H', disabled: !sel, run: () => flip('x') },
      { label: 'Flip vertically', hint: 'Shift+V', disabled: !sel, run: () => flip('y') },
      '-',
      { label: 'Bring to front', disabled: !sel, run: () => moveToEnd(true) },
      { label: 'Move up', disabled: !sel, run: () => moveSelection(1) },
      { label: 'Move down', disabled: !sel, run: () => moveSelection(-1) },
      { label: 'Send to back', disabled: !sel, run: () => moveToEnd(false) },
      '-',
      {
        label: 'Select all',
        hint: 'Mod+A',
        run: () => {
          sc.selected = new Set(spritesOf().map((_, i) => i));
          sc.render();
        },
      },
    ]);
  };
  canvas.onpointercancel = () => {
    sc.drag = null;
    sc.render();
  };
  canvas.ondragover = (e) => {
    if (e.dataTransfer.types.includes('application/x-clementina-tiles')) {
      e.preventDefault();
      showGhost(e);
    }
  };
  canvas.ondrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.getData('application/x-clementina-tiles') === 'selection') place(world(e));
  };
}

/** Wires the pointer on the tile picker: a drag picks a block of tiles to place. */
export function tilePickerPointer() {
  const mapCell = (e) => {
    const r = $('scBankMap').getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(15, Math.floor(((e.clientX - r.left) / r.width) * 16))),
      y: Math.max(0, Math.min(15, Math.floor(((e.clientY - r.top) / r.height) * 16))),
    };
  };
  $('scBankMap').tabIndex = 0;
  $('scBankMap').oncontextmenu = (e) => e.preventDefault();
  $('scBankMap').onpointerdown = (e) => {
    e.preventDefault();
    $('scBankMap').focus();
    $('scBankMap').setPointerCapture(e.pointerId);
    if (e.button !== 0) return;
    sc.sourceAnchor = mapCell(e);
    sc.sourceRect = { ...sc.sourceAnchor, width: 1, height: 1 };
    drawBank();
  };
  $('scBankMap').onpointermove = (e) => {
    if (!sc.sourceAnchor) return;
    const p = mapCell(e);
    sc.sourceRect = {
      x: Math.min(p.x, sc.sourceAnchor.x),
      y: Math.min(p.y, sc.sourceAnchor.y),
      width: Math.abs(p.x - sc.sourceAnchor.x) + 1,
      height: Math.abs(p.y - sc.sourceAnchor.y) + 1,
    };
    drawBank();
  };
  $('scBankMap').onpointerup = () => {
    if (sc.sourceAnchor && shape()) setMode('place');
    sc.sourceAnchor = null;
  };
  $('scBankMap').onpointercancel = () => {
    sc.sourceAnchor = null;
    sc.placing = false;
    hideGhost();
    sc.render();
  };
}
