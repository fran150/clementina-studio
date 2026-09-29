// What the music editor's parts share: the editor's working state, layout
// constants, the song, voice and instrument being edited, and undoable edits.
import { StudioAudio } from '../audio-shared.js';
import { ProjectHistory } from '../history.js';
import { instruments, songs } from '../state.js';
import { markDirty } from '../status.js';
import { replay } from './playback.js';

/** The MIA audio module (window.MiaAudio), once it has loaded; each voice's color. */
export const A = () => window.MiaAudio,
  COLORS = StudioAudio.voiceColors;
/** Layout, in CSS pixels: the keyboard's width, the ruler, a pitch row, a
 * step at 100%; and which semitones of an octave are black keys. */
export const KEYS_W = 54,
  RULER_H = 24,
  ROW_H = 12,
  STEP_W = 16,
  BLACK = [1, 3, 6, 8, 10];

/** The editor's working state; songs and instruments live in state.js. */
export const mu = {
  /** Which song and instrument are open, and the voice being drawn on. */
  songIndex: 0,
  instrumentIndex: 0,
  voice: 0,
  /** The active tool: 'select', 'pencil', 'eraser' or 'pan'. */
  tool: 'pencil',
  /** Horizontal zoom, and the scroll in pixels. */
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  /** The song last fitted to the window, so coming back keeps its view. */
  fittedId: null,
  /** The zoom buttons, once built. */
  zoomControls: null,
  /** The selected notes, on the voice being drawn on. */
  selection: new Set(),
  /** The drag in progress on the canvas, or null: its kind says which. */
  drag: null,
  /** What the pointer is over: step, pitch, note, and whether on the keys. */
  hover: null,
  /** Whether Space is held, which pans with any tool. */
  space: false,
  /** The step play and paste start from. */
  cursor: 0,
  /** The step playing, fractional, or null when stopped. */
  playhead: null,
  /** The length the pencil draws, the last one drawn or sized. */
  lastLength: 4,
  /** Set while a single note plays to audition it, rather than the song. */
  audition: null,
  /** Redraws the whole editor; music-editor.js fills this in. */
  render: () => {},
};
/** Which voices are muted while previewing. */
export const mutes = [false, false, false, false];

/** The song and instrument being edited, and the notes of the voice drawn on. */
export const song = () => songs[mu.songIndex],
  instrument = () => instruments[mu.instrumentIndex],
  notes = () => song()?.voices[mu.voice].notes ?? [];
/** The instrument with this id, if any. */
export const instrumentById = (id) => instruments.find((i) => i.id === id);

/** Records an undo step for `parts` of the project, labeled `label`. */
export function checkpoint(label, parts = ['songs']) {
  ProjectHistory.checkpoint(parts, label);
}
/**
 * Makes one undoable edit: runs fn, marks the project changed, redraws, and
 * carries on playing the edited song if it is playing.
 */
export function edit(label, fn, parts = ['songs']) {
  checkpoint(label, parts);
  fn();
  markDirty();
  mu.render();
  replay();
}
// Taking up a painting tool drops the selection, as in the grid editors;
// the pencil then selects the note it draws or grabs.
export function setTool(name) {
  if (name !== 'select' && name !== 'pan') mu.selection = new Set();
  mu.tool = name;
  mu.render();
}
