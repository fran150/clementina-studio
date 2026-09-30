// The animation editor's frame actions: flip, delete, copy, cut, paste,
// duplicate, select and reorder, the frame's context menu, and the frame
// properties panel (its shape, ticks and offset).
import {
  MAX_FRAMES,
  MAX_OFFSET,
  MIN_OFFSET,
  framesOnTileset,
  moveItem,
  toggleFrameFlip,
} from '../domain/animations.js';
import { $ } from '../dom.js';
import { clampIndex } from '../domain/assets.js';
import { frameIndex, setFrameIndex, setPlaying, shapes, tilesetById } from '../state.js';
import { setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { animationTileset, currentAnimation, currentFrame, edit } from './model.js';

/**
 * Wires up the frame actions.
 *
 * @param {object} options
 * @param {() => void} options.render Redraws the animation editor.
 */
export function frameActions({ render }) {
  // A flip is the frame's, like its offset: the shape stays as drawn.
  function flipFrame(axis) {
    const frame = currentFrame();
    if (!frame) return;
    edit(axis === 'x' ? 'Flip the frame horizontally' : 'Flip the frame vertically', () =>
      toggleFrameFlip(frame, axis),
    );
  }
  // Deletes the selected frame; an animation keeps at least one.
  function removeFrame() {
    const a = currentAnimation();
    if (!a || a.frames.length < 2) return false;
    edit('Delete a frame', () => {
      a.frames.splice(frameIndex, 1);
      setFrameIndex(clampIndex(a.frames, frameIndex));
    });
    return true;
  }
  // Frames copy, cut and paste through the app clipboard; a paste goes in
  // after the selected frame, if its shape shares this animation's tileset.
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
  // Selects frame `index` (clamped) and stops playback.
  function selectFrame(index) {
    const a = currentAnimation();
    if (!a) return;
    setFrameIndex(clampIndex(a.frames, index));
    setPlaying(false);
    render();
  }
  // Moves the frame at `from` to `to`, keeping it selected.
  function moveFrame(from, to) {
    const a = currentAnimation();
    if (!a || from === to || to < 0 || to >= a.frames.length) return;
    edit('Reorder frames', () => {
      moveItem(a.frames, from, to);
      setFrameIndex(to);
    });
  }
  // The selected frame's context menu, at the pointer.
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

  // The frame properties panel: the selected frame's shape (from `usable`),
  // ticks and offset.
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

  return {
    flipFrame,
    removeFrame,
    copyFrame,
    cutFrame,
    pasteFrames,
    selectFrame,
    moveFrame,
    frameMenu,
    renderFrames,
  };
}
