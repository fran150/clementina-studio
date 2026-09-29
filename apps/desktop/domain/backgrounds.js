// Backgrounds: free-sized grids of cells (cells.js) drawn from a primary and
// an alternate tileset. The hardware shows one through a BGMODE-sized window
// of four physical tables per BGSET, scrolled by SCROLL_X/SCROLL_Y; the
// camera math here mirrors clementina-video-client's
// internal/render/renderer.go (bgTableAndLocal). Nothing here touches the page.
import { makeCells } from './cells.js';

/**
 * The six hardware BGMODE window sizes, in tiles: a preview aid, not a canvas
 * limit (specs/video.json background.viewportModes).
 */
export const VIEWPORT_MODES = [
  { id: 0, columns: 40, rows: 25, label: '40 × 25' },
  { id: 1, columns: 80, rows: 25, label: '80 × 25' },
  { id: 2, columns: 40, rows: 50, label: '40 × 50' },
  { id: 3, columns: 160, rows: 25, label: '160 × 25' },
  { id: 4, columns: 40, rows: 100, label: '40 × 100' },
  { id: 5, columns: 80, rows: 50, label: '80 × 50' },
];
/** The physical screen, in pixels. */
export const SCREEN_WIDTH = 320,
  SCREEN_HEIGHT = 200;
// Matches @clementina/assets' MAX_BACKGROUND_DIMENSION/MAX_BACKGROUND_CELLS,
// duplicated the way other hardware facts are so the renderer need not load
// the SDK's session validator.
export const MAX_DIMENSION = 1024,
  MAX_CELLS = 200000;

/** n mod m, never negative. */
export function positiveMod(n, m) {
  return ((n % m) + m) % m;
}

/** The viewport mode with this id. */
export function viewportMode(id) {
  return VIEWPORT_MODES.find((m) => m.id === id);
}

/**
 * Which physical table a coarse (8px) tile column/row falls in, for a BGMODE's
 * table arrangement and the active BGSET (0 or 1).
 */
export function tableForCell(mode, activeSet, x, y) {
  let table;
  switch (mode) {
    case 1:
      table = Math.floor(x / 40);
      break;
    case 2:
      table = y >= 25 ? 2 : 0;
      break;
    case 3:
      table = Math.floor(x / 40);
      break;
    case 4:
      table = Math.floor(y / 25);
      break;
    case 5:
      table = Math.floor(y / 25) * 2 + Math.floor(x / 40);
      break;
    default:
      table = 0;
  }
  return table + (activeSet & 1) * 4;
}

/**
 * Splits a wrapping [origin, origin + span) pixel range on a plane `plane`
 * pixels wide into one or two ranges that don't wrap.
 */
export function wrapRanges(origin, span, plane) {
  return origin + span <= plane
    ? [[origin, origin + span]]
    : [
        [origin, plane],
        [0, origin + span - plane],
      ];
}

/**
 * The pieces of the visible screen within a mode's plane, scrolled by
 * `scroll` {x, y}: the x and y pixel ranges, each one or two long.
 */
export function screenRanges(modeId, scroll) {
  const mode = viewportMode(modeId),
    planeW = mode.columns * 8,
    planeH = mode.rows * 8;
  const localX = positiveMod(scroll.x, planeW),
    localY = positiveMod(scroll.y, planeH);
  return {
    planeW,
    planeH,
    localX,
    localY,
    xRanges: wrapRanges(localX, SCREEN_WIDTH, planeW),
    yRanges: wrapRanges(localY, SCREEN_HEIGHT, planeH),
  };
}

/**
 * The physical tables the visible screen touches, in order: up to four when
 * it straddles a table boundary in both axes.
 */
export function visibleTables(modeId, activeSet, scroll) {
  const { xRanges, yRanges } = screenRanges(modeId, scroll);
  const tables = new Set();
  for (const [x0, x1] of xRanges)
    for (const [y0, y1] of yRanges) {
      const cx0 = Math.floor(x0 / 8),
        cx1 = Math.floor((x1 - 1) / 8),
        cy0 = Math.floor(y0 / 8),
        cy1 = Math.floor((y1 - 1) / 8);
      for (const cx of [cx0, cx1])
        for (const cy of [cy0, cy1]) tables.add(tableForCell(modeId, activeSet, cx, cy));
    }
  return [...tables].sort((x, y) => x - y);
}

/** A scroll register value from any number: 0 to 65535. */
export function clampScroll(v) {
  return Math.max(0, Math.min(65535, Math.round(v) || 0));
}

/** A background dimension from any number: 1 to MAX_DIMENSION tiles. */
export function clampDimension(v) {
  return Math.max(1, Math.min(MAX_DIMENSION, Math.round(v) || 1));
}

/** Whether a width × height background stays within MAX_CELLS. */
export function sizeFits(width, height) {
  return width * height <= MAX_CELLS;
}

/** A new 40 × 25 background reading `tilesetId` as both of its tilesets. */
export function newBackground(id, name, tilesetId) {
  const width = 40,
    height = 25;
  return {
    id,
    name,
    width,
    height,
    tilesetId,
    altTilesetId: tilesetId,
    cells: makeCells(width, height),
  };
}
