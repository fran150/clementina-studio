// Shapes: one arrangement of up to 64 hardware sprites from a single
// tileset. A sprite is {tile, x, y, paletteBank, flipX, flipY}, 8 × 8 pixels,
// placed relative to the shape's origin; later sprites draw on top. The
// canvas is the area the shape is authored in, at most the 320 × 200 screen,
// and the origin is a point on it that anchors the shape when the game draws
// it. Nothing here touches the page.
import { TILES_PER_ROW } from './cells.js';

/** A shape holds at most this many sprites. */
export const MAX_SPRITES = 64;
/** The largest canvas: the physical screen. */
export const MAX_CANVAS_WIDTH = 320,
  MAX_CANVAS_HEIGHT = 200;

/** A new, empty 4 × 4-tile shape on `tilesetId`, its origin at the top left. */
export function newShape(id, name, tilesetId) {
  return {
    id,
    name,
    tilesetId,
    canvasWidth: 4,
    canvasHeight: 4,
    originX: 0,
    originY: 0,
    originAnchor: 'top-left',
    sprites: [],
  };
}

/** A shape's canvas size in pixels; older shapes store it in tiles only. */
export function canvasSize(shape) {
  return {
    width: Math.min(MAX_CANVAS_WIDTH, shape?.canvasPixelWidth ?? (shape?.canvasWidth ?? 4) * 8),
    height: Math.min(MAX_CANVAS_HEIGHT, shape?.canvasPixelHeight ?? (shape?.canvasHeight ?? 4) * 8),
  };
}

/** Whether every sprite fits OAM: X is 10-bit signed and Y 9-bit signed. */
export function validSprites(list) {
  return list.every(
    (p) =>
      Number.isInteger(p.x) &&
      Number.isInteger(p.y) &&
      p.x >= -512 &&
      p.x <= 511 &&
      p.y >= -256 &&
      p.y <= 255,
  );
}

/** The rectangle the sprites cover, relative to the origin. */
export function spriteBounds(list) {
  if (!list.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...list.map((p) => p.x)),
    y = Math.min(...list.map((p) => p.y));
  return {
    x,
    y,
    width: Math.max(...list.map((p) => p.x + 8)) - x,
    height: Math.max(...list.map((p) => p.y + 8)) - y,
  };
}

/** The topmost sprite under a canvas point {x, y}, or -1. */
export function spriteAt(shape, pos) {
  const ox = shape.originX ?? 0,
    oy = shape.originY ?? 0;
  for (let i = shape.sprites.length - 1; i >= 0; i--) {
    const p = shape.sprites[i];
    if (pos.x >= p.x + ox && pos.x < p.x + ox + 8 && pos.y >= p.y + oy && pos.y < p.y + oy + 8)
      return i;
  }
  return -1;
}

/**
 * Where the origin goes when the canvas is resized to w × h: it keeps its
 * anchor (top-left, center or bottom-center) or, when custom, its place in
 * proportion to the canvas.
 */
export function resizedOrigin(shape, w, h) {
  const { width, height } = canvasSize(shape),
    ox = shape.originX ?? 0,
    oy = shape.originY ?? 0,
    anchor = shape.originAnchor ?? 'custom';
  const x =
    anchor === 'top-left'
      ? 0
      : anchor === 'center' || anchor === 'bottom-center'
        ? Math.floor(w / 2)
        : Math.round((ox / width) * w);
  const y =
    anchor === 'top-left'
      ? 0
      : anchor === 'center'
        ? Math.floor(h / 2)
        : anchor === 'bottom-center'
          ? h
          : Math.round((oy / height) * h);
  return { x, y };
}

/**
 * The shape's sprites once its origin moves to (x, y), so each keeps its
 * place on the canvas.
 */
export function spritesForOrigin(shape, x, y) {
  const dx = x - (shape.originX ?? 0),
    dy = y - (shape.originY ?? 0);
  return shape.sprites.map((p) => ({ ...p, x: p.x - dx, y: p.y - dy }));
}

/**
 * One sprite per tile of a tile-map region {x, y, width, height} (in tiles),
 * laid out from (x, y) relative to the origin, each in its tile's authored
 * bank.
 */
export function spritesForTiles(region, x, y, banks) {
  const add = [];
  for (let row = 0; row < region.height; row++)
    for (let col = 0; col < region.width; col++) {
      const t = (region.y + row) * TILES_PER_ROW + region.x + col;
      add.push({
        tile: t,
        x: x + col * 8,
        y: y + row * 8,
        paletteBank: banks[t],
        flipX: false,
        flipY: false,
      });
    }
  return add;
}

/** Copies of the sprites, moved by `offset` pixels on both axes. */
export function offsetSprites(list, offset) {
  return list.map((p) => ({ ...p, x: p.x + offset, y: p.y + offset }));
}

/** The sprites with the selected ones (a Set of indices) moved by (dx, dy). */
export function translateSprites(list, selected, dx, dy) {
  return list.map((p, i) => (selected.has(i) ? { ...p, x: p.x + dx, y: p.y + dy } : p));
}

/**
 * Turns the selected sprites over as one picture on `axis` ('x' or 'y'):
 * each moves to its mirrored place within their bounds and its flip bit
 * toggles. Changes the sprites in place.
 */
export function flipSprites(list, selected, axis) {
  const b = spriteBounds([...selected].map((i) => list[i])),
    size = axis === 'x' ? 'width' : 'height',
    bit = axis === 'x' ? 'flipX' : 'flipY';
  selected.forEach((i) => {
    const p = list[i];
    p[axis] = 2 * b[axis] + b[size] - 8 - p[axis];
    p[bit] = !p[bit];
  });
}

/**
 * The selected sprites moved to the end of the list (front, drawn last) or
 * the start (back), with their new indices.
 */
export function spritesToEnd(list, selected, front) {
  const chosen = list.filter((_, i) => selected.has(i)),
    other = list.filter((_, i) => !selected.has(i));
  return {
    sprites: front ? [...other, ...chosen] : [...chosen, ...other],
    selected: new Set(chosen.map((_, i) => i + (front ? other.length : 0))),
  };
}

/**
 * The selected sprites moved one place up (dir 1, toward the front) or down
 * (dir -1), with their new indices; null when none can move. Each run of
 * neighboring selected sprites steps past its one unselected neighbor, runs
 * taken from the leading edge so a selection stays together.
 */
export function spritesStepped(list, selected, dir) {
  const idxs = [...selected].sort((a, b) => a - b),
    runs = [];
  for (const i of idxs) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  const ordered = dir > 0 ? [...runs].reverse() : runs,
    next = [...list],
    moved = [];
  for (const run of ordered) {
    const [lo, hi] = run;
    if (dir > 0) {
      if (hi + 1 >= next.length) continue;
      const [item] = next.splice(hi + 1, 1);
      next.splice(lo, 0, item);
    } else {
      if (lo - 1 < 0) continue;
      const [item] = next.splice(lo - 1, 1);
      next.splice(hi, 0, item);
    }
    moved.push(run);
  }
  if (!moved.length) return null;
  // Two passes, so a run's own vacated indices can't collide with the indices
  // it is about to occupy (they can be adjacent, e.g. a two-sprite block).
  const newSelected = new Set(selected);
  for (const [lo, hi] of moved) for (let k = lo; k <= hi; k++) newSelected.delete(k);
  for (const [lo, hi] of moved) for (let k = lo; k <= hi; k++) newSelected.add(k + dir);
  return { sprites: next, selected: newSelected };
}
