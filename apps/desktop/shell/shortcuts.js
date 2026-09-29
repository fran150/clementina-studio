// The keyboard shortcut sheet: the keys that work everywhere, then the
// current editor's. Opened with ?, Ctrl/Cmd+/, Help ▸ Keyboard Shortcuts or
// any editor's ? button.
import { isField } from '../dom.js';
import { currentView } from '../state.js';

const SHORTCUTS = {
  everywhere: [
    ['Ctrl/Cmd+N, O, S, Shift+S', 'New, open, save, save as'],
    ['Ctrl/Cmd+Z', 'Undo'],
    ['Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y', 'Redo'],
    ['Ctrl/Cmd+C, X, V', 'Copy, cut, paste'],
    ['Scroll or two-finger swipe', 'Pan the canvas (Shift: sideways)'],
    ['Pinch or Ctrl/Cmd+scroll', 'Zoom around the pointer'],
    ['Ctrl/Cmd+= / −', 'Zoom in / out'],
    ['Ctrl/Cmd+0 · Ctrl/Cmd+Alt+0', 'Zoom to fit · actual size'],
    [
      'Ctrl/Cmd+1 … 9',
      'Palettes, Tilesets, Shapes, Animations, Backgrounds, Overlays, Sounds, Music, Builder',
    ],
    ['Space-drag or middle-drag', 'Pan with any tool'],
    ['F2 or double-click', 'Rename a library item; right-click for more'],
    ['? or Ctrl/Cmd+/', 'This list'],
  ],
  tiles: [
    ['S · B · E · G', 'Select · pencil · eraser · fill'],
    ['L · R · O · I · H', 'Line · rectangle · ellipse · pick color · pan'],
    ['Shift while drawing', 'Square or circle'],
    ['Right-click', 'Erase with a painting tool; otherwise the edit menu'],
    ['Shift+H · Shift+V', 'Flip the selection'],
    ['Ctrl/Cmd+A', 'Select all'],
    ['Arrows', 'Move the selection'],
    ['Delete', 'Clear the selection'],
    ['Ctrl/Cmd+Shift+V', 'Paste with the source palettes'],
    ['Escape', 'Drop the selection or paste'],
  ],
  backgrounds: [
    ['S · B · E · G', 'Select · pencil · eraser · fill'],
    ['R · I · H', 'Rectangle · pick tile · pan'],
    ['Right-click', 'Erase with a painting tool; otherwise the edit menu'],
    ['Shift+H · Shift+V', 'Flip the selection, or the next stamp'],
    ['Ctrl/Cmd+A', 'Select all'],
    ['Drag inside the selection · arrows', 'Move it'],
    ['Delete', 'Clear the selection'],
    ['Escape', 'Drop the selection or paste'],
  ],
  shapes: [
    ['V · S · H', 'Select and move · box select · pan'],
    ['Shift-click', 'Add or remove a sprite'],
    ['Right-click', 'The edit menu'],
    ['Shift+H · Shift+V', 'Flip the selected sprites'],
    ['Ctrl/Cmd+A', 'Select all sprites'],
    ['Ctrl/Cmd+D', 'Duplicate'],
    ['Arrows', 'Nudge one pixel'],
    ['Delete', 'Remove'],
    ['Escape', 'Back to Select and move'],
  ],
  animations: [
    ['Space', 'Play or pause'],
    ['← · →', 'Previous · next frame'],
    ['Alt+← · → on a frame', 'Move it earlier · later'],
    ['Shift+H · Shift+V', 'Flip the frame'],
    ['Ctrl/Cmd+D', 'Duplicate the frame'],
    ['Delete', 'Remove the frame'],
    ['Right-click a frame', 'The frame menu'],
  ],
  palettes: [
    ['Ctrl/Cmd+C · V', 'Copy · paste the palette, or the focused color'],
    ['Right-click a color', 'Copy, paste or edit it'],
  ],
  sounds: [
    ['Space', 'Play or stop'],
    ['S · B · L · E · H', 'Select frames · pencil · line · eraser · pan'],
    ['Right-click', 'Write 0 with a painting tool; otherwise the edit menu'],
    ['↑ · ↓ (Shift: octave)', 'Transpose the selected frames'],
    ['Shift+H · Shift+V', 'Reverse the frames · invert their pitch'],
    ['Ctrl/Cmd+A · D', 'Select all frames · duplicate the selection'],
    ['Delete', 'Remove the selected frames'],
    ['Escape', 'Deselect'],
  ],
  builder: [
    ['Ctrl/Cmd+C · X · V', 'Copy · cut · paste the selected slot'],
    ['Delete', 'Delete the selected slot'],
    ['Drag an asset onto a slot', "Make it the asset's default slot"],
  ],
  music: [
    ['Space', 'Play or pause'],
    ['1 … 4', 'Draw on voice 0 … 3'],
    ['S · B · E · H', 'Select · pencil · eraser · pan'],
    ['Right-click', 'Erase with a painting tool; otherwise the edit menu'],
    ['← · →', 'Move the selected notes a step'],
    ['↑ · ↓ (Shift: octave)', 'Transpose the selected notes'],
    ['Shift+H · Shift+V', 'Reverse the notes in time · invert their pitch'],
    ['L', 'Legato: slide into the selected notes'],
    ['Ctrl/Cmd+A · D', 'Select all notes on the voice · duplicate them'],
    ['Delete', 'Remove the selected notes'],
    ['Escape', 'Deselect'],
  ],
};
SHORTCUTS.overlays = SHORTCUTS.backgrounds;
const shortcutSheet = document.createElement('dialog');
shortcutSheet.id = 'shortcutHelp';
/** Opens the shortcut sheet for the current editor. */
export function showShortcuts() {
  if (shortcutSheet.open) return;
  const names = {
    tiles: 'Tilesets',
    palettes: 'Palettes',
    overlays: 'Overlays',
    backgrounds: 'Backgrounds',
    shapes: 'Shapes',
    animations: 'Animations',
    sounds: 'Sounds',
    music: 'Music',
    builder: 'Builder',
  };
  const table = (title, rows) =>
    `<h3>${title}</h3><dl>${rows.map(([keys, what]) => `<dt>${keys}</dt><dd>${what}</dd>`).join('')}</dl>`;
  shortcutSheet.innerHTML = `<h2>Keyboard shortcuts</h2>${table('Everywhere', SHORTCUTS.everywhere)}${table(names[currentView], SHORTCUTS[currentView] ?? [])}<form method="dialog"><button>Close</button></form>`;
  shortcutSheet.showModal();
}
/** A ? button that opens the shortcut sheet. */
export function helpButton() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'studioHelp';
  b.textContent = '?';
  b.title = 'Keyboard shortcuts (?)';
  b.setAttribute('aria-label', 'Keyboard shortcuts');
  b.onclick = showShortcuts;
  return b;
}

/** Adds the sheet to the page and opens it on ? or Ctrl/Cmd+/. */
export function installShortcuts() {
  document.body.append(shortcutSheet);
  window.addEventListener(
    'keydown',
    (e) => {
      if (isField(e.target) || document.querySelector('dialog[open]')) return;
      if (
        (e.key === '?' && !e.ctrlKey && !e.metaKey) ||
        ((e.ctrlKey || e.metaKey) && e.key === '/')
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showShortcuts();
      }
    },
    true,
  );
}
