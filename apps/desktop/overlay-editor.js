// Overlay authoring. The overlay is the fixed 40×25 hardware text/HUD layer —
// unlike a background it never scrolls and has no BGMODE, its own OVLBANK/
// OVLALT bank pair, and the identical cell attribute layout (tile, palette
// bank, flips, priority, CHR_ALT) — see docs/model.md and specs/video.json.
//
// A placeholder is pure geometry: {id, name, col, row, width, height}. It
// carries no content of its own — whatever is painted in its cells with the
// normal tools is the real initial nametable data, not a discardable mockup.
// A build step can later generate a primitive that overwrites just the
// tile-ID bytes in that region, left-to-right/top-to-bottom; mapping a value
// (a score, a string) to tile IDs is the programmer's job, not Studio's.
import { clampIndex, copyAsset, newId, removeAt } from './domain/assets.js';
import { clamp } from './domain/geometry.js';
import { FILE_NAME, canRename, freshName } from './domain/names.js';
import {
  COLUMNS as OVERLAY_COLUMNS,
  ROWS as OVERLAY_ROWS,
  firstFreeSpot,
  fitsOverlay,
  newOverlay,
  overlapsAny,
  overlayGrid,
} from './domain/overlays.js';
import { $ } from './dom.js';
import { dragRegion, gridEditor, outlineDrag } from './grid-editor.js';
import { showView } from './lifecycle.js';
import { overlays, tilesets } from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('overlayEditor');
const workspace = StudioShell.defineEditor({
  view: 'overlays',
  host,
  render,
  status: $('ovStatus'),
  onHide: () => editor.clearHover(),
});

let overlayIndex = 0;
// The placeholder chosen in the list, or -1 for none.
let placeholderIndex = -1;

const overlay = () => overlays[overlayIndex];
// Tools, tile picker, stamp, palette dock and rails: see grid-editor.js.
const editor = gridEditor({
  prefix: 'ov',
  view: 'overlays',
  host,
  historyKey: 'overlays',
  editLabel: 'Edit the overlay',
  railLabel: 'Overlay tools',
  asset: overlay,
  grid: () => (overlay() ? overlayGrid(overlay()) : null),
  render: () => render(),
  transparentZero: true,
  layout: () => layoutPlaceholders(),
  dragTools: { placeholder: { preview: previewPlaceholder, commit: commitPlaceholder } },
});
const { selection, edit: ovEdit, primaryTileset, altTileset } = editor;
document.addEventListener('studiohistory', () => {
  overlayIndex = clampIndex(overlays, overlayIndex);
  selection.revalidate();
});

// Opens another overlay with no placeholder chosen and a fresh pick.
function chooseOverlay(i) {
  overlayIndex = i;
  placeholderIndex = -1;
  editor.resetPick();
  render();
}
function renameOverlay(i, name) {
  if (!canRename(overlays, i, name, FILE_NAME)) {
    setStatus('Use a unique filename: letters, digits, underscore or hyphen.');
    return false;
  }
  ovEdit('Rename an overlay', () => (overlays[i].name = name));
  return true;
}
// The overlay list and its New, Duplicate and Delete buttons. New needs a
// tileset to draw from.
const overlayLibrary = StudioShell.assetLibrary({
  noun: 'overlay',
  plural: 'overlays',
  list: $('ovList'),
  items: () => overlays,
  index: () => overlayIndex,
  choose: chooseOverlay,
  rename: renameOverlay,
  render,
  buttons: {
    rail: $('ovActions'),
    create: 'ovNewAction',
    duplicate: 'ovDuplicateAction',
    remove: 'ovDeleteAction',
    empty: 'ovEmptyNew',
  },
  ready: () => (tilesets.length ? null : 'Create a tileset first.'),
  create: (label) =>
    ovEdit(label, () => {
      overlays.push(newOverlay(newId(), freshName(overlays, 'Overlay'), tilesets[0].id));
      overlayIndex = overlays.length - 1;
      placeholderIndex = -1;
      editor.resetPlanes();
    }),
  copy: (item, label) =>
    ovEdit(label, () => {
      overlays.push(copyAsset(item, freshName(overlays, 'Overlay')));
      overlayIndex = overlays.length - 1;
      placeholderIndex = -1;
    }),
  remove: (item, label) =>
    ovEdit(label, () => {
      overlayIndex = removeAt(overlays, overlayIndex);
      placeholderIndex = -1;
    }),
});
function renderOverlayList() {
  overlayLibrary.render();
}

// While the Placeholder tool drags out a region, outlines it in yellow.
function previewPlaceholder(anchor, col, row) {
  editor.paintCanvas();
  layoutPlaceholders();
  outlineDrag($('ovCanvas').getContext('2d'), anchor, col, row, '#ffcf40');
}
function addPlaceholder(rect) {
  const a = overlay();
  if (overlapsAny(a.placeholders, rect)) {
    setStatus('That region overlaps an existing placeholder.');
    render();
    return;
  }
  ovEdit('New placeholder', () => {
    a.placeholders.push({ id: newId(), name: freshName(a.placeholders, 'Placeholder'), ...rect });
    placeholderIndex = a.placeholders.length - 1;
  });
}
function commitPlaceholder(anchor, col, row) {
  addPlaceholder(dragRegion(anchor, col, row));
}

function layoutPlaceholders() {
  const a = overlay(),
    wrap = $('ovPlaceholderOverlay');
  if (!a) {
    wrap.replaceChildren();
    return;
  }
  wrap.replaceChildren(
    ...a.placeholders.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'ovPlaceholderRect';
      el.classList.toggle('selected', i === placeholderIndex);
      el.style.left = p.col * 8 * editor.zoom + 'px';
      el.style.top = p.row * 8 * editor.zoom + 'px';
      el.style.width = p.width * 8 * editor.zoom + 'px';
      el.style.height = p.height * 8 * editor.zoom + 'px';
      const label = document.createElement('span');
      label.textContent = p.name;
      el.append(label);
      return el;
    }),
  );
}

function choosePlaceholder(i) {
  placeholderIndex = i;
  render();
}
function renamePlaceholder(i, name) {
  const a = overlay();
  if (!canRename(a.placeholders, i, name, FILE_NAME)) {
    setStatus('Use a unique name: letters, digits, underscore or hyphen.');
    return false;
  }
  ovEdit('Rename a placeholder', () => (a.placeholders[i].name = name));
  return true;
}
function renderPlaceholderList() {
  const a = overlay(),
    items = a?.placeholders ?? [];
  StudioShell.renderList($('ovPlaceholderList'), items, {
    selected: (p, i) => i === placeholderIndex,
    choose: (p, i) => choosePlaceholder(i),
    rename: renamePlaceholder,
    render,
    maxLength: 48,
    duplicate: (p, i) => {
      choosePlaceholder(i);
      $('ovPlaceholderDuplicate').click();
    },
    remove: (p, i) => {
      choosePlaceholder(i);
      $('ovPlaceholderDelete').click();
    },
  });
}
function updatePlaceholderFields() {
  const a = overlay(),
    p = a?.placeholders[placeholderIndex];
  for (const id of ['ovPhCol', 'ovPhRow', 'ovPhWidth', 'ovPhHeight']) $(id).disabled = !p;
  $('ovPlaceholderDuplicate').disabled = !p;
  $('ovPlaceholderDelete').disabled = !p;
  $('ovPhEmpty').hidden = !!p;
  host.querySelector('.ovPhFields').hidden = !p;
  if (!p) return;
  $('ovPhCol').value = p.col;
  $('ovPhRow').value = p.row;
  $('ovPhWidth').value = p.width;
  $('ovPhHeight').value = p.height;
}
function applyPlaceholderField(input, field, min, max) {
  const a = overlay(),
    p = a?.placeholders[placeholderIndex];
  if (!p) return;
  const value = clamp(Math.round(Number(input.value)) || min, min, max);
  const next = { ...p, [field]: value };
  if (!fitsOverlay(next)) {
    setStatus(`That placeholder would fall outside the ${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} grid.`);
    render();
    return;
  }
  if (overlapsAny(a.placeholders, next, placeholderIndex)) {
    setStatus('That change overlaps another placeholder.');
    render();
    return;
  }
  ovEdit('Move or resize a placeholder', () => {
    a.placeholders[placeholderIndex] = next;
  });
}
$('ovPhCol').onchange = () => applyPlaceholderField($('ovPhCol'), 'col', 0, OVERLAY_COLUMNS - 1);
$('ovPhRow').onchange = () => applyPlaceholderField($('ovPhRow'), 'row', 0, OVERLAY_ROWS - 1);
$('ovPhWidth').onchange = () => applyPlaceholderField($('ovPhWidth'), 'width', 1, OVERLAY_COLUMNS);
$('ovPhHeight').onchange = () => applyPlaceholderField($('ovPhHeight'), 'height', 1, OVERLAY_ROWS);

function render() {
  if (!workspace.shown()) return;
  overlayIndex = clampIndex(overlays, overlayIndex);
  const a = overlay();
  $('ovEmpty').hidden = !!a;
  StudioShell.emptyEditor(host, !a);
  $('ovEmptyMessage').textContent = !tilesets.length
    ? 'Create a tileset first. An overlay draws from two tilesets.'
    : 'No overlays yet. An overlay draws from two tilesets.';
  $('ovEmptyNew').hidden = !tilesets.length;
  $('ovCreateTileset').hidden = !!tilesets.length;
  $('ovWork').hidden = !a;
  renderOverlayList();
  if (!a) {
    $('ovStatus').textContent = '';
    return;
  }
  placeholderIndex = Math.min(placeholderIndex, a.placeholders.length - 1);
  $('ovTitle').textContent = a.name;
  editor.renderControls();
  editor.paintCanvas();
  layoutPlaceholders();
  renderPlaceholderList();
  updatePlaceholderFields();
  editor.renderStamp();
  $('ovStatus').textContent =
    `${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} tiles · ${a.cells.length} cells · ${a.placeholders.length} placeholder(s) · primary ${primaryTileset()?.name ?? 'missing'} · alternate ${altTileset()?.name ?? 'missing'}`;
  editor.fitOnOpen();
}

$('ovCreateTileset').onclick = () => {
  showView('tiles');
};
for (const [id, label, icon] of [
  ['ovPlaceholderNew', 'New placeholder', 'newItem'],
  ['ovPlaceholderDuplicate', 'Duplicate placeholder', 'duplicate'],
  ['ovPlaceholderDelete', 'Delete placeholder', 'delete'],
])
  $('ovPlaceholderActions').append(StudioShell.iconButton(id, label, icon));
$('ovPlaceholderNew').onclick = () => {
  const a = overlay();
  if (!a) return;
  const rect = firstFreeSpot(Math.min(4, OVERLAY_COLUMNS), 1, a.placeholders);
  if (!rect) {
    setStatus('No free space for a new placeholder — resize or delete one first.');
    return;
  }
  addPlaceholder(rect);
};
$('ovPlaceholderDuplicate').onclick = () => {
  const a = overlay();
  if (!a || placeholderIndex < 0) return;
  const src = a.placeholders[placeholderIndex],
    rect = firstFreeSpot(src.width, src.height, a.placeholders);
  if (!rect) {
    setStatus('No free space to duplicate this placeholder.');
    return;
  }
  addPlaceholder(rect);
};
$('ovPlaceholderDelete').onclick = () => {
  const a = overlay();
  if (!a || placeholderIndex < 0) return;
  setStatus(`Deleted ${a.placeholders[placeholderIndex].name}. Ctrl/Cmd+Z brings it back.`);
  ovEdit('Delete ' + a.placeholders[placeholderIndex].name, () => {
    a.placeholders.splice(placeholderIndex, 1);
    placeholderIndex = Math.min(placeholderIndex, a.placeholders.length - 1);
  });
};

// Left rail: the panels to pick from, then the tools. Right rail: the flips
// and priority the next stamp takes.
const library = host.querySelector('.ovLibrary'),
  tileLibrary = host.querySelector('.ovTileLibrary'),
  placeholderLibrary = host.querySelector('.ovPlaceholderLibrary');
const placeholderPropsToggle = StudioShell.iconButton(
  'ovPlaceholderPropsToggle',
  "Placeholder — the selected one's position and size",
  'properties',
);
// Open from the start, like the animation editor's frame panel: a panel that
// opened itself on selection would shift the centered canvas under the pointer.
StudioShell.bindPanel({
  panel: host.querySelector('.ovPlaceholderProps'),
  button: placeholderPropsToggle,
  group: 'ovRight',
  closeGroups: ['ovRight'],
  asset: true,
});
editor.buildRails({
  panels: [
    StudioShell.panelToggle(library, 'ovLibraryToggle', 'Overlays', 'overlay', 'ovLeft'),
    StudioShell.panelToggle(
      tileLibrary,
      'ovTileLibraryToggle',
      'Tilesets and tile picker',
      'tilePicker',
      'ovLeft',
      true,
    ),
    StudioShell.panelToggle(
      placeholderLibrary,
      'ovPlaceholderLibraryToggle',
      'Placeholders',
      'placeholder',
      'ovLeft',
      true,
    ),
  ],
  tools: [
    editor.toolButton(
      'Select (S) — drag over cells, then flip, set Priority, click a palette bank, copy or move them',
      'select',
      'select',
    ),
    editor.toolButton('Pencil (B)', 'pencil', 'pencil'),
    editor.toolButton('Eraser (E)', 'eraser', 'eraser'),
    editor.toolButton('Fill (G)', 'fill', 'fill'),
    editor.toolButton('Rectangle (R)', 'rectangle', 'rectangle'),
    editor.toolButton('Pick tile (I)', 'picker', 'picker'),
    editor.toolButton('Placeholder — drag to define a region', 'placeholderTool', 'placeholder'),
    editor.toolButton(
      'Pan (H) — drag the canvas to scroll it; Space or the middle button pan with any other tool active',
      'pan',
      'pan',
    ),
  ],
  sidePanels: [placeholderPropsToggle],
});
library.hidden = true;
tileLibrary.hidden = true;
placeholderLibrary.hidden = true;
for (const id of ['ovLibraryToggle', 'ovTileLibraryToggle', 'ovPlaceholderLibraryToggle'])
  $(id).setAttribute('aria-expanded', 'false');

export { render as renderOverlays };
render();
