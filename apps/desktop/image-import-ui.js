// Artwork import is staged in a modal: decoding, conversion and placement are previews until Apply.
import { $ } from './dom.js';
import { css565ToInput } from './domain/colors.js';
import { clamp, rectBetween } from './domain/geometry.js';
import { nameTaken, uniqueName } from './domain/names.js';
import { tilePixel } from './domain/tilesets.js';
import { StudioShell } from './studio-shell.js';
const dialog = $('bankImageDialog');
const el = (id) => document.getElementById(id);
let session = null,
  cropAnchor = null,
  sourceBox = null;
const value = (id) => Number(el(id).value);
const checker = (ctx) => {
  for (let y = 0; y < ctx.canvas.height; y += 12)
    for (let x = 0; x < ctx.canvas.width; x += 12) {
      ctx.fillStyle = ((x + y) / 12) % 2 ? '#252830' : '#353943';
      ctx.fillRect(x, y, 12, 12);
    }
};
function tilesetCanvas(tileset) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  checker(ctx);
  for (let t = 0; t < 256; t++)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const v = tilePixel(tileset, t, x, y, tileset.plane);
        if (v) {
          ctx.fillStyle = css565ToInput(tileset.palettes[tileset.tilePaletteBanks[t] * 8 + v]);
          ctx.fillRect((t % 16) * 8 + x, Math.floor(t / 16) * 8 + y, 1, 1);
        }
      }
  return canvas;
}
function options() {
  const crop = {
    x: value('iiCropX'),
    y: value('iiCropY'),
    width: value('iiCropW'),
    height: value('iiCropH'),
  };
  return {
    crop,
    width: el('iiResize').checked ? value('iiWidth') : crop.width,
    height: el('iiResize').checked ? value('iiHeight') : crop.height,
    tileX: value('iiTileX'),
    tileY: value('iiTileY'),
    paletteMode: el('iiPaletteMode').value,
    alphaCutoff: value('iiAlpha'),
    protectedPalettes: session.protectedPalettes,
  };
}
function drawSource(o) {
  const c = el('iiSource'),
    ctx = c.getContext('2d');
  checker(ctx);
  const factor = Math.min(c.width / session.image.width, c.height / session.image.height),
    w = session.image.width * factor,
    h = session.image.height * factor,
    x = (c.width - w) / 2,
    y = (c.height - h) / 2;
  sourceBox = { x, y, w, h, factor };
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(session.source, x, y, w, h);
  ctx.strokeStyle = '#36c9d6';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    x + o.crop.x * factor,
    y + o.crop.y * factor,
    o.crop.width * factor,
    o.crop.height * factor,
  );
}
function update() {
  if (!session) return;
  const o = options();
  el('iiWidth').disabled = el('iiHeight').disabled = !el('iiResize').checked;
  el('iiObjectName').disabled = !el('iiObject').checked;
  el('iiApply').disabled = true;
  el('iiError').textContent = '';
  session.result = null;
  drawSource(o);
  const original = tilesetCanvas(session.tileset),
    map = el('iiBank').getContext('2d');
  map.imageSmoothingEnabled = false;
  map.drawImage(original, 0, 0, 384, 384);
  const preview = el('iiConverted').getContext('2d');
  checker(preview);
  el('iiResultSize').textContent = '';
  el('iiSummary').textContent = '';
  el('iiOverwrite').textContent = '';
  try {
    const result = session.convert(session.tileset, session.image, o);
    session.result = result;
    const converted = tilesetCanvas(result.tileset);
    map.drawImage(converted, 0, 0, 384, 384);
    map.strokeStyle = '#ffffff25';
    map.lineWidth = 1;
    for (let n = 0; n <= 16; n++) {
      map.beginPath();
      map.moveTo(n * 24, 0);
      map.lineTo(n * 24, 384);
      map.moveTo(0, n * 24);
      map.lineTo(384, n * 24);
      map.stroke();
    }
    for (const t of result.overwrittenTiles) {
      map.strokeStyle = '#ffac3e';
      map.lineWidth = 2;
      map.strokeRect((t % 16) * 24 + 2, Math.floor(t / 16) * 24 + 2, 20, 20);
    }
    map.strokeStyle = '#36c9d6';
    map.lineWidth = 2;
    map.strokeRect(
      o.tileX * 24 + 1,
      o.tileY * 24 + 1,
      result.tilesWide * 24 - 2,
      result.tilesHigh * 24 - 2,
    );
    const w = result.tilesWide * 8,
      h = result.tilesHigh * 8,
      factor = Math.min(preview.canvas.width / w, preview.canvas.height / h, 12),
      dx = (preview.canvas.width - w * factor) / 2,
      dy = (preview.canvas.height - h * factor) / 2;
    preview.imageSmoothingEnabled = false;
    preview.drawImage(converted, o.tileX * 8, o.tileY * 8, w, h, dx, dy, w * factor, h * factor);
    el('iiResultSize').textContent =
      `${o.width} × ${o.height} pixels → ${result.tilesWide} × ${result.tilesHigh} tiles` +
      (o.width % 8 || o.height % 8 ? ' · edge tiles padded with color 0' : '');
    el('iiOverwrite').textContent =
      `${result.overwrittenTiles.length} nonempty tile(s) will be replaced (orange outlines).`;
    el('iiSummary').textContent =
      `RGB565 · ${session.tileset.bpp === 1 ? 1 : 7} visible colors per tile · ${result.createdPalettes.length} palettes created · ${result.remappedPixels} pixels approximated` +
      (result.limitedTiles
        ? ` · ${result.limitedTiles} tiles matched existing palettes because no free palette slots remain`
        : '');
    const name = el('iiObjectName').value.trim();
    if (el('iiObject').checked && (!name || nameTaken(session.tileset.compositions, name)))
      throw Error('Choose a nonempty, unique Object name.');
    el('iiApply').textContent = result.overwrittenTiles.length
      ? 'Import and replace tiles'
      : 'Import image';
    el('iiApply').disabled = false;
  } catch (error) {
    el('iiError').textContent = error.message;
  }
}
function close() {
  if (dialog.open) dialog.close();
}
el('iiClose').onclick = el('iiCancel').onclick = close;
dialog.onclose = () => {
  session = null;
  cropAnchor = null;
};
for (const input of dialog.querySelectorAll('input,select'))
  input.addEventListener('input', update);
el('iiFit').onclick = () => {
  if (!session) return;
  const w = value('iiCropW'),
    h = value('iiCropH'),
    factor = Math.min(1, ((16 - value('iiTileX')) * 8) / w, ((16 - value('iiTileY')) * 8) / h);
  el('iiResize').checked = true;
  el('iiWidth').value = String(Math.max(1, Math.floor(w * factor)));
  el('iiHeight').value = String(Math.max(1, Math.floor(h * factor)));
  update();
};
const sourcePoint = (e) => {
  const r = el('iiSource').getBoundingClientRect(),
    x = ((e.clientX - r.left) / r.width) * 300,
    y = ((e.clientY - r.top) / r.height) * 260;
  return {
    x: Math.max(
      0,
      Math.min(session.image.width - 1, Math.floor((x - sourceBox.x) / sourceBox.factor)),
    ),
    y: Math.max(
      0,
      Math.min(session.image.height - 1, Math.floor((y - sourceBox.y) / sourceBox.factor)),
    ),
  };
};
function cropTo(p) {
  const r = rectBetween(cropAnchor.x, cropAnchor.y, p.x, p.y);
  el('iiCropX').value = String(r.x);
  el('iiCropY').value = String(r.y);
  el('iiCropW').value = String(r.width);
  el('iiCropH').value = String(r.height);
  update();
}
el('iiSource').onpointerdown = (e) => {
  if (!session) return;
  e.preventDefault();
  cropAnchor = sourcePoint(e);
  el('iiSource').setPointerCapture(e.pointerId);
};
el('iiSource').onpointermove = (e) => {
  if (cropAnchor) cropTo(sourcePoint(e));
};
el('iiSource').onpointerup = (e) => {
  if (cropAnchor) cropTo(sourcePoint(e));
  cropAnchor = null;
};
el('iiSource').onpointercancel = () => (cropAnchor = null);
el('iiBank').onpointerdown = (e) => {
  if (!session) return;
  // The tile clicked becomes the image's top-left, kept where the whole image fits.
  const o = options(),
    cell = StudioShell.pointerCell(e, el('iiBank'), 16, 16);
  el('iiTileX').value = String(clamp(cell.x, 0, 16 - Math.ceil(o.width / 8)));
  el('iiTileY').value = String(clamp(cell.y, 0, 16 - Math.ceil(o.height / 8)));
  update();
};
el('iiApply').onclick = () => {
  if (!session) return;
  update();
  if (el('iiApply').disabled || !session.result) return;
  const o = options(),
    result = session.result,
    name = el('iiObjectName').value.trim();
  if (el('iiObject').checked)
    result.tileset.compositions.push({
      name,
      x: o.tileX,
      y: o.tileY,
      width: result.tilesWide,
      height: result.tilesHigh,
    });
  try {
    session.commit(
      result.tileset,
      { x: o.tileX, y: o.tileY, width: result.tilesWide, height: result.tilesHigh },
      el('iiObject').checked,
    );
    close();
  } catch (error) {
    el('iiError').textContent = error.message;
  }
};
export async function openTilesetImageImport({ tileset, selection, protectedPalettes, commit }) {
  if (dialog.open) return;
  const file = await window.studio.importImage();
  if (!file) return;
  const bitmap = await createImageBitmap(await (await fetch(file.dataUrl)).blob());
  if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 16777216) {
    bitmap.close();
    throw Error('Choose an image up to 8192 pixels per side and 16 megapixels.');
  }
  const source = document.createElement('canvas');
  source.width = bitmap.width;
  source.height = bitmap.height;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const image = {
    width: source.width,
    height: source.height,
    data: context.getImageData(0, 0, source.width, source.height).data,
  };
  // The page loads the built module; its types come from the source, which
  // type-checks without a build.
  const built = '../../dist/packages/assets/image-import.js';
  const { convertTilesetImage } =
    /** @type {typeof import('../../packages/assets/image-import.js')} */ (await import(built));
  session = {
    tileset: structuredClone(tileset),
    protectedPalettes: [...protectedPalettes],
    commit,
    image,
    source,
    convert: convertTilesetImage,
    result: null,
  };
  el('iiFilename').textContent = file.name;
  el('iiSourceSize').textContent =
    `${image.width} × ${image.height} pixels` + (file.format === 'gif' ? ' · first GIF frame' : '');
  const initial = {
    iiCropX: 0,
    iiCropY: 0,
    iiCropW: image.width,
    iiCropH: image.height,
    iiWidth: Math.min(128, image.width),
    iiHeight: Math.min(128, image.height),
    iiTileX: selection.x,
    iiTileY: selection.y,
    iiAlpha: 128,
  };
  for (const [id, v] of Object.entries(initial)) el(id).value = v;
  const stem =
    file.name
      .replace(/\.[^.]+$/, '')
      .trim()
      .slice(0, 56) || 'Imported';
  const name = uniqueName(tileset.compositions, stem);
  el('iiObjectName').value = name;
  el('iiObject').checked = true;
  el('iiResize').checked = false;
  el('iiPaletteMode').value = 'match';
  dialog.showModal();
  update();
}
