// The sound editor's playback, top bar and keyboard: play and stop with a
// moving playhead, the zoom buttons and pitch snap, and the shortcuts.
import { StudioAudio } from '../audio-shared.js';
import { timelineKeys } from '../audio/keys.js';
import { toolKeys } from '../audio/tools.js';
import { $ } from '../dom.js';
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
import { A, LABEL_W, setTool, sf, sound, TOOLS } from './model.js';
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
    prefix: 'sf',
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
  timelineKeys({
    view: 'sounds',
    canvas,
    state: sf,
    open: () => !!sound(),
    tap: play,
    clipboard: { c: copyFrames, x: cutFrames, v: pasteFrames, d: duplicateFrames },
    selectAll,
    deselect: () => (sf.selection = null),
    remove: removeFrames,
    flip: { h: reverse, v: invert },
    tools: toolKeys(TOOLS),
    setTool,
    // Up and Down transpose the selection, or the whole sound; Shift by an octave.
    extra: (e, key, handled) => {
      if (key !== 'arrowup' && key !== 'arrowdown') return false;
      handled();
      transpose((key === 'arrowup' ? 1 : -1) * (e.shiftKey ? 12 : 1));
      return true;
    },
  });
}
