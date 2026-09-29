// The keyboard of the two audio editors, sounds and music. Both are a
// timeline drawn with tools, so they share their shortcuts: Space plays when
// tapped and pans while held, the clipboard keys, Escape, Delete, the flips
// on Shift+H and Shift+V, and single-letter tools.
import { isField } from '../dom.js';
import { currentView } from '../state.js';
import { StudioShell } from '../studio-shell.js';

/**
 * @typedef {object} TimelineKeys
 * @property {string} view The editor's view name.
 * @property {HTMLElement} canvas The timeline; a press on it while Space is
 *   held makes that Space a pan rather than a tap.
 * @property {{ space: boolean, drag: any, render(): void }} state The
 *   editor's state: whether Space is held, the drag in progress, and redraw.
 * @property {() => boolean} open Whether an asset is open to edit.
 * @property {() => void} tap What a Space tap does: play and stop, or pause.
 * @property {Record<'c' | 'x' | 'v' | 'd', () => any>} clipboard Copy, cut,
 *   paste and duplicate; each returns whether it acted (Mod+D always counts).
 * @property {() => void} selectAll
 * @property {() => void} deselect What Escape does after dropping any drag.
 * @property {() => boolean} remove Deletes the selection; whether it did.
 * @property {{ h: () => void, v: () => void }} flip Shift+H and Shift+V.
 * @property {Record<string, string>} tools A tool's name for each letter key.
 * @property {(name: string) => void} setTool
 * @property {(e: KeyboardEvent, key: string, handled: () => void) => boolean} [extra]
 *   The editor's own keys; returns whether it answered the key.
 */

/**
 * Wires an audio editor's shortcuts.
 * @param {TimelineKeys} options
 */
export function timelineKeys(options) {
  const { view, canvas, state } = options;
  StudioShell.viewKeys(view, (e, { key, mod, handled }) => {
    const target = /** @type {HTMLElement} */ (e.target);
    // Keys a focused button or list row already answers are left to it.
    if (target.closest?.('button,[role="option"]') && (e.code === 'Space' || e.key === 'Enter'))
      return;
    if (e.code === 'Space') {
      handled();
      if (!e.repeat && !state.drag) state.space = true;
      return;
    }
    if (!options.open()) return;
    if (mod && key === 'a') {
      handled();
      options.selectAll();
      return;
    }
    if (mod && ['c', 'x', 'v', 'd'].includes(key)) {
      const done = options.clipboard[key]();
      if (done || key === 'd') handled();
      return;
    }
    if (mod || e.altKey) return;
    if (target.closest?.('[role="option"]')) return;
    if (key === 'escape') {
      state.drag = null;
      options.deselect();
      state.render();
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      if (options.remove()) handled();
      return;
    }
    if (e.shiftKey && (key === 'h' || key === 'v')) {
      handled();
      options.flip[key]();
      return;
    }
    if (options.extra?.(e, key, handled)) return;
    const name = options.tools[key];
    if (name && !e.shiftKey) {
      handled();
      options.setTool(name);
    }
  });
  // Space on its own is a tap; a press on the canvas while it is held makes
  // it a pan instead, which the pointer code carries out.
  let panned = false;
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || currentView !== view || !state.space) return;
    state.space = false;
    if (!panned && !isField(e.target)) options.tap();
    panned = false;
  });
  canvas.addEventListener(
    'pointerdown',
    () => {
      if (state.space) panned = true;
    },
    true,
  );
  // Switching windows mid-drag never delivers the pointerup, so drop the drag
  // here; otherwise the next click would carry it on.
  window.addEventListener('blur', () => {
    state.space = false;
    if (!state.drag) return;
    state.drag = null;
    state.render();
  });
}
