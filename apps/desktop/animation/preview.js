// The animation editor's player: the preview canvas and its zoom, the
// transport (previous, next, play), dragging the selected frame's offset on
// the canvas, and the playback loop.
import { clampOffset, frameAtTick } from '../domain/animations.js';
import { $ } from '../dom.js';
import { renderAnimations } from '../lifecycle.js';
import {
  currentView,
  frameIndex,
  playFrame,
  playing,
  playStart,
  setFrameIndex,
  setPlayFrame,
  setPlaying,
  setPlayStart,
  tilesetById,
} from '../state.js';
import { markDirty } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import {
  animationTileset,
  checkpoint,
  currentAnimation,
  currentFrame,
  shapeById,
} from './model.js';
import { paintFrame } from './timeline.js';

/**
 * Wires up the animation player.
 *
 * @param {object} options
 * @param {HTMLElement} options.host The animation editor's section.
 * @param {() => void} options.render Redraws the animation editor.
 * @param {any} options.actions The frame actions (see frames.js).
 */
export function animationPreview({ host, render, actions }) {
  const { selectFrame, moveFrame, frameMenu } = actions;
  // The preview fits the space it has — fractionally, since it is a player —
  // until it is zoomed by hand; Fit goes back to fitting. Zoom steps, the
  // wheel and the View menu work as on every canvas.
  let previewZoom = 1,
    previewFits = true,
    zoomControls = null;
  // Dragging the selected frame's offset on the preview.
  let drag = null;

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
  // Draws the frame showing (the playing one, or the selected one), and the
  // counter and status line under it.
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
  // Play starts from the selected frame; pause selects the frame showing.
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
  // Every display frame: advance playback by the 60 Hz ticks elapsed, and
  // redraw the preview while the editor shows.
  function tick(now) {
    const a = currentAnimation();
    if (playing && a && currentView === 'animations') {
      setPlayFrame(frameAtTick(a.frames, Math.floor(((now - playStart) * 60) / 1000)));
    }
    if (!host.hidden) drawPreview();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // Adds the zoom controls to the top bar.
  function mountZoom() {
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
  }

  return { fitPreview, drawPreview, mountZoom };
}
