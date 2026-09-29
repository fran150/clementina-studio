// The builder's rails: the asset library and tools on the left, the
// properties and Delete on the right, and copy, paste, undo and redo.
import { $ } from '../dom.js';
import { ProjectHistory } from '../history.js';
import { StudioShell } from '../studio-shell.js';
import { addSlot, copy, paste, remove } from './slots.js';

const host = $('builderEditor');

/** Builds both rails and binds their panels. */
export function builderRails() {
  StudioShell.editActions('builder', { copy, cut: () => copy() && remove(), paste });
  const action = (id, label, icon, fn) =>
    Object.assign(StudioShell.iconButton(id, label, icon), { onclick: fn });
  const left = StudioShell.toolRail('buRail', 'Builder tools');
  host.prepend(left);
  const library = StudioShell.iconButton('buLibraryToggle', 'Build assets', 'tileset');
  StudioShell.bindPanel({
    panel: host.querySelector('.buLibrary'),
    button: library,
    group: 'buLeft',
  });
  StudioShell.railLayout(
    left,
    [
      [library],
      [
        action('buSelect', 'Select assets and slots', 'select', () => {}),
        action('buNewSlot', 'New memory slot', 'newItem', () => addSlot()),
      ],
    ],
    [
      action('buCopy', 'Copy slot', 'copy', copy),
      action('buPaste', 'Paste slot', 'paste', paste),
      action('buUndo', 'Undo', 'undo', ProjectHistory.undo),
      action('buRedo', 'Redo', 'redo', ProjectHistory.redo),
    ],
  );
  const right = StudioShell.toolRail('buRightRail', 'Builder properties', 'right');
  host.append(right);
  const props = StudioShell.iconButton('buPropsToggle', 'Properties', 'properties');
  StudioShell.bindPanel({ panel: host.querySelector('.buProps'), button: props, group: 'buRight' });
  StudioShell.railLayout(right, [[props], [action('buDelete', 'Delete slot', 'delete', remove)]]);
}
