// Sound effect authoring. A sound is one voice's registers frame by frame at
// 60 Hz — pitch, volume, pulse width, waveform and gate — under one envelope
// and pan: what a game's driver writes to a voice it takes from the music
// (VTAKE) for a few frames before giving it back (VGIVE). Each frame is a
// column across five lanes, drawn like pixels. See docs/audio.md.
//
// This file holds the sound library, rendering and wiring; its parts live in
// sound/: the shared model, the canvas geometry and drawing, the edits,
// pointer input, the properties panel, playback with the top bar and keys,
// and the rails.
import { StudioAudio } from './audio-shared.js';
import { canAdd, copyAsset, newId, removeAt } from './domain/assets.js';
import { SYMBOL_NAME, canRename, freshName } from './domain/names.js';
import { $ } from './dom.js';
import { play, soundKeys, soundZoom } from './sound/controls.js';
import { copyFrames, cutFrames, pasteFrames } from './sound/editing.js';
import { canvas, clampScroll, fitLevel, frameX, lanes } from './sound/geometry.js';
import { A, edit, sf, sound } from './sound/model.js';
import { canvasPointer } from './sound/pointer.js';
import { buildPresets, soundProps, syncProps } from './sound/props.js';
import { soundRails } from './sound/rails.js';
import { draw, sync } from './sound/view.js';
import { sounds } from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('soundEditor');
const workspace = StudioShell.defineEditor({
  view: 'sounds',
  host,
  render,
  status: $('sfStatus'),
  onHide: () => (sf.hover = null),
  onLeave: StudioAudio.stop,
  onReset: () => {
    StudioAudio.stop();
    sf.selection = null;
  },
});

// ===== the parts =====
StudioShell.editActions('sounds', { copy: copyFrames, cut: cutFrames, paste: pasteFrames });
canvasPointer();
soundZoom();
$('sfPlay').onclick = play;

// ===== the sound library =====
const library = StudioShell.assetLibrary({
  noun: 'sound',
  plural: 'sounds',
  list: $('sfList'),
  items: () => sounds,
  index: () => sf.soundIndex,
  choose: chooseSound,
  rename: renameSound,
  render,
  maxLength: 32,
  buttons: {
    rail: $('sfActions'),
    create: 'sfNew',
    duplicate: 'sfDuplicate',
    remove: 'sfDelete',
    empty: 'sfEmptyNew',
  },
  ready: () => (A() ? null : 'The audio engine is still loading. Try again in a moment.'),
  create: (label) =>
    edit(label, () => {
      sounds.push(A().newSound(newId(), freshName(sounds, 'Sound')));
      sf.soundIndex = sounds.length - 1;
      sf.selection = null;
    }),
  copy: (s, label) =>
    edit(label, () => {
      sounds.push(copyAsset(s, freshName(sounds, 'Sound')));
      sf.soundIndex = sounds.length - 1;
    }),
  remove: (s, label) => {
    StudioAudio.stop();
    edit(label, () => {
      sf.soundIndex = removeAt(sounds, sf.soundIndex);
      sf.selection = null;
    });
  },
});
/** Opens sound `i`, stopping playback if it is another sound. */
function chooseSound(i) {
  if (i !== sf.soundIndex) StudioAudio.stop();
  sf.soundIndex = i;
  sf.selection = null;
  render();
}
/** Renames sound `i`; false (with a hint) when the name is taken or not a symbol. */
function renameSound(i, name) {
  if (!canRename(sounds, i, name, SYMBOL_NAME)) {
    setStatus('Use a unique name: letters, digits, underscores; start with a letter.');
    return false;
  }
  edit('Rename a sound', () => (sounds[i].name = name));
  return true;
}

soundProps();

// ===== rendering =====
/** Redraws the whole editor: the list, bars, tools, properties and canvas. */
function render() {
  if (!workspace.shown()) return;
  sf.soundIndex = Math.max(0, Math.min(sf.soundIndex, sounds.length - 1));
  const s = sound();
  $('sfEmpty').hidden = !!s;
  StudioShell.emptyEditor(host, !s);
  $('sfWork').hidden = !s;
  library.render();
  $('sfDuplicate').disabled = $('sfDelete').disabled = !s;
  $('sfNew').disabled = !canAdd(sounds);
  if (!s) {
    $('sfStatus').textContent = '';
    return;
  }
  if (sf.selection && (sf.selection.to > s.frames.length || sf.selection.from >= sf.selection.to))
    sf.selection = null;
  buildPresets();
  $('sfTitle').textContent = s.name;
  for (const [id, name] of [
    ['sfSelectTool', 'select'],
    ['sfPencilTool', 'pencil'],
    ['sfLineTool', 'line'],
    ['sfEraserTool', 'eraser'],
    ['sfPanTool', 'pan'],
  ])
    $(id).classList.toggle('on', sf.tool === name);
  $('sfSnapToggle').classList.toggle('on', sf.snap);
  $('sfSnapToggle').setAttribute('aria-pressed', String(sf.snap));
  const playing = StudioAudio.playing();
  StudioShell.setIcon(
    $('sfPlay'),
    playing ? 'stop' : 'play',
    playing ? 'Stop (Space)' : 'Play (Space)',
  );
  $('sfPlay').setAttribute('aria-pressed', String(playing));
  $('sfCopy').disabled =
    $('sfDeleteFrames').disabled =
    $('sfDuplicateFrames').disabled =
      !sf.selection;
  $('sfPaste').disabled = !StudioShell.clipboard.has('soundFrames');
  syncProps();
  // A sound opens fitted to the window; coming back to one keeps its zoom.
  if (s.id !== sf.fittedId && canvas.clientWidth) {
    sf.fittedId = s.id;
    sf.zoom = fitLevel();
    sf.scrollX = 0;
  }
  sf.scrollX = clampScroll(sf.scrollX);
  sf.zoomControls.sync();
  draw();
  sync();
}
sf.render = render;

// ===== wiring =====
soundRails();
document.addEventListener('studioclipboard', () => {
  if (!host.hidden) $('sfPaste').disabled = !StudioShell.clipboard.has('soundFrames');
});
document.addEventListener('studiohistory', () => {
  sf.soundIndex = Math.max(0, Math.min(sf.soundIndex, sounds.length - 1));
  sf.selection = null;
});

soundKeys();

new ResizeObserver(() => {
  if (!host.hidden) render();
}).observe($('sfStage'));
document.addEventListener('miaaudioready', () => render());
// Where a frame's column crosses a lane, `t` of the way down it: for driving
// the lanes with real pointer input in tests/desktop-audio.cjs.
/** @type {any} */ (host).pointAt = (frame, key, t = 0.5) => {
  const lane = lanes().find((l) => l.key === key),
    r = canvas.getBoundingClientRect();
  return { x: r.left + frameX(frame + 0.5), y: r.top + lane.top + t * lane.height };
};
export { render as renderSounds };
render();
