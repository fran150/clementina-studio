// Plain geometry on whole-number grids, shared by every editor: pixels in a
// tileset, cells in a background, tiles on a tile map. Points are [x, y].

/** `value` kept within `low` and `high`, both included. */
export function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

/**
 * The rectangle between two corners (x0, y0) and (x1, y1), both included,
 * whichever way round they are: a drag from either corner gives the same one.
 */
export function rectBetween(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    width: Math.abs(x1 - x0) + 1,
    height: Math.abs(y1 - y0) + 1,
  };
}

/**
 * The points on a straight line from `from` to `to`, both included: one per
 * step along the longer axis, so a fast drag leaves no gaps.
 */
export function lineBetween(from, to) {
  const [x0, y0] = from,
    [x1, y1] = to,
    steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)),
    points = [];
  for (let i = 0; i <= steps; i++)
    points.push([
      Math.round(x0 + ((x1 - x0) * i) / (steps || 1)),
      Math.round(y0 + ((y1 - y0) * i) / (steps || 1)),
    ]);
  return points;
}

/**
 * The 4-connected points of a `width` × `height` grid around `start` whose
 * `valueAt(x, y)` matches the start's: what a fill covers. Empty when `start`
 * is off the grid.
 */
export function floodFill(width, height, start, valueAt) {
  const [sx, sy] = start;
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return [];
  const old = valueAt(sx, sy),
    seen = new Uint8Array(width * height),
    stack = [[sx, sy]],
    points = [];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height || seen[y * width + x]) continue;
    if (valueAt(x, y) !== old) continue;
    seen[y * width + x] = 1;
    points.push([x, y]);
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return points;
}
