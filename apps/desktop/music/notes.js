// The music editor's edits on the selected notes: move and transpose,
// reverse, invert, legato, delete, the clipboard, and select all. Each is
// one undoable step.
import {
  invertedNotes,
  noteSpan as span,
  notesAt,
  relativeNotes,
  reversedNotes,
  setLegato,
  settle,
  shiftBlocked,
  shiftedNotes,
} from '../domain/songs.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { instruments } from '../state.js';
import { edit, instrument, instrumentById, mu, notes, song } from './model.js';
import { hear } from './playback.js';

// Replaces the selected notes with `moved` (new objects), settling the voice around them.
export function place(label, moved) {
  const s = song(),
    v = s.voices[mu.voice],
    others = v.notes.filter((n) => !mu.selection.has(n));
  edit(label, () => {
    v.notes = settle(others, moved, s.length);
    mu.selection = new Set(moved.filter((n) => v.notes.includes(n)));
  });
}
/** The selected notes, in the voice's order. */
export const selected = () => notes().filter((n) => mu.selection.has(n));
/** Moves the selection by `steps` and `semitones`; false (with a hint) if it cannot. */
export function shift(steps, semitones) {
  const list = selected();
  if (!list.length) return false;
  const blocked = shiftBlocked(list, steps, semitones, song().length);
  if (blocked) {
    setStatus(
      blocked === 'pitch'
        ? 'The notes would leave the pitch range, C0 to B7.'
        : 'The notes would leave the song.',
    );
    return false;
  }
  place(
    semitones ? (semitones > 0 ? 'Transpose up' : 'Transpose down') : 'Move notes',
    shiftedNotes(list, steps, semitones),
  );
  if (semitones) hear(list[0].pitch + semitones, list[0].instrumentId);
  return true;
}
/** Plays the selected notes backwards. */
export function reverseNotes() {
  const list = selected();
  if (!list.length) return;
  place('Reverse the notes', reversedNotes(list));
}
/** Mirrors the selected notes' pitch. */
export function invertNotes() {
  const list = selected();
  if (!list.length) return;
  place('Invert the notes', invertedNotes(list));
}
/** Makes the selected notes slide from the one before, or restart again. */
export function toggleLegato() {
  const list = selected();
  if (!list.length) return;
  const on = !list.every((n) => n.legato);
  edit(on ? 'Slide into the notes' : 'Restart the notes', () => setLegato(list, on));
}
/** Deletes the selected notes; false if none. */
export function removeNotes() {
  const list = selected();
  if (!list.length) return false;
  const v = song().voices[mu.voice];
  edit(list.length > 1 ? 'Delete notes' : 'Delete a note', () => {
    v.notes = v.notes.filter((n) => !mu.selection.has(n));
    mu.selection = new Set();
  });
  return true;
}
/** Copies the selected notes to the app clipboard; false if none. */
export function copyNotes() {
  const list = selected();
  if (!list.length) return false;
  StudioShell.clipboard.set('notes', relativeNotes(list));
  return true;
}
/** Copies, then deletes, the selected notes. */
export function cutNotes() {
  return copyNotes() && removeNotes();
}
/** Adds `list` (step-relative notes) at step `at`, selected; false if it cannot. */
function addNotes(list, at, label) {
  const s = song();
  if (!s || !list?.length) return false;
  if (at >= s.length) {
    setStatus('Move the cursor inside the song to paste there.');
    return false;
  }
  const added = notesAt(list, at, (id) => !!instrumentById(id), instrument()?.id);
  const v = s.voices[mu.voice];
  edit(label, () => {
    v.notes = settle(v.notes, added, s.length);
    mu.selection = new Set(added.filter((n) => v.notes.includes(n)));
  });
  return true;
}
/** Pastes the clipboard's notes at the cursor. */
export const pasteNotes = () =>
  addNotes(StudioShell.clipboard.get('notes'), mu.cursor, 'Paste notes');
/** Duplicates the selected notes right after themselves. */
export function duplicateNotes() {
  const list = selected();
  if (!list.length) return false;
  return addNotes(relativeNotes(list), span(list).to, 'Duplicate notes');
}
/** Selects every note on the voice, with the Select tool. */
export function selectAll() {
  if (!song()) return;
  if (mu.tool !== 'select') mu.tool = 'select';
  mu.selection = new Set(notes());
  mu.render();
}
// Selecting notes that share an instrument shows it, ready to edit.
export function followSelection() {
  const ids = new Set(selected().map((n) => n.instrumentId));
  if (ids.size === 1) {
    const i = instruments.findIndex((x) => ids.has(x.id));
    if (i >= 0) mu.instrumentIndex = i;
  }
}
