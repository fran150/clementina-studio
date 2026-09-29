// Drawing the tile editor: the tile map, the drawing area at the working
// zoom, the shape tools' state, bank usage marks, the Preview, the pixel
// selection or paste being placed, and the status line.
// The whole tileset as a 16 × 16 map of tiles at 3×, with the tiles drawn
// against the palette bank being inspected and the picked area.
import { $ } from '../dom.js';
import { areaTile } from '../domain/tilesets.js';
import { bankPalette } from '../state.js';
import { setStatus } from '../status.js';
import { asset, pixelColor, tl } from './model.js';
import { applyPixels, clearPixels, withScratchLibrary } from './pixels.js';

export function drawTileMap(a) {
  const map = $('bankMap'),
    m = map.getContext('2d');
  for (let t = 0; t < 256; t++)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        m.fillStyle = pixelColor(a, t, x, y);
        m.fillRect(((t % 16) * 8 + x) * 3, (Math.floor(t / 16) * 8 + y) * 3, 3, 3);
      }
  m.strokeStyle = '#ffffff30';
  m.lineWidth = 1;
  for (let n = 0; n <= 16; n++) {
    m.beginPath();
    m.moveTo(n * 24, 0);
    m.lineTo(n * 24, 384);
    m.moveTo(0, n * 24);
    m.lineTo(384, n * 24);
    m.stroke();
  }
  if (tl.usagePalette !== null)
    for (let t = 0; t < 256; t++)
      if (a.tilePaletteBanks[t] === tl.usagePalette) {
        m.fillStyle = '#36c9d650';
        m.fillRect((t % 16) * 24, Math.floor(t / 16) * 24, 24, 24);
        m.strokeStyle = '#fff';
        m.strokeRect((t % 16) * 24 + 0.5, Math.floor(t / 16) * 24 + 0.5, 23, 23);
      }
  m.strokeStyle = '#36c9d6';
  m.lineWidth = 3;
  m.strokeRect(
    tl.selection.x * 24 + 1.5,
    tl.selection.y * 24 + 1.5,
    tl.selection.width * 24 - 3,
    tl.selection.height * 24 - 3,
  );
}
// The picked area at the working zoom, with pixel and tile grids.
export function drawSelection(a) {
  const canvas = $('bankSelection'),
    scale = tl.zoom;
  canvas.width = tl.selection.width * 8 * scale;
  canvas.height = tl.selection.height * 8 * scale;
  const c = canvas.getContext('2d');
  for (let cy = 0; cy < tl.selection.height; cy++)
    for (let cx = 0; cx < tl.selection.width; cx++) {
      const t = (tl.selection.y + cy) * 16 + tl.selection.x + cx;
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          c.fillStyle = pixelColor(a, t, x, y);
          c.fillRect((cx * 8 + x) * scale, (cy * 8 + y) * scale, scale, scale);
        }
    }
  // Past 16x a solid fill no longer shows where one pixel ends and the next begins.
  if (scale >= 16) {
    c.strokeStyle = '#ffffff30';
    c.lineWidth = 1;
    c.beginPath();
    for (let px = 1; px < tl.selection.width * 8; px++) {
      c.moveTo(px * scale + 0.5, 0);
      c.lineTo(px * scale + 0.5, tl.selection.height * 8 * scale);
    }
    for (let py = 1; py < tl.selection.height * 8; py++) {
      c.moveTo(0, py * scale + 0.5);
      c.lineTo(tl.selection.width * 8 * scale, py * scale + 0.5);
    }
    c.stroke();
  }
  if ($('cellGrid').checked)
    for (let cy = 0; cy < tl.selection.height; cy++)
      for (let cx = 0; cx < tl.selection.width; cx++) {
        c.strokeStyle = '#36c9d680';
        c.strokeRect(cx * 8 * scale + 0.5, cy * 8 * scale + 0.5, 8 * scale - 1, 8 * scale - 1);
      }
}
// The fill patterns and the filled-shape toggle follow the current tool.
export function syncShapeTools() {
  for (const id of ['line', 'rectangle', 'ellipse'])
    $(id + 'Tool').classList.toggle('on', tl.tool === id);
  for (const name of ['solid', 'checker', 'stripes']) {
    const b = $('fillPattern_' + name);
    if (b) {
      b.disabled = !(
        tl.tool === 'fill' ||
        (['rectangle', 'ellipse'].includes(tl.tool) && $('filledShapes').checked)
      );
      b.classList.toggle('on', tl.fillPattern === name);
      b.setAttribute('aria-pressed', String(tl.fillPattern === name));
    }
  }
  if ($('filledShapeToggle')) {
    $('filledShapeToggle').disabled = !['rectangle', 'ellipse'].includes(tl.tool);
    $('filledShapeToggle').classList.toggle('on', $('filledShapes').checked);
    $('filledShapeToggle').setAttribute('aria-pressed', String($('filledShapes').checked));
  }
}
/** Marks the drawing area's tiles drawn against the hovered bank. */
export function drawUsageOverlay() {
  const a = asset();
  if (!a || tl.usagePalette === null) return;
  const ctx = $('bankSelection').getContext('2d');
  ctx.lineWidth = 2;
  for (let y = 0; y < tl.selection.height; y++)
    for (let x = 0; x < tl.selection.width; x++)
      if (a.tilePaletteBanks[(tl.selection.y + y) * 16 + tl.selection.x + x] === tl.usagePalette) {
        ctx.fillStyle = '#36c9d630';
        ctx.fillRect(x * 8 * tl.zoom, y * 8 * tl.zoom, 8 * tl.zoom, 8 * tl.zoom);
        ctx.strokeStyle = '#36c9d6';
        ctx.strokeRect(x * 8 * tl.zoom + 1, y * 8 * tl.zoom + 1, 8 * tl.zoom - 2, 8 * tl.zoom - 2);
      }
}
/** Draws the Preview panel's miniature of the drawing area. */
export function drawMiniature() {
  if (!tl.miniVisible || !asset()) return;
  const canvas = $('miniatureCanvas'),
    w = tl.selection.width * 8,
    h = tl.selection.height * 8;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = pixelColor(asset(), areaTile(tl.selection, x, y), x % 8, y % 8);
      ctx.fillRect(x, y, 1, 1);
    }
  const factor = Math.min(4, 180 / Math.max(w, h));
  canvas.style.width = w * factor + 'px';
  canvas.style.height = h * factor + 'px';
  $('miniatureSize').textContent = w + ' × ' + h + ' pixels';
}
/** Draws a paste or move in progress, and the selection's outline and handles. */
export function drawPixelOverlay() {
  if (!asset()) return;
  const ctx = $('bankSelection').getContext('2d');
  if ((tl.pasteAnchor && tl.pixelClipboard) || tl.moveDrag)
    withScratchLibrary(() => {
      const preview = structuredClone(asset());
      if (tl.moveDrag) {
        clearPixels(preview, tl.moveDrag.rect);
        applyPixels(preview, tl.moveDrag.clip, tl.moveDrag.at, false, false);
      } else
        try {
          applyPixels(
            preview,
            tl.pixelClipboard,
            tl.pasteAnchor,
            $('pasteOpaque').checked,
            $('pasteSource').checked,
          );
        } catch (e) {
          setStatus(e.message);
        }
      for (let y = 0; y < tl.selection.height * 8; y++)
        for (let x = 0; x < tl.selection.width * 8; x++) {
          ctx.fillStyle = pixelColor(preview, areaTile(tl.selection, x, y), x % 8, y % 8);
          ctx.fillRect(x * tl.zoom, y * tl.zoom, tl.zoom, tl.zoom);
        }
    });
  const rect = tl.moveDrag
    ? { ...tl.moveDrag.rect, x: tl.moveDrag.at[0], y: tl.moveDrag.at[1] }
    : tl.pasteAnchor && tl.pixelClipboard
      ? {
          x: tl.pasteAnchor[0],
          y: tl.pasteAnchor[1],
          width: tl.pixelClipboard.width,
          height: tl.pixelClipboard.height,
        }
      : tl.pixelSelection;
  if (rect) {
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      rect.x * tl.zoom + 0.5,
      rect.y * tl.zoom + 0.5,
      rect.width * tl.zoom - 1,
      rect.height * tl.zoom - 1,
    );
    ctx.lineDashOffset = 4;
    ctx.strokeStyle = '#111';
    ctx.strokeRect(
      rect.x * tl.zoom + 0.5,
      rect.y * tl.zoom + 0.5,
      rect.width * tl.zoom - 1,
      rect.height * tl.zoom - 1,
    );
    ctx.restore();
    if (!tl.pasteAnchor && !tl.moveDrag && tl.tool === 'select') {
      for (const [x, y] of [
        [rect.x, rect.y],
        [rect.x + rect.width, rect.y],
        [rect.x, rect.y + rect.height],
        [rect.x + rect.width, rect.y + rect.height],
      ]) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x * tl.zoom - 3, y * tl.zoom - 3, 6, 6);
      }
    }
  }
}
/** Shows the hovered pixel and tile, the selection and the canvas size. */
export function updateStatus() {
  if (!$('drawingStatus')) return;
  const r = tl.pixelSelection,
    info = [];
  if (tl.usagePalette !== null && asset()) {
    const tiles = asset().tilePaletteBanks.filter((b) => b === tl.usagePalette).length;
    info.push(
      `Bank ${String(tl.usagePalette).padStart(2, '0')} · ${bankPalette(tl.usagePalette)?.name ?? 'empty'} · ${tiles} tile${tiles === 1 ? '' : 's'}`,
    );
  }
  if (tl.hovering && asset())
    info.push(
      `Pixel ${tl.lastPixel[0]}, ${tl.lastPixel[1]}`,
      `Tile ${tl.targetTile}`,
      `Palette ${asset().tilePaletteBanks[tl.targetTile]}`,
    );
  if (r) info.push(`Selection ${r.width} × ${r.height}`);
  info.push(`Canvas ${tl.selection.width * 8} × ${tl.selection.height * 8} px`);
  $('drawingStatus').textContent = info.join(' · ');
}
