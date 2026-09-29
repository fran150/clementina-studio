// The Undo and Redo buttons every editor's rail ends with. They share one
// project history, so each one's tooltip names the step it would take and it
// is disabled when there is none; history.js keeps that current.
import { ProjectHistory, syncHistoryButton } from '../history.js';
import { iconButton } from './icons.js';

/**
 * Makes an editor's Undo and Redo buttons, with ids `<prefix>Undo` and
 * `<prefix>Redo`.
 * @param {string} prefix The editor's id prefix, such as 'sf'.
 * @returns {[HTMLButtonElement, HTMLButtonElement]}
 */
export function historyButtons(prefix) {
  const [undo, redo] = /** @type {const} */ (['undo', 'redo']).map((kind) => {
    const label = kind === 'undo' ? 'Undo' : 'Redo';
    const button = iconButton(prefix + label, label, kind);
    button.dataset.history = kind;
    button.onclick = ProjectHistory[kind];
    syncHistoryButton(button);
    return button;
  });
  return [undo, redo];
}
