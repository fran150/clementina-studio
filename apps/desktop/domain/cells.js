// Grids of tile cells: backgrounds and the overlay. A grid is
// {width, height, cells}, its cells row by row; a cell names a tile, its
// palette bank, flips, priority and which of two tilesets it reads (chrAlt).
// A region is {x, y, width, height} in cells, and a block is a grid lifted
// out of another one. Nothing here touches the page.

/** The tile picker shows a tileset as 16 tiles per row. */
export const TILES_PER_ROW = 16;

/** An empty cell: tile 0 in bank 0, no flips or priority, primary tileset. */
export function blankCell() {
  return { tile: 0, paletteBank: 0, flipX: false, flipY: false, priority: false, chrAlt: false };
}

/** width × height blank cells. */
export function makeCells(width, height) {
  return Array.from({ length: width * height }, blankCell);
}

/** Whether a cell holds anything other than the blank cell's values. */
export function isBlank(cell) {
  return (
    cell.tile === 0 &&
    cell.paletteBank === 0 &&
    !cell.flipX &&
    !cell.flipY &&
    !cell.priority &&
    !cell.chrAlt
  );
}

/** Whether (col, row) lies inside the grid. */
function inGrid(grid, col, row) {
  return col >= 0 && row >= 0 && col < grid.width && row < grid.height;
}

/** Sets one cell, if it lies inside the grid. */
export function setCell(grid, col, row, cell) {
  if (inGrid(grid, col, row)) grid.cells[row * grid.width + col] = cell;
}

/** The region between two corner points {col, row}, both included. */
export function regionBetween(a, b) {
  return {
    x: Math.min(a.col, b.col),
    y: Math.min(a.row, b.row),
    width: Math.abs(a.col - b.col) + 1,
    height: Math.abs(a.row - b.row) + 1,
  };
}

/** Whether a region contains a point {col, row}. */
export function regionContains(r, p) {
  return !!r && p.col >= r.x && p.row >= r.y && p.col < r.x + r.width && p.row < r.y + r.height;
}

/** Every point of a region, row by row. */
export function regionPoints(r) {
  const points = [];
  for (let row = r.y; row < r.y + r.height; row++)
    for (let col = r.x; col < r.x + r.width; col++) points.push({ col, row });
  return points;
}

/** Copies a region's cells out as a block. */
export function lift(grid, r) {
  const cells = [];
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++)
      cells.push({ ...grid.cells[(r.y + y) * grid.width + r.x + x] });
  return { width: r.width, height: r.height, cells };
}

/** Blanks a region's cells. */
export function clear(grid, r) {
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++) grid.cells[y * grid.width + x] = blankCell();
}

/** Copies a block into the grid at (x0, y0); cells past the edge are dropped. */
export function place(grid, block, x0, y0) {
  for (let y = 0; y < block.height; y++)
    for (let x = 0; x < block.width; x++)
      setCell(grid, x0 + x, y0 + y, { ...block.cells[y * block.width + x] });
}

/**
 * A block turned over on one axis ('x' or 'y'): the cells swap places and
 * each one's own flip bit toggles, so a multi-tile picture turns over whole
 * instead of each tile flipping in place.
 */
export function mirror(block, axis) {
  const cells = [];
  for (let y = 0; y < block.height; y++)
    for (let x = 0; x < block.width; x++) {
      const cell = {
        ...block.cells[
          (axis === 'y' ? block.height - 1 - y : y) * block.width +
            (axis === 'x' ? block.width - 1 - x : x)
        ],
      };
      if (axis === 'x') cell.flipX = !cell.flipX;
      else cell.flipY = !cell.flipY;
      cells.push(cell);
    }
  return { width: block.width, height: block.height, cells };
}

/** The points on a straight line from `from` to `to`, both included. */
export function linePoints(from, to) {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row));
  const points = [];
  for (let i = 0; i <= steps; i++)
    points.push({
      col: Math.round(from.col + ((to.col - from.col) * i) / (steps || 1)),
      row: Math.round(from.row + ((to.row - from.row) * i) / (steps || 1)),
    });
  return points;
}

/** The 4-connected points around (col, row) showing the same tile. */
export function floodPoints(grid, col, row) {
  const { width: w, height: h } = grid;
  if (!inGrid(grid, col, row)) return [];
  const old = grid.cells[row * w + col].tile,
    seen = new Uint8Array(w * h),
    stack = [[col, row]],
    points = [];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x] || grid.cells[y * w + x].tile !== old)
      continue;
    seen[y * w + x] = 1;
    points.push({ col: x, row: y });
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return points;
}

/**
 * The block a picked group of tiles stamps: the tiles of `pick` ({col, row, width,
 * height} on the tile picker, in tiles), each in its authored bank from `banks`, with
 * the stamp's flips, priority and tileset. A flipped group is mirrored whole,
 * its tiles swapping places as well as flipping, so the picture turns over.
 */
export function groupBlock(pick, stamp, banks) {
  const cells = [];
  for (let dy = 0; dy < pick.height; dy++)
    for (let dx = 0; dx < pick.width; dx++) {
      const sx = stamp.flipX ? pick.width - 1 - dx : dx,
        sy = stamp.flipY ? pick.height - 1 - dy : dy;
      const tile = (pick.row + sy) * TILES_PER_ROW + (pick.col + sx);
      cells.push({
        tile,
        paletteBank: banks?.[tile] ?? 0,
        flipX: stamp.flipX,
        flipY: stamp.flipY,
        priority: stamp.priority,
        chrAlt: stamp.chrAlt,
      });
    }
  return { width: pick.width, height: pick.height, cells };
}

/** Whether resizing to width × height would crop away any painted cell. */
export function cropsContent(grid, width, height) {
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++)
      if ((x >= width || y >= height) && !isBlank(grid.cells[y * grid.width + x])) return true;
  return false;
}

/** The grid's cells resized to width × height, keeping the top-left corner. */
export function resizedCells(grid, width, height) {
  const cells = makeCells(width, height);
  for (let y = 0; y < Math.min(grid.height, height); y++)
    for (let x = 0; x < Math.min(grid.width, width); x++)
      cells[y * width + x] = grid.cells[y * grid.width + x];
  return cells;
}
