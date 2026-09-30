// The music editor's top bar and keyboard: the zoom buttons (the wheel
// scrolls), help, and the shortcuts.
import { $, isField } from '../dom.js';
import { currentView } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import { canvas, clampScroll, fitLevel, stepAt, stepW } from './geometry.js';
import { KEYS_W, mu, setTool, song } from './model.js';
import {
  copyNotes,
  cutNotes,
  duplicateNotes,
  invertNotes,
  pasteNotes,
  removeNotes,
  reverseNotes,
  selectAll,
  shift,
  toggleLegato,
} from './notes.js';
import { toggle } from './playback.js';
import { draw } from './view.js';
import { chooseVoice } from './voices.js';

const host = $('musicEditor');

/** Builds the zoom buttons and the help button into the top bar. */
export function musicZoom() {
  mu.zoomControls = StudioShell.canvasZoom({
    view: 'music',
    prefix: 'mu',
    min: 0.25,
    max: 4,
    get: () => mu.zoom,
    set: (next, x) => {
      const r = canvas.getBoundingClientRect(),
        px = x === undefined ? (canvas.clientWidth + KEYS_W) / 2 : x - r.left,
        step = stepAt(px);
      mu.zoom = next;
      mu.scrollX = step * stepW() - (px - KEYS_W);
      clampScroll();
      mu.render();
    },
    fit: () => {
      if (!song()) return;
      mu.zoom = fitLevel();
      mu.scrollX = 0;
      mu.render();
    },
    wheel: canvas,
    pan: (dx, dy) => {
      mu.scrollX += dx;
      mu.scrollY += dy;
      clampScroll();
      draw();
    },
    busy: () => !!mu.drag,
  });
  host.querySelector('.muTop .studioBarStart').after(mu.zoomControls.group);
  host.querySelector('.muTop .studioBarEnd').append(StudioShell.helpButton());
}

/** Wires the shortcuts. Space plays and pauses when tapped, and pans while held. */
export function musicKeys() {
  StudioShell.viewKeys('music', (e, { key, mod, handled }) => {
    if (
      /** @type {HTMLElement} */ (e.target).closest?.('button,[role="option"]') &&
      (e.code === 'Space' || e.key === 'Enter')
    )
      return;
    if (e.code === 'Space') {
      handled();
      if (!e.repeat && !mu.drag) mu.space = true;
      return;
    }
    if (!song()) return;
    if (mod && key === 'a') {
      handled();
      selectAll();
      return;
    }
    if (mod && ['c', 'x', 'v', 'd'].includes(key)) {
      const done = { c: copyNotes, x: cutNotes, v: pasteNotes, d: duplicateNotes }[key]();
      if (done || key === 'd') handled();
      return;
    }
    if (mod || e.altKey) return;
    if (/** @type {HTMLElement} */ (e.target).closest?.('[role="option"]')) return;
    if (key === 'escape') {
      mu.selection = new Set();
      mu.drag = null;
      mu.render();
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      if (removeNotes()) handled();
      return;
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) && mu.selection.size) {
      handled();
      if (key === 'arrowup' || key === 'arrowdown')
        shift(0, (key === 'arrowup' ? 1 : -1) * (e.shiftKey ? 12 : 1));
      else shift(key === 'arrowleft' ? -1 : 1, 0);
      return;
    }
    if (e.shiftKey && (key === 'h' || key === 'v')) {
      handled();
      (key === 'h' ? reverseNotes : invertNotes)();
      return;
    }
    if (!e.shiftKey && /^[1-4]$/.test(key)) {
      handled();
      chooseVoice(Number(key) - 1);
      return;
    }
    if (key === 'l' && !e.shiftKey) {
      handled();
      toggleLegato();
      return;
    }
    const name = { s: 'select', b: 'pencil', e: 'eraser', h: 'pan' }[key];
    if (name && !e.shiftKey) {
      handled();
      setTool(name);
    }
  });
  // Space plays and pauses when tapped, and pans while held, as elsewhere.
  let spacePanned = false;
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || currentView !== 'music' || !mu.space) return;
    mu.space = false;
    if (!spacePanned && !isField(e.target)) toggle();
    spacePanned = false;
  });
  canvas.addEventListener(
    'pointerdown',
    () => {
      if (mu.space) spacePanned = true;
    },
    true,
  );
  // Switching windows mid-drag never delivers the pointerup, so drop the drag
  // here; otherwise the next click would carry it on.
  window.addEventListener('blur', () => {
    mu.space = false;
    if (!mu.drag) return;
    mu.drag = null;
    mu.render();
  });
}
