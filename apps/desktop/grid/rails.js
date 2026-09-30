// The grid editors' rails and edit actions. The left rail holds the editor's
// panel toggles, its tools, then copy, paste, undo and redo; the right rail
// holds the editor's own panel toggles, the flips and Priority the next
// stamp (or the selection) takes, then clearing the selection.
import { StudioShell } from '../studio-shell.js';

/**
 * Wires up the edit actions of one grid editor and returns its rail builder.
 *
 * @param {any} ed The editor's shared state and helpers (see grid-editor.js).
 */
export function gridRails(ed) {
  const { el, host, prefix, selection, view } = ed;

  // Copy, Paste and Delete follow the selection and the clipboard.
  function syncEditActions() {
    el('Copy').disabled = el('DeleteSelection').disabled = !selection.rect;
    el('Paste').disabled = !StudioShell.clipboard.has('cells');
  }
  document.addEventListener('studioclipboard', () => {
    if (!host.hidden) syncEditActions();
  });
  StudioShell.editActions(view, {
    copy: () => selection.copy(),
    cut: () => selection.cut(),
    paste: ed.startPaste,
  });

  // Builds both rails around the editor's own `panels`, `tools` and
  // `sidePanels` buttons.
  function buildRails({ panels, tools, sidePanels }) {
    const rail = StudioShell.toolRail(prefix + 'Rail', ed.railLabel);
    host.prepend(rail);
    const button = (id, label, icon, onclick) =>
      Object.assign(StudioShell.iconButton(prefix + id, label, icon), { onclick });
    StudioShell.railLayout(
      rail,
      [panels, tools],
      [
        button(
          'Copy',
          'Copy selection (Ctrl/Cmd+C)',
          'copy',
          () => selection.copy() && syncEditActions(),
        ),
        button('Paste', 'Paste (Ctrl/Cmd+V) — click to place it', 'paste', ed.startPaste),
        ...StudioShell.historyButtons(prefix),
      ],
    );
    const sideRail = StudioShell.toolRail(prefix + 'SideRail', 'Selection', 'right');
    host.append(sideRail);
    for (const [id, icon, label] of [
      ['FlipX', 'flipH', 'Flip horizontally (Shift+H) — the selection, or the next stamp'],
      ['FlipY', 'flipV', 'Flip vertically (Shift+V) — the selection, or the next stamp'],
      [
        'Priority',
        'priority',
        'Priority, drawn in front of sprites — the selection, or the next stamp',
      ],
    ])
      StudioShell.setIcon(el(id), icon, label);
    StudioShell.railLayout(sideRail, [
      sidePanels,
      [el('FlipX'), el('FlipY'), el('Priority')],
      [
        button('DeleteSelection', 'Clear the selected cells (Delete)', 'delete', () =>
          selection.remove(),
        ),
      ],
    ]);
  }

  return { syncEditActions, buildRails };
}
