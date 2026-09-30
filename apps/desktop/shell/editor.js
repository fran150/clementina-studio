// What every editor registers once: its status line, when it redraws, and
// what it does when it is hidden, left or handed a different project.
import { newProject, redrawAll, restoreStudioProject, showView } from '../lifecycle.js';
import { currentView } from '../state.js';
import { viewStatus } from './layout.js';

/**
 * @typedef {object} EditorOptions
 * @property {string} view The view name, as `currentView` holds it.
 * @property {HTMLElement} host The editor's root element, shown only in its view.
 * @property {() => void} render Redraws the editor; it starts with `shown()`.
 * @property {HTMLElement} [status] The editor's status line.
 * @property {() => void} [onHide] Runs when a render finds the editor hidden,
 *   such as dropping a hover highlight.
 * @property {(view: string) => void} [onShow] Runs after the render that
 *   follows every view switch.
 * @property {() => void} [onLeave] Runs when the workspace switches from this
 *   editor to another, such as stopping playback.
 * @property {() => void} [onReset] Runs before File > New or opening a
 *   project, to drop selections into the old one.
 */

/**
 * Registers an editor: it redraws on a config change and on every view
 * switch, and its status line shows only in its view.
 * @param {EditorOptions} options
 * @returns {{ shown(): boolean }} `shown()` shows or hides the host for the
 *   current view and says whether the editor is showing; a render that finds
 *   it hidden stops there.
 */
export function defineEditor({ view, host, render, status, onHide, onShow, onLeave, onReset }) {
  if (status) viewStatus(view, status);
  redrawAll.after(render);
  showView.after((next) => {
    render();
    onShow?.(next);
  });
  if (onLeave)
    showView.before((next) => {
      if (next !== view && currentView === view) onLeave();
    });
  if (onReset) {
    newProject.before(onReset);
    restoreStudioProject.before(onReset);
  }
  return {
    shown() {
      host.hidden = currentView !== view;
      if (host.hidden) onHide?.();
      return !host.hidden;
    },
  };
}
