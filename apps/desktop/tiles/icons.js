// Icons for the tile editor's buttons: a few glyphs of its own, and every
// other icon from StudioShell.icons.
// Tool-option glyphs; every other icon comes from StudioShell.icons.
import { StudioShell } from '../studio-shell.js';

export const paths = {};
/** Gives `button` the icon `name` and the label `label`. */
export function icon(button, name, label) {
  StudioShell.setIcon(button, paths[name] ?? name, label);
}
