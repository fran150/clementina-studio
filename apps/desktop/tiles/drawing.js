// Pointer input: on the tile map, a drag picks the drawing area; on the
// canvas, the painting tools draw, Select selects and moves pixels, the
// picker picks a color, and right-click erases or opens the edit menu.
import { $ } from '../dom.js';
import {
  areaTile,
  floodPixels,
  inArea,
  setTilePixel,
  shapePixels as domainShapePixels,
  strokePixels,
} from '../domain/tilesets.js';
import { bankColor, css565 } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import { refreshPalettes } from './dock.js';
import { asset, changed, patternAt, remember, sample, tl, zeroColor } from './model.js';
import {
  capturePixels,
  clearSelection,
  commitPaste,
  copySelection,
  cutSelection,
  dropPixelSelection,
  movePixels,
  movePosition,
  resizeSelection,
  selectAllPixels,
  selectionHandle,
  startPaste,
  transformSelection,
  updatePixelSelection,
} from './pixels.js';
import { updateStatus } from './view.js';

function mapCell(e) {
  const r = $('bankMap').getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(15, Math.floor(((e.clientX - r.left) / r.width) * 16))),
    y: Math.max(0, Math.min(15, Math.floor(((e.clientY - r.top) / r.height) * 16))),
  };
}
function selectTo(point) {
  tl.pixelSelection = null;
  tl.pasteAnchor = null;
  tl.selection = {
    x: Math.min(tl.anchor.x, point.x),
    y: Math.min(tl.anchor.y, point.y),
    width: Math.abs(point.x - tl.anchor.x) + 1,
    height: Math.abs(point.y - tl.anchor.y) + 1,
  };
  tl.render();
}
// Paints one pixel of the drawing area, recording the bank it was drawn
// against unless erasing.
function paintAt(x, y, value) {
  if (!inArea(tl.selection, x, y)) return;
  const t = areaTile(tl.selection, x, y);
  if (!tl.erasing) asset().tilePaletteBanks[t] = tl.palette;
  setTilePixel(asset(), t, x % 8, y % 8, value, tl.plane);
}
/** The drawing-area pixel under a pointer. */
/** @returns {[number, number]} */
function point(e) {
  const r = $('bankSelection').getBoundingClientRect();
  return [
    Math.floor(((e.clientX - r.left) / r.width) * tl.selection.width * 8),
    Math.floor(((e.clientY - r.top) / r.height) * tl.selection.height * 8),
  ];
}
/** Continues a pencil stroke to `pnt`, filling the pixels it skipped. */
function drawTo(pnt) {
  for (const [x, y] of tl.last ? strokePixels(tl.last, pnt) : [pnt]) paintAt(x, y, tl.stroke);
  tl.last = pnt;
  changed();
}
// Right-click paints with color 0 — erases — while a painting tool is
// active, the Aseprite way; with any other tool it opens the edit menu.
const PAINT_TOOLS = ['pencil', 'eraser', 'fill', 'line', 'rectangle', 'ellipse'],
  painting = () => !tl.panToolActive && PAINT_TOOLS.includes(tl.tool);
/** Marks the tile under the pointer, for the dock and status line. */
function hoverTile([x, y]) {
  if (!asset() || !inArea(tl.selection, x, y)) return;
  const tile = areaTile(tl.selection, x, y);
  tl.hovering = true;
  tl.lastPixel = [x, y];
  tl.targetTile = tile;
  refreshPalettes();
  updateStatus();
}
// Fills the area of one color around a pixel, in the fill pattern.
function flood(start, value) {
  for (const [x, y] of floodPixels(asset(), tl.selection, start, tl.plane))
    if (value === 0 || patternAt(x, y)) paintAt(x, y, value);
}
/** The pixel under a pointer, kept inside the area; Shift makes a square or circle. */
function boundedPoint(e) {
  let [x, y] = point(e);
  x = Math.max(0, Math.min(tl.selection.width * 8 - 1, x));
  y = Math.max(0, Math.min(tl.selection.height * 8 - 1, y));
  if (e.shiftKey && tl.shapeStart && ['rectangle', 'ellipse'].includes(tl.tool)) {
    const [sx, sy] = tl.shapeStart,
      dx = x >= sx ? 1 : -1,
      dy = y >= sy ? 1 : -1;
    const side = Math.min(
      Math.max(Math.abs(x - sx), Math.abs(y - sy)),
      dx > 0 ? tl.selection.width * 8 - 1 - sx : sx,
      dy > 0 ? tl.selection.height * 8 - 1 - sy : sy,
    );
    x = sx + dx * side;
    y = sy + dy * side;
  }
  return [x, y];
}
// The pixels the line, rectangle or ellipse tool covers, in the fill pattern
// when filled.
function shapePixels(kind, a, b) {
  const filled = $('filledShapes').checked;
  return domainShapePixels(kind, a, b, filled).filter(
    ([x, y]) => kind === 'line' || !filled || tl.erasing || patternAt(x, y),
  );
}
/** Draws the shape being dragged out over the canvas. */
function previewShape() {
  tl.render();
  if (!tl.shapeStart) return;
  const c = $('bankSelection').getContext('2d');
  c.fillStyle = tl.erasing ? zeroColor(asset(), tl.palette) : css565(bankColor(tl.palette, tl.ink));
  for (const [x, y] of shapePixels(tl.tool, tl.shapeStart, tl.shapeEnd))
    c.fillRect(x * tl.zoom, y * tl.zoom, tl.zoom, tl.zoom);
}

/** Wires the tile map: a drag picks the drawing area. */
export function tileMapPointer() {
  $('bankMap').onpointerdown = (e) => {
    tl.anchor = mapCell(e);
    $('bankMap').setPointerCapture(e.pointerId);
    selectTo(tl.anchor);
  };
  $('bankMap').onpointermove = (e) => {
    if (tl.anchor) selectTo(mapCell(e));
  };
  $('bankMap').onpointerup = $('bankMap').onpointercancel = () => {
    tl.anchor = null;
    tl.render();
  };
}
/** Wires the drawing canvas. */
export function canvasPointer() {
  $('bankSelection').onpointerdown = (e) => {
    e.preventDefault();
    if (!asset() || (e.button === 2 && !painting())) return;
    tl.erasing = e.button === 2 || tl.tool === 'eraser';
    hoverTile(point(e));
    tl.clipboardArea = 'pixels';
    if (tl.pasteAnchor) {
      tl.pasteAnchor = boundedPoint(e);
      commitPaste();
      return;
    }
    if (tl.tool === 'select') {
      const pos = boundedPoint(e),
        handle = selectionHandle(e);
      if (handle) {
        tl.resizeDrag = handle;
        $('bankSelection').setPointerCapture(e.pointerId);
        return;
      }
      if (
        tl.pixelSelection &&
        pos[0] >= tl.pixelSelection.x &&
        pos[1] >= tl.pixelSelection.y &&
        pos[0] < tl.pixelSelection.x + tl.pixelSelection.width &&
        pos[1] < tl.pixelSelection.y + tl.pixelSelection.height
      ) {
        tl.moveDrag = {
          start: pos,
          rect: { ...tl.pixelSelection },
          clip: capturePixels(tl.pixelSelection),
          at: [tl.pixelSelection.x, tl.pixelSelection.y],
        };
        $('bankSelection').setPointerCapture(e.pointerId);
        return;
      }
      tl.selectStart = pos;
      tl.pixelSelection = { x: tl.selectStart[0], y: tl.selectStart[1], width: 1, height: 1 };
      $('bankSelection').setPointerCapture(e.pointerId);
      tl.render();
      return;
    }
    if (tl.tool === 'picker') {
      const [x, y] = point(e),
        t = areaTile(tl.selection, x, y);
      tl.palette = asset().tilePaletteBanks[t];
      tl.ink = sample(asset(), t, x % 8, y % 8);
      refreshPalettes();
      return;
    }
    if (['line', 'rectangle', 'ellipse'].includes(tl.tool)) {
      tl.shapeStart = point(e);
      tl.shapeEnd = tl.shapeStart;
      $('bankSelection').setPointerCapture(e.pointerId);
      previewShape();
      return;
    }
    remember(false, tl.tool === 'fill' ? 'Fill' : tl.erasing ? 'Erase' : 'Paint');
    if (tl.tool === 'fill') {
      flood(point(e), e.button === 2 ? 0 : tl.ink);
      changed();
      return;
    }
    tl.stroke = e.button === 2 || tl.tool === 'eraser' ? 0 : tl.ink;
    tl.last = null;
    $('bankSelection').setPointerCapture(e.pointerId);
    drawTo(point(e));
  };
  $('bankSelection').onpointermove = (e) => {
    tl.clipboardArea = 'pixels';
    hoverTile(point(e));
    tl.lastPixel = boundedPoint(e);
    if (tl.resizeDrag) {
      resizeSelection(tl.lastPixel);
      tl.render();
      return;
    }
    if (tl.moveDrag) {
      tl.moveDrag.at = movePosition(
        tl.lastPixel[0] - tl.moveDrag.start[0],
        tl.lastPixel[1] - tl.moveDrag.start[1],
        tl.moveDrag.rect,
      );
      tl.render();
      return;
    }
    if (tl.pasteAnchor) {
      tl.pasteAnchor = tl.lastPixel;
      tl.render();
      return;
    }
    if (tl.selectStart) {
      updatePixelSelection(tl.lastPixel);
      tl.render();
      return;
    }
    if (tl.shapeStart) {
      tl.shapeEnd = boundedPoint(e);
      previewShape();
    } else if (tl.stroke !== null) drawTo(point(e));
  };
  $('bankSelection').onpointerleave = () => {
    tl.hovering = false;
    refreshPalettes();
    updateStatus();
  };
  $('bankSelection').onpointerup = (e) => {
    if (tl.resizeDrag) {
      resizeSelection(boundedPoint(e));
      tl.resizeDrag = null;
      tl.render();
      return;
    }
    if (tl.moveDrag) {
      const m = tl.moveDrag;
      tl.moveDrag = null;
      movePixels(m.rect, m.clip, m.at);
      return;
    }
    if (tl.selectStart) {
      updatePixelSelection(boundedPoint(e));
      tl.selectStart = null;
      tl.render();
      return;
    }
    if (tl.shapeStart) {
      tl.shapeEnd = boundedPoint(e);
      const points = shapePixels(tl.tool, tl.shapeStart, tl.shapeEnd);
      remember(
        false,
        { line: 'Draw a line', rectangle: 'Draw a rectangle', ellipse: 'Draw an ellipse' }[tl.tool],
      );
      points.forEach(([x, y]) => paintAt(x, y, tl.erasing ? 0 : tl.ink));
      tl.shapeStart = tl.shapeEnd = null;
      changed();
    }
    tl.stroke = null;
    tl.last = null;
  };
  $('bankSelection').onpointercancel = () => {
    tl.resizeDrag = null;
    tl.moveDrag = null;
    tl.selectStart = null;
    tl.pasteAnchor = null;
    tl.shapeStart = tl.shapeEnd = null;
    tl.stroke = null;
    tl.last = null;
    tl.render();
  };
  $('bankSelection').oncontextmenu = (e) => {
    e.preventDefault();
    if (!asset() || painting()) return;
    StudioShell.editMenu(e, {
      selected: !!tl.pixelSelection,
      kind: 'pixels',
      cut: cutSelection,
      copy: copySelection,
      paste: startPaste,
      remove: clearSelection,
      flip: (axis) => transformSelection(axis === 'x' ? 'horizontal' : 'vertical'),
      transform: [
        {
          label: 'Rotate 90°',
          disabled: !tl.pixelSelection,
          run: () => transformSelection('rotate'),
        },
      ],
      selectAll: selectAllPixels,
      deselect: dropPixelSelection,
    });
  };
}
