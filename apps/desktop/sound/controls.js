// The sound editor's playback, top bar and keyboard: play and stop with a
// moving playhead, the zoom buttons and pitch snap, and the shortcuts.
import { StudioAudio } from '../audio-shared.js';
import { $, isField } from '../dom.js';
import { currentView } from '../state.js';
import { StudioShell } from '../studio-shell.js';
import {
  copyFrames,
  cutFrames,
  duplicateFrames,
  invert,
  pasteFrames,
  removeFrames,
  reverse,
  selectAll,
  transpose,
} from './editing.js';
import { canvas, clampScroll, fitLevel, frameW } from './geometry.js';
import { A, LABEL_W, setTool, sf, sound } from './model.js';
import { draw, sync } from './view.js';

const host = $('soundEditor');

// ===== playback =====
/** Plays the sound, or stops it if it is playing. */
export function play() {
  if (StudioAudio.playing()) {
    StudioAudio.stop();
    return;
  }
  if (!sound() || !A()) return;
  StudioAudio.play(A().soundStream(sound()), {
    onEnd: () => {
      sf.playhead = null;
      sf.render();
    },
  });
  sf.render();
  tick();
}
/** Moves the playhead along with the audio, each animation frame, until it stops. */
function tick() {
  if (!StudioAudio.playing() || host.hidden) {
    sf.playhead = null;
    draw();
    return;
  }
  sf.playhead = StudioAudio.position() / A().FRAME_SAMPLES;
  draw();
  sync();
  requestAnimationFrame(tick);
}

// ===== the top bar =====
/** Builds the zoom buttons (the wheel scrolls the frames) and the pitch snap toggle. */
export function soundZoom() {
  sf.zoomControls = StudioShell.canvasZoom({
    view: 'sounds',
    ids: {
      fit: 'sfFit',
      actual: 'sfActualSize',
      zoomOut: 'sfZoomOut',
      label: 'sfZoomLabel',
      zoomIn: 'sfZoomIn',
    },
    min: 0.5,
    max: 4,
    get: () => sf.zoom,
    set: (next, x) => {
      const r = canvas.getBoundingClientRect(),
        px = x === undefined ? (canvas.clientWidth + LABEL_W) / 2 : x - r.left,
        frame = (px - LABEL_W + sf.scrollX) / frameW();
      sf.zoom = next;
      sf.scrollX = clampScroll(frame * frameW() - (px - LABEL_W));
      sf.render();
    },
    fit: () => {
      if (!sound()) return;
      sf.zoom = fitLevel();
      sf.scrollX = 0;
      sf.render();
    },
    wheel: canvas,
    pan: (dx, dy) => {
      sf.scrollX = clampScroll(sf.scrollX + dx + dy);
      draw();
    },
    busy: () => !!sf.drag,
  });
  host.querySelector('.sfTop .studioBarStart').after(sf.zoomControls.group);
  const snapToggle = StudioShell.iconButton('sfSnapToggle', 'Snap pitch to semitones', 'snap');
  snapToggle.onclick = () => {
    sf.snap = !sf.snap;
    sf.render();
  };
  host.querySelector('.sfTop .studioBarEnd').append(snapToggle, StudioShell.helpButton());
}

// ===== keys =====
/** Wires the shortcuts. Space plays and stops: on its own, a tap; held, it pans. */
export function soundKeys() {
  window.addEventListener(
    'keydown',
    (e) => {
      if (currentView !== 'sounds' || isField(e.target) || document.querySelector('dialog[open]'))
        return;
      const key = e.key.toLowerCase(),
        mod = e.ctrlKey || e.metaKey,
        handled = () => {
          e.preventDefault();
          e.stopImmediatePropagation();
        };
      // Keys a focused button or list row already answers are left to it.
      if (
        /** @type {HTMLElement} */ (e.target).closest?.('button,[role="option"]') &&
        (e.code === 'Space' || e.key === 'Enter')
      )
        return;
      if (e.code === 'Space') {
        handled();
        if (!e.repeat && !sf.drag) sf.space = true;
        return;
      }
      if (!sound()) return;
      if (mod && key === 'a') {
        handled();
        selectAll();
        return;
      }
      if (mod && ['c', 'x', 'v', 'd'].includes(key)) {
        const done = { c: copyFrames, x: cutFrames, v: pasteFrames, d: duplicateFrames }[key]();
        if (done || key === 'd') handled();
        return;
      }
      if (mod || e.altKey) return;
      if (/** @type {HTMLElement} */ (e.target).closest?.('[role="option"]')) return;
      if (key === 'escape') {
        sf.selection = null;
        sf.drag = null;
        sf.render();
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        if (removeFrames()) handled();
        return;
      }
      if (key === 'arrowup' || key === 'arrowdown') {
        handled();
        transpose((key === 'arrowup' ? 1 : -1) * (e.shiftKey ? 12 : 1));
        return;
      }
      if (e.shiftKey && (key === 'h' || key === 'v')) {
        handled();
        (key === 'h' ? reverse : invert)();
        return;
      }
      const name = { s: 'select', b: 'pencil', l: 'line', e: 'eraser', h: 'pan' }[key];
      if (name && !e.shiftKey) {
        handled();
        setTool(name);
      }
    },
    true,
  );
  let spacePanned = false;
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || currentView !== 'sounds' || !sf.space) return;
    sf.space = false;
    if (!spacePanned && !isField(e.target)) play();
    spacePanned = false;
  });
  canvas.addEventListener(
    'pointerdown',
    () => {
      if (sf.space) spacePanned = true;
    },
    true,
  );
  window.addEventListener('blur', () => {
    sf.space = false;
    sf.drag = null;
  });
}
