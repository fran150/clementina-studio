// Music authoring. A song is four voices of notes on a step grid — MIA's four
// voices, each playing one note at a time — and plays as the background
// sequencer plays it: compiled to each voice's track (compileSong in
// packages/assets/audio.ts) and run on the same engine as the chip. A note
// plays an instrument, the registers the sequencer's SET_* opcodes put on a
// voice between notes. See docs/audio.md.
//
// This file holds the song library, rendering and wiring; its parts live in
// music/: the shared model, the roll's geometry and drawing, the note edits,
// playback, pointer input, the voice strip, the song and instrument panels,
// the top bar and keys, and the rails.
import { StudioAudio } from './audio-shared.js';
import { canAdd, copyAsset, newId, removeAt } from './domain/assets.js';
import { SYMBOL_NAME, canRename, freshName } from './domain/names.js';
import { NOTES } from './domain/songs.js';
import { $ } from './dom.js';
import { musicKeys, musicZoom } from './music/controls.js';
import { canvas, center, clampScroll, fitLevel, pitchY, stepX } from './music/geometry.js';
import { instrumentLibrary, instrumentProps, renderInstrumentProps } from './music/instruments.js';
import { A, ROW_H, RULER_H, edit, instrument, mu, notes, song } from './music/model.js';
import { copyNotes, cutNotes, pasteNotes, selected } from './music/notes.js';
import { replay, rewind, toggle } from './music/playback.js';
import { canvasPointer } from './music/pointer.js';
import { musicRails } from './music/rails.js';
import { renderSongProps, songProps } from './music/song-props.js';
import { draw, syncPosition } from './music/view.js';
import { renderVoices } from './music/voices.js';
import { currentView, instruments, setInstruments, songs } from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('musicEditor');
const workspace = StudioShell.defineEditor({
  view: 'music',
  host,
  render,
  status: $('muStatus'),
  onHide: () => (mu.hover = null),
  onLeave: StudioAudio.stop,
  onReset: () => {
    StudioAudio.stop();
    mu.selection = new Set();
    mu.cursor = 0;
    mu.voice = 0;
  },
});

// ===== the parts =====
StudioShell.editActions('music', { copy: copyNotes, cut: cutNotes, paste: pasteNotes });
$('muPlay').onclick = toggle;
$('muRewind').onclick = rewind;
canvasPointer();
musicZoom();
songProps();
instrumentProps();
const instrumentList = instrumentLibrary();

// ===== the song library =====
// Whether the last New song also added the starting instruments.
let madeKit = false;
const songLibrary = StudioShell.assetLibrary({
  noun: 'song',
  plural: 'songs',
  list: $('muList'),
  items: () => songs,
  index: () => mu.songIndex,
  choose: chooseSong,
  rename: renameSong,
  render: () => mu.render(),
  maxLength: 32,
  buttons: {
    rail: $('muActions'),
    create: 'muNew',
    duplicate: 'muDuplicate',
    remove: 'muDelete',
    empty: 'muEmptyNew',
  },
  ready: () => (A() ? null : 'The audio engine is still loading. Try again in a moment.'),
  // A first song comes with instruments to draw with.
  create: (label) => {
    madeKit = !instruments.length;
    edit(
      label,
      () => {
        if (madeKit) setInstruments(A().defaultInstruments(newId));
        songs.push(A().newSong(newId(), freshName(songs, 'Song')));
        mu.songIndex = songs.length - 1;
        mu.selection = new Set();
        mu.cursor = 0;
      },
      madeKit ? ['songs', 'instruments'] : ['songs'],
    );
  },
  created: (s) => `Created ${s.name}${madeKit ? ' and four starting instruments' : ''}.`,
  copy: (s, label) =>
    edit(label, () => {
      songs.push(copyAsset(s, freshName(songs, 'Song')));
      mu.songIndex = songs.length - 1;
      mu.selection = new Set();
    }),
  remove: (s, label) => {
    StudioAudio.stop();
    edit(label, () => {
      mu.songIndex = removeAt(songs, mu.songIndex);
      mu.selection = new Set();
    });
  },
});
/** Opens song `i`; another song starts stopped, at its first step. */
function chooseSong(i) {
  if (i !== mu.songIndex) {
    StudioAudio.stop();
    mu.cursor = 0;
  }
  mu.songIndex = i;
  mu.selection = new Set();
  render();
}
/** Renames song `i`; false (with a hint) when the name is taken or not a symbol. */
function renameSong(i, name) {
  if (!canRename(songs, i, name, SYMBOL_NAME)) {
    setStatus('Use a unique name: letters, digits, underscores; start with a letter.');
    return false;
  }
  edit('Rename a song', () => (songs[i].name = name));
  return true;
}

// ===== rendering =====
/** Redraws the whole editor: lists, bars, tools, voices, panels and the roll. */
function render() {
  if (!workspace.shown()) return;
  mu.songIndex = Math.max(0, Math.min(mu.songIndex, songs.length - 1));
  mu.instrumentIndex = Math.max(0, Math.min(mu.instrumentIndex, instruments.length - 1));
  const s = song();
  $('muEmpty').hidden = !!s;
  StudioShell.emptyEditor(host, !s);
  $('muWork').hidden = !s;
  songLibrary.render();
  instrumentList.render();
  $('muDuplicate').disabled = $('muDelete').disabled = !s;
  $('muNew').disabled = !canAdd(songs);
  $('muInstrumentDuplicate').disabled = $('muInstrumentDelete').disabled = !instrument();
  renderInstrumentProps();
  if (!s) {
    $('muStatus').textContent = '';
    return;
  }
  mu.selection = new Set(notes().filter((n) => mu.selection.has(n)));
  mu.cursor = Math.max(0, Math.min(mu.cursor, s.length - 1));
  $('muTitle').textContent = s.name;
  for (const [id, name] of [
    ['muSelectTool', 'select'],
    ['muPencilTool', 'pencil'],
    ['muEraserTool', 'eraser'],
    ['muPanTool', 'pan'],
  ])
    $(id).classList.toggle('on', mu.tool === name);
  const playing = StudioAudio.playing() && !mu.audition;
  StudioShell.setIcon(
    $('muPlay'),
    playing ? 'pause' : 'play',
    playing ? 'Pause (Space)' : 'Play from the cursor (Space)',
  );
  $('muPlay').setAttribute('aria-pressed', String(playing));
  const sel = mu.selection.size > 0;
  for (const id of [
    'muCopy',
    'muReverse',
    'muInvert',
    'muTransposeUp',
    'muTransposeDown',
    'muLegato',
    'muDuplicateNotes',
    'muDeleteNotes',
  ])
    $(id).disabled = !sel;
  $('muLegato').classList.toggle('on', sel && selected().every((n) => n.legato));
  $('muPaste').disabled = !StudioShell.clipboard.has('notes');
  renderVoices();
  renderSongProps();
  // A song opens fitted across and showing its notes; coming back keeps the view.
  if (s.id !== mu.fittedId && canvas.clientWidth) {
    mu.fittedId = s.id;
    mu.zoom = fitLevel();
    mu.scrollX = 0;
    center();
  }
  clampScroll();
  mu.zoomControls.sync();
  draw();
  syncPosition();
}
mu.render = render;

// ===== wiring =====
musicRails();
document.addEventListener('studioclipboard', () => {
  if (!host.hidden) $('muPaste').disabled = !StudioShell.clipboard.has('notes');
});
document.addEventListener('studiohistory', () => {
  mu.songIndex = Math.max(0, Math.min(mu.songIndex, songs.length - 1));
  mu.instrumentIndex = Math.max(0, Math.min(mu.instrumentIndex, instruments.length - 1));
  mu.selection = new Set();
  mu.drag = null;
  if (currentView === 'music') setTimeout(replay);
});

musicKeys();

new ResizeObserver(() => {
  if (!host.hidden) render();
}).observe($('muStage'));
document.addEventListener('miaaudioready', () => render());
// Where a step and pitch are on screen, scrolling the pitch into view: for
// driving the roll with real pointer input in tests/desktop-audio.cjs.
/** @type {any} */ (host).pointAt = (step, pitch) => {
  if (pitchY(pitch) < RULER_H || pitchY(pitch) + ROW_H > canvas.clientHeight) {
    mu.scrollY = (NOTES - 1 - pitch) * ROW_H - (canvas.clientHeight - RULER_H) / 2;
    clampScroll();
    draw();
  }
  const r = canvas.getBoundingClientRect();
  return { x: r.left + stepX(step), y: r.top + pitchY(pitch) + ROW_H / 2 };
};
export { render as renderMusic };
render();
