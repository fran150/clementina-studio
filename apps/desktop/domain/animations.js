// Animations: a sequence of frames, each showing one shape for a number of
// 60 Hz ticks, optionally flipped and offset by (dx, dy). A frame names its
// shape rather than owning sprites, so a shape edit reaches every frame
// showing it. Every frame's shape shares one tileset. Nothing here touches
// the page.

/** An animation holds at most this many frames. */
export const MAX_FRAMES = 255;
/** How long a new frame shows, in 60 Hz ticks. */
export const DEFAULT_TICKS = 6;
/** A frame's offset stays within OAM's X range on both axes. */
export const MIN_OFFSET = -512,
  MAX_OFFSET = 511;

/** The first of animation:name, animation:name-2, … no animation uses as its id. */
export function freshAnimationId(animations, name) {
  const stem = 'animation:' + name;
  let id = stem,
    n = 2;
  while (animations.some((a) => a.id === id)) id = stem + '-' + n++;
  return id;
}

/** A new animation of one frame showing `shapeId`. */
export function newAnimation(id, name, shapeId) {
  return { id, name, frames: [{ shapeId, ticks: DEFAULT_TICKS }] };
}

/** The tileset an animation is pinned to: the one its first frame's shape uses. */
export function animationTilesetId(animation, shapes) {
  const id = animation?.frames[0]?.shapeId;
  return shapes.find((s) => s.id === id)?.tilesetId;
}

/** The shapes an animation can show: those on its tileset, or all without one. */
export function usableShapes(animation, shapes) {
  const pinned = animation && animationTilesetId(animation, shapes);
  return shapes.filter((s) => !animation || s.tilesetId === pinned);
}

/** Whether every frame shows a shape on the tileset `tilesetId`. */
export function framesOnTileset(frames, shapes, tilesetId) {
  return frames.every((f) => shapes.find((s) => s.id === f.shapeId)?.tilesetId === tilesetId);
}

/**
 * A frame's sprites as the game writes them to OAM: the shape mirrored about
 * its origin (a sprite is 8 × 8, so x becomes -x - 8 and its flip bit
 * toggles), then moved by the frame's offset.
 */
export function frameSprites(frame, shapes) {
  const shape = shapes.find((s) => s.id === frame?.shapeId);
  return (shape?.sprites ?? []).map((s) => ({
    ...s,
    x: (frame.flipX ? -s.x - 8 : s.x) + (frame.dx ?? 0),
    y: (frame.flipY ? -s.y - 8 : s.y) + (frame.dy ?? 0),
    flipX: s.flipX !== !!frame.flipX,
    flipY: s.flipY !== !!frame.flipY,
  }));
}

/** Toggles a frame's flip on `axis` ('x' or 'y'); an unflipped frame stores no flag. */
export function toggleFrameFlip(frame, axis) {
  const key = axis === 'x' ? 'flipX' : 'flipY';
  if (frame[key]) delete frame[key];
  else frame[key] = true;
}

/** Moves the item at `from` to `to` in place. */
export function moveItem(list, from, to) {
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
}

/** A frame offset kept within OAM's range. */
export function clampOffset(v) {
  return Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, v));
}

/** Which frame shows `tick` ticks into a looping playback. */
export function frameAtTick(frames, tick) {
  const total = frames.reduce((sum, f) => sum + f.ticks, 0);
  let t = tick % total,
    index = 0;
  while (t >= frames[index].ticks) {
    t -= frames[index].ticks;
    index++;
  }
  return index;
}
