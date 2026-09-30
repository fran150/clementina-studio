// Keyboard shortcuts that belong to one editor.
import { isField } from '../dom.js';
import { currentView } from '../state.js';

/**
 * @typedef {object} KeyInfo
 * @property {string} key The key, in lower case: 'a', 'escape', 'arrowup'.
 * @property {boolean} mod Whether Ctrl (Cmd on a Mac) is held.
 * @property {() => void} handled Marks the key as answered: the browser's own
 *   action and every later listener are skipped.
 */

/**
 * Listens for key presses while `view` is the open editor. Every editor
 * skips the same keys: those typed into a text field, and all keys while a
 * dialog is open. The listener runs in the capture phase, ahead of the
 * page's other key handlers.
 * @param {string} view The view name, as `currentView` holds it.
 * @param {(e: KeyboardEvent, info: KeyInfo) => void} handler
 */
export function viewKeys(view, handler) {
  window.addEventListener(
    'keydown',
    (e) => {
      if (currentView !== view || isField(e.target) || document.querySelector('dialog[open]'))
        return;
      handler(e, {
        key: e.key.toLowerCase(),
        mod: e.ctrlKey || e.metaKey,
        handled() {
          e.preventDefault();
          e.stopImmediatePropagation();
        },
      });
    },
    true,
  );
}
