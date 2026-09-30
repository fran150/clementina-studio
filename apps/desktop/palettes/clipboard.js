// Copy and paste, through the app clipboard: the whole selected palette, or
// one color when a swatch has focus. A copied color pastes into the swatch
// with focus, or the one last edited; it is the same clipboard the tileset
// editor's palette dock copies colors to.
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { focusedInk, palette, paletteEdit, pl } from './model.js';

/** Copies the palette, or the focused color; false when there is no palette. */
export function copyPalette() {
  const entry = palette(),
    ink = focusedInk();
  if (!entry) return false;
  if (ink !== null) {
    StudioShell.clipboard.set('color', entry.colors[ink]);
    setStatus(`Copied color ${ink} of ${entry.name}.`);
  } else {
    StudioShell.clipboard.set('palette', entry.colors);
    setStatus(`Copied ${entry.name}.`);
  }
  pl.render();
  return true;
}
/** Pastes a copied palette or color; false when there is nothing to paste. */
export function pastePalette() {
  const entry = palette();
  if (!entry) return false;
  const colors = StudioShell.clipboard.get('palette'),
    color = StudioShell.clipboard.get('color');
  if (colors)
    paletteEdit('Paste a palette', () => entry.colors.splice(0, colors.length, ...colors));
  else if (color !== null) {
    const ink = focusedInk() ?? pl.editing;
    paletteEdit('Paste a color', () => (entry.colors[ink] = color));
  } else return false;
  pl.render();
  return true;
}
