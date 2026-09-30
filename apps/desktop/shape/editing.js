// The shape editor's edits: resizing the canvas, moving the origin, placing
// tiles, and working on the selected sprites (nudge, flip, remove, the
// clipboard and draw order). Each is one undoable step.
import { clamp } from '../domain/geometry.js';
import {
  MAX_CANVAS_HEIGHT,
  MAX_CANVAS_WIDTH,
  MAX_SPRITES,
  flipSprites,
  offsetSprites,
  resizedOrigin,
  spritesForOrigin,
  spritesForTiles,
  spritesStepped,
  spritesToEnd,
  translateSprites,
  validSprites as valid,
} from '../domain/shapes.js';
import { $ } from '../dom.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { edit, height, hideGhost, ox, oy, sc, shape, source, spritesOf, width } from './model.js';

/**
 * Resizes the canvas to w × h pixels (clamped), keeping the origin's anchor
 * and the sprites where they sit on screen; refused if a sprite would leave
 * OAM's coordinate range. OAM carries X as 10-bit signed and Y as 9-bit signed.
 */
export function resizeCanvas(w, h) {
  w = clamp(Math.round(w), 1, MAX_CANVAS_WIDTH);
  h = clamp(Math.round(h), 1, MAX_CANVAS_HEIGHT);
  const a = shape();
  if (!a) return;
  const { x: nx, y: ny } = resizedOrigin(a, w, h);
  const next = spritesForOrigin(a, nx, ny);
  if (!valid(next)) return;
  edit('Resize the canvas', () => {
    a.canvasPixelWidth = w;
    a.canvasPixelHeight = h;
    a.canvasWidth = Math.ceil(w / 8);
    a.canvasHeight = Math.ceil(h / 8);
    a.originX = nx;
    a.originY = ny;
    a.sprites = next;
  });
}
/**
 * Moves the origin to canvas pixel (x, y), clamped to the canvas; the sprites
 * stay put on screen. `anchor` names a preset ('top-left', 'center',
 * 'bottom-center') or 'custom'.
 */
export function setOrigin(x, y, anchor = 'custom') {
  x = clamp(x, 0, width());
  y = clamp(y, 0, height());
  if (
    !shape() ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    Math.abs(x) > 32767 ||
    Math.abs(y) > 32767
  )
    return;
  const next = spritesForOrigin(shape(), x, y);
  if (!valid(next)) {
    setStatus('Origin would put a part outside its supported coordinate range.');
    return;
  }
  edit('Move the origin', () => {
    shape().originX = x;
    shape().originY = y;
    shape().originAnchor = anchor;
    shape().sprites = next;
  });
}
/**
 * Places the tiles picked in the tile picker with their top-left at canvas
 * pixel `pos` (snapped to the tile grid when Snap is on), selected, and
 * drops back to the Move tool.
 */
export function place(pos) {
  const b = source();
  if (!shape() || !b) return;
  if (
    pos.x < 0 ||
    pos.y < 0 ||
    pos.x + sc.sourceRect.width * 8 > width() ||
    pos.y + sc.sourceRect.height * 8 > height()
  ) {
    setStatus('Place the selected tiles inside the canvas, or resize the canvas.');
    return;
  }
  if (spritesOf().length + sc.sourceRect.width * sc.sourceRect.height > MAX_SPRITES) {
    setStatus('A shape holds at most 64 sprites.');
    return;
  }
  let x = pos.x - ox(),
    y = pos.y - oy();
  if ($('scSnap').checked) {
    x = Math.round(x / 8) * 8;
    y = Math.round(y / 8) * 8;
  }
  if (
    x + ox() < 0 ||
    y + oy() < 0 ||
    x + ox() + sc.sourceRect.width * 8 > width() ||
    y + oy() + sc.sourceRect.height * 8 > height()
  ) {
    setStatus('Snapped tiles would exceed the canvas.');
    return;
  }
  const add = spritesForTiles(sc.sourceRect, x, y, b.tilePaletteBanks);
  if (!valid(add)) return;
  // New sprites go on the end, which puts them on top.
  edit('Place tiles', () => {
    const start = spritesOf().length;
    spritesOf().push(...add);
    sc.selected = new Set(add.map((_, i) => start + i));
  });
  sc.placing = false;
  hideGhost();
  sc.render();
}

/** Nudges the selected sprites by (dx, dy) pixels. */
export function translate(dx, dy) {
  const next = translateSprites(spritesOf(), sc.selected, dx, dy);
  if (valid(next)) edit('Nudge sprites', () => (shape().sprites = next));
  else setStatus('Offset is outside the supported range.');
}
/** Flips the selected sprites in place on 'x' or 'y'. */
export function flip(axis) {
  edit('Flip sprites', () => flipSprites(spritesOf(), sc.selected, axis));
}
/** Removes the selected sprites. */
export function removeSprites() {
  edit('Remove sprites', () => {
    shape().sprites = spritesOf().filter((_, i) => !sc.selected.has(i));
    sc.selected.clear();
  });
}
// Copy, cut, paste and duplicate, through the app clipboard. A paste lands
// where the sprites were copied from, selected and ready to drag or nudge;
// a duplicate lands one tile down and right so it shows.
const selectedSprites = () => [...sc.selected].sort((a, b) => a - b).map((i) => spritesOf()[i]);
/** Adds `list` at `offset` pixels as one step, selected; false if it would not fit. */
function addSprites(list, offset) {
  if (!shape() || !list?.length) return false;
  if (spritesOf().length + list.length > MAX_SPRITES) {
    setStatus('A shape holds at most 64 sprites.');
    return false;
  }
  const add = offsetSprites(list, offset);
  if (!valid(add)) {
    setStatus('Those sprites would fall outside the supported coordinate range.');
    return false;
  }
  edit(offset ? 'Duplicate sprites' : 'Paste sprites', () => {
    const start = spritesOf().length;
    spritesOf().push(...add);
    sc.selected = new Set(add.map((_, i) => start + i));
  });
  return true;
}
/** Copies the selected sprites to the app clipboard; false if none. */
export function copySprites() {
  if (!sc.selected.size) return false;
  StudioShell.clipboard.set('sprites', selectedSprites());
  return true;
}
/** Copies, then removes, the selected sprites; false if none. */
export function cutSprites() {
  if (!copySprites()) return false;
  $('scRemove').click();
  return true;
}
/** Pastes the clipboard's sprites where they were copied from. */
export const pasteSprites = () => addSprites(StudioShell.clipboard.get('sprites'), 0);
/** Duplicates the selected sprites one tile down and right. */
export const duplicateSprites = () => sc.selected.size > 0 && addSprites(selectedSprites(), 8);
// Bring-to-front/send-to-back move the whole selection to one end of the list,
// where OAM index order draws it last (front) or first (back).
export function moveToEnd(front) {
  edit(front ? 'Bring to front' : 'Send to back', () => {
    ({ sprites: shape().sprites, selected: sc.selected } = spritesToEnd(
      spritesOf(),
      sc.selected,
      front,
    ));
  });
}
// Move up/down shifts each selected run past its single non-selected neighbor,
// one OAM index at a time; runs are processed from the move's leading edge so a
// multi-sprite selection stays contiguous instead of tangling with itself.
export function moveSelection(dir) {
  if (!shape() || !sc.selected.size) return;
  const moved = spritesStepped(spritesOf(), sc.selected, dir);
  if (!moved) return;
  edit(dir > 0 ? 'Move up' : 'Move down', () => {
    shape().sprites = moved.sprites;
    sc.selected = moved.selected;
  });
}
