// The overlay: the fixed 40 × 25 text/HUD layer, a grid of cells (cells.js)
// that never scrolls. Placeholders are named regions of it, {id, name, col,
// row, width, height}, that a build step can fill at runtime; they never
// overlap. Nothing here touches the page.
import { makeCells } from './cells.js';

/** The overlay's fixed size (specs/video.json's overlay entry). */
export const COLUMNS = 40,
  ROWS = 25;

/** The overlay as a grid, for the grid operations in cells.js. */
export function overlayGrid(overlay) {
  return { width: COLUMNS, height: ROWS, cells: overlay.cells };
}

/** A new, blank overlay reading `tilesetId` as both of its tilesets. */
export function newOverlay(id, name, tilesetId) {
  return {
    id,
    name,
    tilesetId,
    altTilesetId: tilesetId,
    cells: makeCells(COLUMNS, ROWS),
    placeholders: [],
  };
}

/** Whether two {col, row, width, height} regions share a cell. */
export function overlaps(a, b) {
  return (
    a.col < b.col + b.width &&
    b.col < a.col + a.width &&
    a.row < b.row + b.height &&
    b.row < a.row + a.height
  );
}

/** Whether a region lies inside the overlay. */
export function fitsOverlay(rect) {
  return rect.col + rect.width <= COLUMNS && rect.row + rect.height <= ROWS;
}

/** Whether a region overlaps any placeholder but the one at `except`. */
export function overlapsAny(placeholders, rect, except = -1) {
  return placeholders.some((p, i) => i !== except && overlaps(p, rect));
}

/**
 * The first free width × height spot, scanning row by row from the top
 * left, or null when none is left.
 */
export function firstFreeSpot(width, height, placeholders) {
  for (let row = 0; row <= ROWS - height; row++)
    for (let col = 0; col <= COLUMNS - width; col++) {
      const rect = { col, row, width, height };
      if (!overlapsAny(placeholders, rect)) return rect;
    }
  return null;
}
