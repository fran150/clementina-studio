// The animation editor's frame drawing and timeline: a frame painted on the
// 320 × 200 screen, and the strip of frame cards to select, reorder (by
// dragging or Alt+arrows) and open the context menu on.
import { $ } from '../dom.js';
import { bankColor, css565, frameIndex, tilePixel, tilesetById } from '../state.js';
import { frameSprites, shapeById } from './model.js';

/**
 * Paints `frame` on `canvas` as the 320 × 200 screen, its origin at the
 * center, scaled by `zoom` about the center.
 */
export function paintFrame(canvas, frame, zoom = 1) {
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

/**
 * Rebuilds the timeline for animation `a`, keeping its scroll position.
 *
 * @param {any} a The animation, if any.
 * @param {any} actions The frame actions (see frames.js).
 */
export function renderTimeline(a, { selectFrame, moveFrame, frameMenu }) {
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
    // The thumbnail zooms in on small shapes, up to 6×, so they show.
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
