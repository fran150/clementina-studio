// What the tile editor's parts share: the editor's working state, the
// tileset being edited, undoable edits, and how a pixel shows on screen.
import { $ } from '../dom.js';
import { patternAt as domainPatternAt, tilePixel } from '../domain/tilesets.js';
import { ProjectHistory } from '../history.js';
import { bankColor, css565, tilesets } from '../state.js';
import { markDirty } from '../status.js';

const host = $('namedBankEditor');

/** The editor's working state; the tilesets themselves live in state.js. */
export const tl = {
  // ---- which tileset, and which part of it ----
  /** Which tileset is open, and the tilesets array it was opened from (an
   * undo replaces the array; that is not a newly opened project). */
  index: 0,
  reference: null,
  /** The tiles picked on the tile map, in tile units: the drawing area. */
  selection: { x: 0, y: 0, width: 1, height: 1 },
  /** Where a drag on the tile map started, or null. */
  anchor: null,
  /** The object picked in the Objects list, or -1. */
  objectIndex: -1,
  /** Which of a 1bpp tileset's three pages is on screen. */
  plane: 0,
  // ---- drawing ----
  /** The active tool: 'pencil', 'eraser', 'fill', 'line', 'rectangle',
   * 'ellipse', 'picker' or 'select'. */
  tool: 'pencil',
  /** The palette bank and color drawn with. */
  palette: 0,
  ink: 1,
  /** A pencil stroke's color and its last pixel, or null between strokes. */
  stroke: null,
  last: null,
  /** Whether the stroke in progress erases (the eraser or right button). */
  erasing: false,
  /** A line, rectangle or ellipse being dragged out, in pixels. */
  shapeStart: null,
  shapeEnd: null,
  /** The fill tools' pattern: 'solid', 'checker' or 'stripes'. */
  fillPattern: 'solid',
  // ---- pixel selection and clipboard ----
  /** The selected pixels, a rectangle in drawing-area pixels, or null. */
  pixelSelection: null,
  /** Where a selection drag started, or null. */
  selectStart: null,
  /** The corner a selection handle drag keeps fixed, or null. */
  resizeDrag: null,
  /** Selected pixels being dragged: their rectangle, pixels and position. */
  moveDrag: null,
  /** The pixels being pasted, and where, while a paste is positioned. */
  pixelClipboard: null,
  pasteAnchor: null,
  /** Which area a copy takes from: the canvas ('pixels') or the dock ('color'). */
  clipboardArea: 'pixels',
  // ---- hover and inspection ----
  /** The pixel and tile under the pointer, and whether it is over the canvas. */
  lastPixel: [0, 0],
  targetTile: 0,
  hovering: false,
  /** The bank whose tiles are marked while it is hovered in the dock, or null. */
  usagePalette: null,
  /** The color the color picker is editing. */
  colorEdit: { bank: 0, ink: 1 },
  // ---- the view ----
  /** Screen pixels per tile pixel, and the area the zoom was last fitted to. */
  zoom: 8,
  fittedArea: null,
  /** The zoom buttons, once built. */
  zoomControls: null,
  /** Panning: Space held, the Pan tool's toggle, and a pan drag in progress. */
  spaceHeld: false,
  panToolActive: false,
  panDrag: null,
  /** Whether the Preview panel shows. */
  miniVisible: true,
  /** Color 0 is a background tile's background color and transparent for
   * sprites. Which of the two the canvas and the swatches show is a view choice. */
  zeroAsColor: false,
  /** Redraws the whole editor; bank-editor.js fills this in. */
  render: () => {},
};

/** The canvas's scrolling frame, and the row holding the preview background. */
export const scroll = host.querySelector('.selectionScroll'),
  backgroundRow = $('previewBackground').closest('.bankActions');

/** The tileset being edited, if any. */
export const asset = () => tilesets[tl.index];
// Colors live in the shared library, so history has to carry it alongside the
// banks. Shapes keep their own history and are only folded in for the
// rare edit that spans both, so ordinary drawing cannot revert sprite work.
// Edits here, and in the palette library, which edits the same shared
// state, go into the project's one history (history.js). Palettes travel
// with every tileset edit because drawing records banks the active config
// arranges; the rare edit that repoints sprite groups folds shapes in too.
export function remember(withGroups, label = 'Edit the tileset') {
  ProjectHistory.checkpoint(
    ['tilesets', 'palettes', ...(withGroups ? ['shapes', 'animations'] : [])],
    label,
  );
}
/** Marks the project changed and redraws. */
export function changed() {
  markDirty();
  tl.render();
}
// An edit's label names it in the history: mutate('Delete X', fn[, withGroups]).
export function mutate(...args) {
  const label = typeof args[0] === 'string' ? args.shift() : 'Edit the tileset';
  const [fn, withGroups] = args;
  remember(withGroups, label);
  fn();
  changed();
}
// One pixel of a tile, on the 1bpp page being viewed.
export function sample(a, t, x, y) {
  return tilePixel(a, t, x, y, tl.plane);
}
/** The CSS color of one pixel of tile `t`, as the canvas shows it. */
export function pixelColor(a, t, x, y) {
  const value = sample(a, t, x, y);
  const bank = a.tilePaletteBanks[t];
  return value === 0 ? zeroColor(a, bank) : css565(bankColor(bank, value));
}
/** How color 0 shows: the bank's color 0, or the preview background. */
export function zeroColor(a, bank) {
  return tl.zeroAsColor ? css565(bankColor(bank, 0)) : (a.previewBackground ?? '#252830');
}
/** Whether the fill pattern covers pixel (x, y). */
export function patternAt(x, y) {
  return domainPatternAt(tl.fillPattern, x, y);
}
