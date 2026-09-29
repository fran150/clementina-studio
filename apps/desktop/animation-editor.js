// Animation authoring. An animation is a sequence of shapes with durations; it
// names shapes rather than owning sprites, so a shape edit reaches every frame
// showing it, flipped or not. Loaded before sprite-composer.js, which wraps
// renderAnimations to keep its own canvas in sync with shape edits.
//
// This file holds the animation list, the shapes to append, and rendering;
// its parts live in animation/: the shared model, the frame actions and
// properties, the timeline, the player, and the keys and rails.
import { animationKeys, animationRail, frameRail } from './animation/controls.js';
import { frameActions } from './animation/frames.js';
import {
  animationTileset,
  currentAnimation,
  currentFrame,
  edit,
  usableShapes,
} from './animation/model.js';
import { animationPreview } from './animation/preview.js';
import { renderTimeline } from './animation/timeline.js';
import { DEFAULT_TICKS, MAX_FRAMES, freshAnimationId, newAnimation } from './domain/animations.js';
import { canAdd, copyAsset, removeAt } from './domain/assets.js';
import { SYMBOL_NAME, canRename, freshName } from './domain/names.js';
import { $ } from './dom.js';
import { renderAnimations, showView } from './lifecycle.js';
import {
  animationIndex,
  animations,
  frameIndex,
  playing,
  setAnimationIndex,
  setFrameIndex,
  setPlaying,
  shapes,
  tilesetById,
} from './state.js';
import { setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('animationEditor');
const workspace = StudioShell.defineEditor({
  view: 'animations',
  host,
  render,
  status: $('anStatus'),
});

for (const [id, label, icon] of [
  ['anNew', 'New animation', 'newItem'],
  ['anDuplicateAnim', 'Duplicate animation', 'duplicate'],
  ['anDelete', 'Delete animation', 'delete'],
])
  $('anAnimActions').append(StudioShell.iconButton(id, label, icon));

// The shapes picked to append as frames, and the row a Shift-click extends
// the pick from.
let selectedShapeIds = new Set(),
  shapeAnchor = null;
/** A project-unique id for an animation named `name`. */
const freshId = (name) => freshAnimationId(animations, name);

// ===== the animation list =====
$('anCreateShape').onclick = () => {
  showView('shapes');
  if ($('scLibraryToggle').getAttribute('aria-expanded') !== 'true') $('scLibraryToggle').click();
  $('scNew').focus();
};
// Opens animation `i` at its first frame, stopped, with no shapes picked.
function chooseAnimation(i) {
  setAnimationIndex(i);
  setFrameIndex(0);
  setPlaying(false);
  selectedShapeIds.clear();
  shapeAnchor = null;
  renderAnimations();
}
function renameAnimation(i, name) {
  if (!canRename(animations, i, name, SYMBOL_NAME)) {
    setStatus('Use a unique name: letters, digits, underscores; start with a letter.');
    return false;
  }
  edit('Rename an animation', () => (animations[i].name = name));
  return true;
}
// The animation list and its New, Duplicate and Delete buttons. New needs a
// shape to sequence, and points at the Shapes editor without one.
const library = StudioShell.assetLibrary({
  noun: 'animation',
  plural: 'animations',
  list: $('anAnimList'),
  items: () => animations,
  index: () => animationIndex,
  choose: chooseAnimation,
  rename: renameAnimation,
  render,
  maxLength: 32,
  buttons: {
    create: 'anNew',
    duplicate: 'anDuplicateAnim',
    remove: 'anDelete',
    empty: 'anEmptyNew',
  },
  ready: () => {
    if (shapes.length) return null;
    $('anCreateShape').focus();
    return 'Create a shape first. Use Go to Shapes to get started.';
  },
  create: (label) =>
    edit(label, () => {
      const name = freshName(animations, 'animation');
      animations.push(newAnimation(freshId(name), name, shapes[0].id));
      setAnimationIndex(animations.length - 1);
      setFrameIndex(0);
      selectedShapeIds.clear();
      shapeAnchor = null;
    }),
  copy: (a, label) =>
    edit(label, () => {
      const name = freshName(animations, 'animation');
      animations.push(copyAsset(a, name, freshId(name)));
      setAnimationIndex(animations.length - 1);
      setFrameIndex(0);
    }),
  remove: (a, label) =>
    edit(label, () => {
      setAnimationIndex(removeAt(animations, animationIndex));
      setFrameIndex(0);
    }),
});
function renderAnimList() {
  library.render();
}

// ===== the shapes to append =====
// A shape row here selects it; Append frame is the explicit action, matching
// the tileset editor's "select an object, then Place selection" pattern.
function renderShapeList(usable) {
  selectedShapeIds = new Set([...selectedShapeIds].filter((id) => usable.some((s) => s.id === id)));
  if (!selectedShapeIds.size && usable.length && shapeAnchor === null)
    selectedShapeIds.add(usable[0].id);
  const list = $('anShapeList');
  list.replaceChildren();
  usable.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'assetRow';
    row.tabIndex = 0;
    row.setAttribute('role', 'option');
    row.textContent = s.name;
    row.setAttribute('aria-selected', String(selectedShapeIds.has(s.id)));
    // Click picks one shape, Ctrl/Cmd-click toggles one, Shift-click picks
    // the run from the last one clicked.
    /** @param {MouseEvent | KeyboardEvent} e */
    const choose = (e) => {
      if (e.shiftKey && shapeAnchor !== null) {
        const start = usable.findIndex((x) => x.id === shapeAnchor);
        if (!e.ctrlKey && !e.metaKey) selectedShapeIds.clear();
        for (
          let j = Math.min(start < 0 ? i : start, i);
          j <= Math.max(start < 0 ? i : start, i);
          j++
        )
          selectedShapeIds.add(usable[j].id);
      } else if (e.ctrlKey || e.metaKey) {
        if (selectedShapeIds.has(s.id)) selectedShapeIds.delete(s.id);
        else selectedShapeIds.add(s.id);
        shapeAnchor = s.id;
      } else {
        selectedShapeIds = new Set([s.id]);
        shapeAnchor = s.id;
      }
      render();
      /** @type {HTMLElement} */ ($('anShapeList').children[i])?.focus();
    };
    row.onclick = choose;
    row.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        choose(e);
      }
    };
    list.append(row);
  });
}
$('anAppend').onclick = () => {
  const a = currentAnimation(),
    selected = usableShapes(a).filter((s) => selectedShapeIds.has(s.id));
  if (!a || !selected.length || a.frames.length + selected.length > MAX_FRAMES) return;
  edit('Append frames', () => {
    setFrameIndex(a.frames.length);
    for (const shape of selected) a.frames.push({ shapeId: shape.id, ticks: DEFAULT_TICKS });
  });
};

// ===== the parts =====
const actions = frameActions({ render: () => render() });
const preview = animationPreview({ host, render: () => render(), actions });

// ===== rendering =====
function render() {
  if (!workspace.shown()) return;
  const a = currentAnimation();
  setFrameIndex(Math.max(0, Math.min(frameIndex, (a?.frames.length ?? 1) - 1)));
  $('anEmpty').hidden = !!a;
  StudioShell.emptyEditor(host, !a);
  for (const el of [host.querySelector('.anTop'), $('anBody'), $('anTransport'), $('anTimeline')])
    el.hidden = !a;
  $('anEmptyMessage').textContent = !shapes.length
    ? 'Create a shape first. Animations sequence shapes as frames.'
    : 'No animations yet. An animation sequences shapes as frames.';
  $('anCreateShape').hidden = !!shapes.length;
  $('anEmptyNew').hidden = !shapes.length;
  $('anNew').disabled = !canAdd(animations);
  $('anPrevious').disabled = !a;
  $('anNext').disabled = !a;
  $('anMoveEarlier').disabled = !a || frameIndex === 0;
  $('anMoveLater').disabled = !a || frameIndex === a.frames.length - 1;
  $('anGroupTitle').textContent = a?.name ?? 'No animations';
  $('anDuplicateAnim').disabled = $('anDelete').disabled = !a;
  StudioShell.setIcon(
    $('anPlay'),
    playing ? 'pause' : 'play',
    playing ? 'Pause (Space)' : 'Play (Space)',
  );
  $('anPlay').setAttribute('aria-pressed', String(playing));
  $('anPlay').disabled = !a;
  renderAnimList();
  const usable = usableShapes(a);
  renderShapeList(usable);
  const pinned = a && animationTileset(a);
  $('anShapeNote').textContent = !shapes.length
    ? 'Create a shape first.'
    : !a
      ? 'Create an animation, then append shapes as frames.'
      : pinned
        ? `Only shapes on ${tilesetById(pinned)?.name ?? 'this tileset'} can join: every frame in one animation plays from the same tileset.`
        : 'A new animation is pinned to its first frame’s tileset.';
  const selectedCount = usable.filter((s) => selectedShapeIds.has(s.id)).length;
  $('anAppend').disabled = !a || !selectedCount || a.frames.length + selectedCount > MAX_FRAMES;
  $('anAppend').textContent = `Append ${selectedCount} frame${selectedCount === 1 ? '' : 's'}`;
  $('anDuplicateFrame').disabled = !currentFrame() || a.frames.length >= MAX_FRAMES;
  // The flips show pressed while the selected frame is flipped, like a stamp's in Backgrounds.
  for (const [id, key] of [
    ['anFlipX', 'flipX'],
    ['anFlipY', 'flipY'],
  ]) {
    const on = !!currentFrame()?.[key];
    $(id).disabled = !currentFrame();
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', String(on));
  }
  $('anRemoveFrame').disabled = !a || a.frames.length < 2;
  $('anCopy').disabled = !currentFrame();
  $('anPaste').disabled = !a || !StudioShell.clipboard.has('frames');
  actions.renderFrames(a, usable);
  renderTimeline(a, actions);
  preview.fitPreview();
  preview.drawPreview();
}

// ===== wiring =====
animationKeys(actions);
animationRail(host, actions);
document.addEventListener('studiohistory', () => {
  setAnimationIndex(Math.max(0, Math.min(animationIndex, animations.length - 1)));
  setFrameIndex(Math.max(0, Math.min(frameIndex, (currentAnimation()?.frames.length ?? 1) - 1)));
  setPlaying(false);
});
preview.mountZoom();
frameRail(host, actions);
// The panels start closed.
host.querySelector('.anLibrary').hidden = true;
host.querySelector('.anShapeLibrary').hidden = true;
for (const id of ['anLibraryToggle', 'anShapeLibraryToggle'])
  $(id).setAttribute('aria-expanded', 'false');

document.addEventListener('studioclipboard', () => {
  if (!host.hidden)
    $('anPaste').disabled = !currentAnimation() || !StudioShell.clipboard.has('frames');
});
renderAnimations.after(render);
render();
