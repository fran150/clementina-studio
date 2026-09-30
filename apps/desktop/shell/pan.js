// Panning a scrolled stage by dragging, the way image editors do: with Space
// held, with the middle button, or while the Pan tool is on.
import { viewKeys } from './keys.js';

/**
 * Wires the pan of one editor's stage. `state` records `spaceHeld` and the
 * `panDrag` in progress, which the editor reads to tell a pan from a stroke.
 * The pointer handlers run in the capture phase and stop there, so the
 * canvas's own paint handlers never see a pan.
 * @param {object} options
 * @param {string} options.view The editor's view name.
 * @param {HTMLElement} options.stage The scrolled element that moves.
 * @param {HTMLElement} options.cursor The element whose cursor shows the grab.
 * @param {() => boolean} options.panTool Whether the Pan tool is on.
 * @param {{ spaceHeld: boolean, panDrag: any }} options.state
 */
export function stagePan({ view, stage, cursor, panTool, state }) {
  const rest = () => (state.spaceHeld || panTool() ? 'grab' : '');
  // No `!spaceHeld` guard here: held keys repeat-fire keydown, and every
  // one of those must be prevented too, or the un-prevented repeats leave
  // the browser's native "Space pages the nearest scrollable ancestor
  // down" behavior free to fire on the stage in between them.
  viewKeys(view, (e) => {
    if (e.code !== 'Space') return;
    state.spaceHeld = true;
    e.preventDefault();
    cursor.style.cursor = 'grab';
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    state.spaceHeld = false;
    cursor.style.cursor = rest();
  });
  window.addEventListener('blur', () => {
    state.spaceHeld = false;
    state.panDrag = null;
    cursor.style.cursor = rest();
  });
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2 || (!state.spaceHeld && e.button !== 1 && !panTool())) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      state.panDrag = { x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
      stage.setPointerCapture(e.pointerId);
      cursor.style.cursor = 'grabbing';
    },
    true,
  );
  stage.addEventListener(
    'pointermove',
    (e) => {
      const drag = state.panDrag;
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
        if (!state.panDrag) return;
        state.panDrag = null;
        e.stopImmediatePropagation();
        cursor.style.cursor = rest();
      },
      true,
    );
}
