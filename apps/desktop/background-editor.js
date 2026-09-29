// Background authoring. A background is a free-sized canvas of cells, each
// naming a tile, a palette bank, flips, priority, and which of two tilesets it
// reads (CHR_ALT). The six hardware BGMODE viewport sizes are a preview aid
// here, not a canvas limit — see docs/model.md and specs/video.json.
//
// Two nested preview rectangles model two different hardware facts: the
// outer one is the BGMODE-sized window that would be resident in the active
// BGSET's four physical tables (what's loaded), the inner one is the fixed
// 320×200 physical screen positioned by SCROLL_X/SCROLL_Y within it (what's
// actually visible). SCROLL_X/Y wrap at the mode's own pixel size — see
// clementina-rom/docs/basic-video.md's SCROLL entry — so the inner rectangle
// wraps too, and the camera panel's table-index math mirrors
// clementina-video-client/internal/render/renderer.go's bgTableAndLocal.
import { canAdd, clampIndex, copyAsset, newId, removeAt } from './domain/assets.js';
import {
  VIEWPORT_MODES,
  MAX_CELLS,
  clampDimension,
  clampScroll,
  newBackground,
  positiveMod,
  screenRanges,
  sizeFits,
  viewportMode,
  visibleTables,
} from './domain/backgrounds.js';
import { cropsContent, resizedCells } from './domain/cells.js';
import { FILE_NAME, canRename, freshName } from './domain/names.js';
import { $ } from './dom.js';
import { gridEditor } from './grid-editor.js';
import { redrawAll, renderBackgrounds, showView } from './lifecycle.js';
import {
  backgrounds,
  bankColor,
  css565,
  currentView,
  overlays,
  tilePixel,
  tilesets,
} from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('backgroundEditor');

$('bgPreviewMode').replaceChildren(...VIEWPORT_MODES.map((m) => new Option(m.label, String(m.id))));

let backgroundIndex = 0;
// The viewport preview: which BGMODE window is shown, where it sits on the
// canvas, and the drag moving it by its handle.
let bgPreviewModeId = 0,
  bgViewportOrigin = { x: 0, y: 0 },
  bgOverlayDrag = null;
// Camera preview: BGSET (0/1) and SCROLL_X/SCROLL_Y, ephemeral like the
// viewport mode/origin above — never saved to the asset.
let bgActiveSet = 0,
  bgScroll = { x: 0, y: 0 },
  bgScrollDrag = null;
// The "toggle overlay" composite preview — which overlay asset to render on
// top of the inner (visible-screen) rectangle, and whether it's shown.
let bgOverlayId = null,
  bgShowOverlay = false;

const background = () => backgrounds[backgroundIndex];
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
  decorate: (ctx) => {
    drawCellLines(ctx);
    if (bgShowOverlay) drawOverlayComposite(ctx);
  },
  busy: () => !!(bgOverlayDrag || bgScrollDrag),
});
const { selection, edit: bgEdit, primaryTileset, altTileset } = editor;
document.addEventListener('studiohistory', () => {
  backgroundIndex = clampIndex(backgrounds, backgroundIndex);
  selection.revalidate();
});

// Opens another background with the camera reset and a fresh pick.
function chooseBackground(i) {
  backgroundIndex = i;
  bgViewportOrigin = { x: 0, y: 0 };
  bgScroll = { x: 0, y: 0 };
  bgActiveSet = 0;
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

// Marks where each cell (one nametable and attribute table entry) begins and
// ends, so an empty cell doesn't read as featureless background.
function drawCellLines(ctx) {
  const a = background();
  ctx.strokeStyle = '#ffffff26';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let col = 0; col <= a.width; col++) {
    ctx.moveTo(col * 8 + 0.5, 0);
    ctx.lineTo(col * 8 + 0.5, a.height * 8);
  }
  for (let row = 0; row <= a.height; row++) {
    ctx.moveTo(0, row * 8 + 0.5);
    ctx.lineTo(a.width * 8, row * 8 + 0.5);
  }
  ctx.stroke();
}
// The overlay never scrolls — it always sits 1:1 on the physical screen, so
// it composites onto exactly the same wrapped pieces the inner (visible)
// rectangle guide already computes, mapping each piece back to its source
// region of the fixed 320×200 overlay image. Plane defaults to 0 for any
// 1bpp overlay tileset — a documented simplification; full plane accuracy
// lives in the overlay editor itself.
function drawOverlayComposite(ctx) {
  const overlay = overlays.find((o) => o.id === bgOverlayId);
  if (!overlay) return;
  const primary = editor.tilesetById(overlay.tilesetId),
    alt = editor.tilesetById(overlay.altTilesetId);
  const { xRanges, yRanges } = screenRanges(bgPreviewModeId, bgScroll);
  let sx0 = 0;
  for (const [x0, x1] of xRanges) {
    const sxLen = x1 - x0;
    let sy0 = 0;
    for (const [y0, y1] of yRanges) {
      const syLen = y1 - y0;
      for (let dy = 0; dy < syLen; dy++)
        for (let dx = 0; dx < sxLen; dx++) {
          const sx = sx0 + dx,
            sy = sy0 + dy;
          const col = Math.floor(sx / 8),
            row = Math.floor(sy / 8),
            px = sx % 8,
            py = sy % 8;
          const cell = overlay.cells[row * 40 + col];
          if (!cell) continue;
          const source = cell.chrAlt ? alt : primary;
          if (!source) continue;
          const cx = cell.flipX ? 7 - px : px,
            cy = cell.flipY ? 7 - py : py;
          const ink = tilePixel(source, cell.tile, cx, cy, 0);
          if (ink === 0) continue;
          ctx.fillStyle = css565(bankColor(cell.paletteBank, ink));
          ctx.fillRect(bgViewportOrigin.x * 8 + x0 + dx, bgViewportOrigin.y * 8 + y0 + dy, 1, 1);
        }
      sy0 += syLen;
    }
    sx0 += sxLen;
  }
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

function layoutViewportOverlay() {
  const a = background(),
    overlay = $('bgViewportOverlay');
  if (!a) {
    overlay.hidden = true;
    return;
  }
  const mode = viewportMode(bgPreviewModeId);
  const cols = Math.min(mode.columns, a.width),
    rows = Math.min(mode.rows, a.height);
  bgViewportOrigin.x = Math.max(0, Math.min(a.width - cols, bgViewportOrigin.x));
  bgViewportOrigin.y = Math.max(0, Math.min(a.height - rows, bgViewportOrigin.y));
  overlay.hidden = false;
  overlay.style.left = bgViewportOrigin.x * 8 * editor.zoom + 'px';
  overlay.style.top = bgViewportOrigin.y * 8 * editor.zoom + 'px';
  overlay.style.width = cols * 8 * editor.zoom + 'px';
  overlay.style.height = rows * 8 * editor.zoom + 'px';
}
$('bgPreviewMode').onchange = () => {
  bgPreviewModeId = Number($('bgPreviewMode').value);
  render();
};
// The overlay itself is click-through (pointer-events:none) so it never
// blocks painting underneath it; only its small handle is draggable.
$('bgViewportHandle').onpointerdown = (e) => {
  e.stopPropagation();
  bgOverlayDrag = { startX: e.clientX, startY: e.clientY, origin: { ...bgViewportOrigin } };
  $('bgViewportHandle').setPointerCapture(e.pointerId);
};
$('bgViewportHandle').onpointermove = (e) => {
  if (!bgOverlayDrag) return;
  const dx = Math.round((e.clientX - bgOverlayDrag.startX) / (8 * editor.zoom)),
    dy = Math.round((e.clientY - bgOverlayDrag.startY) / (8 * editor.zoom));
  bgViewportOrigin = { x: bgOverlayDrag.origin.x + dx, y: bgOverlayDrag.origin.y + dy };
  layoutViewportOverlay();
  layoutScrollOverlay();
  updateCameraPanel();
};
$('bgViewportHandle').onpointerup = $('bgViewportHandle').onpointercancel = () => {
  bgOverlayDrag = null;
};

// The inner rectangle is the fixed 320×200 physical screen, positioned by
// SCROLL_X/SCROLL_Y within the loaded window and wrapping at the mode's own
// pixel size — up to four pieces when it straddles both edges. #bgScrollClip
// is sized to the mode's true plane, not the (possibly canvas-clamped)
// outer rectangle — a small authored canvas must not clip scroll math that
// real hardware would still apply at the mode's full size.
function layoutScrollOverlay() {
  const a = background();
  if (!a) return;
  const { planeW, planeH, localX, localY, xRanges, yRanges } = screenRanges(
    bgPreviewModeId,
    bgScroll,
  );
  const clip = $('bgScrollClip');
  clip.hidden = false;
  clip.style.left = bgViewportOrigin.x * 8 * editor.zoom + 'px';
  clip.style.top = bgViewportOrigin.y * 8 * editor.zoom + 'px';
  clip.style.width = planeW * editor.zoom + 'px';
  clip.style.height = planeH * editor.zoom + 'px';
  const pieces = host.querySelectorAll('.bgScrollRect');
  let i = 0;
  for (const [x0, x1] of xRanges)
    for (const [y0, y1] of yRanges) {
      const el = pieces[i++];
      el.hidden = false;
      el.style.left = x0 * editor.zoom + 'px';
      el.style.top = y0 * editor.zoom + 'px';
      el.style.width = (x1 - x0) * editor.zoom + 'px';
      el.style.height = (y1 - y0) * editor.zoom + 'px';
    }
  for (; i < pieces.length; i++) pieces[i].hidden = true;
  const handleX = positiveMod(localX + 160, planeW),
    handleY = positiveMod(localY + 100, planeH);
  $('bgScrollHandle').style.left = handleX * editor.zoom + 'px';
  $('bgScrollHandle').style.top = handleY * editor.zoom + 'px';
}
$('bgActiveSet').onchange = () => {
  bgActiveSet = Number($('bgActiveSet').value);
  render();
};
$('bgScrollX').onchange = () => {
  bgScroll = { ...bgScroll, x: clampScroll(Number($('bgScrollX').value)) };
  render();
};
$('bgScrollY').onchange = () => {
  bgScroll = { ...bgScroll, y: clampScroll(Number($('bgScrollY').value)) };
  render();
};
$('bgScrollHandle').onpointerdown = (e) => {
  e.stopPropagation();
  bgScrollDrag = { startX: e.clientX, startY: e.clientY, origin: { ...bgScroll } };
  $('bgScrollHandle').setPointerCapture(e.pointerId);
};
$('bgScrollHandle').onpointermove = (e) => {
  if (!bgScrollDrag) return;
  const dx = Math.round((e.clientX - bgScrollDrag.startX) / editor.zoom),
    dy = Math.round((e.clientY - bgScrollDrag.startY) / editor.zoom);
  bgScroll = {
    x: positiveMod(bgScrollDrag.origin.x + dx, 65536),
    y: positiveMod(bgScrollDrag.origin.y + dy, 65536),
  };
  layoutScrollOverlay();
  updateCameraPanel();
};
$('bgScrollHandle').onpointerup = $('bgScrollHandle').onpointercancel = () => {
  bgScrollDrag = null;
};

function updateCameraPanel() {
  const a = background();
  if (!a) return;
  const mode = viewportMode(bgPreviewModeId);
  $('bgActiveSet').value = String(bgActiveSet);
  $('bgScrollX').value = String(bgScroll.x);
  $('bgScrollY').value = String(bgScroll.y);
  $('bgCamMode').textContent = `BGMODE ${mode.id} · ${mode.label} tiles`;
  $('bgCamWindow').textContent =
    `Origin ${bgViewportOrigin.x}, ${bgViewportOrigin.y} tiles from top-left`;
  $('bgCamTables').textContent =
    `Tables ${visibleTables(bgPreviewModeId, bgActiveSet, bgScroll).join(', ')}`;
  $('bgCamTilesets').textContent =
    `Primary ${primaryTileset()?.name ?? 'missing'} · Alternate ${altTileset()?.name ?? 'missing'}`;
}

function renderOverlayToggle() {
  const picker = $('bgOverlayPick'),
    signature = overlays.map((o) => o.id + '|' + o.name).join(',');
  if (picker.dataset.signature !== signature) {
    picker.dataset.signature = signature;
    picker.replaceChildren(...overlays.map((o) => new Option(o.name, o.id)));
  }
  if (!overlays.some((o) => o.id === bgOverlayId)) bgOverlayId = overlays[0]?.id ?? null;
  picker.value = bgOverlayId ?? '';
  $('bgOverlayPickWrap').hidden = !overlays.length;
  $('bgToggleOverlay').hidden = !overlays.length;
  $('bgToggleOverlay').textContent = bgShowOverlay ? 'Hide overlay' : 'Show overlay';
  $('bgToggleOverlay').setAttribute('aria-pressed', String(bgShowOverlay));
  $('bgToggleOverlay').classList.toggle('on', bgShowOverlay);
}
$('bgOverlayPick').onchange = () => {
  bgOverlayId = $('bgOverlayPick').value || null;
  editor.paintCanvas();
};
$('bgToggleOverlay').onclick = () => {
  bgShowOverlay = !bgShowOverlay;
  renderOverlayToggle();
  editor.paintCanvas();
};

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
  $('bgPreviewMode').value = String(bgPreviewModeId);
  editor.renderControls();
  renderOverlayToggle();
  editor.paintCanvas();
  layoutViewportOverlay();
  layoutScrollOverlay();
  updateCameraPanel();
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
    bgViewportOrigin = { x: 0, y: 0 };
    bgScroll = { x: 0, y: 0 };
    bgActiveSet = 0;
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
