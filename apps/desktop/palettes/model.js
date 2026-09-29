// What the palette library's parts share: which palette is open, which
// color is being edited, and which configs use a palette.
import { paletteUsage } from '../domain/palettes.js';
import { paletteConfigs, paletteLibrary } from '../state.js';

/** The palette library's working state; the palettes live in state.js. */
export const pl = {
  /** The open palette's index in the library. */
  index: 0,
  /** The color the color input is editing. */
  editing: 0,
  /** Redraws the palette library; palette-library.js fills this in. */
  render: () => {},
};

/** The open palette, if any. */
export const palette = () => paletteLibrary[pl.index];
// A palette is used by the configs that place it in a bank. Nothing else binds
// one: a tile records a bank number, and a sprite part names a bank outright.
export function usage(id) {
  return paletteUsage(paletteConfigs, id);
}
/** The color of the focused swatch, or null when no swatch has focus. */
export const focusedInk = () => {
  const el = /** @type {HTMLElement} */ (document.activeElement);
  return el?.closest?.('#palColors') && el.dataset.ink !== undefined
    ? Number(el.dataset.ink)
    : null;
};
