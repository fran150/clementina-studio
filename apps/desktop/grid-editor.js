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
//
// This file holds the editor's state, its tools, drawing and zoom; its parts
// live in grid/: the tile picker, the stamp settings and palette dock,
// painting on the canvas, the rails, and the keys and panning. They share
// one object, `ed`, of the editor's state and helpers.
import { cellSelection } from './cell-grid.js';
import { blankCell } from './domain/cells.js';
import { $ } from './dom.js';
import { placedPixel } from './domain/tilesets.js';
import { gridKeys } from './grid/keys.js';
import { canvasPainting } from './grid/painting.js';
import { gridRails } from './grid/rails.js';
import { stampControls } from './grid/stamp.js';
import { SINGLE_TILE, tilePicker } from './grid/tile-picker.js';
import { ProjectHistory } from './history.js';
import { bankColor, css565, tilesets } from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

export { dragRegion, outlineDrag } from './grid/drag.js';

// The tools that paint the current stamp. Right-click erases while one of
// these is active; with any other tool it opens the edit menu.
const PAINTING_TOOLS = ['pencil', 'rectangle', 'fill', 'eraser'];
// The tools a tile pick keeps; picking tiles with any other tool active
// switches to the pencil.
const STAMPING_TOOLS = ['pencil', 'rectangle', 'fill'];

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
  const decorate = options.decorate ?? (() => {});
  const busy = options.busy ?? (() => false);
  const el = (name) => $(prefix + name);
  const canvas = el('Canvas'),
    stage = el('Stage');
  let zoom = 1,
    fittedId = null;

  // ===== history =====
  // An asset's own data never changes another asset kind, and nothing else
  // changes it, so its history is independent rather than shared.
  // checkpoint(label) records an undo step; edit('Delete X', fn) is one
  // undoable edit that runs fn, marks the project changed and redraws.
  const { checkpoint, edit } = ProjectHistory.editor({
    parts: [historyKey],
    label: editLabel,
    after: () => render(),
  });

  // The editor's state and helpers, shared with its parts in grid/. Helpers
  // defined further down are added to it as they are.
  /** @type {any} */
  const ed = {
    ...options,
    dragTools: options.dragTools ?? {},
    layout: options.layout ?? (() => {}),
    el,
    canvas,
    stage,
    tileMap: el('TileMap'),
    // The active tool's name.
    tool: 'pencil',
    // What the next paint lays down.
    stamp: blankCell(),
    // The tile picker: whether it shows the alternate tileset, and the
    // picked region in tile coordinates. 1×1 is a single tile; a bigger
    // region (dragged out, or loaded from an Object) is stamped as a group,
    // each tile keeping its own authored palette bank.
    pickAlt: false,
    pickRegion: { ...SINGLE_TILE },
    // Which of a 1bpp tileset's three pages the primary/alternate tileset
    // shows. Preview state only; the real CHRPLANE register is a build and
    // runtime concern, not authored here.
    primaryPlane: 0,
    altPlane: 0,
    // Panning: Space held, and the drag scrolling the stage.
    spaceHeld: false,
    panDrag: null,
    checkpoint,
    edit,
    paintCanvas,
    setTool,
    stampTool,
    startPaste,
    toolId,
    isPainting: () => PAINTING_TOOLS.includes(ed.tool),
    isGroup: () => ed.pickRegion.width > 1 || ed.pickRegion.height > 1,
    restCursor: () => (ed.tool === 'pan' ? 'grab' : ''),
  };

  // The Select tool (cell-grid.js): with cells selected, the flips, Priority
  // and a palette bank click edit those cells rather than the next stamp.
  const selection = (ed.selection = cellSelection({
    grid,
    edit: (label, fn) => edit(label, fn),
    render: () => {
      paintCanvas();
      ed.layout();
      stamp.updateStampBar();
      stamp.renderPaletteDock();
      rails.syncEditActions();
    },
  }));

  // ===== tilesets =====
  const tilesetById = (id) => tilesets.find((t) => t.id === id);
  ed.primaryTileset = () => tilesetById(asset()?.tilesetId);
  ed.altTileset = () => tilesetById(asset()?.altTilesetId);
  ed.pickingTileset = () => (ed.pickAlt ? ed.altTileset() : ed.primaryTileset());
  // The tileset a cell reads, by its CHR_ALT bit.
  ed.cellTileset = (cell) => (cell.chrAlt ? ed.altTileset() : ed.primaryTileset());
  // The color index of one pixel of a cell's tile, flips applied; 0 when its
  // tileset is missing.
  ed.cellInk = (cell, x, y) => {
    const source = ed.cellTileset(cell);
    if (!source) return 0;
    return placedPixel(source, cell, x, y, cell.chrAlt ? ed.altPlane : ed.primaryPlane);
  };
  const picker = tilePicker(ed);

  // ===== tools =====
  // Picking tiles is picking what to paint, so it switches to the pencil
  // unless a stamping tool is already active.
  function stampTool() {
    if (!STAMPING_TOOLS.includes(ed.tool)) setTool('pencil');
  }
  // The selection belongs to the Select tool, as in Photoshop: taking up a
  // painting tool drops it (panning keeps it), so the flips, Priority and a
  // palette bank click act on the selection while selecting and on the next
  // stamp while painting, never ambiguously on both.
  function setTool(name) {
    if (name !== 'select' && name !== 'pan') selection.reset();
    ed.tool = name;
    render();
  }
  // The id of a tool's rail button: 'pencil' is #bgPencilTool.
  function toolId(name) {
    return prefix + name[0].toUpperCase() + name.slice(1) + 'Tool';
  }
  const toolNames = [];
  // Makes a rail button that takes up a tool.
  function toolButton(label, icon, name) {
    const b = StudioShell.iconButton(toolId(name), label, icon);
    b.onclick = () => setTool(name);
    toolNames.push(name);
    return b;
  }
  // Starts placing the clipboard's cells, which follow the pointer until a
  // click drops them.
  function startPaste() {
    if (selection.startPaste()) {
      setTool('select');
      setStatus('Click to place the paste. Escape cancels.');
    }
  }

  // ===== canvas =====
  // Draws one cell's tile at its place on the canvas, one canvas pixel per
  // tile pixel.
  function drawCell(ctx, cell, col, row) {
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const ink = ed.cellInk(cell, x, y);
        ctx.fillStyle =
          ink === 0 && ed.transparentZero ? '#101113' : css565(bankColor(cell.paletteBank, ink));
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
    painting.markHover();
  }
  const painting = canvasPainting(ed);

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
    prefix,
    get: () => zoom,
    scrolled: {
      stage,
      content: canvas,
      apply: (z) => {
        zoom = z;
        render();
      },
    },
    fit: () => {
      if (!asset()) return;
      zoom = fitLevel();
      render();
    },
    wheel: stage,
    busy: () => !!(painting.busy() || selection.busy || ed.panDrag || busy()),
  });
  host.querySelector(`.${prefix}Top .studioBarStart`).after(zoomControls.group);
  host.querySelector(`.${prefix}Top .studioBarEnd`).append(StudioShell.helpButton());

  // ===== the other parts =====
  const stamp = stampControls(ed);
  const rails = gridRails(ed);
  gridKeys(ed);

  // ===== rendering =====
  // The controls around the canvas: zoom, tool buttons, undo and redo, the
  // tileset lists and the tile picker.
  function renderControls() {
    zoomControls.sync();
    for (const name of toolNames) $(toolId(name)).classList.toggle('on', ed.tool === name);
    canvas.style.cursor = ed.restCursor();
    rails.syncEditActions();
    picker.renderTilesetAssignment();
    el('PickSlot').value = ed.pickAlt ? 'alt' : 'primary';
    picker.drawTileMap();
    picker.renderObjectList();
  }
  // The palette dock and the stamp settings.
  function renderStamp() {
    stamp.renderPaletteDock();
    stamp.updateStampBar();
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
    buildRails: rails.buildRails,
    toolButton,
    paintCanvas,
    renderControls,
    renderStamp,
    fitOnOpen,
    primaryTileset: ed.primaryTileset,
    altTileset: ed.altTileset,
    tilesetById,
    get zoom() {
      return zoom;
    },
    // A new or newly chosen asset starts on its tilesets' first pages.
    resetPlanes() {
      ed.primaryPlane = 0;
      ed.altPlane = 0;
    },
    // Choosing another asset starts over: first pages, a single-tile pick
    // and no selection.
    resetPick() {
      ed.primaryPlane = 0;
      ed.altPlane = 0;
      ed.pickRegion = { ...SINGLE_TILE };
      selection.reset();
    },
    // Forgets the pointer when the editor is hidden.
    clearHover: painting.clearHover,
  };
}
