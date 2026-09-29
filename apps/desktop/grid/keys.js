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
    // No `!spaceHeld` guard here: held keys repeat-fire keydown, and every
    // one of those must be prevented too, or the un-prevented repeats leave
    // the browser's native "Space pages the nearest scrollable ancestor
    // down" behavior free to fire on the stage in between them.
    if (e.code === 'Space') {
      ed.spaceHeld = true;
      e.preventDefault();
      canvas.style.cursor = 'grab';
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
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      ed.spaceHeld = false;
      canvas.style.cursor = ed.restCursor();
    }
  });
  window.addEventListener('blur', () => {
    ed.spaceHeld = false;
    ed.panDrag = null;
    canvas.style.cursor = ed.restCursor();
  });
  // Space-drag, the middle button, or the Pan tool all scroll the stage
  // instead of painting. Capture phase and stopImmediatePropagation so this
  // runs before the canvas's own paint handlers or any handle's drag.
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2 || (!ed.spaceHeld && e.button !== 1 && ed.tool !== 'pan')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      ed.panDrag = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      stage.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
    },
    true,
  );
  stage.addEventListener(
    'pointermove',
    (e) => {
      const drag = ed.panDrag;
      if (!drag) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      stage.scrollLeft = drag.left + drag.x - e.clientX;
      stage.scrollTop = drag.top + drag.y - e.clientY;
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel'])
    stage.addEventListener(
      type,
      (e) => {
        if (!ed.panDrag) return;
        ed.panDrag = null;
        e.stopImmediatePropagation();
        canvas.style.cursor = ed.spaceHeld || ed.tool === 'pan' ? 'grab' : '';
      },
      true,
    );
}
