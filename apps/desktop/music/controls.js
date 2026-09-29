// The music editor's top bar and keyboard: the zoom buttons (the wheel
// scrolls), help, and the shortcuts.
import { timelineKeys } from '../audio/keys.js';
import { toolKeys } from '../audio/tools.js';
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { canvas, clampScroll, fitLevel, stepAt, stepW } from './geometry.js';
import { KEYS_W, mu, setTool, song, TOOLS } from './model.js';
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
  timelineKeys({
    view: 'music',
    canvas,
    state: mu,
    open: () => !!song(),
    tap: toggle,
    clipboard: { c: copyNotes, x: cutNotes, v: pasteNotes, d: duplicateNotes },
    selectAll,
    deselect: () => (mu.selection = new Set()),
    remove: removeNotes,
    flip: { h: reverseNotes, v: invertNotes },
    tools: toolKeys(TOOLS),
    setTool,
    extra: (e, key, handled) => {
      // The arrows move the selected notes: Up and Down by a semitone, or an
      // octave with Shift; Left and Right by a step.
      if (key.startsWith('arrow') && mu.selection.size) {
        handled();
        if (key === 'arrowup' || key === 'arrowdown')
          shift(0, (key === 'arrowup' ? 1 : -1) * (e.shiftKey ? 12 : 1));
        else shift(key === 'arrowleft' ? -1 : 1, 0);
        return true;
      }
      // 1 to 4 pick the voice to draw on; L makes the selected notes legato.
      if (!e.shiftKey && /^[1-4]$/.test(key)) {
        handled();
        chooseVoice(Number(key) - 1);
        return true;
      }
      if (key === 'l' && !e.shiftKey) {
        handled();
        toggleLegato();
        return true;
      }
      return false;
    },
  });
}
