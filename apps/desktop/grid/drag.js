// Drags across a cell grid: the region between a drag's two corners, and the
// dashed outline that previews it.

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
