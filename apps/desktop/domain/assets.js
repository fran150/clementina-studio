// Operations every list of assets shares: tilesets, backgrounds, overlays,
// shapes, animations, sounds, songs and instruments.

/** A project holds at most this many assets of each kind. */
export const MAX_ASSETS = 255;

/** Whether another asset fits in the list. */
export function canAdd(list) {
  return list.length < MAX_ASSETS;
}

/**
 * A new random id for an asset.
 * @returns {string}
 */
export function newId() {
  return crypto.randomUUID();
}

/**
 * A deep copy of an asset under a new id and name.
 * @template {{id: string, name: string}} T
 * @param {T} asset
 * @param {string} name
 * @param {string} [id]
 * @returns {T}
 */
export function copyAsset(asset, name, id = newId()) {
  const copy = structuredClone(asset);
  copy.id = id;
  copy.name = name;
  return copy;
}

/** Removes the asset at `index` and returns the index to show next. */
export function removeAt(list, index) {
  list.splice(index, 1);
  return Math.max(0, index - 1);
}

/** An index kept within the list, 0 when it is empty. */
export function clampIndex(list, index) {
  return Math.max(0, Math.min(index, list.length - 1));
}
