// The grid editors' canvas input: painting strokes, rectangles and fills,
// the eyedropper, the editor's own drag tools, the Select tool's pointer
// events, and the right-click edit menu. Also marks, in the palette dock, the
// color under the pointer.
import {
  TILES_PER_ROW,
  blankCell,
  floodPoints,
  groupBlock,
  linePoints,
  place,
  regionBetween,
  regionPoints,
  setCell,
} from '../domain/cells.js';
import { markDirty } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { outlineDrag } from './drag.js';

/**
 * Wires up painting on one grid editor's canvas.
 *
 * @param {any} ed The editor's shared state and helpers (see grid-editor.js).
 */
export function canvasPainting(ed) {
  const { el, canvas, grid, asset, selection, dragTools } = ed;
  // A paint stroke: whether it erases, whether it is under way, and the last
  // cell it reached, so a fast drag fills the cells in between.
  let erasing = false,
    painting = false,
    last = null;
  // Where a rectangle (or an editor's own drag tool) started.
  let anchor = null;
  // The pointer's last position over the canvas, so the palette dock's hover
  // marks follow a paint, an undo or a zoom made while it rests there.
  let hover = null;

  // Paints one cell with the stamp, or blanks it when erasing.
  function paintCellAt(col, row) {
    setCell(grid(), col, row, erasing ? blankCell() : { ...ed.stamp });
  }
  // A picked group stamps its whole footprint anchored at (col,row). Only the
  // pencil does this, never fill or rectangle, which would stamp the group
  // at every cell they cover. See groupBlock in domain/cells.js.
  function paintGroupAt(col, row) {
    if (erasing) paintCellAt(col, row);
    else
      place(
        grid(),
        groupBlock(ed.pickRegion, ed.stamp, ed.cellTileset(ed.stamp)?.tilePaletteBanks),
        col,
        row,
      );
  }
  function paintAt(col, row) {
    (ed.isGroup() ? paintGroupAt : paintCellAt)(col, row);
  }
  // Continues a stroke to (col,row), painting every cell on the straight
  // line from the last one so a fast drag leaves no gaps.
  function drawTo(col, row) {
    for (const p of last ? linePoints(last, { col, row }) : [{ col, row }]) paintAt(p.col, p.row);
    last = { col, row };
    markDirty();
    ed.paintCanvas();
  }
  // Fills the 4-connected area of cells showing the same tile as (col,row).
  function flood(col, row) {
    for (const p of floodPoints(grid(), col, row)) paintCellAt(p.col, p.row);
  }
  function previewRectangle(from, col, row) {
    ed.paintCanvas();
    outlineDrag(canvas.getContext('2d'), from, col, row, '#fff', '#111');
  }
  function commitRectangle(from, col, row) {
    for (const p of regionPoints(regionBetween(from, { col, row }))) paintCellAt(p.col, p.row);
    markDirty();
    ed.paintCanvas();
  }
  // The drag tools: the rectangle, plus any the editor adds.
  // A drag whose tool was switched mid-way by a shortcut finishes as a
  // rectangle.
  const rectangle = { preview: previewRectangle, commit: commitRectangle };
  const dragFor = (name) => dragTools[name] ?? rectangle;

  // Outlines, in the palette dock, the bank and color of the pixel under the
  // pointer, as drawn, so a block being moved or pasted counts.
  function markHover() {
    const g = grid();
    let mark = null;
    if (g && hover) {
      const r = canvas.getBoundingClientRect(),
        x = Math.floor(((hover.x - r.left) / r.width) * g.width * 8),
        y = Math.floor(((hover.y - r.top) / r.height) * g.height * 8);
      if (x >= 0 && y >= 0 && x < g.width * 8 && y < g.height * 8) {
        const cell = selection.cellAt({ col: x >> 3, row: y >> 3 });
        mark = { bank: cell.paletteBank, ink: ed.cellInk(cell, x % 8, y % 8) };
      }
    }
    StudioShell.hoverBankDock(el('Swatches'), mark);
  }
  // The cell under the pointer, clamped to the grid.
  function canvasCell(e) {
    const r = canvas.getBoundingClientRect(),
      g = grid();
    const px = ((e.clientX - r.left) / r.width) * g.width * 8,
      py = ((e.clientY - r.top) / r.height) * g.height * 8;
    return {
      col: Math.max(0, Math.min(g.width - 1, Math.floor(px / 8))),
      row: Math.max(0, Math.min(g.height - 1, Math.floor(py / 8))),
    };
  }
  // The eyedropper: makes a painted cell the stamp and shows its tile in the
  // picker.
  function pickCell(col, row) {
    const g = grid(),
      cell = g.cells[row * g.width + col];
    ed.stamp = { ...cell };
    ed.pickAlt = cell.chrAlt;
    ed.pickRegion = {
      col: cell.tile % TILES_PER_ROW,
      row: Math.floor(cell.tile / TILES_PER_ROW),
      width: 1,
      height: 1,
    };
    ed.render();
  }
  // The history label for a stroke started with `tool`.
  const strokeLabel = (tool) =>
    tool === 'fill'
      ? 'Fill'
      : tool === 'rectangle'
        ? 'Draw a rectangle'
        : erasing
          ? 'Erase'
          : 'Paint';

  canvas.onpointerdown = (e) => {
    e.preventDefault();
    const tool = ed.tool;
    if (!asset() || (e.button === 2 && !ed.isPainting())) return;
    const { col, row } = canvasCell(e);
    if (selection.pasting || tool === 'select') {
      canvas.setPointerCapture(e.pointerId);
      selection.down({ col, row });
      return;
    }
    if (tool === 'picker') {
      pickCell(col, row);
      return;
    }
    if (dragTools[tool]) {
      anchor = { col, row };
      canvas.setPointerCapture(e.pointerId);
      dragTools[tool].preview(anchor, col, row);
      return;
    }
    erasing = e.button === 2 || tool === 'eraser';
    ed.checkpoint(strokeLabel(tool));
    if (tool === 'fill') {
      flood(col, row);
      markDirty();
      ed.paintCanvas();
      return;
    }
    if (tool === 'rectangle') {
      anchor = { col, row };
      canvas.setPointerCapture(e.pointerId);
      previewRectangle(anchor, col, row);
      return;
    }
    painting = true;
    last = null;
    canvas.setPointerCapture(e.pointerId);
    drawTo(col, row);
  };
  canvas.onpointermove = (e) => {
    if (!asset()) return;
    hover = { x: e.clientX, y: e.clientY };
    markHover();
    const { col, row } = canvasCell(e);
    if (selection.move({ col, row })) return;
    if (ed.tool === 'select') canvas.style.cursor = selection.contains({ col, row }) ? 'move' : '';
    if (anchor) {
      dragFor(ed.tool).preview(anchor, col, row);
      return;
    }
    if (painting) drawTo(col, row);
  };
  canvas.onpointerup = (e) => {
    if (!asset()) return;
    if (selection.up()) return;
    if (anchor) {
      const { col, row } = canvasCell(e),
        from = anchor;
      anchor = null;
      dragFor(ed.tool).commit(from, col, row);
      return;
    }
    painting = false;
    last = null;
  };
  canvas.onpointercancel = () => {
    anchor = null;
    painting = false;
    last = null;
    selection.cancel();
    ed.layout();
  };
  canvas.onpointerleave = () => {
    hover = null;
    markHover();
  };
  // Right-click erases while a painting tool is active, the Aseprite way;
  // with any other tool it opens the edit menu for the selection.
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    if (!asset() || ed.isPainting()) return;
    const sel = !!selection.rect;
    StudioShell.editMenu(e, {
      selected: sel,
      kind: 'cells',
      cut: () => selection.cut(),
      copy: () => selection.copy(),
      paste: ed.startPaste,
      remove: () => selection.remove(),
      flip: (axis) => selection.flip(axis),
      transform: [{ label: 'Priority', disabled: !sel, run: () => el('Priority').click() }],
      selectAll: () => {
        ed.setTool('select');
        selection.selectAll();
      },
      deselect: () => selection.deselect(),
    });
  };

  return {
    markHover,
    // Whether a stroke or a drag is under way.
    busy: () => painting || anchor,
    // Forgets the pointer when the editor is hidden.
    clearHover() {
      hover = null;
    },
  };
}
