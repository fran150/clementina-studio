// Drags across a cell grid: the region between a drag's two corners, and the
// dashed outline that previews it.
import { rectBetween } from '../domain/geometry.js';
import { StudioShell } from '../studio-shell.js';

// Draws a dashed outline around the cells between a drag's two corners; a
// second color, offset by one dash, keeps it visible on any tile.
export function outlineDrag(ctx, anchor, col, row, color, backColor = null) {
  const r = rectBetween(anchor.col, anchor.row, col, row);
  StudioShell.dashedRect(ctx, r.x * 8, r.y * 8, r.width * 8, r.height * 8, color, backColor);
}
// The inclusive corners of a drag as a {col, row, width, height} region.
export function dragRegion(anchor, col, row) {
  const r = rectBetween(anchor.col, anchor.row, col, row);
  return { col: r.x, row: r.y, width: r.width, height: r.height };
}
