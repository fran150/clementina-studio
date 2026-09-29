// Palettes and bank configs. A palette is {id, name, colors} with eight
// RGB565 colors; the library holds every palette of the project. A config is
// {id, name, banks}, naming the palette in each of palette RAM's sixteen banks
// (or null for an empty bank). Nothing binds a palette to a bank except a
// config, so a tile records only a bank number and recolors when another
// config is active. Nothing here touches the page.
import { PAL_BANKS, PAL_COLORS } from './colors.js';

/** The colors an empty bank shows: all black. */
export const BLACK_PALETTE = Object.freeze(Array(PAL_COLORS).fill(0));

/** The first of "Palette 1", "Palette 2", … (or another base) no item uses. */
export function freshSpacedName(items, base) {
  const taken = new Set(items.map((p) => p.name.toLowerCase()));
  let n = 1;
  while (taken.has(`${base.toLowerCase()} ${n}`)) n++;
  return `${base} ${n}`;
}

/** A new palette holding a copy of `colors`. */
export function newPalette(id, name, colors) {
  return { id, name, colors: [...colors] };
}

/** The palette in the library with exactly these colors, if any. */
export function paletteWithColors(library, colors) {
  return library.find((p) => p.colors.every((v, i) => v === colors[i]));
}

/**
 * A new config. Without `banks` it fills its banks from the library in
 * order, so drawing can start at once.
 */
export function newConfig(id, name, library, banks) {
  return {
    id,
    name,
    banks: banks ? [...banks] : Array.from({ length: PAL_BANKS }, (_, i) => library[i]?.id ?? null),
  };
}

/** The palette a config places in a bank, or undefined when the bank is empty. */
export function configBankPalette(library, config, bank) {
  const id = config?.banks?.[bank];
  return library.find((p) => p.id === id);
}

/** The configs that place a palette in a bank, each with the banks it fills. */
export function paletteUsage(configs, id) {
  return configs
    .map((c) => ({ config: c, banks: c.banks.flatMap((b, i) => (b === id ? [i] : [])) }))
    .filter((u) => u.banks.length);
}

/** Replaces one palette with another (or null) in every bank of every config. */
export function repointBanks(configs, fromId, toId) {
  let banks = 0;
  for (const config of configs)
    config.banks = config.banks.map((b) => (b === fromId ? (banks++, toId) : b));
  return banks;
}
