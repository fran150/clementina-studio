// What the sound editor's parts share: the editor's working state, the lanes
// it draws, the sound being edited, the active tool, and undoable edits.
import { ProjectHistory } from '../history.js';
import { sounds } from '../state.js';
import { markDirty } from '../status.js';

/** The MIA audio module (window.MiaAudio), once it has loaded. */
export const A = () => window.MiaAudio;
/** Layout, in CSS pixels: a frame's width at 100%, the label column, the
 * ruler, the gap between lanes; and the pitch lane's range in semitones. */
export const FRAME_W = 12,
  LABEL_W = 86,
  RULER_H = 22,
  GAP = 10,
  PITCH_LOW = 0,
  PITCH_HIGH = 96;
// The lanes, top to bottom: which frame field each draws, and its color.
export const LANES = [
  { key: 'freq', label: 'Pitch', color: '#ffb000' },
  { key: 'volume', label: 'Volume', color: '#7bd88f', height: 72 },
  { key: 'pulse', label: 'Pulse width', color: '#6fb7ff', height: 60 },
  { key: 'wave', label: 'Wave', color: '#ff6fae', height: 75 },
  { key: 'gate', label: 'Gate', color: '#a48bff', height: 22 },
];
export const WAVE_SHORT = ['Sine', 'Pulse', 'Saw', 'Tri', 'Noise'];

/** The editor's working state; the sounds themselves live in state.js. */
export const sf = {
  /** Which sound is open. */
  soundIndex: 0,
  /** The active tool: 'select', 'pencil', 'line', 'eraser' or 'pan'. */
  tool: 'pencil',
  /** Horizontal zoom, and how far the frames are scrolled, in pixels. */
  zoom: 1,
  scrollX: 0,
  /** The sound last fitted to the window, so coming back keeps its zoom. */
  fittedId: null,
  /** The zoom buttons, once built. */
  zoomControls: null,
  /** Whether drawn pitch snaps to semitones. */
  snap: true,
  /** The selected frames [from, to), belonging to the Select tool, or null. */
  selection: null,
  /** The drag in progress on the canvas, or null: its kind says which. */
  drag: null,
  /** The frame under the pointer, or null. */
  hover: null,
  /** Whether Space is held, which pans with any tool. */
  space: false,
  /** The frame playing, fractional, or null when stopped. */
  playhead: null,
  /** Redraws the whole editor; sound-editor.js fills this in. */
  render: () => {},
};

/** The sound being edited, if any. */
export const sound = () => sounds[sf.soundIndex],
  /** Its frames, one per 60 Hz tick. */
  frames = () => sound()?.frames ?? [];

/** Records an undo step for the sounds, labeled `label`. */
export function checkpoint(label) {
  ProjectHistory.checkpoint(['sounds'], label);
}
/**
 * Makes one undoable edit: edit('Reverse the frames', fn) runs fn, marks the
 * project changed and redraws.
 */
export function edit(label, fn) {
  checkpoint(label);
  fn();
  markDirty();
  sf.render();
}
/** Picks the active tool; any tool but Select and Pan drops the selection. */
export function setTool(name) {
  if (name !== 'select' && name !== 'pan') sf.selection = null;
  sf.tool = name;
  sf.render();
}
