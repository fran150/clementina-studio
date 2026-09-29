// The project's palette library. One palette can be bound by many banks and
// named by many sprite parts, so every edit here is visible everywhere at once.
//
// This file holds rendering and wiring; its parts live in palettes/: the
// shared model, copy and paste, the rail, the palette list, bank configs and
// the color swatches.
import { $, isField } from './dom.js';
import { renderPaletteLibrary, showView } from './lifecycle.js';
import { copyPalette, pastePalette } from './palettes/clipboard.js';
import { colorInput, renderColors } from './palettes/colors.js';
import { configActions, renderConfigs } from './palettes/configs.js';
import { libraryActions, renderPaletteList } from './palettes/library.js';
import { palette, pl } from './palettes/model.js';
import { paletteRails } from './palettes/rails.js';
import { activeConfig, currentView, paletteConfigs, paletteLibrary } from './state.js';
import { StudioShell } from './studio-shell.js';

const host = $('paletteWorkspace');
paletteRails();
libraryActions();
configActions();

// ===== rendering =====
/** Redraws the library: configs, bars, the open palette's colors and the list. */
function render() {
  if (host.hidden) return;
  renderConfigs();
  if (pl.index >= paletteLibrary.length) pl.index = Math.max(0, paletteLibrary.length - 1);
  const entry = palette();
  $('palCopy').disabled = !entry;
  $('palPaste').disabled =
    !entry || !(StudioShell.clipboard.has('palette') || StudioShell.clipboard.has('color'));
  $('palDelete').disabled = !entry || paletteLibrary.length === 1;
  $('palDuplicate').disabled = !entry;
  $('palName').textContent = entry ? entry.name : 'No palettes';
  $('palStatus').textContent =
    `${paletteLibrary.length} palette${paletteLibrary.length === 1 ? '' : 's'} · ${paletteConfigs.length} bank config${paletteConfigs.length === 1 ? '' : 's'} · previewing "${activeConfig()?.name ?? 'none'}"`;
  renderColors(entry);
  renderPaletteList();
}
pl.render = render;

// ===== wiring =====
colorInput();
window.addEventListener(
  'keydown',
  (event) => {
    if (currentView !== 'palettes' || !(event.metaKey || event.ctrlKey) || isField(event.target))
      return;
    const key = event.key.toLowerCase();
    if (key !== 'c' && key !== 'v') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (key === 'c') copyPalette();
    else pastePalette();
  },
  true,
);
showView.after((view) => {
  host.hidden = view !== 'palettes';
  render();
});
StudioShell.viewStatus('palettes', $('palStatus'));
renderPaletteLibrary.after(render);
