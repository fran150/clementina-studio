// Animation authoring. An animation is a sequence of shapes with durations; it
// names shapes rather than owning sprites, so a shape edit reaches every frame
// showing it, flipped or not. Loaded before sprite-composer.js, which wraps
// renderAnimations to keep its own canvas in sync with shape edits.
import {
  DEFAULT_TICKS,
  MAX_FRAMES,
  MAX_OFFSET,
  MIN_OFFSET,
  animationTilesetId,
  clampOffset,
  frameAtTick,
  frameSprites as framePlacement,
  framesOnTileset,
  freshAnimationId,
  moveItem,
  newAnimation,
  toggleFrameFlip,
  usableShapes as shapesFor,
} from './domain/animations.js';
import { canAdd, copyAsset, removeAt } from './domain/assets.js';
import { SYMBOL_NAME, canRename, freshName } from './domain/names.js';
import { $, isField } from './dom.js';
import { ProjectHistory } from './history.js';
import { redrawAll, renderAnimations, showView } from './lifecycle.js';
import {
  animationIndex,
  animations,
  bankColor,
  css565,
  currentView,
  frameIndex,
  playFrame,
  playing,
  playStart,
  setAnimationIndex,
  setFrameIndex,
  setPlayFrame,
  setPlaying,
  setPlayStart,
  shapes,
  tilePixel,
  tilesetById,
} from './state.js';
import { markDirty, setStatus } from './status.js';
import { StudioShell } from './studio-shell.js';

const host = $('animationEditor');

for (const [id, label, icon] of [
  ['anNew', 'New animation', 'newItem'],
  ['anDuplicateAnim', 'Duplicate animation', 'duplicate'],
  ['anDelete', 'Delete animation', 'delete'],
])
  $('anAnimActions').append(StudioShell.iconButton(id, label, icon));

let selectedShapeIds = new Set(),
  shapeAnchor = null;
const currentAnimation = () => animations[animationIndex];
const currentFrame = () => currentAnimation()?.frames[frameIndex];
const shapeById = (id) => shapes.find((s) => s.id === id);
/** The tileset an animation is pinned to: the one its existing frames use. */
const animationTileset = (a) => animationTilesetId(a, shapes);
function checkpoint(label) {
  ProjectHistory.checkpoint(['animations'], label);
}
// An edit's label names it in the history: edit('Delete X', fn).
function edit(...args) {
  const label = typeof args[0] === 'string' ? args.shift() : 'Edit the animation';
  checkpoint(label);
  args[0]();
  setPlaying(false);
  markDirty();
  renderAnimations();
}
/** The shapes animation `a` can show: those on its tileset. */
const usableShapes = (a) => shapesFor(a, shapes);
/** A project-unique id for an animation named `name`. */
const freshId = (name) => freshAnimationId(animations, name);
$('anCreateShape').onclick = () => {
  showView('shapes');
  if ($('scLibraryToggle').getAttribute('aria-expanded') !== 'true') $('scLibraryToggle').click();
  $('scNew').focus();
};
$('anNew').onclick = () => {
  if (!canAdd(animations)) {
    setStatus('A project holds at most 255 animations.');
    return;
  }
  if (!shapes.length) {
    $('anCreateShape').focus();
    setStatus('Create a shape first. Use Go to Shapes to get started.');
    return;
  }
  edit('New animation', () => {
    const name = freshName(animations, 'animation');
    animations.push(newAnimation(freshId(name), name, shapes[0].id));
    setAnimationIndex(animations.length - 1);
    setFrameIndex(0);
    selectedShapeIds.clear();
    shapeAnchor = null;
  });
  setStatus('Created ' + currentAnimation().name + '.');
};
$('anDuplicateAnim').onclick = () => {
  if (!currentAnimation() || !canAdd(animations)) return;
  edit('Duplicate ' + currentAnimation().name, () => {
    const name = freshName(animations, 'animation');
    animations.push(copyAsset(currentAnimation(), name, freshId(name)));
    setAnimationIndex(animations.length - 1);
    setFrameIndex(0);
  });
};
$('anEmptyNew').onclick = () => $('anNew').click();
$('anDelete').onclick = () => {
  if (!currentAnimation()) return;
  setStatus(`Deleted ${currentAnimation().name}. Ctrl/Cmd+Z brings it back.`);
  edit('Delete ' + currentAnimation().name, () => {
    setAnimationIndex(removeAt(animations, animationIndex));
    setFrameIndex(0);
  });
};

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
function renderAnimList() {
  StudioShell.renderList($('anAnimList'), animations, {
    selected: (a, i) => i === animationIndex,
    choose: (a, i) => chooseAnimation(i),
    rename: renameAnimation,
    render,
    maxLength: 32,
    duplicate: (a, i) => {
      chooseAnimation(i);
      $('anDuplicateAnim').click();
    },
    remove: (a, i) => {
      chooseAnimation(i);
      $('anDelete').click();
    },
  });
}

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
// Frames copy, cut and paste through the app clipboard; a paste goes in
// after the selected frame, if its shape shares this animation's tileset.
function frameMenu(e) {
  const a = currentAnimation();
  if (!a || !currentFrame()) return;
  StudioShell.contextMenu(e.clientX, e.clientY, [
    { label: 'Copy', hint: 'Mod+C', run: copyFrame },
    {
      label: 'Paste after',
      hint: 'Mod+V',
      disabled: !StudioShell.clipboard.has('frames'),
      run: pasteFrames,
    },
    {
      label: 'Duplicate',
      hint: 'Mod+D',
      disabled: a.frames.length >= MAX_FRAMES,
      run: () => $('anDuplicateFrame').click(),
    },
    { label: 'Delete', hint: 'Delete', disabled: a.frames.length < 2, run: removeFrame },
    '-',
    { label: 'Flip horizontally', hint: 'Shift+H', run: () => flipFrame('x') },
    { label: 'Flip vertically', hint: 'Shift+V', run: () => flipFrame('y') },
    '-',
    {
      label: 'Move earlier',
      disabled: frameIndex === 0,
      run: () => moveFrame(frameIndex, frameIndex - 1),
    },
    {
      label: 'Move later',
      disabled: frameIndex === a.frames.length - 1,
      run: () => moveFrame(frameIndex, frameIndex + 1),
    },
  ]);
}
// A flip is the frame's, like its offset: the shape stays as drawn.
function flipFrame(axis) {
  const frame = currentFrame();
  if (!frame) return;
  edit(axis === 'x' ? 'Flip the frame horizontally' : 'Flip the frame vertically', () =>
    toggleFrameFlip(frame, axis),
  );
}
function removeFrame() {
  const a = currentAnimation();
  if (!a || a.frames.length < 2) return false;
  edit('Delete a frame', () => {
    a.frames.splice(frameIndex, 1);
    setFrameIndex(Math.max(0, Math.min(frameIndex, a.frames.length - 1)));
  });
  return true;
}
function copyFrame() {
  if (!currentFrame()) return false;
  StudioShell.clipboard.set('frames', [currentFrame()]);
  return true;
}
function cutFrame() {
  const a = currentAnimation();
  if (!a || a.frames.length < 2 || !copyFrame()) return false;
  return removeFrame();
}
function pasteFrames() {
  const a = currentAnimation(),
    frames = StudioShell.clipboard.get('frames');
  if (!a || !frames) return false;
  if (a.frames.length + frames.length > MAX_FRAMES) {
    setStatus(`An animation holds at most ${MAX_FRAMES} frames.`);
    return false;
  }
  const pinned = animationTileset(a);
  if (!framesOnTileset(frames, shapes, pinned)) {
    setStatus(
      `Only frames showing shapes on ${tilesetById(pinned)?.name ?? "this animation's tileset"} can join this animation.`,
    );
    return false;
  }
  edit('Paste frames', () => {
    a.frames.splice(frameIndex + 1, 0, ...frames);
    setFrameIndex(frameIndex + frames.length);
  });
  return true;
}
StudioShell.editActions('animations', { copy: copyFrame, cut: cutFrame, paste: pasteFrames });
$('anDuplicateFrame').onclick = () => {
  const a = currentAnimation();
  if (!a || a.frames.length >= MAX_FRAMES || !currentFrame()) return;
  edit('Duplicate a frame', () => {
    a.frames.splice(frameIndex + 1, 0, structuredClone(currentFrame()));
    setFrameIndex(frameIndex + 1);
  });
};

function renderFrames(a, usable) {
  const panel = $('anFrames'),
    frame = a?.frames[frameIndex],
    i = frameIndex;
  panel.replaceChildren();
  if (!frame) return;
  const number = document.createElement('p');
  number.className = 'anFrameNumber';
  number.textContent = `Frame ${i + 1} of ${a.frames.length}`;
  panel.append(number);
  const field = (text, control) => {
    const label = document.createElement('label');
    label.append(Object.assign(document.createElement('span'), { textContent: text }), control);
    panel.append(label);
  };
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Frame ${i} shape`);
  select.replaceChildren(
    ...usable.map((s) => new Option(s.name, s.id, false, s.id === frame.shapeId)),
  );
  select.onchange = () => edit("Change the frame's shape", () => (frame.shapeId = select.value));
  field('Shape', select);
  for (const [key, text] of [
    ['ticks', 'Ticks'],
    ['dx', 'Offset X'],
    ['dy', 'Offset Y'],
  ]) {
    const input = document.createElement('input');
    input.type = 'number';
    input.setAttribute('aria-label', `Frame ${i} ${key}`);
    const limits = key === 'ticks' ? [1, 255] : [MIN_OFFSET, MAX_OFFSET];
    input.min = String(limits[0]);
    input.max = String(limits[1]);
    input.value = key === 'ticks' ? frame.ticks : (frame[key] ?? 0);
    input.onchange = () => {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < Number(input.min) || value > Number(input.max)) {
        render();
        return;
      }
      edit(key === 'ticks' ? "Change the frame's ticks" : 'Move the frame', () => {
        if (key === 'ticks') frame.ticks = value;
        else if (value) frame[key] = value;
        else delete frame[key];
      });
    };
    field(text, input);
  }
}

function paintFrame(canvas, frame, zoom = 1) {
  const ctx = canvas.getContext('2d'),
    scale = canvas.width / 320;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#22262e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(
    scale * zoom,
    0,
    0,
    scale * zoom,
    (canvas.width * (1 - zoom)) / 2,
    (canvas.height * (1 - zoom)) / 2,
  );
  for (let y = 0; y < 200; y += 8)
    for (let x = 0; x < 320; x += 8) {
      ctx.fillStyle = ((x + y) / 8) % 2 ? '#292d35' : '#22262e';
      ctx.fillRect(x, y, 8, 8);
    }
  ctx.fillStyle = '#586174';
  ctx.fillRect(160, 0, 1, 200);
  ctx.fillRect(0, 100, 320, 1);
  const source = tilesetById(shapeById(frame?.shapeId)?.tilesetId);
  if (source)
    for (const sprite of frameSprites(frame))
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const ink = tilePixel(
            source,
            sprite.tile,
            sprite.flipX ? 7 - x : x,
            sprite.flipY ? 7 - y : y,
            0,
          );
          if (ink) {
            ctx.fillStyle = css565(bankColor(sprite.paletteBank, ink));
            ctx.fillRect(160 + sprite.x + x, 100 + sprite.y + y, 1, 1);
          }
        }
}
// A frame's sprites as the game writes them to OAM.
const frameSprites = (frame) => framePlacement(frame, shapes);
function selectFrame(index) {
  const a = currentAnimation();
  if (!a) return;
  setFrameIndex(Math.max(0, Math.min(index, a.frames.length - 1)));
  setPlaying(false);
  render();
}
function moveFrame(from, to) {
  const a = currentAnimation();
  if (!a || from === to || to < 0 || to >= a.frames.length) return;
  edit('Reorder frames', () => {
    moveItem(a.frames, from, to);
    setFrameIndex(to);
  });
}
function renderTimeline(a) {
  const timeline = $('anTimeline'),
    scroll = timeline.scrollLeft;
  timeline.replaceChildren();
  a?.frames.forEach((frame, i) => {
    const card = document.createElement('div');
    card.className = 'anFrameCard';
    card.tabIndex = 0;
    card.draggable = true;
    card.dataset.index = i;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', String(i === frameIndex));
    const flipped = [frame.flipX && 'horizontally', frame.flipY && 'vertically']
      .filter(Boolean)
      .join(' and ');
    card.setAttribute(
      'aria-label',
      `Frame ${i + 1}: ${shapeById(frame.shapeId)?.name ?? 'missing shape'}${flipped ? ', flipped ' + flipped : ''}, ${frame.ticks} ticks`,
    );
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const placed = frameSprites(frame);
    const extentX = Math.max(20, ...placed.map((s) => Math.abs(s.x) + 8)),
      extentY = Math.max(12, ...placed.map((s) => Math.abs(s.y) + 8));
    paintFrame(canvas, frame, Math.min(6, 140 / extentX, 85 / extentY));
    const label = document.createElement('span');
    label.textContent = `${i + 1} · ${shapeById(frame.shapeId)?.name ?? 'Missing'}`;
    // A flip is marked too, since a symmetric shape looks the same either way.
    const timing = document.createElement('span');
    timing.textContent = `${frame.ticks} ticks${frame.flipX ? ' ↔' : ''}${frame.flipY ? ' ↕' : ''}`;
    card.append(canvas, label, timing);
    card.onclick = () => selectFrame(i);
    card.oncontextmenu = (e) => {
      e.preventDefault();
      selectFrame(i);
      frameMenu(e);
    };
    card.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectFrame(i);
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const next = Math.max(
          0,
          Math.min(i + (e.key === 'ArrowLeft' ? -1 : 1), a.frames.length - 1),
        );
        if (e.altKey) moveFrame(i, next);
        else selectFrame(next);
        /** @type {HTMLElement} */ (timeline.children[next])?.focus();
      }
    };
    card.ondragstart = (e) => {
      e.dataTransfer.setData('application/x-clementina-frame', String(i));
      e.dataTransfer.effectAllowed = 'move';
    };
    card.ondragover = (e) => {
      if ([...e.dataTransfer.types].includes('application/x-clementina-frame')) e.preventDefault();
    };
    card.ondrop = (e) => {
      e.preventDefault();
      const text = e.dataTransfer.getData('application/x-clementina-frame');
      if (!/^\d+$/.test(text)) return;
      const from = Number(text);
      if (from < a.frames.length) moveFrame(from, i);
    };
    timeline.append(card);
  });
  timeline.scrollLeft = scroll;
}
// The preview fits the space it has — fractionally, since it is a player —
// until it is zoomed by hand; Fit goes back to fitting. Zoom steps, the
// wheel and the View menu work as on every canvas.
let previewZoom = 1,
  previewFits = true,
  zoomControls = null;
function applyPreviewZoom() {
  const c = $('anCanvas');
  c.style.width = 320 * previewZoom + 'px';
  c.style.height = 200 * previewZoom + 'px';
  zoomControls?.sync();
}
function fitPreview() {
  if (host.hidden || !previewFits) return;
  const box = $('anPreviewCol');
  previewZoom = Math.max(
    0.25,
    Math.min((box.clientWidth - 24) / 320, (box.clientHeight - 24) / 200),
  );
  applyPreviewZoom();
}
new ResizeObserver(fitPreview).observe($('anPreviewCol'));
function drawPreview() {
  const a = currentAnimation(),
    index = playing ? playFrame : frameIndex,
    frame = a?.frames[index];
  paintFrame($('anCanvas'), frame);
  $('anFrameCounter').textContent = a ? `${index + 1} / ${a.frames.length}` : '0 / 0';
  for (const card of /** @type {HTMLCollectionOf<HTMLElement>} */ ($('anTimeline').children))
    card.dataset.playing = String(playing && Number(card.dataset.index) === index);
  $('anStatus').textContent = !a
    ? 'Create an animation to sequence your shapes.'
    : `${a.name} · ${shapeById(frame?.shapeId)?.name ?? 'missing shape'} · ${tilesetById(animationTileset(a))?.name ?? 'No tileset'} · 320 × 200 preview · ${a.frames.reduce((sum, f) => sum + f.ticks, 0)} ticks total`;
}
$('anPrevious').onclick = () => selectFrame((playing ? playFrame : frameIndex) - 1);
$('anNext').onclick = () => selectFrame((playing ? playFrame : frameIndex) + 1);
$('anMoveEarlier').onclick = () => moveFrame(frameIndex, frameIndex - 1);
$('anMoveLater').onclick = () => moveFrame(frameIndex, frameIndex + 1);
$('anPlay').onclick = () => {
  const a = currentAnimation();
  if (!a) return;
  if (playing) {
    setFrameIndex(playFrame);
    setPlaying(false);
  } else {
    setPlayFrame(frameIndex);
    setPlayStart(
      performance.now() -
        (a.frames.slice(0, frameIndex).reduce((n, f) => n + f.ticks, 0) * 1000) / 60,
    );
    setPlaying(true);
  }
  render();
};
let drag = null;
$('anCanvas').onpointerdown = (e) => {
  if (e.button !== 0 || !currentFrame()) return;
  if (playing) {
    setFrameIndex(playFrame);
    setPlaying(false);
    render();
  }
  const frame = currentFrame();
  drag = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    dx: frame.dx ?? 0,
    dy: frame.dy ?? 0,
    changed: false,
    frame,
  };
  $('anCanvas').setPointerCapture(e.pointerId);
};
$('anCanvas').onpointermove = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const rect = $('anCanvas').getBoundingClientRect();
  const dx = clampOffset(drag.dx + Math.round(((e.clientX - drag.x) * 320) / rect.width)),
    dy = clampOffset(drag.dy + Math.round(((e.clientY - drag.y) * 200) / rect.height));
  if (dx === (drag.frame.dx ?? 0) && dy === (drag.frame.dy ?? 0)) return;
  if (!drag.changed) {
    checkpoint('Move the frame');
    drag.changed = true;
  }
  drag.frame.dx = dx;
  drag.frame.dy = dy;
  drawPreview();
};
function finishDrag() {
  if (!drag) return;
  const changed = drag.changed;
  drag = null;
  if (changed) {
    markDirty();
    renderAnimations();
  }
}
$('anCanvas').oncontextmenu = (e) => {
  e.preventDefault();
  frameMenu(e);
};
$('anCanvas').onpointerup = finishDrag;
$('anCanvas').onpointercancel = finishDrag;
$('anCanvas').onlostpointercapture = finishDrag;
function tick(now) {
  const a = currentAnimation();
  if (playing && a && currentView === 'animations') {
    setPlayFrame(frameAtTick(a.frames, Math.floor(((now - playStart) * 60) / 1000)));
  }
  if (!host.hidden) drawPreview();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function render() {
  host.hidden = currentView !== 'animations';
  document.body.classList.toggle('animationView', !host.hidden);
  if (host.hidden) return;
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
  $('anUndo').disabled = !ProjectHistory.canUndo();
  $('anRedo').disabled = !ProjectHistory.canRedo();
  renderFrames(a, usable);
  renderTimeline(a);
  fitPreview();
  drawPreview();
}

window.addEventListener(
  'keydown',
  (e) => {
    if (currentView !== 'animations' || isField(e.target) || document.querySelector('dialog[open]'))
      return;
    const key = e.key.toLowerCase(),
      mod = e.ctrlKey || e.metaKey,
      handled = () => {
        e.preventDefault();
        e.stopImmediatePropagation();
      };
    if (mod && ['c', 'x', 'v', 'd'].includes(key)) {
      const done =
        key === 'd'
          ? ($('anDuplicateFrame').click(), true)
          : { c: copyFrame, x: cutFrame, v: pasteFrames }[key]();
      if (done || key === 'd') handled();
      return;
    }
    if (mod || e.altKey) return;
    if (e.shiftKey && (key === 'h' || key === 'v')) {
      handled();
      flipFrame(key === 'h' ? 'x' : 'y');
      return;
    }
    // Keys a focused button or frame card already answers are left to it.
    if (/** @type {HTMLElement} */ (e.target).closest?.('button,[role="option"]')) return;
    if (e.code === 'Space') {
      handled();
      $('anPlay').click();
      return;
    }
    if (key === 'arrowleft' || key === 'arrowright') {
      handled();
      (key === 'arrowleft' ? $('anPrevious') : $('anNext')).click();
      return;
    }
    if (key === 'delete' || key === 'backspace') {
      handled();
      removeFrame();
    }
  },
  true,
);

host.querySelector('.anTop .studioBarEnd').append(StudioShell.helpButton());
const library = host.querySelector('.anLibrary'),
  shapeLibrary = host.querySelector('.anShapeLibrary');
const panelToggle = (panel, id, label, icon, asset = false) => {
  const b = StudioShell.iconButton(id, label, icon);
  StudioShell.bindPanel({
    panel,
    button: b,
    group: 'animation',
    closeGroups: ['animation'],
    asset,
  });
  return b;
};
const rail = StudioShell.toolRail('anRail', 'Animation tools');
host.prepend(rail);
StudioShell.railLayout(
  rail,
  [
    [
      panelToggle(library, 'anLibraryToggle', 'Animations', 'animation'),
      panelToggle(shapeLibrary, 'anShapeLibraryToggle', 'Shapes to append', 'shape', true),
    ],
  ],
  [
    Object.assign(StudioShell.iconButton('anCopy', 'Copy frame (Ctrl/Cmd+C)', 'copy'), {
      onclick: copyFrame,
    }),
    Object.assign(
      StudioShell.iconButton('anPaste', 'Paste frame after this one (Ctrl/Cmd+V)', 'paste'),
      { onclick: pasteFrames },
    ),
    Object.assign(StudioShell.iconButton('anUndo', 'Undo (Ctrl/Cmd+Z)', 'undo'), {
      onclick: ProjectHistory.undo,
    }),
    Object.assign(StudioShell.iconButton('anRedo', 'Redo (Ctrl/Cmd+Shift+Z)', 'redo'), {
      onclick: ProjectHistory.redo,
    }),
  ],
);
document.addEventListener('studiohistory', () => {
  setAnimationIndex(Math.max(0, Math.min(animationIndex, animations.length - 1)));
  setFrameIndex(Math.max(0, Math.min(frameIndex, (currentAnimation()?.frames.length ?? 1) - 1)));
  setPlaying(false);
});
// The selected frame's actions, on the right like any selection's.
zoomControls = StudioShell.canvasZoom({
  view: 'animations',
  ids: {
    fit: 'anFit',
    actual: 'anActualSize',
    zoomOut: 'anZoomOut',
    label: 'anZoomLabel',
    zoomIn: 'anZoomIn',
  },
  min: 0.25,
  max: 32,
  get: () => previewZoom,
  set: (next, x, y) => {
    previewFits = false;
    StudioShell.zoomScrolled(
      $('anPreviewCol'),
      $('anCanvas'),
      previewZoom,
      next,
      (z) => {
        previewZoom = z;
        applyPreviewZoom();
      },
      x,
      y,
    );
  },
  fit: () => {
    previewFits = true;
    fitPreview();
    $('anPreviewCol').scrollLeft = $('anPreviewCol').scrollTop = 0;
  },
  wheel: $('anPreviewCol'),
  busy: () => !!drag,
});
host.querySelector('.anTop .studioBarStart').after(zoomControls.group);
StudioShell.setIcon($('anPrevious'), 'previous', 'Previous frame (←)');
StudioShell.setIcon($('anNext'), 'next', 'Next frame (→)');
const frameRail = StudioShell.toolRail('anFrameRail', 'Frame actions', 'right');
host.append(frameRail);
const framePanel = host.querySelector('.anFramePanel');
const framePanelToggle = StudioShell.iconButton(
  'anFramePanelToggle',
  'Frame properties',
  'properties',
);
StudioShell.bindPanel({
  panel: framePanel,
  button: framePanelToggle,
  group: 'animationRight',
  closeGroups: ['animationRight'],
  asset: true,
});
for (const [id, icon, label] of [
  ['anDuplicateFrame', 'duplicate', 'Duplicate frame (Ctrl/Cmd+D)'],
  ['anMoveEarlier', 'earlier', 'Move frame earlier'],
  ['anMoveLater', 'later', 'Move frame later'],
])
  StudioShell.setIcon($(id), icon, label);
const flipButton = (id, axis, icon, label) =>
  Object.assign(StudioShell.iconButton(id, label, icon), { onclick: () => flipFrame(axis) });
StudioShell.railLayout(frameRail, [
  [framePanelToggle],
  [
    flipButton(
      'anFlipX',
      'x',
      'flipH',
      'Flip the frame horizontally (Shift+H) — mirrors the shape about its origin',
    ),
    flipButton(
      'anFlipY',
      'y',
      'flipV',
      'Flip the frame vertically (Shift+V) — mirrors the shape about its origin',
    ),
  ],
  [$('anDuplicateFrame'), $('anMoveEarlier'), $('anMoveLater')],
  [
    Object.assign(StudioShell.iconButton('anRemoveFrame', 'Remove frame (Delete)', 'delete'), {
      onclick: removeFrame,
    }),
  ],
]);
library.hidden = true;
shapeLibrary.hidden = true;
for (const id of ['anLibraryToggle', 'anShapeLibraryToggle'])
  $(id).setAttribute('aria-expanded', 'false');

document.addEventListener('studioclipboard', () => {
  if (!host.hidden)
    $('anPaste').disabled = !currentAnimation() || !StudioShell.clipboard.has('frames');
});
StudioShell.viewStatus('animations', $('anStatus'));
renderAnimations.after(render);
redrawAll.after(() => {
  render();
});
showView.after(() => {
  render();
});
render();
