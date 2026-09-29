// The grid editors' tile picker: the primary and alternate tileset lists, a
// 1bpp tileset's page pickers, the 16 × 16 map of the picked tileset's tiles
// and its saved Objects. Picking a tile, or dragging out a group, sets what
// the next paint lays down.
import { TILES_PER_ROW } from '../domain/cells.js';
import { bankColor, css565, tilePixel, tilesets } from '../state.js';
import { StudioShell } from '../studio-shell.js';

/** A single tile at the top left of the picker. */
export const SINGLE_TILE = Object.freeze({ col: 0, row: 0, width: 1, height: 1 });

/**
 * Wires up the tile picker of one grid editor.
 *
 * @param {any} ed The editor's shared state and helpers (see grid-editor.js).
 */
export function tilePicker(ed) {
  const { el, tileMap, transparentZero } = ed;
  // Where a drag on the picker started, in tile coordinates.
  let pickAnchor = null;

  // The two tileset lists, and the page pickers a 1bpp tileset adds.
  function renderTilesetAssignment() {
    const a = ed.asset();
    for (const [listId, field] of [
      ['PrimaryList', 'tilesetId'],
      ['AltList', 'altTilesetId'],
    ]) {
      StudioShell.renderOptions(el(listId), tilesets, {
        label: (t) => t.name,
        selected: (t) => !!a && t.id === a[field],
        choose: (t) => {
          if (!a || t.id === a[field]) return;
          ed.edit(
            field === 'tilesetId' ? 'Change the primary tileset' : 'Change the alternate tileset',
            () => {
              a[field] = t.id;
            },
          );
        },
      });
    }
    el('PrimaryPlaneLabel').hidden = ed.primaryTileset()?.bpp !== 1;
    el('PrimaryPlane').value = String(ed.primaryPlane);
    el('AltPlaneLabel').hidden = ed.altTileset()?.bpp !== 1;
    el('AltPlane').value = String(ed.altPlane);
  }
  el('PrimaryPlane').onchange = () => {
    ed.primaryPlane = Number(el('PrimaryPlane').value);
    ed.paintCanvas();
    drawTileMap();
  };
  el('AltPlane').onchange = () => {
    ed.altPlane = Number(el('AltPlane').value);
    ed.paintCanvas();
    drawTileMap();
  };

  // Draws all 256 tiles of the picked tileset at 2× in a 16×16 grid, each in
  // its authored bank, and outlines the picked region.
  function drawTileMap() {
    const source = ed.pickingTileset(),
      ctx = tileMap.getContext('2d');
    ctx.fillStyle = '#252830';
    ctx.fillRect(0, 0, 256, 256);
    if (source)
      for (let t = 0; t < 256; t++) {
        const bank = source.tilePaletteBanks[t];
        for (let y = 0; y < 8; y++)
          for (let x = 0; x < 8; x++) {
            // As on the canvas: color 0 is the bank's color unless it is
            // transparent in this layer.
            const ink = tilePixel(source, t, x, y, ed.pickAlt ? ed.altPlane : ed.primaryPlane);
            ctx.fillStyle = ink === 0 && transparentZero ? '#252830' : css565(bankColor(bank, ink));
            ctx.fillRect(((t % 16) * 8 + x) * 2, (Math.floor(t / 16) * 8 + y) * 2, 2, 2);
          }
      }
    ctx.strokeStyle = '#ffffff30';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let n = 0; n <= 16; n++) {
      ctx.moveTo(n * 16, 0);
      ctx.lineTo(n * 16, 256);
      ctx.moveTo(0, n * 16);
      ctx.lineTo(256, n * 16);
    }
    ctx.stroke();
    const region = ed.pickRegion;
    if (source && ed.stamp.chrAlt === ed.pickAlt) {
      ctx.strokeStyle = '#36c9d6';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        region.col * 16 + 1,
        region.row * 16 + 1,
        region.width * 16 - 2,
        region.height * 16 - 2,
      );
    }
  }
  // The tile under the pointer on the picker, clamped to its 16×16 grid.
  function tileMapCell(e) {
    const r = tileMap.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(15, Math.floor(((e.clientX - r.left) / r.width) * 16))),
      y: Math.max(0, Math.min(15, Math.floor(((e.clientY - r.top) / r.height) * 16))),
    };
  }
  // Makes a region of the picked tileset the stamp: its top-left tile, in
  // that tile's authored bank.
  function pick(region) {
    const source = ed.pickingTileset();
    ed.pickRegion = region;
    const tile = region.row * TILES_PER_ROW + region.col;
    ed.stamp = {
      ...ed.stamp,
      tile,
      paletteBank: source.tilePaletteBanks[tile],
      chrAlt: ed.pickAlt,
    };
    ed.stampTool();
    ed.render();
  }
  // Dragging on the tile picker picks a rectangular group, the same way the
  // tileset editor's own tile map does; a plain click is a 1×1 drag.
  function selectPickRegion(x, y) {
    if (!ed.pickingTileset() || !pickAnchor) return;
    pick({
      col: Math.min(pickAnchor.x, x),
      row: Math.min(pickAnchor.y, y),
      width: Math.abs(x - pickAnchor.x) + 1,
      height: Math.abs(y - pickAnchor.y) + 1,
    });
  }
  tileMap.onpointerdown = (e) => {
    if (!ed.pickingTileset()) return;
    pickAnchor = tileMapCell(e);
    tileMap.setPointerCapture(e.pointerId);
    selectPickRegion(pickAnchor.x, pickAnchor.y);
  };
  tileMap.onpointermove = (e) => {
    if (pickAnchor) {
      const { x, y } = tileMapCell(e);
      selectPickRegion(x, y);
    }
  };
  tileMap.onpointerup = tileMap.onpointercancel = () => (pickAnchor = null);
  el('PickSlot').onchange = () => {
    ed.pickAlt = el('PickSlot').value === 'alt';
    ed.pickRegion = { ...SINGLE_TILE };
    ed.render();
  };
  // Objects are managed in the tileset editor; here they are a shortcut to
  // pick a saved region as a group.
  function renderObjectList() {
    const objects = ed.pickingTileset()?.compositions ?? [];
    StudioShell.renderList(el('ObjectList'), objects, {
      selected: (o) =>
        o.x === ed.pickRegion.col &&
        o.y === ed.pickRegion.row &&
        o.width === ed.pickRegion.width &&
        o.height === ed.pickRegion.height,
      choose: (o) => pick({ col: o.x, row: o.y, width: o.width, height: o.height }),
      render: ed.render,
    });
  }

  return { renderTilesetAssignment, drawTileMap, renderObjectList };
}
