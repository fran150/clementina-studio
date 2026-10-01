// The shape editor's panels: the shape list, the tileset picker (with the
// 1bpp page to preview), the palette bank dock, and the origin presets.
import { copyAsset, newId, removeAt } from '../domain/assets.js';
import { SYMBOL_NAME, canRename, freshName } from '../domain/names.js';
import { newShape } from '../domain/shapes.js';
import { $ } from '../dom.js';
import { renderAnimations } from '../lifecycle.js';
import {
  activeConfig,
  bankColor,
  bankPalette,
  css565,
  setFrameIndex,
  setShapeIndex,
  shapeIndex,
  shapes,
  tilesets,
} from '../state.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { setOrigin } from './editing.js';
import { edit, height, sc, shape, shapeTileset, spritesOf, width } from './model.js';
import { draw, drawBank, fit } from './view.js';

const host = $('shapeEditor');

// ===== the shape list =====
/** Opens shape `i` with the first tile picked, fitted to the canvas. */
function chooseShape(i) {
  setShapeIndex(i);
  sc.sourceRect = { x: 0, y: 0, width: 1, height: 1 };
  sc.plane = 0;
  renderAnimations();
  fit();
}
/** The shape list, made by shapeLibrary. */
let library;
/**
 * Wires the shape list's New, Duplicate and Delete buttons. A shape is
 * drawn from a tileset, so a new one takes the first tileset there is.
 */
export function shapeLibrary() {
  library = StudioShell.assetLibrary({
    noun: 'shape',
    plural: 'shapes',
    list: $('scSprites'),
    items: () => shapes,
    index: () => shapeIndex,
    choose: chooseShape,
    rename: renameShape,
    render: () => sc.render(),
    maxLength: 32,
    buttons: { create: 'scNew', duplicate: 'scDuplicate', remove: 'scDelete', empty: 'scEmptyNew' },
    create: (label) => {
      edit(label, () => {
        shapes.push(newShape(newId(), freshName(shapes, 'shape'), tilesets[0]?.id));
        setShapeIndex(shapes.length - 1);
        setFrameIndex(0);
      });
      fit();
    },
    copy: (s, label) =>
      edit(label, () => {
        shapes.push(copyAsset(s, freshName(shapes, 'shape')));
        setShapeIndex(shapes.length - 1);
      }),
    remove: (s, label) =>
      edit(label, () => {
        setShapeIndex(removeAt(shapes, shapeIndex));
      }),
  });
}
/** Lists the shapes, with rename, duplicate and delete on each row. */
export function renderShapeList() {
  library.render();
}
/** Renames shape `i`; false (with a hint) when the name is taken or not a symbol. */
function renameShape(i, name) {
  if (!canRename(shapes, i, name, SYMBOL_NAME)) {
    setStatus('Use a unique shape name: letters, digits and underscores, starting with a letter.');
    return false;
  }
  edit('Rename a shape', () => (shapes[i].name = name));
  return true;
}

// ===== the tileset =====
// Switching tileset repoints every sprite's tile index at whatever graphics sit
// at that index in the new tileset. Sprites carry no other reference to the
// tileset, so nothing needs migrating, and switching back restores this shape
// exactly — there is nothing to lock.
export function renderTilesetPicker() {
  const a = shape(),
    current = shapeTileset();
  StudioShell.renderOptions($('scBank'), tilesets, {
    label: (t) => t.name,
    selected: (t) => t.id === a?.tilesetId,
    choose: (t) => {
      if (!a || t.id === a.tilesetId) return;
      sc.plane = 0;
      edit('Change the tileset', () => {
        shape().tilesetId = t.id;
        sc.sourceRect = { x: 0, y: 0, width: 1, height: 1 };
      });
    },
  });
  $('scTilesetNote').textContent = !a
    ? 'Create a shape to choose its tileset.'
    : !tilesets.length
      ? 'Create a tileset first.'
      : spritesOf().length
        ? `Drawing from ${current?.name ?? 'a missing tileset'}. Switching repoints every sprite's tile at the new tileset — switch back and this shape looks right again.`
        : 'A shape draws from one tileset: Clementina has a single sprite CHR bank.';
  $('scPlaneLabel').hidden = current?.bpp !== 1;
  $('scPlane').value = String(sc.plane);
}
/** Redraws with the 1bpp page picked to preview. */
export function planePicker() {
  $('scPlane').onchange = () => {
    sc.plane = Number($('scPlane').value);
    drawBank();
    draw();
  };
}

// ===== the palette banks =====
// A tile's palette bank comes along for free when it is placed (see `place`),
// so the dock below just needs to show and let the user override it. Built
// from the same .paletteGroup markup the tileset editor uses for its own
// palette dock, so both pick up identical styling from its stylesheet with
// nothing duplicated here — only the click behavior differs (a whole bank
// rather than one ink, since a sprite has no ink of its own to pick).
// A bank click sets it on the selected sprites. The ring marks the bank the
// selection shares, the dot the banks the shape uses; color 0 shows as the
// transparent swatch, since sprites show what is behind it.
export function renderPaletteDock() {
  StudioShell.bankDock($('scPalettes'), (bank) =>
    edit(`Set bank ${bank}`, () => sc.selected.forEach((i) => (spritesOf()[i].paletteBank = bank))),
  );
  const picked = [...sc.selected].map((i) => spritesOf()[i]);
  const common =
    picked.length && picked.every((p) => p.paletteBank === picked[0].paletteBank)
      ? picked[0].paletteBank
      : null;
  StudioShell.syncBankDock($('scPalettes'), {
    color: (bank, ink) => css565(bankColor(bank, ink)),
    transparentZero: true,
    chosen: common,
    used: new Set(spritesOf().map((p) => p.paletteBank)),
    disabled: !picked.length,
    title: (bank) =>
      `Bank ${String(bank).padStart(2, '0')} · ${bankPalette(bank)?.name ?? 'empty in "' + (activeConfig()?.name ?? 'none') + '"'}` +
      (picked.length ? ' · Click to set this bank on the selected sprites' : ''),
  });
}

// ===== the origin presets =====
/** Wires the origin preset buttons (top-left, center, bottom-center) and draws their icons. */
export function originPresets() {
  host.querySelectorAll('[data-origin]').forEach(
    (b) =>
      (b.onclick = () => {
        if (!shape()) return;
        const w = width(),
          h = height();
        setOrigin(
          b.dataset.origin === 'top-left' ? 0 : Math.floor(w / 2),
          b.dataset.origin === 'top-left'
            ? 0
            : b.dataset.origin === 'center'
              ? Math.floor(h / 2)
              : h,
          b.dataset.origin,
        );
      }),
  );
  for (const button of host.querySelectorAll('[data-origin]')) {
    const preset = button.dataset.origin,
      x = preset === 'top-left' ? 5 : 12,
      y = preset === 'top-left' ? 5 : preset === 'bottom-center' ? 19 : 12,
      label = preset
        ? {
            'top-left': 'Origin at canvas top-left',
            center: 'Origin at canvas center',
            'bottom-center': 'Origin at canvas bottom-center',
          }[preset]
        : 'Place origin (or drag its crosshair)';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" opacity=".5"/><path d="M' +
      (x - 4) +
      ' ' +
      y +
      'h8M' +
      x +
      ' ' +
      (y - 4) +
      'v8"/></svg>';
  }
}
