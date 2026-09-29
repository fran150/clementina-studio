// Tilesets and their pixels. A tileset is one CHR bank's worth of graphics:
// three planes of 2048 bytes, each plane 256 tiles of 8 rows, bit 0 the
// leftmost pixel. A 3bpp pixel's color index is p0 | p1 << 1 | p2 << 2; a
// 1bpp tileset holds three independent mono pages, one per plane. Beside the
// pixels, each tile records the palette bank it was drawn against
// (tilePaletteBanks), and saved regions of the tile map are its Objects
// (compositions). See docs/model.md.
//
// The tileset editor draws on an area: a region of the tile map, {x, y,
// width, height} in tiles, shown as one picture. Pixel coordinates are within
// that picture. A pixel block is {width, height, data, banks}: each pixel's
// color index and its tile's bank. Nothing here touches the page.
import { TILES_PER_ROW } from './cells.js';
import { freshName } from './names.js';

export const GH = 8,
  TILES = 256,
  PLANE = TILES * GH,
  TILESET_BYTES = 3 * PLANE;

/** A new, blank 3bpp tileset. */
export function newTileset(id, name) {
  return {
    id,
    name,
    bpp: 3,
    chr: Array(TILESET_BYTES).fill(0),
    tilePaletteBanks: Array(TILES).fill(0),
    compositions: [],
  };
}

/**
 * One pixel of a tile. A 1bpp tileset reads a single plane; `plane` is the
 * page being viewed, which belongs to the editor rather than the tileset.
 */
export function tilePixel(tileset, tile, x, y, plane = 0) {
  const bit = (p) => (tileset.chr[p * PLANE + tile * GH + y] >> x) & 1;
  return tileset.bpp === 1 ? bit(plane) : bit(0) | (bit(1) << 1) | (bit(2) << 2);
}

/** Sets one pixel of a tile; on a 1bpp tileset any value but 0 sets the bit. */
export function setTilePixel(tileset, tile, x, y, value, plane = 0) {
  for (const p of tileset.bpp === 1 ? [plane] : [0, 1, 2]) {
    const i = p * PLANE + tile * GH + y,
      bit = tileset.bpp === 1 ? (value ? 1 : 0) : (value >> p) & 1;
    if (bit) tileset.chr[i] |= 1 << x;
    else tileset.chr[i] &= ~(1 << x);
  }
}

// ===== drawing areas =====

/** The tile that pixel (x, y) of an area falls in. */
export function areaTile(area, x, y) {
  return (area.y + Math.floor(y / 8)) * TILES_PER_ROW + area.x + Math.floor(x / 8);
}

/** Whether pixel (x, y) lies inside an area. */
export function inArea(area, x, y) {
  return x >= 0 && y >= 0 && x < area.width * 8 && y < area.height * 8;
}

/** The color index of pixel (x, y) of an area. */
export function areaPixel(tileset, area, x, y, plane) {
  return tilePixel(tileset, areaTile(area, x, y), x % 8, y % 8, plane);
}

/** Sets pixel (x, y) of an area. */
export function setAreaPixel(tileset, area, x, y, value, plane) {
  setTilePixel(tileset, areaTile(area, x, y), x % 8, y % 8, value, plane);
}

/** Copies a pixel region {x, y, width, height} of an area out as a block. */
export function capturePixels(tileset, area, r, plane) {
  const data = [],
    banks = [];
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const sx = r.x + x,
        sy = r.y + y,
        t = areaTile(area, sx, sy);
      data.push(tilePixel(tileset, t, sx % 8, sy % 8, plane));
      banks.push(tileset.tilePaletteBanks[t]);
    }
  return { width: r.width, height: r.height, data, banks };
}

/**
 * Draws a block into an area with its top-left at `at` [x, y]; pixels past
 * the area's edge are dropped. Unless `opaque`, color 0 in the block leaves
 * the pixel below alone. With `source`, each tile the block reaches takes the
 * bank of the first block pixel drawn into it. Banks are global under a
 * config, so the same number means the same colors.
 */
export function applyPixels(tileset, area, block, at, opaque, source, plane) {
  const assigned = new Set();
  for (let y = 0; y < block.height; y++)
    for (let x = 0; x < block.width; x++) {
      const i = y * block.width + x,
        v = block.data[i],
        dx = at[0] + x,
        dy = at[1] + y;
      if ((!opaque && !v) || !inArea(area, dx, dy)) continue;
      const t = areaTile(area, dx, dy);
      if (source && !assigned.has(t)) {
        tileset.tilePaletteBanks[t] = block.banks[i];
        assigned.add(t);
      }
      setTilePixel(tileset, t, dx % 8, dy % 8, v, plane);
    }
}

/** Sets a pixel region of an area to color 0. */
export function clearPixels(tileset, area, r, plane) {
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++) setAreaPixel(tileset, area, x, y, 0, plane);
}

/**
 * A block flipped ('horizontal', 'vertical') or rotated a quarter turn
 * clockwise ('rotate'). A rotated block swaps its width and height.
 */
export function transformPixels(block, kind) {
  const rot = kind === 'rotate',
    w = rot ? block.height : block.width,
    h = rot ? block.width : block.height;
  const out = { width: w, height: h, data: Array(w * h), banks: Array(w * h) };
  for (let y = 0; y < block.height; y++)
    for (let x = 0; x < block.width; x++) {
      const dx = rot ? block.height - 1 - y : kind === 'horizontal' ? block.width - 1 - x : x,
        dy = rot ? x : kind === 'vertical' ? block.height - 1 - y : y;
      out.data[dy * w + dx] = block.data[y * block.width + x];
      out.banks[dy * w + dx] = block.banks[y * block.width + x];
    }
  return out;
}

/** The 4-connected pixels of an area around `start` [x, y] with its color. */
export function floodPixels(tileset, area, start, plane) {
  const [sx, sy] = start,
    w = area.width * 8,
    h = area.height * 8;
  if (!inArea(area, sx, sy)) return [];
  const get = (x, y) => areaPixel(tileset, area, x, y, plane);
  const old = get(sx, sy),
    seen = new Uint8Array(w * h),
    stack = [[sx, sy]],
    points = [];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x] || get(x, y) !== old) continue;
    seen[y * w + x] = 1;
    points.push([x, y]);
    stack.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return points;
}

// ===== drawing =====

/** Whether a fill pattern ('solid', 'checker' or 'stripes') covers pixel (x, y). */
export function patternAt(pattern, x, y) {
  return pattern === 'solid' || (pattern === 'checker' ? (x + y) % 2 === 0 : y % 2 === 0);
}

/**
 * The pixels a freehand stroke covers from `from` to `to`, both [x, y]:
 * every pixel on the straight line, so a fast drag leaves no gaps.
 */
export function strokePixels(from, to) {
  const [x, y] = to,
    steps = Math.max(Math.abs(x - from[0]), Math.abs(y - from[1])),
    points = [];
  for (let i = 0; i <= steps; i++)
    points.push([
      Math.round(from[0] + ((x - from[0]) * i) / (steps || 1)),
      Math.round(from[1] + ((y - from[1]) * i) / (steps || 1)),
    ]);
  return points;
}

/**
 * The pixels of a 'line', 'rectangle' or 'ellipse' between corners a and b,
 * each once. A filled rectangle or ellipse also covers every pixel between
 * its outline's leftmost and rightmost on each row.
 */
export function shapePixels(kind, a, b, filled) {
  const out = new Map(),
    add = (x, y) => out.set(x + ',' + y, [x, y]);
  // Bresenham's line.
  const line = (x0, y0, x1, y1) => {
    const dx = Math.abs(x1 - x0),
      sx = x0 < x1 ? 1 : -1,
      dy = -Math.abs(y1 - y0),
      sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      add(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e = 2 * err;
      if (e >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  };
  const x0 = Math.min(a[0], b[0]),
    x1 = Math.max(a[0], b[0]),
    y0 = Math.min(a[1], b[1]),
    y1 = Math.max(a[1], b[1]);
  if (kind === 'line' || x0 === x1 || y0 === y1) line(a[0], a[1], b[0], b[1]);
  else if (kind === 'rectangle') {
    line(x0, y0, x1, y0);
    line(x1, y0, x1, y1);
    line(x1, y1, x0, y1);
    line(x0, y1, x0, y0);
  } else {
    // The ellipse as short lines between points around it, close enough
    // together that no pixel of the outline is skipped.
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2,
      rx = (x1 - x0) / 2,
      ry = (y1 - y0) / 2,
      steps = Math.ceil(8 * Math.PI * Math.max(rx, ry));
    let prev = [x1, Math.round(cy)];
    for (let n = 1; n <= steps; n++) {
      const angle = (n * 2 * Math.PI) / steps,
        next = [Math.round(cx + rx * Math.cos(angle)), Math.round(cy + ry * Math.sin(angle))];
      line(prev[0], prev[1], next[0], next[1]);
      prev = next;
    }
  }
  if (kind !== 'line' && filled) {
    for (let y = y0; y <= y1; y++) {
      const row = [...out.values()].filter((p) => p[1] === y).map((p) => p[0]);
      if (row.length) for (let x = Math.min(...row); x <= Math.max(...row); x++) add(x, y);
    }
  }
  return [...out.values()];
}

/** The first of Object_1, Object_2, … no Object of the tileset uses (case matters). */
export function freshObjectName(tileset) {
  return freshName(tileset.compositions, 'Object');
}
