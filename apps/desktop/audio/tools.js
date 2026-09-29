// The drawing tools of the audio editors. Each editor lists its tools once,
// with the letter that picks each; the rail buttons, the shortcut keys and
// the highlighted button all come from that list, so they cannot disagree.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';

/**
 * @typedef {object} Tool
 * @property {string} name The tool's name, also its icon: 'pencil'.
 * @property {string} key The letter that picks it, in lower case.
 * @property {string} label The button's tooltip.
 */

// A tool's button id: sfPencilTool, muPanTool.
const toolId = (prefix, tool) => prefix + tool.name[0].toUpperCase() + tool.name.slice(1) + 'Tool';

/**
 * The rail buttons for `tools`, each picking its tool when clicked.
 * @param {string} prefix The editor's id prefix: 'sf'.
 * @param {Tool[]} tools
 * @param {(name: string) => void} setTool
 */
export function toolButtons(prefix, tools, setTool) {
  return tools.map((tool) =>
    Object.assign(StudioShell.iconButton(toolId(prefix, tool), tool.label, tool.name), {
      onclick: () => setTool(tool.name),
    }),
  );
}

/** Highlights the button of the `current` tool. */
export function syncTools(prefix, tools, current) {
  for (const tool of tools) $(toolId(prefix, tool)).classList.toggle('on', tool.name === current);
}

/**
 * The shortcut table for `tools`: each tool's name by its letter.
 * @param {Tool[]} tools
 */
export const toolKeys = (tools) => Object.fromEntries(tools.map((tool) => [tool.key, tool.name]));
