// Background authoring. A background is a free-sized canvas of cells, each
// naming a tile, a palette bank, flips, priority, and which of two tilesets it
// reads (CHR_ALT). The six hardware BGMODE viewport sizes are a preview aid
// here, not a canvas limit — see docs/model.md and specs/video.json.
//
// The camera preview, the loaded window and visible screen over the canvas,
// lives in grid/background-camera.js.
import { canAdd, clampIndex, copyAsset, newId, removeAt } from './domain/assets.js';
import { MAX_CELLS, clampDimension, newBackground, sizeFits } from './domain/backgrounds.js';
import { cropsContent, resizedCells } from './domain/cells.js';
import { FILE_NAME, canRename, freshName } from './domain/names.js';
import { $ } from './dom.js';
import { gridEditor } from './grid-editor.js';
import { backgroundCamera } from './grid/background-camera.js';
import { redrawAll, renderBackgrounds, showView } from './lifecycle.js';
import { backgrounds, currentView, tilesets } from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('backgroundEditor');

let backgroundIndex = 0;
const background = () => backgrounds[backgroundIndex];
// The loaded window and visible screen over the canvas.
const camera = backgroundCamera({ host, background, editor: () => editor, render: () => render() });
// Tools, tile picker, stamp, palette dock and rails: see grid-editor.js.
const editor = gridEditor({
  prefix: 'bg',
  view: 'backgrounds',
  host,
  historyKey: 'backgrounds',
  editLabel: 'Edit the background',
  railLabel: 'Background tools',
  asset: background,
  grid: background,
  render: () => render(),
  transparentZero: false,
  decorate: camera.decorate,
  busy: camera.busy,
});
const { selection, edit: bgEdit, primaryTileset, altTileset } = editor;
document.addEventListener('studiohistory', () => {
  backgroundIndex = clampIndex(backgrounds, backgroundIndex);
  selection.revalidate();
});

// Opens another background with the camera reset and a fresh pick.
function chooseBackground(i) {
  backgroundIndex = i;
  camera.reset();
  editor.resetPick();
  render();
}
function renameBackground(i, name) {
  if (!canRename(backgrounds, i, name, FILE_NAME)) {
    setStatus('Use a unique filename: letters, digits, underscore or hyphen.');
    return false;
  }
  bgEdit('Rename a background', () => (backgrounds[i].name = name));
  return true;
}
function renderBackgroundList() {
  StudioShell.renderList($('bgList'), backgrounds, {
    selected: (b, i) => i === backgroundIndex,
    choose: (b, i) => chooseBackground(i),
    rename: renameBackground,
    render,
    maxLength: 48,
    duplicate: (b, i) => {
      chooseBackground(i);
      $('bgDuplicateAction').click();
    },
    remove: (b, i) => {
      chooseBackground(i);
      $('bgDeleteAction').click();
    },
  });
}

function resizeBackground(newWidth, newHeight) {
  const a = background();
  if (!a) return;
  newWidth = clampDimension(newWidth);
  newHeight = clampDimension(newHeight);
  if (!sizeFits(newWidth, newHeight)) {
    setStatus(`That size holds too many cells — up to ${MAX_CELLS} total.`);
    render();
    return;
  }
  if (newWidth === a.width && newHeight === a.height) {
    render();
    return;
  }
  if (cropsContent(a, newWidth, newHeight))
    setStatus('Cropped the painted cells outside the new size. Ctrl/Cmd+Z brings them back.');
  selection.reset();
  bgEdit('Resize the background', () => {
    const cells = resizedCells(a, newWidth, newHeight);
    a.width = newWidth;
    a.height = newHeight;
    a.cells = cells;
  });
}
$('bgResize').onclick = () =>
  resizeBackground(Number($('bgWidth').value), Number($('bgHeight').value));

function render() {
  host.hidden = currentView !== 'backgrounds';
  document.body.classList.toggle('backgroundView', !host.hidden);
  if (host.hidden) {
    editor.clearHover();
    return;
  }
  backgroundIndex = Math.min(backgroundIndex, Math.max(0, backgrounds.length - 1));
  const a = background();
  $('bgEmpty').hidden = !!a;
  StudioShell.emptyEditor(host, !a);
  $('bgEmptyMessage').textContent = !tilesets.length
    ? 'Create a tileset first. A background draws from two tilesets.'
    : 'No backgrounds yet. A background draws from two tilesets.';
  $('bgEmptyNew').hidden = !tilesets.length;
  $('bgCreateTileset').hidden = !!tilesets.length;
  $('bgWork').hidden = !a;
  renderBackgroundList();
  if (!a) {
    $('bgStatus').textContent = '';
    return;
  }
  $('bgTitle').textContent = a.name;
  $('bgWidth').value = a.width;
  $('bgHeight').value = a.height;
  camera.syncMode();
  editor.renderControls();
  camera.renderOverlayToggle();
  editor.paintCanvas();
  camera.layout();
  editor.renderStamp();
  $('bgStatus').textContent =
    `${a.width} × ${a.height} tiles · ${a.cells.length} cells · primary ${primaryTileset()?.name ?? 'missing'} · alternate ${altTileset()?.name ?? 'missing'}`;
  editor.fitOnOpen();
}

$('bgCreateTileset').onclick = () => {
  showView('tiles');
};
$('bgEmptyNew').onclick = () => $('bgNewAction').click();
for (const [id, label, icon] of [
  ['bgNewAction', 'New background', 'newItem'],
  ['bgDuplicateAction', 'Duplicate background', 'duplicate'],
  ['bgDeleteAction', 'Delete background', 'delete'],
])
  $('bgActions').append(StudioShell.iconButton(id, label, icon));
$('bgNewAction').onclick = () => {
  if (!canAdd(backgrounds)) {
    setStatus('A project holds at most 255 backgrounds.');
    return;
  }
  if (!tilesets.length) {
    setStatus('Create a tileset first.');
    return;
  }
  bgEdit('New background', () => {
    backgrounds.push(newBackground(newId(), freshName(backgrounds, 'Background'), tilesets[0].id));
    backgroundIndex = backgrounds.length - 1;
    camera.reset();
    editor.resetPlanes();
  });
  setStatus('Created ' + background().name + '.');
};
$('bgDuplicateAction').onclick = () => {
  if (!background() || !canAdd(backgrounds)) return;
  bgEdit('Duplicate ' + background().name, () => {
    backgrounds.push(copyAsset(background(), freshName(backgrounds, 'Background')));
    backgroundIndex = backgrounds.length - 1;
  });
};
$('bgDeleteAction').onclick = () => {
  if (!background()) return;
  setStatus(`Deleted ${background().name}. Ctrl/Cmd+Z brings it back.`);
  bgEdit('Delete ' + background().name, () => {
    backgroundIndex = removeAt(backgrounds, backgroundIndex);
  });
};

// Left rail: the panels to pick from, then the tools. Right rail: the
// selection's panel, then the flips and priority that the next stamp — or
// an active selection — takes.
const library = host.querySelector('.bgLibrary'),
  tileLibrary = host.querySelector('.bgTileLibrary'),
  statusPanel = host.querySelector('.bgStatusPanel');
const panelToggle = (panel, id, label, icon, group, asset = false) => {
  const b = StudioShell.iconButton(id, label, icon);
  StudioShell.bindPanel({ panel, button: b, group, closeGroups: [group], asset });
  return b;
};
editor.buildRails({
  panels: [
    panelToggle(library, 'bgLibraryToggle', 'Backgrounds', 'background', 'bgLeft'),
    panelToggle(
      tileLibrary,
      'bgTileLibraryToggle',
      'Tilesets and tile picker',
      'tilePicker',
      'bgLeft',
      true,
    ),
  ],
  tools: [
    editor.toolButton(
      'Select (S) — drag over cells, then flip, set Priority or click a palette bank to edit them in place',
      'select',
      'select',
    ),
    editor.toolButton('Pencil (B)', 'pencil', 'pencil'),
    editor.toolButton('Eraser (E)', 'eraser', 'eraser'),
    editor.toolButton('Fill (G)', 'fill', 'fill'),
    editor.toolButton('Rectangle (R)', 'rectangle', 'rectangle'),
    editor.toolButton('Pick tile (I)', 'picker', 'picker'),
    editor.toolButton(
      'Pan (H) — drag the canvas to scroll it; Space or the middle button pan with any other tool active',
      'pan',
      'pan',
    ),
  ],
  sidePanels: [
    panelToggle(
      statusPanel,
      'bgStatusToggle',
      'Status — loaded window and screen position',
      'camera',
      'bgRight',
      true,
    ),
  ],
});
library.hidden = true;
tileLibrary.hidden = true;
statusPanel.hidden = true;
for (const id of ['bgLibraryToggle', 'bgTileLibraryToggle', 'bgStatusToggle'])
  $(id).setAttribute('aria-expanded', 'false');

StudioShell.viewStatus('backgrounds', $('bgStatus'));
renderBackgrounds.after(render);
redrawAll.after(() => {
  render();
});
showView.after(() => {
  render();
});
render();
