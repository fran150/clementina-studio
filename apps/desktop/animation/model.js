// What the animation editor's parts share: the animation and frame being
// edited, lookups, and making an undoable edit.
import {
  animationTilesetId,
  frameSprites as framePlacement,
  usableShapes as shapesFor,
} from '../domain/animations.js';
import { ProjectHistory } from '../history.js';
import { renderAnimations } from '../lifecycle.js';
import { animationIndex, animations, frameIndex, setPlaying, shapes } from '../state.js';
import { markDirty } from '../status.js';

/** The animation being edited, if any. */
export const currentAnimation = () => animations[animationIndex];
/** The selected frame of the animation being edited, if any. */
export const currentFrame = () => currentAnimation()?.frames[frameIndex];
/** The shape with this id, if any. */
export const shapeById = (id) => shapes.find((s) => s.id === id);
/** The tileset an animation is pinned to: the one its existing frames use. */
export const animationTileset = (a) => animationTilesetId(a, shapes);
/** The shapes animation `a` can show: those on its tileset. */
export const usableShapes = (a) => shapesFor(a, shapes);
/** A frame's sprites as the game writes them to OAM. */
export const frameSprites = (frame) => framePlacement(frame, shapes);

/** Records an undo step for the animations, labeled `label`. */
export function checkpoint(label) {
  ProjectHistory.checkpoint(['animations'], label);
}
/**
 * Makes one undoable edit: edit('Delete X', fn) runs fn, stops playback,
 * marks the project changed and redraws every animation view.
 */
export function edit(...args) {
  const label = typeof args[0] === 'string' ? args.shift() : 'Edit the animation';
  checkpoint(label);
  args[0]();
  setPlaying(false);
  markDirty();
  renderAnimations();
}
