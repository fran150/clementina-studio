// Small drawing and pointer helpers every canvas editor shares.
import { clamp } from '../domain/geometry.js';

/**
 * The cell of a `cols` × `rows` grid drawn over `element` that the pointer is
 * on, as {x, y}, clamped to the grid so a drag past the edge stays on it.
 * @param {{ clientX: number, clientY: number }} e A pointer event.
 * @param {Element} element
 * @param {number} cols
 * @param {number} rows
 */
export function pointerCell(e, element, cols, rows) {
  const r = element.getBoundingClientRect();
  return {
    x: clamp(Math.floor(((e.clientX - r.left) / r.width) * cols), 0, cols - 1),
    y: clamp(Math.floor(((e.clientY - r.top) / r.height) * rows), 0, rows - 1),
  };
}

/**
 * Strokes a one-pixel dashed outline just inside a rectangle, in canvas
 * pixels. With `backColor`, a second dash pattern fills the gaps, so the
 * outline shows up on any picture.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} color
 * @param {string | null} [backColor]
 */
export function dashedRect(ctx, x, y, width, height, color, backColor = null) {
  const rect = /** @type {const} */ ([x + 0.5, y + 0.5, width - 1, height - 1]);
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

/**
 * Sizes a canvas's backing store to its on-screen size at the screen's pixel
 * density, then returns its context, cleared and scaled so drawing is in CSS
 * pixels, with that size.
 * @param {HTMLCanvasElement} canvas
 */
export function sizedContext(canvas) {
  const dpr = devicePixelRatio || 1,
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}
