// The music editor's rails: the left one opens the song and instrument
// lists and holds the tools, clipboard and history; the right one opens the
// song and instrument properties and holds the note actions.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { setTool } from './model.js';
import {
  copyNotes,
  duplicateNotes,
  invertNotes,
  pasteNotes,
  removeNotes,
  reverseNotes,
  shift,
  toggleLegato,
} from './notes.js';

const host = $('musicEditor');

/** Builds both rails and their panel toggles; the lists and instrument panel start closed. */
export function musicRails() {
  const library = host.querySelector('.muLibrary'),
    instrumentLibrary = host.querySelector('.muInstrumentLibrary'),
    songProps = host.querySelector('.muSongProps'),
    instrumentProps = host.querySelector('.muInstrumentProps');
  const toolButton = (id, label, icon, name) =>
    Object.assign(StudioShell.iconButton(id, label, icon), { onclick: () => setTool(name) });
  const action = (id, label, icon, fn) =>
    Object.assign(StudioShell.iconButton(id, label, icon), { onclick: fn });
  const rail = StudioShell.toolRail('muRail', 'Music tools');
  host.prepend(rail);
  StudioShell.railLayout(
    rail,
    [
      [
        StudioShell.panelToggle(library, 'muLibraryToggle', 'Songs', 'music', 'muLeft'),
        StudioShell.panelToggle(
          instrumentLibrary,
          'muInstrumentLibraryToggle',
          'Instruments',
          'instrument',
          'muLeft',
        ),
      ],
      [
        toolButton(
          'muSelectTool',
          'Select (S) — click or box notes, then move, transpose, copy or delete them',
          'select',
          'select',
        ),
        toolButton(
          'muPencilTool',
          'Pencil (B) — click to add a note, drag to size it; drag a note to move it, its end to resize it',
          'pencil',
          'pencil',
        ),
        toolButton(
          'muEraserTool',
          'Eraser (E) — click or drag across notes to remove them',
          'eraser',
          'eraser',
        ),
        toolButton(
          'muPanTool',
          'Pan (H) — drag to scroll; Space or the middle button pan with any other tool active',
          'pan',
          'pan',
        ),
      ],
    ],
    [
      action('muCopy', 'Copy notes (Ctrl/Cmd+C)', 'copy', copyNotes),
      action('muPaste', 'Paste notes at the cursor (Ctrl/Cmd+V)', 'paste', pasteNotes),
      ...StudioShell.historyButtons('mu'),
    ],
  );
  const sideRail = StudioShell.toolRail('muSideRail', 'Notes', 'right');
  host.append(sideRail);
  StudioShell.railLayout(sideRail, [
    [
      StudioShell.panelToggle(
        songProps,
        'muSongPropsToggle',
        'Song — tempo, length, loop, pans and sequencer size',
        'properties',
        'muRight',
        true,
      ),
      StudioShell.panelToggle(
        instrumentProps,
        'muInstrumentPropsToggle',
        'Instrument — waveform, pulse width, volume and envelope',
        'settings',
        'muRight',
      ),
    ],
    [
      action('muReverse', 'Reverse the notes in time (Shift+H)', 'flipH', reverseNotes),
      action('muInvert', "Invert the notes' pitch (Shift+V)", 'flipV', invertNotes),
    ],
    [
      action('muTransposeUp', 'Transpose up a semitone (↑; Shift: an octave)', 'transposeUp', () =>
        shift(0, 1),
      ),
      action(
        'muTransposeDown',
        'Transpose down a semitone (↓; Shift: an octave)',
        'transposeDown',
        () => shift(0, -1),
      ),
      action(
        'muLegato',
        'Legato (L) — slide into the notes from the one before, without restarting the envelope',
        'legato',
        toggleLegato,
      ),
    ],
    [
      action(
        'muDuplicateNotes',
        'Duplicate the notes after themselves (Ctrl/Cmd+D)',
        'duplicate',
        duplicateNotes,
      ),
      action('muDeleteNotes', 'Delete the notes (Delete)', 'delete', removeNotes),
    ],
  ]);
  StudioShell.setIcon($('muRewind'), 'previous', 'Back to the start');
  library.hidden = true;
  instrumentLibrary.hidden = true;
  instrumentProps.hidden = true;
  for (const id of ['muLibraryToggle', 'muInstrumentLibraryToggle', 'muInstrumentPropsToggle'])
    $(id).setAttribute('aria-expanded', 'false');
}
