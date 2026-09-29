// The painting surface the two tile-grid editors share: backgrounds and the
// overlay. Both paint a grid of cells, each naming a tile, a palette bank,
// flips, priority and which of two tilesets it reads (CHR_ALT), with the same
// tools, tile picker, stamp settings, palette dock, rails and shortcuts. Each
// editor creates one of these with gridEditor() and adds only what is its
// own: the background's camera preview, the overlay's placeholders.
//
// Every element id is the editor's prefix plus a fixed name, so 'bg' finds
// #bgCanvas, #bgTileMap, #bgFlipX and so on in views/background-editor.html,
// and 'ov' finds the same controls in views/overlay-editor.html.
import { CellGrid } from './cell-grid.js';
import { $, isField } from './dom.js';
import { ProjectHistory } from './history.js';
import { bankColor, bankPalette, css565, currentView, tilePixel, tilesets } from './state.js';
import { markDirty, setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

// The tools that paint the current stamp. Right-click erases while one of
// these is active; with any other tool it opens the edit menu.
const PAINTING_TOOLS = ['pencil', 'rectangle', 'fill', 'eraser'];
// The tools a tile pick keeps; picking tiles with any other tool active
// switches to the pencil.
const STAMPING_TOOLS = ['pencil', 'rectangle', 'fill'];
// Single-key tool shortcuts, the same letters as the tileset editor's.
const TOOL_KEYS = {
  s: 'select',
  b: 'pencil',
  r: 'rectangle',
  g: 'fill',
  e: 'eraser',
  i: 'picker',
  h: 'pan',
};
const SINGLE_TILE = { col: 0, row: 0, width: 1, height: 1 };

function blankCell() {
  return { tile: 0, paletteBank: 0, flipX: false, flipY: false, priority: false, chrAlt: false };
}
// The cells between two corners of a drag, as inclusive bounds.
function spanOf(anchor, col, row) {
  return {
    x0: Math.min(anchor.col, col),
    x1: Math.max(anchor.col, col),
    y0: Math.min(anchor.row, row),
    y1: Math.max(anchor.row, row),
  };
}
// Draws a dashed outline around the cells between a drag's two corners; a
// second color, offset by one dash, keeps it visible on any tile.
export function outlineDrag(ctx, anchor, col, row, color, backColor = null) {
  const { x0, x1, y0, y1 } = spanOf(anchor, col, row);
  const rect = [x0 * 8 + 0.5, y0 * 8 + 0.5, (x1 - x0 + 1) * 8 - 1, (y1 - y0 + 1) * 8 - 1];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(...rect);
  if (backColor) {
    ctx.lineDashOffset = 4;
    ctx.strokeStyle = backColor;
    ctx.strokeRect(...rect);
  }
  ctx.restore();
}
// The inclusive corners of a drag as a {col, row, width, height} region.
export function dragRegion(anchor, col, row) {
  const { x0, x1, y0, y1 } = spanOf(anchor, col, row);
  return { col: x0, row: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/**
 * Sets up the shared painting surface for one grid editor.
 *
 * @param {object} options
 * @param {string} options.prefix The element id prefix: 'bg' or 'ov'.
 * @param {string} options.view The view this editor shows in.
 * @param {HTMLElement} options.host The editor's section.
 * @param {string} options.historyKey The project field its edits change.
 * @param {string} options.editLabel The history label for an unnamed edit.
 * @param {string} options.railLabel The accessible name of the tool rail.
 * @param {() => any} options.asset The asset being edited, if any.
 * @param {() => {width: number, height: number, cells: object[]} | null} options.grid
 *   The asset's cells and size.
 * @param {() => void} options.render Redraws the whole editor.
 * @param {boolean} options.transparentZero Whether color 0 is see-through,
 *   as on the overlay; on a background it is the bank's own color.
 * @param {(ctx: CanvasRenderingContext2D) => void} [options.decorate] Draws
 *   the editor's own marks over the cells.
 * @param {() => void} [options.layout] Lays out the editor's own marks over
 *   the canvas after a selection changes or a drag is cancelled.
 * @param {() => boolean} [options.busy] Whether one of the editor's own
 *   drags is under way, which holds off wheel zoom.
 * @param {Record<string, {preview: Function, commit: Function}>} [options.dragTools]
 *   Extra tools that drag out a region: preview(anchor, col, row) while
 *   dragging and commit(anchor, col, row) on release.
 */
export function gridEditor(options) {
  const { prefix, view, host, historyKey, editLabel, asset, grid, render } = options;
  const { transparentZero, dragTools = {} } = options;
  const decorate = options.decorate ?? (() => {});
  const layout = options.layout ?? (() => {});
  const busy = options.busy ?? (() => false);
  const el = (name) => $(prefix + name);
  const canvas = el('Canvas'),
    stage = el('Stage'),
    tileMap = el('TileMap');

  // ===== state =====
  let tool = 'pencil',
    zoom = 1,
    fittedId = null;
  // A paint stroke: whether it erases, whether it is under way, and the last
  // cell it reached, so a fast drag fills the cells in between.
  let erasing = false,
    painting = false,
    last = null;
  // Where a rectangle (or an editor's own drag tool) started.
  let anchor = null;
  // Panning: Space held, and the drag scrolling the stage.
  let spaceHeld = false,
    panDrag = null;
  // The pointer's last position over the canvas, so the palette dock's hover
  // marks follow a paint, an undo or a zoom made while it rests there.
  let hover = null;
  // What the next paint lays down.
  let stamp = blankCell();
  // The tile picker: which tileset it shows, where a drag on it started, and
  // the picked region in tile coordinates. 1×1 is a single tile; a bigger
  // region (dragged out, or loaded from an Object) is stamped as a group,
  // each tile keeping its own authored palette bank.
  let pickAlt = false,
    pickAnchor = null,
    pickRegion = { ...SINGLE_TILE };
  // Which of a 1bpp tileset's three pages the primary/alternate tileset
  // shows. Preview state only; the real CHRPLANE register is a build and
  // runtime concern, not authored here.
  let primaryPlane = 0,
    altPlane = 0;

  // ===== history =====
  // An asset's own data never changes another asset kind, and nothing else
  // changes it, so its history is independent rather than shared.
  function checkpoint(label = editLabel) {
    ProjectHistory.checkpoint([historyKey], label);
  }
  // Makes one undoable edit: edit('Delete X', fn) runs fn, marks the project
  // changed and redraws.
  function edit(...args) {
    const label = typeof args[0] === 'string' ? args.shift() : editLabel;
    checkpoint(label);
    args[0]();
    markDirty();
    render();
  }

  // The Select tool (cell-grid.js): with cells selected, the flips, Priority
  // and a palette bank click edit those cells rather than the next stamp.
  const selection = CellGrid.cellSelection({
    grid,
    edit: (label, fn) => edit(label, fn),
    render: () => {
      paintCanvas();
      layout();
      updateStampBar();
      renderPaletteDock();
      syncEditActions();
    },
  });

  // ===== tilesets =====
  const tilesetById = (id) => tilesets.find((t) => t.id === id);
  const primaryTileset = () => tilesetById(asset()?.tilesetId);
  const altTileset = () => tilesetById(asset()?.altTilesetId);
  const pickingTileset = () => (pickAlt ? altTileset() : primaryTileset());
  // The tileset a cell reads, by its CHR_ALT bit.
  const cellTileset = (cell) => (cell.chrAlt ? altTileset() : primaryTileset());
  // The color index of one pixel of a cell's tile, flips applied; 0 when its
  // tileset is missing.
  function cellInk(cell, x, y) {
    const source = cellTileset(cell);
    if (!source) return 0;
    const px = cell.flipX ? 7 - x : x,
      py = cell.flipY ? 7 - y : y;
    return tilePixel(source, cell.tile, px, py, cell.chrAlt ? altPlane : primaryPlane);
  }

  // The two tileset lists, and the page pickers a 1bpp tileset adds.
  function renderTilesetAssignment() {
    const a = asset();
    for (const [listId, field] of [
      ['PrimaryList', 'tilesetId'],
      ['AltList', 'altTilesetId'],
    ]) {
      StudioShell.renderOptions(el(listId), tilesets, {
        label: (t) => t.name,
        selected: (t) => !!a && t.id === a[field],
        choose: (t) => {
          if (!a || t.id === a[field]) return;
          edit(
            field === 'tilesetId' ? 'Change the primary tileset' : 'Change the alternate tileset',
            () => {
              a[field] = t.id;
            },
          );
        },
      });
    }
    el('PrimaryPlaneLabel').hidden = primaryTileset()?.bpp !== 1;
    el('PrimaryPlane').value = String(primaryPlane);
    el('AltPlaneLabel').hidden = altTileset()?.bpp !== 1;
    el('AltPlane').value = String(altPlane);
  }
  el('PrimaryPlane').onchange = () => {
    primaryPlane = Number(el('PrimaryPlane').value);
    paintCanvas();
    drawTileMap();
  };
  el('AltPlane').onchange = () => {
    altPlane = Number(el('AltPlane').value);
    paintCanvas();
    drawTileMap();
  };

  // ===== tile picker =====
  // Draws all 256 tiles of the picked tileset at 2× in a 16×16 grid, each in
  // its authored bank, and outlines the picked region.
  function drawTileMap() {
    const source = pickingTileset(),
      ctx = tileMap.getContext('2d');
    ctx.fillStyle = '#252830';
    ctx.fillRect(0, 0, 256, 256);
    if (source)
      for (let t = 0; t < 256; t++) {
        const bank = source.tilePaletteBanks[t];
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            // As on the canvas: color 0 is the bank's color unless it is
            // transparent in this layer.
            const ink = tilePixel(source, t, x, y, pickAlt ? altPlane : primaryPlane);
            ctx.fillStyle = ink === 0 && transparentZero ? '#252830' : css565(bankColor(bank, ink));
            ctx.fillRect(((t % 16) * 8 + x) * 2, (Math.floor(t / 16) * 8 + y) * 2, 2, 2);
          }
      }
    ctx.strokeStyle = '#ffffff30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let n = 0; n <= 16; n++) {
      ctx.moveTo(n * 16, 0);
      ctx.lineTo(n * 16, 256);
      ctx.moveTo(0, n * 16);
      ctx.lineTo(256, n * 16);
    }
    ctx.stroke();
    if (source && stamp.chrAlt === pickAlt) {
      ctx.strokeStyle = '#36c9d6';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        pickRegion.col * 16 + 1,
        pickRegion.row * 16 + 1,
        pickRegion.width * 16 - 2,
        pickRegion.height * 16 - 2,
      );
    }
  }
  // The tile under the pointer on the picker, clamped to its 16×16 grid.
  function tileMapCell(e) {
    const r = tileMap.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(15, Math.floor(((e.clientX - r.left) / r.width) * 16))),
      y: Math.max(0, Math.min(15, Math.floor(((e.clientY - r.top) / r.height) * 16))),
    };
  }
  // Makes a region of the picked tileset the stamp: its top-left tile, in
  // that tile's authored bank.
  function pick(region) {
    const source = pickingTileset();
    pickRegion = region;
    const tile = region.row * 16 + region.col;
    stamp = { ...stamp, tile, paletteBank: source.tilePaletteBanks[tile], chrAlt: pickAlt };
    stampTool();
    render();
  }
  // Dragging on the tile picker picks a rectangular group, the same way the
  // tileset editor's own tile map does; a plain click is a 1×1 drag.
  function selectPickRegion(x, y) {
    if (!pickingTileset() || !pickAnchor) return;
    pick({
      col: Math.min(pickAnchor.x, x),
      row: Math.min(pickAnchor.y, y),
      width: Math.abs(x - pickAnchor.x) + 1,
      height: Math.abs(y - pickAnchor.y) + 1,
    });
  }
  tileMap.onpointerdown = (e) => {
    if (!pickingTileset()) return;
    pickAnchor = tileMapCell(e);
    tileMap.setPointerCapture(e.pointerId);
    selectPickRegion(pickAnchor.x, pickAnchor.y);
  };
  tileMap.onpointermove = (e) => {
    if (pickAnchor) {
      const { x, y } = tileMapCell(e);
      selectPickRegion(x, y);
    }
  };
  tileMap.onpointerup = tileMap.onpointercancel = () => (pickAnchor = null);
  el('PickSlot').onchange = () => {
    pickAlt = el('PickSlot').value === 'alt';
    pickRegion = { ...SINGLE_TILE };
    render();
  };
  // Objects are managed in the tileset editor; here they are a shortcut to
  // pick a saved region as a group.
  function renderObjectList() {
    const objects = pickingTileset()?.compositions ?? [];
    StudioShell.renderList(el('ObjectList'), objects, {
      selected: (o) =>
        o.x === pickRegion.col &&
        o.y === pickRegion.row &&
        o.width === pickRegion.width &&
        o.height === pickRegion.height,
      choose: (o) => pick({ col: o.x, row: o.y, width: o.width, height: o.height }),
      render,
    });
  }
  const isGroup = () => pickRegion.width > 1 || pickRegion.height > 1;

  // ===== tools =====
  // Picking tiles is picking what to paint, so it switches to the pencil
  // unless a stamping tool is already active.
  function stampTool() {
    if (!STAMPING_TOOLS.includes(tool)) setTool('pencil');
  }
  // The selection belongs to the Select tool, as in Photoshop: taking up a
  // painting tool drops it (panning keeps it), so the flips, Priority and a
  // palette bank click act on the selection while selecting and on the next
  // stamp while painting, never ambiguously on both.
  function setTool(name) {
    if (name !== 'select' && name !== 'pan') selection.reset();
    tool = name;
    render();
  }
  // The id of a tool's rail button: 'pencil' is #bgPencilTool.
  const toolId = (name) => prefix + name[0].toUpperCase() + name.slice(1) + 'Tool';
  const toolNames = [];
  // Makes a rail button that takes up a tool.
  function toolButton(label, icon, name) {
    const b = StudioShell.iconButton(toolId(name), label, icon);
    b.onclick = () => setTool(name);
    toolNames.push(name);
    return b;
  }
  const isPainting = () => PAINTING_TOOLS.includes(tool);
  // Starts placing the clipboard's cells, which follow the pointer until a
  // click drops them.
  function startPaste() {
    if (selection.startPaste()) {
      setTool('select');
      setStatus('Click to place the paste. Escape cancels.');
    }
  }

  // ===== painting =====
  // Paints one cell with the stamp, or blanks it when erasing.
  function paintCellAt(col, row) {
    const g = grid();
    if (col < 0 || row < 0 || col >= g.width || row >= g.height) return;
    g.cells[row * g.width + col] = erasing ? blankCell() : { ...stamp };
  }
  // A picked group stamps its whole footprint anchored at (col,row). Only the
  // pencil does this, never fill or rectangle, which would stamp the group
  // at every cell they cover. Each tile keeps its own authored bank, and a
  // flipped group is mirrored whole, its tiles swapping places as well as
  // flipping, so the picture turns over.
  function paintGroupAt(col, row) {
    if (erasing) {
      paintCellAt(col, row);
      return;
    }
    const g = grid(),
      source = cellTileset(stamp);
    for (let dy = 0; dy < pickRegion.height; dy++)
      for (let dx = 0; dx < pickRegion.width; dx++) {
        const cx = col + dx,
          cy = row + dy;
        if (cx < 0 || cy < 0 || cx >= g.width || cy >= g.height) continue;
        const sx = stamp.flipX ? pickRegion.width - 1 - dx : dx,
          sy = stamp.flipY ? pickRegion.height - 1 - dy : dy;
        const tile = (pickRegion.row + sy) * 16 + (pickRegion.col + sx);
        g.cells[cy * g.width + cx] = {
          tile,
          paletteBank: source?.tilePaletteBanks[tile] ?? 0,
          flipX: stamp.flipX,
          flipY: stamp.flipY,
          priority: stamp.priority,
          chrAlt: stamp.chrAlt,
        };
      }
  }
  function paintAt(col, row) {
    (isGroup() ? paintGroupAt : paintCellAt)(col, row);
  }
  // Continues a stroke to (col,row), painting every cell on the straight
  // line from the last one so a fast drag leaves no gaps.
  function drawTo(col, row) {
    if (last) {
      const steps = Math.max(Math.abs(col - last.col), Math.abs(row - last.row));
      for (let i = 0; i <= steps; i++)
        paintAt(
          Math.round(last.col + ((col - last.col) * i) / (steps || 1)),
          Math.round(last.row + ((row - last.row) * i) / (steps || 1)),
        );
    } else paintAt(col, row);
    last = { col, row };
    markDirty();
    paintCanvas();
  }
  // Fills the 4-connected area of cells showing the same tile as (col,row).
  function flood(col, row) {
    const g = grid(),
      w = g.width,
      h = g.height;
    if (col < 0 || row < 0 || col >= w || row >= h) return;
    const old = g.cells[row * w + col].tile,
      seen = new Uint8Array(w * h),
      stack = [[col, row]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x] || g.cells[y * w + x].tile !== old)
        continue;
      seen[y * w + x] = 1;
      paintCellAt(x, y);
      stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
    }
  }
  function previewRectangle(from, col, row) {
    paintCanvas();
    outlineDrag(canvas.getContext('2d'), from, col, row, '#fff', '#111');
  }
  function commitRectangle(from, col, row) {
    const { x0, x1, y0, y1 } = spanOf(from, col, row);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paintCellAt(x, y);
    markDirty();
    paintCanvas();
  }
  // The drag tools: the rectangle, plus any the editor adds.
  // A drag whose tool was switched mid-way by a shortcut finishes as a
  // rectangle.
  const rectangle = { preview: previewRectangle, commit: commitRectangle };
  const dragFor = (name) => dragTools[name] ?? rectangle;

  // ===== canvas =====
  // Draws one cell's tile at its place on the canvas, one canvas pixel per
  // tile pixel.
  function drawCell(ctx, cell, col, row) {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ink = cellInk(cell, x, y);
        ctx.fillStyle =
          ink === 0 && transparentZero ? '#101113' : css565(bankColor(cell.paletteBank, ink));
        ctx.fillRect(col * 8 + x, row * 8 + y, 1, 1);
      }
  }
  // Redraws every cell, the selection being moved or pasted, and the
  // editor's own marks, at the current zoom.
  function paintCanvas() {
    const g = grid();
    if (!g) return;
    canvas.width = g.width * 8;
    canvas.height = g.height * 8;
    canvas.style.width = g.width * 8 * zoom + 'px';
    canvas.style.height = g.height * 8 * zoom + 'px';
    const ctx = canvas.getContext('2d');
    for (let row = 0; row < g.height; row++)
      for (let col = 0; col < g.width; col++) drawCell(ctx, g.cells[row * g.width + col], col, row);
    selection.drawFloating(ctx, drawCell);
    decorate(ctx);
    selection.layout(el('Marquee'), zoom);
    markHover();
  }
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
        mark = { bank: cell.paletteBank, ink: cellInk(cell, x % 8, y % 8) };
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
    stamp = { ...cell };
    pickAlt = cell.chrAlt;
    pickRegion = { col: cell.tile % 16, row: Math.floor(cell.tile / 16), width: 1, height: 1 };
    render();
  }
  canvas.onpointerdown = (e) => {
    e.preventDefault();
    if (!asset() || (e.button === 2 && !isPainting())) return;
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
    checkpoint(
      tool === 'fill'
        ? 'Fill'
        : tool === 'rectangle'
          ? 'Draw a rectangle'
          : erasing
            ? 'Erase'
            : 'Paint',
    );
    if (tool === 'fill') {
      flood(col, row);
      markDirty();
      paintCanvas();
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
    if (tool === 'select') canvas.style.cursor = selection.contains({ col, row }) ? 'move' : '';
    if (anchor) {
      dragFor(tool).preview(anchor, col, row);
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
      dragFor(tool).commit(from, col, row);
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
    layout();
  };
  canvas.onpointerleave = () => {
    hover = null;
    markHover();
  };
  // Right-click erases while a painting tool is active, the Aseprite way;
  // with any other tool it opens the edit menu for the selection.
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    if (!asset() || isPainting()) return;
    const sel = !!selection.rect;
    StudioShell.contextMenu(e.clientX, e.clientY, [
      { label: 'Cut', hint: 'Mod+X', disabled: !sel, run: () => selection.cut() },
      { label: 'Copy', hint: 'Mod+C', disabled: !sel, run: () => selection.copy() },
      {
        label: 'Paste',
        hint: 'Mod+V',
        disabled: !StudioShell.clipboard.has('cells'),
        run: startPaste,
      },
      { label: 'Delete', hint: 'Delete', disabled: !sel, run: () => selection.remove() },
      '-',
      {
        label: 'Flip horizontally',
        hint: 'Shift+H',
        disabled: !sel,
        run: () => selection.flip('x'),
      },
      { label: 'Flip vertically', hint: 'Shift+V', disabled: !sel, run: () => selection.flip('y') },
      { label: 'Priority', disabled: !sel, run: () => el('Priority').click() },
      '-',
      {
        label: 'Select all',
        hint: 'Mod+A',
        run: () => {
          setTool('select');
          selection.selectAll();
        },
      },
      { label: 'Deselect', hint: 'Esc', disabled: !sel, run: () => selection.deselect() },
    ]);
  };

  // ===== zoom =====
  // The zoom that fits the whole grid in the stage.
  function fitLevel() {
    const g = grid();
    return StudioShell.fitZoom(
      stage.clientWidth - 48,
      stage.clientHeight - 48,
      g.width * 8,
      g.height * 8,
    );
  }
  const zoomControls = StudioShell.canvasZoom({
    view,
    ids: {
      fit: prefix + 'Fit',
      actual: prefix + 'ActualSize',
      zoomOut: prefix + 'ZoomOut',
      label: prefix + 'ZoomLabel',
      zoomIn: prefix + 'ZoomIn',
    },
    get: () => zoom,
    set: (next, x, y) =>
      StudioShell.zoomScrolled(
        stage,
        canvas,
        zoom,
        next,
        (z) => {
          zoom = z;
          render();
        },
        x,
        y,
      ),
    fit: () => {
      if (!asset()) return;
      zoom = fitLevel();
      render();
      stage.scrollLeft = stage.scrollTop = 0;
    },
    wheel: stage,
    busy: () => !!(painting || anchor || selection.busy || panDrag || busy()),
  });
  host.querySelector(`.${prefix}Top .studioBarStart`).after(zoomControls.group);
  host.querySelector(`.${prefix}Top .studioBarEnd`).append(StudioShell.helpButton());

  // ===== stamp settings =====
  // Shows the stamp (or, with cells selected, what the flips and bank act on).
  function updateStampBar() {
    const group = isGroup(),
      sel = selection.rect;
    el('StampTile').textContent = String(stamp.tile);
    el('GroupLabel').hidden = !group;
    el('GroupLabel').textContent =
      `Group ${pickRegion.width} × ${pickRegion.height} — each tile keeps its own bank`;
    el('SelectionLabel').hidden = !sel;
    if (sel)
      el('SelectionLabel').textContent =
        `Selected ${sel.width} × ${sel.height} — flips, Priority and a palette bank edit these tiles in place`;
    el('SelectionClear').hidden = !sel;
    // With a selection the flips and Priority act on it; otherwise they are
    // the next stamp's settings, shown pressed when on.
    el('FlipX').classList.toggle('on', !sel && stamp.flipX);
    el('FlipY').classList.toggle('on', !sel && stamp.flipY);
    el('Priority').classList.toggle('on', !sel && stamp.priority);
    el('StampSource').textContent = stamp.chrAlt ? 'Reads: Alternate' : 'Reads: Primary';
    const authored = cellTileset(stamp)?.tilePaletteBanks?.[stamp.tile];
    el('BankLabel').textContent =
      group && !sel ? '' : 'Bank ' + String(stamp.paletteBank).padStart(2, '0');
    el('BankReset').hidden = sel
      ? false
      : group || authored === undefined || authored === stamp.paletteBank;
  }
  // With a selection these edit the selected cells, as one undo step: a flip
  // turns the selected block over, Priority turns on for all of them unless
  // all have it already. Otherwise they set up the next stamp.
  el('FlipX').onclick = () => {
    if (selection.rect) selection.flip('x');
    else {
      stamp = { ...stamp, flipX: !stamp.flipX };
      render();
    }
  };
  el('FlipY').onclick = () => {
    if (selection.rect) selection.flip('y');
    else {
      stamp = { ...stamp, flipY: !stamp.flipY };
      render();
    }
  };
  el('Priority').onclick = () => {
    if (selection.rect) {
      const on = !selection.selected().every((c) => c.priority);
      selection.apply((c) => (c.priority = on), on ? 'Set priority' : 'Clear priority');
    } else {
      stamp = { ...stamp, priority: !stamp.priority };
      render();
    }
  };
  // Puts the stamp, or the selected cells, back in their tiles' authored banks.
  el('BankReset').onclick = () => {
    if (selection.rect) {
      selection.apply((cell) => {
        const source = cellTileset(cell);
        if (source) cell.paletteBank = source.tilePaletteBanks[cell.tile];
      }, 'Reset palette banks');
      return;
    }
    const source = cellTileset(stamp);
    if (source) stamp = { ...stamp, paletteBank: source.tilePaletteBanks[stamp.tile] };
    render();
  };
  el('SelectionClear').onclick = () => selection.deselect();

  // Each bank is a full 8-color palette, not one representative color, so
  // two banks that differ past color 1 still look different. Clicking a
  // bank's row picks it for the stamp, or sets the selected cells to it.
  function renderPaletteDock() {
    StudioShell.bankDock(el('Swatches'), (b) => {
      if (selection.rect) selection.apply((cell) => (cell.paletteBank = b), `Set bank ${b}`);
      else {
        stamp = { ...stamp, paletteBank: b };
        render();
      }
    });
    // A picked group has no single bank to set, unless cells are selected,
    // which a bank click then sets whatever is picked.
    const sel = selection.rect,
      group = !sel && isGroup();
    StudioShell.syncBankDock(el('Swatches'), {
      color: (b, i) => css565(bankColor(b, i)),
      transparentZero,
      chosen: group || sel ? null : stamp.paletteBank,
      used: new Set(grid().cells.map((c) => c.paletteBank)),
      disabled: group,
      title: (b) =>
        group
          ? "A group keeps each tile's own authored bank"
          : sel
            ? `Set the selected tiles to bank ${String(b).padStart(2, '0')} · ${bankPalette(b)?.name ?? 'empty'}`
            : `Bank ${String(b).padStart(2, '0')} · ${bankPalette(b)?.name ?? 'empty'}`,
    });
  }

  // ===== rails =====
  // Copy, Paste and Delete follow the selection and the clipboard.
  function syncEditActions() {
    el('Copy').disabled = el('DeleteSelection').disabled = !selection.rect;
    el('Paste').disabled = !StudioShell.clipboard.has('cells');
  }
  document.addEventListener('studioclipboard', () => {
    if (!host.hidden) syncEditActions();
  });
  StudioShell.editActions(view, {
    copy: () => selection.copy(),
    cut: () => selection.cut(),
    paste: startPaste,
  });
  // Builds both rails. The left one holds the editor's panel toggles, then
  // its tools, then copy, paste, undo and redo; the right one holds the
  // editor's own panel toggles, then the flips and Priority the next stamp
  // (or the selection) takes, then clearing the selection.
  function buildRails({ panels, tools, sidePanels }) {
    const rail = StudioShell.toolRail(prefix + 'Rail', options.railLabel);
    host.prepend(rail);
    const button = (id, label, icon, onclick) =>
      Object.assign(StudioShell.iconButton(prefix + id, label, icon), { onclick });
    StudioShell.railLayout(
      rail,
      [panels, tools],
      [
        button(
          'Copy',
          'Copy selection (Ctrl/Cmd+C)',
          'copy',
          () => selection.copy() && syncEditActions(),
        ),
        button('Paste', 'Paste (Ctrl/Cmd+V) — click to place it', 'paste', startPaste),
        button('Undo', 'Undo (Ctrl/Cmd+Z)', 'undo', ProjectHistory.undo),
        button('Redo', 'Redo (Ctrl/Cmd+Shift+Z)', 'redo', ProjectHistory.redo),
      ],
    );
    const sideRail = StudioShell.toolRail(prefix + 'SideRail', 'Selection', 'right');
    host.append(sideRail);
    for (const [id, icon, label] of [
      ['FlipX', 'flipH', 'Flip horizontally (Shift+H) — the selection, or the next stamp'],
      ['FlipY', 'flipV', 'Flip vertically (Shift+V) — the selection, or the next stamp'],
      [
        'Priority',
        'priority',
        'Priority, drawn in front of sprites — the selection, or the next stamp',
      ],
    ])
      StudioShell.setIcon(el(id), icon, label);
    StudioShell.railLayout(sideRail, [
      sidePanels,
      [el('FlipX'), el('FlipY'), el('Priority')],
      [
        button('DeleteSelection', 'Clear the selected cells (Delete)', 'delete', () =>
          selection.remove(),
        ),
      ],
    ]);
  }

  // ===== keys and panning =====
  window.addEventListener(
    'keydown',
    (e) => {
      if (currentView !== view || isField(e.target)) return;
      // Selection and clipboard keys, the same in every grid editor.
      const command = selection.key(e);
      if (command) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if ((command === 'selectAll' || command === 'paste') && tool !== 'select')
          setTool('select');
        if (command === 'paste') setStatus('Click to place the paste. Escape cancels.');
        return;
      }
      // No `!spaceHeld` guard here: held keys repeat-fire keydown, and every
      // one of those must be prevented too, or the un-prevented repeats leave
      // the browser's native "Space pages the nearest scrollable ancestor
      // down" behavior free to fire on the stage in between them.
      if (e.code === 'Space') {
        spaceHeld = true;
        e.preventDefault();
        canvas.style.cursor = 'grab';
      }
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && (key === 'h' || key === 'v')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        el(key === 'h' ? 'FlipX' : 'FlipY').click();
        return;
      }
      if (TOOL_KEYS[key] && !e.shiftKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        $(toolId(TOOL_KEYS[key])).click();
      }
    },
    true,
  );
  const restCursor = () => (tool === 'pan' ? 'grab' : '');
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      canvas.style.cursor = restCursor();
    }
  });
  window.addEventListener('blur', () => {
    spaceHeld = false;
    panDrag = null;
    canvas.style.cursor = restCursor();
  });
  // Space-drag, the middle button, or the Pan tool all scroll the stage
  // instead of painting. Capture phase and stopImmediatePropagation so this
  // runs before the canvas's own paint handlers or any handle's drag.
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2 || (!spaceHeld && e.button !== 1 && tool !== 'pan')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      panDrag = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      stage.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    },
    true,
  );
  stage.addEventListener(
    'pointermove',
    (e) => {
      if (!panDrag) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      stage.scrollLeft = panDrag.left + panDrag.x - e.clientX;
      stage.scrollTop = panDrag.top + panDrag.y - e.clientY;
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel'])
    stage.addEventListener(
      type,
      (e) => {
        if (!panDrag) return;
        panDrag = null;
        e.stopImmediatePropagation();
        canvas.style.cursor = spaceHeld || tool === 'pan' ? 'grab' : '';
      },
      true,
    );

  // ===== rendering =====
  // The controls around the canvas: zoom, tool buttons, undo and redo, the
  // tileset lists and the tile picker.
  function renderControls() {
    zoomControls.sync();
    for (const name of toolNames) $(toolId(name)).classList.toggle('on', tool === name);
    canvas.style.cursor = restCursor();
    el('Undo').disabled = !ProjectHistory.canUndo();
    el('Redo').disabled = !ProjectHistory.canRedo();
    syncEditActions();
    renderTilesetAssignment();
    el('PickSlot').value = pickAlt ? 'alt' : 'primary';
    drawTileMap();
    renderObjectList();
  }
  // The palette dock and the stamp settings.
  function renderStamp() {
    renderPaletteDock();
    updateStampBar();
  }
  // An asset opens fitted to the window; returning to one keeps its zoom.
  // Called last in a render, once the docks around the stage have their
  // final size.
  function fitOnOpen() {
    const a = asset();
    if (a.id !== fittedId) {
      fittedId = a.id;
      zoom = fitLevel();
      render();
    }
  }

  return {
    selection,
    edit,
    buildRails,
    toolButton,
    paintCanvas,
    renderControls,
    renderStamp,
    fitOnOpen,
    primaryTileset,
    altTileset,
    tilesetById,
    get zoom() {
      return zoom;
    },
    // A new or newly chosen asset starts on its tilesets' first pages.
    resetPlanes() {
      primaryPlane = 0;
      altPlane = 0;
    },
    // Choosing another asset starts over: first pages, a single-tile pick
    // and no selection.
    resetPick() {
      primaryPlane = 0;
      altPlane = 0;
      pickRegion = { ...SINGLE_TILE };
      selection.reset();
    },
    // Forgets the pointer when the editor is hidden.
    clearHover() {
      hover = null;
    },
  };
}
