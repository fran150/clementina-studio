// The grid editors' keyboard shortcuts and panning: selection and clipboard
// keys, the flips on Shift+H and Shift+V, single-letter tools, and scrolling
// the stage with Space-drag, the middle button or the Pan tool.
import { $ } from '../dom.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';

// Single-key tool shortcuts, the same letters as the tileset editor's.
const TOOL_KEYS = {
  s: 'select',
  b: 'pencil',
  r: 'rectangle',
  g: 'fill',
  e: 'eraser',
  i: 'picker',
  h: 'pan',
};

/**
 * Wires up the keys and panning of one grid editor.
 *
 * @param {any} ed The editor's shared state and helpers (see grid-editor.js).
 */
export function gridKeys(ed) {
  const { el, canvas, stage, selection, view } = ed;
  StudioShell.viewKeys(view, (e, { key, mod, handled }) => {
    // Selection and clipboard keys, the same in every grid editor.
    const command = selection.key(e);
    if (command) {
      handled();
      if ((command === 'selectAll' || command === 'paste') && ed.tool !== 'select')
        ed.setTool('select');
      if (command === 'paste') setStatus('Click to place the paste. Escape cancels.');
      return;
    }
    if (mod || e.altKey) return;
    if (e.shiftKey && (key === 'h' || key === 'v')) {
      handled();
      el(key === 'h' ? 'FlipX' : 'FlipY').click();
      return;
    }
    if (TOOL_KEYS[key] && !e.shiftKey) {
      handled();
      $(ed.toolId(TOOL_KEYS[key])).click();
    }
  });
  // Space-drag, the middle button, or the Pan tool all scroll the stage
  // instead of painting.
  StudioShell.stagePan({
    view,
    stage,
    cursor: canvas,
    panTool: () => ed.tool === 'pan',
    state: ed,
  });
}
