// The shape canvas: drawing tiles, the tile picker's map, the camera that maps
// shape pixels to the screen, and the canvas with its origin, selection and
// status line, plus the Preview panel's miniature.
import { MAX_SPRITES } from '../domain/shapes.js';
import { $ } from '../dom.js';
import { placedPixel } from '../domain/tilesets.js';
import { bankColor, css565 } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import {
  bounds,
  height,
  ox,
  oy,
  sc,
  shape,
  shapeTileset,
  source,
  spritesOf,
  width,
} from './model.js';

const host = $('shapeEditor');
export const canvas = $('scCanvas');

/**
 * Draws sprite `p` (its tile, flips and palette bank) from `tileset` at
 * (x, y), `scale` screen pixels per tile pixel; a missing tileset draws a red
 * crossed box. A 1bpp tileset's three pages are independent; sprites read
 * whichever plane CHRPLANE selects at runtime — sc.plane is Studio's preview
 * choice.
 */
export function tile(ctx, tileset, p, x, y, scale) {
  if (!tileset) {
    ctx.strokeStyle = '#f66';
    ctx.strokeRect(x, y, 8 * scale, 8 * scale);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 8 * scale, y + 8 * scale);
    ctx.stroke();
    return;
  }
  for (let py = 0; py < 8; py++)
    for (let px = 0; px < 8; px++) {
      const v = placedPixel(tileset, p, px, py, sc.plane);
      if (v) {
        ctx.fillStyle = css565(bankColor(p.paletteBank, v));
        ctx.fillRect(x + px * scale, y + py * scale, scale, scale);
      }
    }
}
/** Draws the tile picker: the tileset's 256 tiles with the picked ones outlined. */
export function drawBank() {
  const b = source(),
    c = $('scBankMap'),
    ctx = c.getContext('2d');
  ctx.fillStyle = '#252830';
  ctx.fillRect(0, 0, 256, 256);
  if (!b) return;
  for (let t = 0; t < 256; t++)
    tile(
      ctx,
      b,
      { tile: t, paletteBank: b.tilePaletteBanks[t] },
      (t % 16) * 16,
      Math.floor(t / 16) * 16,
      2,
    );
  ctx.strokeStyle = '#ffffff20';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let n = 0; n <= 16; n++) {
    ctx.moveTo(n * 16, 0);
    ctx.lineTo(n * 16, 256);
    ctx.moveTo(0, n * 16);
    ctx.lineTo(256, n * 16);
  }
  ctx.stroke();
  ctx.strokeStyle = '#36c9d6';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    sc.sourceRect.x * 16 + 1,
    sc.sourceRect.y * 16 + 1,
    sc.sourceRect.width * 16 - 2,
    sc.sourceRect.height * 16 - 2,
  );
}

/** The canvas's size on screen. */
export function viewport() {
  return { w: canvas.clientWidth || 500, h: canvas.clientHeight || 400 };
}
/** Where shape pixel (x, y) lands on the canvas. */
export function screen(x, y) {
  const { w, h } = viewport();
  return [(x - sc.camera.x) * sc.zoom + w / 2, (y - sc.camera.y) * sc.zoom + h / 2];
}
/** The shape pixel under a pointer event. */
export function world(e) {
  const r = canvas.getBoundingClientRect(),
    { w, h } = viewport();
  return {
    x: Math.floor((e.clientX - r.left - w / 2) / sc.zoom + sc.camera.x),
    y: Math.floor((e.clientY - r.top - h / 2) / sc.zoom + sc.camera.y),
  };
}
/** Draws the canvas, the status line and the Preview panel. */
export function draw() {
  if (host.hidden) return;
  canvas.style.cursor = sc.placing
    ? 'copy'
    : sc.originTool || sc.boxSelect
      ? 'crosshair'
      : sc.drag?.kind === 'pan'
        ? 'grabbing'
        : sc.panMode
          ? 'grab'
          : 'default';
  const { w, h } = viewport();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const a = shape();
  if (!a) {
    $('scStatus').textContent = '';
    return;
  }
  const [left, top] = screen(0, 0);
  ctx.save();
  ctx.shadowColor = '#0008';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = $('scBackground').value;
  ctx.fillRect(left, top, width() * sc.zoom, height() * sc.zoom);
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width() * sc.zoom, height() * sc.zoom);
  ctx.clip();
  if ($('scGrid').checked && sc.zoom >= 2) {
    ctx.strokeStyle = '#ffffff16';
    ctx.beginPath();
    for (
      let x = Math.floor((sc.camera.x - w / 2 / sc.zoom) / 8) * 8;
      x < sc.camera.x + w / 2 / sc.zoom;
      x += 8
    ) {
      const [sx] = screen(x, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
    }
    for (
      let y = Math.floor((sc.camera.y - h / 2 / sc.zoom) / 8) * 8;
      y < sc.camera.y + h / 2 / sc.zoom;
      y += 8
    ) {
      const [, sy] = screen(0, y);
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = '#ffffff60';
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(left, top, width() * sc.zoom, height() * sc.zoom);
  ctx.setLineDash([]);
  const preview = sc.drag?.kind === 'move' ? sc.drag.sprites : spritesOf();
  preview.forEach((p, i) => {
    const [x, y] = screen(p.x + ox(), p.y + oy());
    tile(ctx, shapeTileset(), p, x, y, sc.zoom);
    if (sc.selected.has(i)) {
      ctx.strokeStyle = '#36c9d6';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 0.5, y + 0.5, 8 * sc.zoom - 1, 8 * sc.zoom - 1);
    }
  });
  ctx.restore();
  ctx.strokeStyle = '#3a3f4a';
  ctx.strokeRect(left + 0.5, top + 0.5, width() * sc.zoom - 1, height() * sc.zoom - 1);
  ctx.fillStyle = '#36c9d6';
  ctx.fillRect(left + width() * sc.zoom - 5, top + height() * sc.zoom - 5, 10, 10);
  // Drawn after the clip is lifted, so a box that starts or ends outside the
  // canvas still shows — only its selection test, not its outline, cares about
  // where the tiles actually are.
  if (sc.drag?.kind === 'marquee') {
    const [x, y] = screen(sc.drag.start.x, sc.drag.start.y),
      [ex, ey] = screen(sc.drag.end.x, sc.drag.end.y);
    ctx.save();
    ctx.strokeStyle = '#36c9d6';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, ex - x - 1, ey - y - 1);
    ctx.restore();
  }
  const origin = sc.drag?.kind === 'origin' ? sc.drag.point : { x: ox(), y: oy() },
    [cx, cy] = screen(origin.x, origin.y);
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy);
  ctx.lineTo(cx + 11, cy);
  ctx.moveTo(cx, cy - 11);
  ctx.lineTo(cx, cy + 11);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffcb52';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffcb52';
  ctx.fillText('0,0', cx + 8, cy - 8);
  ctx.restore();

  const outside = spritesOf().filter(
    (p) =>
      p.x + ox() < 0 || p.y + oy() < 0 || p.x + ox() + 8 > width() || p.y + oy() + 8 > height(),
  ).length;
  const b = bounds();
  $('scStatus').textContent =
    `${width()} × ${height()} px · ${spritesOf().length}/${MAX_SPRITES} sprites · ${sc.selected.size} selected · Bounds ${b.width} × ${b.height} px at (${b.x}, ${b.y})` +
    (outside ? ` · ${outside} outside canvas` : '') +
    (sc.placing ? ' · Click to place tiles' : sc.originTool ? ' · Click to position origin' : '');
  $('scPreview').hidden = !sc.previewVisible;
  $('scMiniSize').textContent = width() + ' × ' + height() + ' pixels';
  if (!sc.previewVisible) return;
  const mini = $('scMini'),
    mc = mini.getContext('2d');
  mc.fillStyle = $('scBackground').value;
  mc.fillRect(0, 0, mini.width, mini.height);
  const scale = Math.min(4, 128 / width(), 96 / height());
  mc.save();
  mc.beginPath();
  mc.rect(8, 8, width() * scale, height() * scale);
  mc.clip();
  for (const p of preview)
    tile(mc, shapeTileset(), p, 8 + (p.x + ox()) * scale, 8 + (p.y + oy()) * scale, scale);
  mc.restore();
}
/** Centers the shape and zooms it to fill the canvas. */
export function fit() {
  if (!shape()) return;
  const { w, h } = viewport();
  sc.camera = { x: width() / 2, y: height() / 2 };
  sc.zoom = StudioShell.fitZoom(w - 64, h - 64, width(), height(), 0.25, 32);
  sc.render();
}
