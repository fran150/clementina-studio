// The palette library's rail: the Palettes and Bank configs panel toggles,
// and copy, paste, undo and redo.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { copyPalette, pastePalette } from './clipboard.js';
import { palette } from './model.js';

const host = $('paletteWorkspace');
const iconButton = (id, label, icon) => StudioShell.iconButton(id, label, icon);

/** Adds the ? button, binds the two panels and builds the rail. */
export function paletteRails() {
  const library = $('palLibrary'),
    configsPanel = $('palConfigs');
  $('palTop').append(Object.assign(StudioShell.helpButton(), { style: 'margin-left:auto' }));
  const toggle = iconButton('palLibraryToggle', 'Palettes', 'palette');
  StudioShell.bindPanel({ panel: library, button: toggle, closeId: 'palClose' });

  const configsToggle = iconButton('palConfigsToggle', 'Bank configs', 'bankConfig');
  StudioShell.bindPanel({ panel: configsPanel, button: configsToggle, closeId: 'palConfigsClose' });
  StudioShell.editActions('palettes', { copy: copyPalette, paste: pastePalette });
  StudioShell.railLayout(
    $('palRail'),
    [[toggle, configsToggle]],
    [
      Object.assign(
        iconButton('palCopy', 'Copy palette (Ctrl/Cmd+C) — or the focused color', 'copy'),
        { onclick: copyPalette },
      ),
      Object.assign(iconButton('palPaste', 'Paste palette or color (Ctrl/Cmd+V)', 'paste'), {
        onclick: pastePalette,
      }),
      ...StudioShell.historyButtons('pal'),
    ],
  );
  document.addEventListener('studioclipboard', () => {
    if (!host.hidden)
      $('palPaste').disabled =
        !palette() || !(StudioShell.clipboard.has('palette') || StudioShell.clipboard.has('color'));
  });
}
