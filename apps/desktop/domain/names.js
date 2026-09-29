// Asset names. Every asset kind has a name the build step turns into a file
// name or an assembler symbol, so names follow one of two patterns and are
// unique within their kind, ignoring case.

/** Tilesets, backgrounds, overlays and placeholders: a file name. */
export const FILE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,47}$/;
/** Shapes, animations, sounds, songs and instruments: an assembler symbol. */
export const SYMBOL_NAME = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/** Whether an item other than the one at `except` already uses `name`. */
export function nameTaken(items, name, except = -1) {
  const lower = name.toLowerCase();
  return items.some((item, i) => i !== except && item.name.toLowerCase() === lower);
}

/**
 * Whether `name` may be given to the item at `index`: it matches `pattern`
 * and no other item uses it.
 */
export function canRename(items, index, name, pattern) {
  return pattern.test(name) && !nameTaken(items, name, index);
}

/** The first of base_1, base_2, … that no item uses. */
export function freshName(items, base) {
  let n = 1;
  while (nameTaken(items, `${base}_${n}`)) n++;
  return `${base}_${n}`;
}

/** `name` if no item uses it, else the first of name_2, name_3, … that none does. */
export function uniqueName(items, name) {
  let unique = name,
    n = 2;
  while (nameTaken(items, unique)) unique = name + '_' + n++;
  return unique;
}
