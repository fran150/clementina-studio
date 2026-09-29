// The shape editor's top bar and keyboard: the zoom buttons (the wheel pans
// the canvas's camera; zooming keeps the art under the pointer in place),
// the grid, snap, preview and display settings, and the shortcuts.
import { $, isField } from '../dom.js';
import { currentView } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import {
  copySprites,
  cutSprites,
  duplicateSprites,
  flip,
  pasteSprites,
  translate,
} from './editing.js';
import { showGhost } from './ghost.js';
import { hideGhost, sc, setMode, spritesOf } from './model.js';
import { canvas, draw, fit, viewport } from './view.js';

const host = $('spriteComposer');
const iconButton = (id, label, icon) => StudioShell.iconButton(id, label, icon);

/** Builds the zoom buttons into the top bar. */
export function shapeZoom() {
  const refreshGhost = () => {
    if (sc.placing && sc.ghostPoint)
      showGhost({ clientX: sc.ghostPoint.x, clientY: sc.ghostPoint.y });
  };
  sc.zoomControls = StudioShell.canvasZoom({
    view: 'shapes',
    ids: {
      fit: 'scFit',
      actual: 'scActualSize',
      zoomOut: 'scZoomOut',
      label: 'scZoomLabel',
      zoomIn: 'scZoomIn',
    },
    min: 0.25,
    max: 32,
    get: () => sc.zoom,
    fit,
    wheel: canvas,
    busy: () => !!sc.drag,
    set: (next, x, y) => {
      const r = canvas.getBoundingClientRect(),
        { w, h } = viewport(),
        dx = x === undefined ? 0 : x - r.left - w / 2,
        dy = y === undefined ? 0 : y - r.top - h / 2,
        px = sc.camera.x + dx / sc.zoom,
        py = sc.camera.y + dy / sc.zoom;
      sc.zoom = next;
      sc.camera = { x: px - dx / sc.zoom, y: py - dy / sc.zoom };
      sc.render();
      refreshGhost();
    },
    pan: (dx, dy) => {
      sc.camera = { x: sc.camera.x + dx / sc.zoom, y: sc.camera.y + dy / sc.zoom };
      draw();
      refreshGhost();
    },
  });
  $('scZoomGroup').replaceWith(sc.zoomControls.group);
  sc.zoomControls.group.id = 'scZoomGroup';
}

/** Adds the help button, and wires the grid, snap, preview and display settings. */
export function topBarControls() {
  host.querySelector('.scTop .studioBarEnd').append(StudioShell.helpButton());
  $('scGrid').onchange = $('scBackground').oninput = draw;
  // Snap becomes a toggle button next to the zoom controls, matching the tileset
  // editor's Tile-grid button; the checkbox stays as the value every drag/place/
  // ghost check already reads, just hidden from view.
  $('scSnapRow').hidden = true;
  const snapToggle = iconButton('scSnapToggle', 'Snap to the tile grid', 'snap');
  const syncSnap = () => {
    snapToggle.classList.toggle('on', $('scSnap').checked);
    snapToggle.setAttribute('aria-pressed', String($('scSnap').checked));
  };
  snapToggle.onclick = () => {
    $('scSnap').checked = !$('scSnap').checked;
    syncSnap();
  };
  syncSnap();
  $('scSnapRow').after(snapToggle);
  // The Preview panel, shown or hidden with the same button as the tileset
  // editor's.
  const previewToggle = iconButton('scPreviewToggle', 'Preview', 'miniature');
  const syncPreview = () => {
    previewToggle.classList.toggle('on', sc.previewVisible);
    previewToggle.setAttribute('aria-expanded', String(sc.previewVisible));
  };
  previewToggle.onclick = () => {
    sc.previewVisible = !sc.previewVisible;
    syncPreview();
    draw();
  };
  syncPreview();
  $('scDisplaySettings').after(previewToggle);
  // "Display settings" popover, matching the tileset editor's gear-icon popup.
  const settingsSummary = $('scDisplaySettings').querySelector('summary');
  StudioShell.setIcon(settingsSummary, 'settings', 'Display settings');
}

/** Wires the shortcuts, and resets Space and any drag when the window loses focus. */
export function shapeKeys() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (currentView !== 'shapes' || isField(e.target)) return;
      const key = e.key.toLowerCase();
      if (e.code === 'Space') {
        sc.space = true;
        e.preventDefault();
        return;
      }
      if (key === 'escape') {
        sc.drag = null;
        setMode('move');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        sc.selected = new Set(spritesOf().map((_, i) => i));
        sc.render();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'v', 'd'].includes(key)) {
        const done = { c: copySprites, x: cutSprites, v: pasteSprites, d: duplicateSprites }[key]();
        if (done || key === 'd') {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (/** @type {HTMLElement} */ (e.target).closest?.('[role="option"]')) return;
      if (sc.selected.size && ['delete', 'backspace'].includes(key)) {
        e.preventDefault();
        $('scRemove').click();
      }
      const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[
        key
      ];
      if (d && sc.selected.size) {
        e.preventDefault();
        translate(...d);
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.shiftKey && (key === 'h' || key === 'v')) {
          if (sc.selected.size) {
            e.preventDefault();
            flip(key === 'h' ? 'x' : 'y');
          }
          return;
        }
        const mode = { v: 'move', s: 'box', h: 'pan' }[key];
        if (mode) {
          e.preventDefault();
          setMode(mode);
        }
      }
    },
    true,
  );
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') sc.space = false;
  });
  window.addEventListener('blur', () => {
    sc.space = false;
    sc.drag = null;
    sc.placing = false;
    hideGhost();
    draw();
  });
}
