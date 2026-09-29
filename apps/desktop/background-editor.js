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
import { CellGrid } from './cell-grid.js';
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

// Six fixed hardware viewport sizes, preview-only — specs/video.json
// background.viewportModes, docs/architecture/video.md.
const VIEWPORT_MODES = [
  { id: 0, columns: 40, rows: 25, label: '40 × 25' },
  { id: 1, columns: 80, rows: 25, label: '80 × 25' },
  { id: 2, columns: 40, rows: 50, label: '40 × 50' },
  { id: 3, columns: 160, rows: 25, label: '160 × 25' },
  { id: 4, columns: 40, rows: 100, label: '40 × 100' },
  { id: 5, columns: 80, rows: 50, label: '80 × 50' },
];
$('bgPreviewMode').replaceChildren(...VIEWPORT_MODES.map((m) => new Option(m.label, String(m.id))));
// Matches @clementina/assets' MAX_BACKGROUND_DIMENSION/MAX_BACKGROUND_CELLS —
// duplicated here the way other hardware facts are, so the editor bounds
// input without importing the SDK's session validator into the renderer.
const MAX_BG_DIMENSION = 1024,
  MAX_BG_CELLS = 200000;

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

function positiveMod(n, m) {
  return ((n % m) + m) % m;
}
// Mirrors clementina-video-client/internal/render/renderer.go's
// bgTableAndLocal: which of the active BGSET's four physical tables a
// coarse (8px) tile column/row falls in, per BGMODE's table arrangement.
function bgTableForCell(mode, activeSet, x, y) {
  let table;
  switch (mode) {
    case 1:
      table = Math.floor(x / 40);
      break;
    case 2:
      table = y >= 25 ? 2 : 0;
      break;
    case 3:
      table = Math.floor(x / 40);
      break;
    case 4:
      table = Math.floor(y / 25);
      break;
    case 5:
      table = Math.floor(y / 25) * 2 + Math.floor(x / 40);
      break;
    default:
      table = 0;
  }
  return table + (activeSet & 1) * 4;
}
// Splits a wrapping [origin, origin+span) pixel range against a periodic
// plane size into 1 or 2 non-wrapping pieces — shared by the scroll
// overlay's DOM layout and the visible-tables calculation below.
function bgWrapRanges(origin, span, plane) {
  return origin + span <= plane
    ? [[origin, origin + span]]
    : [
        [origin, plane],
        [0, origin + span - plane],
      ];
}
// Which physical tables the current 320×200 visible window touches — up to
// four when it straddles a table boundary in both axes at once.
function bgVisibleTables() {
  const mode = VIEWPORT_MODES.find((m) => m.id === bgPreviewModeId),
    planeW = mode.columns * 8,
    planeH = mode.rows * 8;
  const localX = positiveMod(bgScroll.x, planeW),
    localY = positiveMod(bgScroll.y, planeH);
  const xRanges = bgWrapRanges(localX, 320, planeW),
    yRanges = bgWrapRanges(localY, 200, planeH);
  const tables = new Set();
  for (const [x0, x1] of xRanges)
    for (const [y0, y1] of yRanges) {
      const cx0 = Math.floor(x0 / 8),
        cx1 = Math.floor((x1 - 1) / 8),
        cy0 = Math.floor(y0 / 8),
        cy1 = Math.floor((y1 - 1) / 8);
      for (const cx of [cx0, cx1])
        for (const cy of [cy0, cy1]) tables.add(bgTableForCell(mode.id, bgActiveSet, cx, cy));
    }
  return [...tables].sort((x, y) => x - y);
}

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
function makeCells(width, height) {
  return Array.from({ length: width * height }, CellGrid.blank);
}
document.addEventListener('studiohistory', () => {
  backgroundIndex = Math.max(0, Math.min(backgroundIndex, backgrounds.length - 1));
  selection.revalidate();
});

function freshBackgroundName() {
  let n = 1;
  while (backgrounds.some((b) => b.name.toLowerCase() === 'background_' + n)) n++;
  return 'Background_' + n;
}
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
  if (
    !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name) ||
    backgrounds.some((x, j) => j !== i && x.name.toLowerCase() === name.toLowerCase())
  ) {
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
  const mode = VIEWPORT_MODES.find((m) => m.id === bgPreviewModeId),
    planeW = mode.columns * 8,
    planeH = mode.rows * 8;
  const localX = positiveMod(bgScroll.x, planeW),
    localY = positiveMod(bgScroll.y, planeH);
  const xRanges = bgWrapRanges(localX, 320, planeW),
    yRanges = bgWrapRanges(localY, 200, planeH);
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
  newWidth = Math.max(1, Math.min(MAX_BG_DIMENSION, Math.round(newWidth) || 1));
  newHeight = Math.max(1, Math.min(MAX_BG_DIMENSION, Math.round(newHeight) || 1));
  if (newWidth * newHeight > MAX_BG_CELLS) {
    setStatus(`That size holds too many cells — up to ${MAX_BG_CELLS} total.`);
    render();
    return;
  }
  if (newWidth === a.width && newHeight === a.height) {
    render();
    return;
  }
  let cropsContent = false;
  for (let y = 0; y < a.height && !cropsContent; y++)
    for (let x = 0; x < a.width; x++) {
      if (x < newWidth && y < newHeight) continue;
      const cell = a.cells[y * a.width + x];
      if (
        cell.tile !== 0 ||
        cell.paletteBank !== 0 ||
        cell.flipX ||
        cell.flipY ||
        cell.priority ||
        cell.chrAlt
      ) {
        cropsContent = true;
        break;
      }
    }
  if (cropsContent)
    setStatus('Cropped the painted cells outside the new size. Ctrl/Cmd+Z brings them back.');
  selection.reset();
  bgEdit('Resize the background', () => {
    const cells = makeCells(newWidth, newHeight);
    for (let y = 0; y < Math.min(a.height, newHeight); y++)
      for (let x = 0; x < Math.min(a.width, newWidth); x++)
        cells[y * newWidth + x] = a.cells[y * a.width + x];
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
  const mode = VIEWPORT_MODES.find((m) => m.id === bgPreviewModeId);
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
  const mode = VIEWPORT_MODES.find((m) => m.id === bgPreviewModeId),
    planeW = mode.columns * 8,
    planeH = mode.rows * 8;
  const clip = $('bgScrollClip');
  clip.hidden = false;
  clip.style.left = bgViewportOrigin.x * 8 * editor.zoom + 'px';
  clip.style.top = bgViewportOrigin.y * 8 * editor.zoom + 'px';
  clip.style.width = planeW * editor.zoom + 'px';
  clip.style.height = planeH * editor.zoom + 'px';
  const localX = positiveMod(bgScroll.x, planeW),
    localY = positiveMod(bgScroll.y, planeH);
  const xRanges = bgWrapRanges(localX, 320, planeW),
    yRanges = bgWrapRanges(localY, 200, planeH);
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
function clampScrollInput(v) {
  return Math.max(0, Math.min(65535, Math.round(v) || 0));
}
$('bgActiveSet').onchange = () => {
  bgActiveSet = Number($('bgActiveSet').value);
  render();
};
$('bgScrollX').onchange = () => {
  bgScroll = { ...bgScroll, x: clampScrollInput(Number($('bgScrollX').value)) };
  render();
};
$('bgScrollY').onchange = () => {
  bgScroll = { ...bgScroll, y: clampScrollInput(Number($('bgScrollY').value)) };
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
  const mode = VIEWPORT_MODES.find((m) => m.id === bgPreviewModeId);
  $('bgActiveSet').value = String(bgActiveSet);
  $('bgScrollX').value = String(bgScroll.x);
  $('bgScrollY').value = String(bgScroll.y);
  $('bgCamMode').textContent = `BGMODE ${mode.id} · ${mode.label} tiles`;
  $('bgCamWindow').textContent =
    `Origin ${bgViewportOrigin.x}, ${bgViewportOrigin.y} tiles from top-left`;
  $('bgCamTables').textContent = `Tables ${bgVisibleTables().join(', ')}`;
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
  if (backgrounds.length >= 255) {
    setStatus('A project holds at most 255 backgrounds.');
    return;
  }
  if (!tilesets.length) {
    setStatus('Create a tileset first.');
    return;
  }
  bgEdit('New background', () => {
    const width = 40,
      height = 25;
    backgrounds.push({
      id: crypto.randomUUID(),
      name: freshBackgroundName(),
      width,
      height,
      tilesetId: tilesets[0].id,
      altTilesetId: tilesets[0].id,
      cells: makeCells(width, height),
    });
    backgroundIndex = backgrounds.length - 1;
    bgViewportOrigin = { x: 0, y: 0 };
    bgScroll = { x: 0, y: 0 };
    bgActiveSet = 0;
    editor.resetPlanes();
  });
  setStatus('Created ' + background().name + '.');
};
$('bgDuplicateAction').onclick = () => {
  if (!background() || backgrounds.length >= 255) return;
  bgEdit('Duplicate ' + background().name, () => {
    const copy = structuredClone(background());
    copy.id = crypto.randomUUID();
    copy.name = freshBackgroundName();
    backgrounds.push(copy);
    backgroundIndex = backgrounds.length - 1;
  });
};
$('bgDeleteAction').onclick = () => {
  if (!background()) return;
  setStatus(`Deleted ${background().name}. Ctrl/Cmd+Z brings it back.`);
  bgEdit('Delete ' + background().name, () => {
    backgrounds.splice(backgroundIndex, 1);
    backgroundIndex = Math.max(0, backgroundIndex - 1);
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
