// The app's clipboard: one item tagged with its kind, so a paste only lands
// where that kind of thing fits — cells in the background and overlay
// editors, sprites in shapes, frames in animations, palettes and colors in
// the palette editor, sound frames and notes in the audio editors. Copies go
// in and out by value.
import { isField } from '../dom.js';
import { currentView } from '../state.js';

let clip = null;
export const clipboard = Object.freeze({
  set(kind, data) {
    clip = { kind, data: structuredClone(data) };
    document.dispatchEvent(new Event('studioclipboard'));
  },
  get(kind) {
    return clip?.kind === kind ? structuredClone(clip.data) : null;
  },
  has(kind) {
    return clip?.kind === kind;
  },
});

// Edit ▸ Cut, Copy and Paste, clicked in the menu, reach the page as the
// browser's own clipboard events. Outside a text field they run the current
// editor's command — the same one its keyboard shortcut runs; the shortcuts
// themselves are handled first, so a key press never runs both.
const editCommands = new Map();
/** Registers `view`'s cut, copy and paste commands for the Edit menu. */
export function editActions(view, commands) {
  editCommands.set(view, commands);
}

/** Routes the Edit menu's cut, copy and paste to the current editor. */
export function installEditCommands() {
  for (const type of ['cut', 'copy', 'paste'])
    document.addEventListener(type, (event) => {
      const target = /** @type {HTMLElement} */ (event.target);
      if (isField(target) || target?.isContentEditable) return;
      const run = editCommands.get(currentView)?.[type];
      if (!run) return;
      event.preventDefault();
      run();
    });
}
