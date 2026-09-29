// The background editor's camera preview. Two nested rectangles over the
// canvas model two hardware facts: the outer one is the BGMODE-sized window
// that would be resident in the active BGSET's four physical tables (what's
// loaded), the inner one is the fixed 320×200 physical screen positioned by
// SCROLL_X/SCROLL_Y within it (what's actually visible). SCROLL_X/Y wrap at
// the mode's own pixel size — see clementina-rom/docs/basic-video.md's
// SCROLL entry — so the inner rectangle wraps too, and the camera panel's
// table-index math mirrors clementina-video-client/internal/render/
// renderer.go's bgTableAndLocal. An overlay can be composited on the visible
// screen. None of this is saved to the asset.
import {
  VIEWPORT_MODES,
  clampScroll,
  positiveMod,
  screenRanges,
  viewportMode,
  visibleTables,
} from '../domain/backgrounds.js';
import { $ } from '../dom.js';
import { bankColor, css565, overlays, tilePixel } from '../state.js';

/**
 * Wires up the camera preview of the background editor.
 *
 * @param {object} options
 * @param {HTMLElement} options.host The background editor's section.
 * @param {() => any} options.background The background being edited, if any.
 * @param {() => any} options.editor The editor's grid editor (see grid-editor.js).
 * @param {() => void} options.render Redraws the whole editor.
 */
export function backgroundCamera({ host, background, editor, render }) {
  $('bgPreviewMode').replaceChildren(
    ...VIEWPORT_MODES.map((m) => new Option(m.label, String(m.id))),
  );
  // The viewport preview: which BGMODE window is shown, where it sits on the
  // canvas, and the drag moving it by its handle.
  let previewModeId = 0,
    viewportOrigin = { x: 0, y: 0 },
    viewportDrag = null;
  // BGSET (0/1) and SCROLL_X/SCROLL_Y, and the drag moving the screen.
  let activeSet = 0,
    scroll = { x: 0, y: 0 },
    scrollDrag = null;
  // The composite preview: which overlay to draw on the visible screen, and
  // whether it's shown.
  let overlayId = null,
    showOverlay = false;

  // Marks where each cell (one nametable and attribute table entry) begins
  // and ends, so an empty cell doesn't read as featureless background.
  function drawCellLines(ctx) {
    const a = background();
    ctx.strokeStyle = '#ffffff26';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let col = 0; col <= a.width; col++) {
      ctx.moveTo(col * 8 + 0.5, 0);
      ctx.lineTo(col * 8 + 0.5, a.height * 8);
    }
    for (let row = 0; row <= a.height; row++) {
      ctx.moveTo(0, row * 8 + 0.5);
      ctx.lineTo(a.width * 8, row * 8 + 0.5);
    }
    ctx.stroke();
  }
  // The overlay never scrolls — it always sits 1:1 on the physical screen, so
  // it composites onto exactly the same wrapped pieces the inner (visible)
  // rectangle guide already computes, mapping each piece back to its source
  // region of the fixed 320×200 overlay image. Plane defaults to 0 for any
  // 1bpp overlay tileset — a documented simplification; full plane accuracy
  // lives in the overlay editor itself.
  function drawOverlayComposite(ctx) {
    const overlay = overlays.find((o) => o.id === overlayId);
    if (!overlay) return;
    const primary = editor().tilesetById(overlay.tilesetId),
      alt = editor().tilesetById(overlay.altTilesetId);
    const { xRanges, yRanges } = screenRanges(previewModeId, scroll);
    let sx0 = 0;
    for (const [x0, x1] of xRanges) {
      const sxLen = x1 - x0;
      let sy0 = 0;
      for (const [y0, y1] of yRanges) {
        const syLen = y1 - y0;
        for (let dy = 0; dy < syLen; dy++)
          for (let dx = 0; dx < sxLen; dx++) {
            const sx = sx0 + dx,
              sy = sy0 + dy;
            const col = Math.floor(sx / 8),
              row = Math.floor(sy / 8),
              px = sx % 8,
              py = sy % 8;
            const cell = overlay.cells[row * 40 + col];
            if (!cell) continue;
            const source = cell.chrAlt ? alt : primary;
            if (!source) continue;
            const cx = cell.flipX ? 7 - px : px,
              cy = cell.flipY ? 7 - py : py;
            const ink = tilePixel(source, cell.tile, cx, cy, 0);
            if (ink === 0) continue;
            ctx.fillStyle = css565(bankColor(cell.paletteBank, ink));
            ctx.fillRect(viewportOrigin.x * 8 + x0 + dx, viewportOrigin.y * 8 + y0 + dy, 1, 1);
          }
        sy0 += syLen;
      }
      sx0 += sxLen;
    }
  }

  // ===== the loaded window =====
  function layoutViewportOverlay() {
    const a = background(),
      overlay = $('bgViewportOverlay'),
      zoom = editor().zoom;
    if (!a) {
      overlay.hidden = true;
      return;
    }
    const mode = viewportMode(previewModeId);
    const cols = Math.min(mode.columns, a.width),
      rows = Math.min(mode.rows, a.height);
    viewportOrigin.x = Math.max(0, Math.min(a.width - cols, viewportOrigin.x));
    viewportOrigin.y = Math.max(0, Math.min(a.height - rows, viewportOrigin.y));
    overlay.hidden = false;
    overlay.style.left = viewportOrigin.x * 8 * zoom + 'px';
    overlay.style.top = viewportOrigin.y * 8 * zoom + 'px';
    overlay.style.width = cols * 8 * zoom + 'px';
    overlay.style.height = rows * 8 * zoom + 'px';
  }
  $('bgPreviewMode').onchange = () => {
    previewModeId = Number($('bgPreviewMode').value);
    render();
  };
  // The overlay itself is click-through (pointer-events:none) so it never
  // blocks painting underneath it; only its small handle is draggable.
  $('bgViewportHandle').onpointerdown = (e) => {
    e.stopPropagation();
    viewportDrag = { startX: e.clientX, startY: e.clientY, origin: { ...viewportOrigin } };
    $('bgViewportHandle').setPointerCapture(e.pointerId);
  };
  $('bgViewportHandle').onpointermove = (e) => {
    if (!viewportDrag) return;
    const zoom = editor().zoom,
      dx = Math.round((e.clientX - viewportDrag.startX) / (8 * zoom)),
      dy = Math.round((e.clientY - viewportDrag.startY) / (8 * zoom));
    viewportOrigin = { x: viewportDrag.origin.x + dx, y: viewportDrag.origin.y + dy };
    layoutViewportOverlay();
    layoutScrollOverlay();
    updateCameraPanel();
  };
  $('bgViewportHandle').onpointerup = $('bgViewportHandle').onpointercancel = () => {
    viewportDrag = null;
  };

  // ===== the visible screen =====
  // The inner rectangle is the fixed 320×200 physical screen, positioned by
  // SCROLL_X/SCROLL_Y within the loaded window and wrapping at the mode's own
  // pixel size — up to four pieces when it straddles both edges.
  // #bgScrollClip is sized to the mode's true plane, not the (possibly
  // canvas-clamped) outer rectangle — a small authored canvas must not clip
  // scroll math that real hardware would still apply at the mode's full size.
  function layoutScrollOverlay() {
    const a = background(),
      zoom = editor().zoom;
    if (!a) return;
    const { planeW, planeH, localX, localY, xRanges, yRanges } = screenRanges(
      previewModeId,
      scroll,
    );
    const clip = $('bgScrollClip');
    clip.hidden = false;
    clip.style.left = viewportOrigin.x * 8 * zoom + 'px';
    clip.style.top = viewportOrigin.y * 8 * zoom + 'px';
    clip.style.width = planeW * zoom + 'px';
    clip.style.height = planeH * zoom + 'px';
    const pieces = host.querySelectorAll('.bgScrollRect');
    let i = 0;
    for (const [x0, x1] of xRanges)
      for (const [y0, y1] of yRanges) {
        const el = pieces[i++];
        el.hidden = false;
        el.style.left = x0 * zoom + 'px';
        el.style.top = y0 * zoom + 'px';
        el.style.width = (x1 - x0) * zoom + 'px';
        el.style.height = (y1 - y0) * zoom + 'px';
      }
    for (; i < pieces.length; i++) pieces[i].hidden = true;
    const handleX = positiveMod(localX + 160, planeW),
      handleY = positiveMod(localY + 100, planeH);
    $('bgScrollHandle').style.left = handleX * zoom + 'px';
    $('bgScrollHandle').style.top = handleY * zoom + 'px';
  }
  $('bgActiveSet').onchange = () => {
    activeSet = Number($('bgActiveSet').value);
    render();
  };
  $('bgScrollX').onchange = () => {
    scroll = { ...scroll, x: clampScroll(Number($('bgScrollX').value)) };
    render();
  };
  $('bgScrollY').onchange = () => {
    scroll = { ...scroll, y: clampScroll(Number($('bgScrollY').value)) };
    render();
  };
  $('bgScrollHandle').onpointerdown = (e) => {
    e.stopPropagation();
    scrollDrag = { startX: e.clientX, startY: e.clientY, origin: { ...scroll } };
    $('bgScrollHandle').setPointerCapture(e.pointerId);
  };
  $('bgScrollHandle').onpointermove = (e) => {
    if (!scrollDrag) return;
    const zoom = editor().zoom,
      dx = Math.round((e.clientX - scrollDrag.startX) / zoom),
      dy = Math.round((e.clientY - scrollDrag.startY) / zoom);
    scroll = {
      x: positiveMod(scrollDrag.origin.x + dx, 65536),
      y: positiveMod(scrollDrag.origin.y + dy, 65536),
    };
    layoutScrollOverlay();
    updateCameraPanel();
  };
  $('bgScrollHandle').onpointerup = $('bgScrollHandle').onpointercancel = () => {
    scrollDrag = null;
  };

  // ===== the camera panel and overlay composite =====
  function updateCameraPanel() {
    const a = background();
    if (!a) return;
    const mode = viewportMode(previewModeId);
    $('bgActiveSet').value = String(activeSet);
    $('bgScrollX').value = String(scroll.x);
    $('bgScrollY').value = String(scroll.y);
    $('bgCamMode').textContent = `BGMODE ${mode.id} · ${mode.label} tiles`;
    $('bgCamWindow').textContent =
      `Origin ${viewportOrigin.x}, ${viewportOrigin.y} tiles from top-left`;
    $('bgCamTables').textContent =
      `Tables ${visibleTables(previewModeId, activeSet, scroll).join(', ')}`;
    $('bgCamTilesets').textContent =
      `Primary ${editor().primaryTileset()?.name ?? 'missing'} · Alternate ${editor().altTileset()?.name ?? 'missing'}`;
  }
  function renderOverlayToggle() {
    const picker = $('bgOverlayPick'),
      signature = overlays.map((o) => o.id + '|' + o.name).join(',');
    if (picker.dataset.signature !== signature) {
      picker.dataset.signature = signature;
      picker.replaceChildren(...overlays.map((o) => new Option(o.name, o.id)));
    }
    if (!overlays.some((o) => o.id === overlayId)) overlayId = overlays[0]?.id ?? null;
    picker.value = overlayId ?? '';
    $('bgOverlayPickWrap').hidden = !overlays.length;
    $('bgToggleOverlay').hidden = !overlays.length;
    $('bgToggleOverlay').textContent = showOverlay ? 'Hide overlay' : 'Show overlay';
    $('bgToggleOverlay').setAttribute('aria-pressed', String(showOverlay));
    $('bgToggleOverlay').classList.toggle('on', showOverlay);
  }
  $('bgOverlayPick').onchange = () => {
    overlayId = $('bgOverlayPick').value || null;
    editor().paintCanvas();
  };
  $('bgToggleOverlay').onclick = () => {
    showOverlay = !showOverlay;
    renderOverlayToggle();
    editor().paintCanvas();
  };

  return {
    // Draws the cell lines, and the overlay when it's shown, over the cells.
    decorate(ctx) {
      drawCellLines(ctx);
      if (showOverlay) drawOverlayComposite(ctx);
    },
    // Whether the window or the screen is being dragged.
    busy: () => !!(viewportDrag || scrollDrag),
    // Puts the camera back at the top left of set 0, unscrolled.
    reset() {
      viewportOrigin = { x: 0, y: 0 };
      scroll = { x: 0, y: 0 };
      activeSet = 0;
    },
    // Shows the chosen mode, before the editor's controls render.
    syncMode() {
      $('bgPreviewMode').value = String(previewModeId);
    },
    renderOverlayToggle,
    // Places both rectangles and fills in the camera panel, once the canvas
    // is painted.
    layout() {
      layoutViewportOverlay();
      layoutScrollOverlay();
      updateCameraPanel();
    },
  };
}
