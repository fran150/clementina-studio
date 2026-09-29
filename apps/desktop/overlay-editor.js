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
import { CellGrid } from './cell-grid.js';
import { $ } from './dom.js';
import { dragRegion, gridEditor, outlineDrag } from './grid-editor.js';
import { redrawAll, showView } from './lifecycle.js';
import { currentView, overlays, tilesets } from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('overlayEditor');

// The overlay's fixed hardware size — specs/video.json's overlay entry
// (columns:40, rows:25, scrolls:false).
const OVERLAY_COLUMNS = 40,
  OVERLAY_ROWS = 25,
  OVERLAY_CELLS = 1000;

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
  grid: () =>
    overlay() ? { width: OVERLAY_COLUMNS, height: OVERLAY_ROWS, cells: overlay().cells } : null,
  render: () => render(),
  transparentZero: true,
  layout: () => layoutPlaceholders(),
  dragTools: { placeholder: { preview: previewPlaceholder, commit: commitPlaceholder } },
});
const { selection, edit: ovEdit, primaryTileset, altTileset } = editor;
function makeCells() {
  return Array.from({ length: OVERLAY_CELLS }, CellGrid.blank);
}
function overlapsRect(a, b) {
  return (
    a.col < b.col + b.width &&
    b.col < a.col + a.width &&
    a.row < b.row + b.height &&
    b.row < a.row + a.height
  );
}
function firstFreeSpot(width, height, placeholders) {
  for (let row = 0; row <= OVERLAY_ROWS - height; row++)
    for (let col = 0; col <= OVERLAY_COLUMNS - width; col++) {
      const rect = { col, row, width, height };
      if (!placeholders.some((p) => overlapsRect(p, rect))) return rect;
    }
  return null;
}

document.addEventListener('studiohistory', () => {
  overlayIndex = Math.max(0, Math.min(overlayIndex, overlays.length - 1));
  selection.revalidate();
});

function freshOverlayName() {
  let n = 1;
  while (overlays.some((o) => o.name.toLowerCase() === 'overlay_' + n)) n++;
  return 'Overlay_' + n;
}
function freshPlaceholderName(a) {
  let n = 1;
  while (a.placeholders.some((p) => p.name.toLowerCase() === 'placeholder_' + n)) n++;
  return 'Placeholder_' + n;
}
// Opens another overlay with no placeholder chosen and a fresh pick.
function chooseOverlay(i) {
  overlayIndex = i;
  placeholderIndex = -1;
  editor.resetPick();
  render();
}
function renameOverlay(i, name) {
  if (
    !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name) ||
    overlays.some((x, j) => j !== i && x.name.toLowerCase() === name.toLowerCase())
  ) {
    setStatus('Use a unique filename: letters, digits, underscore or hyphen.');
    return false;
  }
  ovEdit('Rename an overlay', () => (overlays[i].name = name));
  return true;
}
function renderOverlayList() {
  StudioShell.renderList($('ovList'), overlays, {
    selected: (o, i) => i === overlayIndex,
    choose: (o, i) => chooseOverlay(i),
    rename: renameOverlay,
    render,
    maxLength: 48,
    duplicate: (o, i) => {
      chooseOverlay(i);
      $('ovDuplicateAction').click();
    },
    remove: (o, i) => {
      chooseOverlay(i);
      $('ovDeleteAction').click();
    },
  });
}

// While the Placeholder tool drags out a region, outlines it in yellow.
function previewPlaceholder(anchor, col, row) {
  editor.paintCanvas();
  layoutPlaceholders();
  outlineDrag($('ovCanvas').getContext('2d'), anchor, col, row, '#ffcf40');
}
function addPlaceholder(rect) {
  const a = overlay();
  if (a.placeholders.some((p) => overlapsRect(p, rect))) {
    setStatus('That region overlaps an existing placeholder.');
    render();
    return;
  }
  ovEdit('New placeholder', () => {
    a.placeholders.push({ id: crypto.randomUUID(), name: freshPlaceholderName(a), ...rect });
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
  if (
    !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name) ||
    a.placeholders.some((x, j) => j !== i && x.name.toLowerCase() === name.toLowerCase())
  ) {
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
  const value = Math.max(min, Math.min(max, Math.round(Number(input.value)) || min));
  const next = { ...p, [field]: value };
  if (next.col + next.width > OVERLAY_COLUMNS || next.row + next.height > OVERLAY_ROWS) {
    setStatus(`That placeholder would fall outside the ${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} grid.`);
    render();
    return;
  }
  if (a.placeholders.some((q, i) => i !== placeholderIndex && overlapsRect(q, next))) {
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
  host.hidden = currentView !== 'overlays';
  document.body.classList.toggle('overlayView', !host.hidden);
  if (host.hidden) {
    editor.clearHover();
    return;
  }
  overlayIndex = Math.min(overlayIndex, Math.max(0, overlays.length - 1));
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
$('ovEmptyNew').onclick = () => $('ovNewAction').click();

for (const [id, label, icon] of [
  ['ovNewAction', 'New overlay', 'newItem'],
  ['ovDuplicateAction', 'Duplicate overlay', 'duplicate'],
  ['ovDeleteAction', 'Delete overlay', 'delete'],
])
  $('ovActions').append(StudioShell.iconButton(id, label, icon));
$('ovNewAction').onclick = () => {
  if (overlays.length >= 255) {
    setStatus('A project holds at most 255 overlays.');
    return;
  }
  if (!tilesets.length) {
    setStatus('Create a tileset first.');
    return;
  }
  ovEdit('New overlay', () => {
    overlays.push({
      id: crypto.randomUUID(),
      name: freshOverlayName(),
      tilesetId: tilesets[0].id,
      altTilesetId: tilesets[0].id,
      cells: makeCells(),
      placeholders: [],
    });
    overlayIndex = overlays.length - 1;
    placeholderIndex = -1;
    editor.resetPlanes();
  });
  setStatus('Created ' + overlay().name + '.');
};
$('ovDuplicateAction').onclick = () => {
  if (!overlay() || overlays.length >= 255) return;
  ovEdit('Duplicate ' + overlay().name, () => {
    const copy = structuredClone(overlay());
    copy.id = crypto.randomUUID();
    copy.name = freshOverlayName();
    overlays.push(copy);
    overlayIndex = overlays.length - 1;
    placeholderIndex = -1;
  });
};
$('ovDeleteAction').onclick = () => {
  if (!overlay()) return;
  setStatus(`Deleted ${overlay().name}. Ctrl/Cmd+Z brings it back.`);
  ovEdit('Delete ' + overlay().name, () => {
    overlays.splice(overlayIndex, 1);
    overlayIndex = Math.max(0, overlayIndex - 1);
    placeholderIndex = -1;
  });
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
const panelToggle = (panel, id, label, icon, asset = false) => {
  const b = StudioShell.iconButton(id, label, icon);
  StudioShell.bindPanel({ panel, button: b, group: 'ovLeft', closeGroups: ['ovLeft'], asset });
  return b;
};
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
    panelToggle(library, 'ovLibraryToggle', 'Overlays', 'overlay'),
    panelToggle(tileLibrary, 'ovTileLibraryToggle', 'Tilesets and tile picker', 'tilePicker', true),
    panelToggle(
      placeholderLibrary,
      'ovPlaceholderLibraryToggle',
      'Placeholders',
      'placeholder',
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

StudioShell.viewStatus('overlays', $('ovStatus'));
export { render as renderOverlays };
redrawAll.after(() => {
  render();
});
showView.after(() => {
  render();
});
render();
