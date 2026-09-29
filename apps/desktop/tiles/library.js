// The tileset and object libraries: new, import, duplicate, delete, rename
// and choose; the color mode and page; objects saved from the drawing area;
// and importing artwork.
import { $ } from '../dom.js';
import { canAdd, copyAsset, newId, removeAt } from '../domain/assets.js';
import { canRename, FILE_NAME, freshName, nameTaken, uniqueName } from '../domain/names.js';
import { freshObjectName, newTileset } from '../domain/tilesets.js';
import { ProjectHistory } from '../history.js';
import { openTilesetImageImport } from '../image-import-ui.js';
import { activeConfig, internPalette, resolveActiveConfig, shapes, tilesets } from '../state.js';
import { setStatus } from '../status.js';
import { studioAction } from '../studio-core.js';
import { StudioShell } from '../studio-shell.js';
import { asset, mutate, tl } from './model.js';

/** Opens tileset `i` at its first tile. */
export function selectBank(i) {
  tl.pixelSelection = null;
  tl.pasteAnchor = null;
  tl.index = i;
  tl.plane = 0;
  tl.objectIndex = -1;
  tl.targetTile = 0;
  tl.hovering = false;
  tl.selection = { x: 0, y: 0, width: 1, height: 1 };
  tl.render();
}
/** Renames tileset `i`; false (with a hint) when the name is taken or not a filename. */
export function renameBank(i, name) {
  if (!canRename(tilesets, i, name, FILE_NAME)) {
    setStatus('Use a unique filename: letters, digits, underscore or hyphen.');
    return false;
  }
  mutate('Rename a tileset', () => (tilesets[i].name = name));
  return true;
}
/** Renames object `i`; false (with a hint) when the name is taken. */
export function renameObject(i, name) {
  if (!name || nameTaken(asset().compositions, name, i)) {
    setStatus('Use a unique object name.');
    return false;
  }
  mutate('Rename an object', () => (asset().compositions[i].name = name));
  return true;
}
/** Picks object `i`'s tiles as the drawing area. */
export function selectObject(i) {
  tl.pixelSelection = null;
  tl.pasteAnchor = null;
  tl.objectIndex = i;
  const c = asset().compositions[i];
  tl.selection = { x: c.x, y: c.y, width: c.width, height: c.height };
  tl.render();
}

/** The tileset list, made by libraryActions. */
let tilesetList;
/** Draws the tileset list. */
export function renderTilesetList() {
  tilesetList.render();
}
/** Opens the tileset just added at the end of the list, on its first tile. */
function openNewTileset() {
  tl.index = tilesets.length - 1;
  tl.objectIndex = -1;
  tl.targetTile = 0;
  tl.palette = 0;
}

/** Wires the library, color mode, page, history and object buttons. */
export function libraryActions() {
  tilesetList = StudioShell.assetLibrary({
    noun: 'tileset',
    plural: 'tilesets',
    list: $('bankFiles'),
    items: () => tilesets,
    index: () => tl.index,
    choose: selectBank,
    rename: renameBank,
    render: () => tl.render(),
    // The empty editor's New button is made later, by the layout, and clicks
    // addBankFile.
    buttons: { create: 'addBankFile', duplicate: 'copyBankFile', remove: 'deleteBankFile' },
    create: (label) =>
      mutate(label, () => {
        tilesets.push(newTileset(newId(), freshName(tilesets, 'Tileset')));
        openNewTileset();
      }),
    copy: (t, label) =>
      mutate(label, () => {
        tilesets.push(copyAsset(t, freshName(tilesets, 'Tileset')));
        openNewTileset();
      }),
    deleted: (t) => `Deleted ${t.name} and its objects. Ctrl/Cmd+Z brings it back.`,
    remove: (t, label) =>
      mutate(label, () => {
        tl.index = removeAt(tilesets, tl.index);
        tl.objectIndex = -1;
        tl.targetTile = 0;
      }),
  });
  $('importBankFile').onclick = () =>
    studioAction(async () => {
      if (!canAdd(tilesets)) {
        setStatus('A project holds at most 255 tilesets.');
        return;
      }
      const imported = await window.studio.importTileset();
      if (!imported) return;
      let name = imported.name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
      if (!/^[A-Za-z]/.test(name)) name = 'Tileset_' + name;
      const unique = uniqueName(tilesets, name);
      mutate('Import a tileset', () => {
        tilesets.push({
          id: newId(),
          name: unique,
          bpp: imported.bpp,
          chr: imported.chr,
          tilePaletteBanks: Array(256).fill(0),
          compositions: [],
        });
        openNewTileset();
      });
      setStatus(
        'Imported CHR data as a tileset. Assign it to a CHR bank later, when building the game.',
      );
    });
  $('bankFileMode').onchange = () =>
    mutate('Change the color mode', () => {
      asset().bpp = Number($('bankFileMode').value);
      tl.ink = 1;
    });
  // The plane is which of a 1bpp tileset's three pages is on screen, not a
  // property of the tileset, so switching it is not a project edit.
  $('bankFilePlane').onchange = () => {
    tl.plane = Number($('bankFilePlane').value);
    tl.render();
  };
  $('bankUndo').onclick = ProjectHistory.undo;
  $('bankRedo').onclick = ProjectHistory.redo;
  $('saveComposition').onclick = () => {
    const name = freshObjectName(asset());
    mutate('New object', () => {
      asset().compositions.push({ name, ...tl.selection });
      tl.objectIndex = asset().compositions.length - 1;
    });
    StudioShell.startRename(
      $('compositionList'),
      tl.objectIndex,
      name,
      renameObject,
      tl.render,
      64,
    );
  };
  $('deleteComposition').onclick = () => {
    if (tl.objectIndex < 0) return;
    setStatus(
      `Deleted ${asset().compositions[tl.objectIndex].name}; its pixels are kept. Ctrl/Cmd+Z brings it back.`,
    );
    mutate('Delete an object', () => {
      asset().compositions.splice(tl.objectIndex, 1);
      tl.objectIndex = -1;
    });
  };
}

/** Adds Import image… above the tile map. */
export function importImageButton() {
  const importArtwork = document.createElement('button');
  importArtwork.id = 'importBankImage';
  importArtwork.textContent = 'Import image…';
  importArtwork.title = 'Import PNG, BMP or GIF artwork into this tileset';
  $('bankMap').before(importArtwork);
  importArtwork.onclick = () =>
    studioAction(async () => {
      const target = asset();
      if (!target) return;
      // Banks a shape's sprites already name are protected: reassigning their colors
      // would recolor art elsewhere in the project.
      const protectedPalettes = new Set();
      for (const shape of shapes)
        if (shape.tilesetId === target.id)
          for (const sprite of shape.sprites) protectedPalettes.add(sprite.paletteBank);
      // Import reads and writes flattened palette RAM. Whatever it invents is
      // interned into the library and placed in the active config's banks.
      await openTilesetImageImport({
        tileset: { ...target, plane: tl.plane, palettes: resolveActiveConfig() },
        selection: { ...tl.selection },
        protectedPalettes,
        commit: (next, rect, createdObject) => {
          if (asset() !== target)
            throw Error('The destination tileset changed. Reopen image import.');
          mutate('Import an image', () => {
            const { palettes, plane: _plane, ...rest } = next;
            Object.assign(target, rest);
            const config = activeConfig(),
              before = resolveActiveConfig();
            for (let bank = 0; bank < 16; bank++) {
              const colors = palettes.slice(bank * 8, bank * 8 + 8);
              if (colors.every((v, i) => v === before[bank * 8 + i])) continue;
              config.banks[bank] = internPalette(colors).id;
            }
            tl.selection = rect;
            tl.pixelSelection = null;
            tl.pasteAnchor = null;
            tl.objectIndex = createdObject ? target.compositions.length - 1 : -1;
          });
          setStatus(
            'Imported image into ' + target.name + '. Undo restores pixels, palettes and Objects.',
          );
        },
      });
    });
}
