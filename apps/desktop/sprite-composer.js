// Shape authoring: one arrangement of sprites from a single tileset. Coordinates
// are pixels relative to the shape's origin; list order is OAM order.
//
// This file holds the shape library, the canvas size, rendering and wiring;
// its parts live in shape/: the shared model, the canvas view, the edits,
// pointer input, the placement ghost, the panels, the top bar and keys, and
// the rails.

import { MAX_CANVAS_HEIGHT, MAX_CANVAS_WIDTH } from './domain/shapes.js';
import { $ } from './dom.js';
import { ProjectHistory } from './history.js';
import {
  newProject,
  redrawAll,
  renderAnimations,
  restoreStudioProject,
  showView,
} from './lifecycle.js';
import { topBarControls, shapeKeys, shapeZoom } from './shape/controls.js';
import {
  copySprites,
  cutSprites,
  pasteSprites,
  removeSprites,
  resizeCanvas,
} from './shape/editing.js';
import { mountGhost } from './shape/ghost.js';
import {
  height,
  hideGhost,
  sc,
  setMode,
  shape,
  shapeTileset,
  source,
  spritesOf,
  width,
} from './shape/model.js';
import {
  originPresets,
  planePicker,
  renderPaletteDock,
  renderShapeList,
  shapeLibrary,
  renderTilesetPicker,
} from './shape/panels.js';
import { canvasPointer, tilePickerPointer } from './shape/pointer.js';
import { shapeRails } from './shape/rails.js';
import { draw, drawBank, fit } from './shape/view.js';
import { currentView, setShapeIndex, shapeIndex, shapes, tilesets } from './state.js';

import { StudioShell } from './studio-shell.js';

const host = $('spriteComposer');
// Built this early, before anything below wires up onclick handlers by id,
// since these buttons don't exist in the static template above.
const iconButton = (id, label, icon) => StudioShell.iconButton(id, label, icon);
for (const [id, label, icon] of [
  ['scNew', 'New shape', 'newItem'],
  ['scDuplicate', 'Duplicate shape', 'duplicate'],
  ['scDelete', 'Delete shape', 'delete'],
])
  $('scShapeActions').append(iconButton(id, label, icon));
// Undo/redo move into the left rail once it exists (see below); created here,
// ahead of the onclick wiring further down, since they don't exist in the
// static template above.
for (const [id, label, icon] of [
  ['scUndo', 'Undo (Ctrl/Cmd+Z)', 'undo'],
  ['scRedo', 'Redo (Ctrl/Cmd+Shift+Z)', 'redo'],
])
  host.append(iconButton(id, label, icon));
// Box select likewise moves into the left rail once it exists.
host.append(
  iconButton(
    'scBoxSelect',
    'Box select (S) — drag to select every sprite the box touches, even starting on one',
    'select',
  ),
);

// ===== rendering =====
/** Redraws the whole editor: the bars, panels, sprite list and canvas. */
function render() {
  host.hidden = currentView !== 'shapes';
  if (host.hidden) {
    hideGhost();
    return;
  }
  const a = shape();
  $('scGroupTitle').textContent = a?.name ?? 'No shapes';
  $('scEmpty').hidden = !!a;
  StudioShell.emptyEditor(host, !a);
  for (const el of [
    host.querySelector('.scTop'),
    host.querySelector('.scOrigin'),
    $('scViewport'),
    $('scPaletteDock'),
  ])
    el.hidden = !a;
  $('scEmptyMessage').textContent = tilesets.length
    ? 'No shapes yet. A shape arranges sprites from one tileset.'
    : 'Create a tileset first. A shape arranges sprites from one tileset.';
  $('scEmptyNew').hidden = !tilesets.length;
  $('scEmptyTileset').hidden = !!tilesets.length;
  if (sc.lastSprite !== a) {
    sc.selected = new Set();
    sc.lastSprite = a;
    sc.drag = null;
    sc.placing = false;
    hideGhost();
  }
  sc.selected = new Set([...sc.selected].filter((i) => i < spritesOf().length));
  renderShapeList();
  renderTilesetPicker();
  renderPaletteDock();
  $('scWidth').value = String(sc.units === 'pixels' ? width() : width() / 8);
  $('scHeight').value = String(sc.units === 'pixels' ? height() : height() / 8);
  $('scWidth').max = String(sc.units === 'pixels' ? MAX_CANVAS_WIDTH : 40);
  $('scHeight').max = String(sc.units === 'pixels' ? MAX_CANVAS_HEIGHT : 25);
  $('scWidth').step = $('scHeight').step = '1';
  sc.zoomControls?.sync();
  for (const id of ['scDelete', 'scDuplicate', 'scWidth', 'scHeight', 'scOriginTool'])
    $(id).disabled = !a;
  $('scPlace').disabled = !a || !shapeTileset();
  $('scPlace').classList.toggle('on', sc.placing);
  $('scOriginTool').classList.toggle('on', sc.originTool);
  $('scBoxSelect').disabled = !a;
  $('scBoxSelect').classList.toggle('on', sc.boxSelect);
  $('scMoveTool').classList.toggle(
    'on',
    !sc.placing && !sc.originTool && !sc.boxSelect && !sc.panMode,
  );
  $('scPanTool').classList.toggle('on', sc.panMode);
  $('scUndo').disabled = !ProjectHistory.canUndo();
  $('scRedo').disabled = !ProjectHistory.canRedo();
  $('scCopy').disabled = !sc.selected.size;
  $('scPaste').disabled = !a || !StudioShell.clipboard.has('sprites');
  for (const id of [
    'scFlipX',
    'scFlipY',
    'scRemove',
    'scBack',
    'scFront',
    'scMoveUp',
    'scMoveDown',
  ])
    $(id).disabled = !sc.selected.size;
  $('scParts').replaceChildren(
    ...spritesOf().map((p, i) => {
      const b = document.createElement('button');
      b.textContent = `#${i} · ${shapeTileset()?.name ?? 'No tileset'} / ${p.tile} (${p.x}, ${p.y})`;
      b.classList.toggle('on', sc.selected.has(i));
      b.classList.toggle('missing', !shapeTileset());
      b.onclick = (e) => {
        if (!e.shiftKey) sc.selected.clear();
        sc.selected.has(i) ? sc.selected.delete(i) : sc.selected.add(i);
        render();
      };
      return b;
    }),
  );
  StudioShell.renderList($('scObjectList'), source()?.compositions ?? [], {
    selected: (c) =>
      c.x === sc.sourceRect.x &&
      c.y === sc.sourceRect.y &&
      c.width === sc.sourceRect.width &&
      c.height === sc.sourceRect.height,
    choose: (c) => {
      sc.sourceRect = { x: c.x, y: c.y, width: c.width, height: c.height };
      setMode('place');
    },
    render,
  });
  drawBank();
  draw();
}
sc.render = render;

// ===== the parts =====
canvasPointer();
tilePickerPointer();
$('scPlace').onclick = () => setMode(sc.placing ? 'move' : 'place');
$('scOriginTool').onclick = () => setMode(sc.originTool ? 'move' : 'origin');
$('scBoxSelect').onclick = () => setMode(sc.boxSelect ? 'move' : 'box');
originPresets();

// ===== the shape library =====
shapeLibrary();
$('scEmptyTileset').onclick = () => showView('tiles');

// ===== the canvas size =====
$('scUnits').onchange = () => {
  sc.units = $('scUnits').value;
  render();
};
for (const id of ['scWidth', 'scHeight'])
  $(id).onchange = () => {
    const n = Number($(id).value) * (sc.units === 'tiles' ? 8 : 1);
    if (
      shape() &&
      Number.isInteger(n) &&
      (sc.units === 'pixels' || Number.isInteger(Number($(id).value))) &&
      n >= 1 &&
      n <= (id === 'scWidth' ? MAX_CANVAS_WIDTH : MAX_CANVAS_HEIGHT)
    ) {
      resizeCanvas(id === 'scWidth' ? n : width(), id === 'scHeight' ? n : height());
      fit();
    } else render();
  };

// ===== the sprites, history and controls =====
$('scRemove').onclick = removeSprites;
StudioShell.editActions('shapes', { copy: copySprites, cut: cutSprites, paste: pasteSprites });
$('scUndo').onclick = ProjectHistory.undo;
$('scRedo').onclick = ProjectHistory.redo;
document.addEventListener('studiohistory', () => {
  setShapeIndex(Math.max(0, Math.min(shapeIndex, shapes.length - 1)));
});
shapeZoom();
topBarControls();
shapeKeys();
shapeRails();

// ===== wiring =====
restoreStudioProject.before(() => {
  sc.selected.clear();
  sc.placing = false;
  sc.originTool = false;
});
newProject.before(() => {
  sc.selected.clear();
  sc.placing = false;
  sc.originTool = false;
});
renderAnimations.after(() => {
  render();
});
showView.after((v) => {
  render();
  if (v === 'shapes') fit();
});
redrawAll.after(() => {
  render();
});
planePicker();
mountGhost();
StudioShell.viewStatus('shapes', $('scStatus'));
new ResizeObserver(() => draw()).observe($('scViewport'));
render();
