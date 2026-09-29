// Tileset authoring. A tileset is one CHR bank's worth of graphics; its per-tile
// palette bank numbers are authoring intent, recorded alongside the pixels.
//
// This file holds rendering and wiring; its parts live in tiles/: the
// shared model, drawing, the palette dock, pixel selections, pointer input,
// the libraries, zoom and keys, and the layout.
import { $ } from './dom.js';
import { ProjectHistory } from './history.js';
import { redrawAll, renderBankEditor, showView } from './lifecycle.js';
import { currentView, inputTo565, setBankColor, tilesets } from './state.js';
import { StudioShell } from './studio-shell.js';
import { spacePan, tileKeys, tileZoom } from './tiles/controls.js';
import { colorClipboard, refreshPalettes } from './tiles/dock.js';
import { canvasPointer, tileMapPointer } from './tiles/drawing.js';
import {
  addSelectionTools,
  addShapeTools,
  buildLayout,
  buildMiniature,
  buildOptions,
  finishLayout,
  placePanels,
} from './tiles/layout.js';
import {
  importImageButton,
  libraryActions,
  renameObject,
  renderTilesetList,
  selectObject,
} from './tiles/library.js';
import { asset, backgroundRow, mutate, scroll, tl } from './tiles/model.js';
import { cutSelection, startPaste } from './tiles/pixels.js';
import {
  drawMiniature,
  drawPixelOverlay,
  drawSelection,
  drawTileMap,
  drawUsageOverlay,
  syncShapeTools,
  updateStatus,
} from './tiles/view.js';

const host = $('namedBankEditor');
for (const [id, label, icon] of [
  ['addBankFile', 'New tileset', 'newItem'],
  ['copyBankFile', 'Duplicate tileset', 'duplicate'],
  ['importBankFile', 'Import tileset…', 'import'],
  ['deleteBankFile', 'Delete tileset', 'delete'],
])
  $('bankFileActions').append(StudioShell.iconButton(id, label, icon));
placePanels();
// An undo replaces the tilesets array; that is not a newly opened project.
document.addEventListener('studiohistory', () => {
  tl.reference = tilesets;
  tl.index = Math.max(0, Math.min(tl.index, tilesets.length - 1));
});

// ===== rendering =====
/** Redraws the whole editor: libraries, bars, tools, the map, canvas and dock. */
function render() {
  host.hidden = currentView !== 'tiles';
  document.body.classList.toggle('drawingView', !host.hidden);
  if (host.hidden) {
    tl.hovering = false;
    return;
  }
  const list = tilesets;
  if (tl.reference !== list) {
    tl.pixelSelection = null;
    tl.pasteAnchor = null;
    tl.selectStart = null;
    tl.index = Math.min(tl.index, list.length - 1);
    tl.reference = list;
  }
  if (tl.index < 0) tl.index = 0;
  const a = asset();
  if (a && tl.objectIndex >= a.compositions.length) tl.objectIndex = -1;
  $('emptyBank').hidden = !!a;
  StudioShell.emptyEditor(host, !a);
  $('miniaturePanel').hidden = !a || !tl.miniVisible;
  for (const id of ['copyBankFile', 'deleteBankFile', 'saveComposition', 'importBankImage'])
    $(id).disabled = !a;
  $('deleteComposition').disabled = !a || tl.objectIndex < 0;
  if (!a) {
    if ($('drawingStatus')) $('drawingStatus').textContent = '';
    $('canvasStage').hidden = true;
    $('paletteDock').hidden = true;
    $('canvasTop').hidden = true;
    $('bankFiles').replaceChildren();
    $('compositionList').replaceChildren();
    return;
  }
  $('canvasStage').hidden = false;
  $('paletteDock').hidden = false;
  $('canvasTop').hidden = false;
  $('canvasAssetLabel').textContent =
    a.name + (tl.objectIndex >= 0 ? ' / ' + a.compositions[tl.objectIndex].name : '');
  renderTilesetList();

  $('bankFileMode').value = a.bpp;
  $('bankFilePlane').value = String(tl.plane);
  $('bankFilePlaneLabel').hidden = a.bpp !== 1;
  $('bankUndo').disabled = !ProjectHistory.canUndo();
  $('bankRedo').disabled = !ProjectHistory.canRedo();
  $('pencilTool').classList.toggle('on', tl.tool === 'pencil');
  $('eraserTool').classList.toggle('on', tl.tool === 'eraser');
  $('pickerTool').classList.toggle('on', tl.tool === 'picker');
  $('fillTool').classList.toggle('on', tl.tool === 'fill');
  tl.zoomControls?.sync();
  $('panTool').classList.toggle('on', tl.panToolActive);
  scroll.style.cursor = tl.panToolActive ? 'grab' : '';
  $('previewBackground').value = a.previewBackground ?? '#252830';
  $('zeroMode').value = tl.zeroAsColor ? 'background' : 'transparent';
  $('previewBackground').disabled = tl.zeroAsColor;
  backgroundRow.style.opacity = tl.zeroAsColor ? '.45' : '';
  $('bankSelectionInfo').textContent =
    `${tl.selection.width} × ${tl.selection.height} tiles · ${tl.selection.width * 8} × ${tl.selection.height * 8} pixels`;
  drawTileMap(a);
  drawSelection(a);
  refreshPalettes();
  StudioShell.renderList($('compositionList'), a.compositions, {
    selected: (c, i) => i === tl.objectIndex,
    choose: (c, i) => selectObject(i),
    rename: renameObject,
    render: tl.render,
    maxLength: 64,
    remove: (c, i) => {
      selectObject(i);
      $('deleteComposition').click();
    },
  });
  syncShapeTools();
  drawMiniature();
  drawPixelOverlay();
  drawUsageOverlay();
  updateStatus();
  for (const id of ['flipHorizontal', 'flipVertical', 'rotateSelection'])
    $(id).disabled = !tl.pixelSelection;
  $('selectionTool').classList.toggle('on', tl.tool === 'select');
  $('copyPixels').disabled = !tl.pixelSelection;
  $('pastePixels').disabled = !StudioShell.clipboard.has('pixels');
  $('clearPixels').disabled = !tl.pixelSelection;
  $('toolOptions').hidden = !['fill', 'rectangle', 'ellipse'].includes(tl.tool);
  // A tileset opens fitted to the window, like every canvas, and refits when
  // the area picked on the tile map changes size — not while it is being
  // dragged out. Zooming by hand holds until then. Measured last, once the
  // docks around the canvas have their final size.
  const area = a.id + ':' + tl.selection.width + '×' + tl.selection.height;
  if (!tl.anchor && area !== tl.fittedArea) {
    tl.fittedArea = area;
    const next = StudioShell.fitZoom(
      scroll.clientWidth - 48,
      scroll.clientHeight - 48,
      tl.selection.width * 8,
      tl.selection.height * 8,
      1,
      32,
    );
    if (next !== tl.zoom) {
      tl.zoom = next;
      render();
    }
  }
}
tl.render = render;
renderBankEditor.after(render);
// The palette library panel edits the same shared state, so it shares this history.
// Its second argument folds sprite groups into the snapshot when an edit repoints them.
export { mutate as graphicsEdit } from './tiles/model.js';
redrawAll.after(() => {
  render();
});
showView.after(() => {
  render();
});

// ===== the parts =====
tileMapPointer();
canvasPointer();
$('bankColor').onchange = () =>
  mutate('Change a color', () =>
    setBankColor(tl.colorEdit.bank, tl.colorEdit.ink, inputTo565($('bankColor').value)),
  );
$('previewBackground').onchange = () =>
  mutate(
    'Change the preview background',
    () => (asset().previewBackground = $('previewBackground').value),
  );
$('pencilTool').onclick = () => {
  tl.tool = 'pencil';
  render();
};
$('fillTool').onclick = () => {
  tl.tool = 'fill';
  render();
};
$('cellGrid').onchange = render;
libraryActions();
buildLayout();
tileKeys();
addShapeTools();
buildMiniature();
document.addEventListener('studioclipboard', () => {
  if (host.hidden) return;
  $('pastePixels').disabled = !StudioShell.clipboard.has('pixels');
  $('pasteColor').disabled = !StudioShell.clipboard.has('color') || tl.ink === 0;
});
StudioShell.editActions('tiles', {
  copy: () => (tl.clipboardArea === 'color' ? $('copyColor') : $('copyPixels')).click(),
  cut: () => cutSelection(),
  paste: () => {
    if (StudioShell.clipboard.has('color')) $('pasteColor').click();
    else startPaste();
  },
});
addSelectionTools();
colorClipboard();
buildOptions();
tileZoom();
spacePan();
finishLayout();
importImageButton();
render();
