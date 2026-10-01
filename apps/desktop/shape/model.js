// What the shape editor's parts share: the editor's working state, the shape
// being edited with its lookups, the active tool, and making an undoable edit.
import { canvasSize, spriteBounds } from '../domain/shapes.js';
import { $ } from '../dom.js';
import { ProjectHistory } from '../history.js';
import { renderAnimations } from '../lifecycle.js';
import { shapeIndex, shapes, tilesets } from '../state.js';

/**
 * The editor's working state. Everything here is view state; the shape itself
 * lives in the project (state.js).
 */
export const sc = {
  /** Whether the size fields read in 'tiles' or 'pixels'. */
  units: 'tiles',
  /** Where the pointer last showed the placement ghost, or null. */
  ghostPoint: null,
  /** Whether the Preview panel shows. */
  previewVisible: true,
  /** Indexes of the selected sprites in the shape's list. */
  selected: new Set(),
  /** The tiles picked in the tile picker, in tile units. */
  sourceRect: { x: 0, y: 0, width: 1, height: 1 },
  /** Where a drag on the tile picker started, or null. */
  sourceAnchor: null,
  /** Screen pixels per shape pixel. */
  zoom: 8,
  /** The shape pixel at the middle of the canvas. */
  camera: { x: 16, y: 16 },
  /** The drag in progress on the canvas, or null: its kind says which. */
  drag: null,
  /** The active tool: placing tiles, positioning the origin, box select, pan. */
  placing: false,
  originTool: false,
  boxSelect: false,
  panMode: false,
  /** Whether Space is held, which pans with any tool. */
  space: false,
  /** The shape shown last, so switching shapes clears the selection. */
  lastSprite: null,
  /** Which page of a 1bpp tileset to preview (sprites pick one at runtime). */
  plane: 0,
  /** The zoom buttons, once built. */
  zoomControls: null,
  /** Redraws the whole editor; shape-editor.js fills this in. */
  render: () => {},
};

/** The shape being edited, if any. */
export const shape = () => shapes[shapeIndex];
/** The shape's sprites, in OAM order. */
export const spritesOf = () => shape()?.sprites ?? [];
/** The tileset with this id, if any. */
const byId = (id) => tilesets.find((t) => t.id === id);
/** The shape's tileset: every sprite in a shape comes from this one tileset. */
export function shapeTileset() {
  return byId(shape()?.tilesetId);
}
/** The tileset the tile picker shows (the shape's own). */
export const source = () => shapeTileset();
/** The canvas size in pixels. */
export const width = () => canvasSize(shape()).width,
  height = () => canvasSize(shape()).height;
/** The origin's place on the canvas. */
export const ox = () => shape()?.originX ?? 0,
  oy = () => shape()?.originY ?? 0;
/** The box around `list` (the shape's sprites by default). */
export const bounds = (list = spritesOf()) => spriteBounds(list);

/**
 * checkpoint(label) records an undo step for the shapes; edit('Delete X', fn)
 * is one undoable edit that runs fn, marks the project changed and redraws
 * the animations (which show shapes). This editor listens to renderAnimations
 * too, so that one call redraws it as well.
 */
export const { checkpoint, edit } = ProjectHistory.editor({
  parts: ['shapes'],
  label: 'Edit the shape',
  after: () => renderAnimations(),
});

/** Hides the tiles that follow the pointer while placing. */
export function hideGhost() {
  if ($('scDragGhost')) $('scDragGhost').hidden = true;
  sc.ghostPoint = null;
}
/**
 * Picks the active tool: 'place', 'origin', 'box', 'pan' or 'move'. One tool
 * is active at a time; Move is what's left when none of the others is.
 */
export function setMode(mode) {
  sc.placing = mode === 'place';
  sc.originTool = mode === 'origin';
  sc.boxSelect = mode === 'box';
  sc.panMode = mode === 'pan';
  if (!sc.placing) hideGhost();
  sc.render();
}
