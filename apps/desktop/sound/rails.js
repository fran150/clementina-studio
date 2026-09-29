// The sound editor's rails: the left one opens the sound list and holds the
// tools, clipboard and history; the right one opens the properties and
// holds reverse, invert, transpose, duplicate and delete.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import {
  copyFrames,
  duplicateFrames,
  invert,
  pasteFrames,
  removeFrames,
  reverse,
  transpose,
} from './editing.js';
import { TOOLS, setTool } from './model.js';
import { toolButtons } from '../audio/tools.js';

const host = $('soundEditor');

/** Builds both rails and their panel toggles; the sound list starts closed. */
export function soundRails() {
  const library = host.querySelector('.sfLibrary'),
    props = host.querySelector('.sfProps');
  const libraryToggle = StudioShell.panelToggle(
    library,
    'sfLibraryToggle',
    'Sounds',
    'sound',
    'sfLeft',
  );
  const action = (id, label, icon, fn) =>
    Object.assign(StudioShell.iconButton(id, label, icon), { onclick: fn });
  const rail = StudioShell.toolRail('sfRail', 'Sound tools');
  host.prepend(rail);
  StudioShell.railLayout(
    rail,
    [[libraryToggle], toolButtons('sf', TOOLS, setTool)],
    [
      action('sfCopy', 'Copy frames (Ctrl/Cmd+C)', 'copy', copyFrames),
      action('sfPaste', 'Paste frames after the selection (Ctrl/Cmd+V)', 'paste', pasteFrames),
      ...StudioShell.historyButtons('sf'),
    ],
  );
  const propsToggle = StudioShell.panelToggle(
    props,
    'sfPropsToggle',
    'Sound — envelope, pan, length and presets',
    'properties',
    'sfRight',
    true,
  );
  const sideRail = StudioShell.toolRail('sfSideRail', 'Frames', 'right');
  host.append(sideRail);
  StudioShell.railLayout(sideRail, [
    [propsToggle],
    [
      action(
        'sfReverse',
        'Reverse (Shift+H) — the selected frames, or the whole sound',
        'flipH',
        reverse,
      ),
      action(
        'sfInvert',
        'Invert pitch (Shift+V) — the selected frames, or the whole sound',
        'flipV',
        invert,
      ),
    ],
    [
      action('sfTransposeUp', 'Transpose up a semitone (↑; Shift: an octave)', 'transposeUp', () =>
        transpose(1),
      ),
      action(
        'sfTransposeDown',
        'Transpose down a semitone (↓; Shift: an octave)',
        'transposeDown',
        () => transpose(-1),
      ),
    ],
    [
      action(
        'sfDuplicateFrames',
        'Duplicate the selected frames (Ctrl/Cmd+D)',
        'duplicate',
        duplicateFrames,
      ),
      action('sfDeleteFrames', 'Delete the selected frames (Delete)', 'delete', removeFrames),
    ],
  ]);
  library.hidden = true;
  libraryToggle.setAttribute('aria-expanded', 'false');
}
