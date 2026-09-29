// The tile editor's zoom and keyboard: the zoom buttons (the wheel zooms
// about the pointer), the shortcuts, and panning with Space, the middle
// button or the Pan tool.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { asset, scroll, tl } from './model.js';
import {
  capturePixels,
  clearSelection,
  cutSelection,
  dropPixelSelection,
  movePixels,
  movePosition,
  selectAllPixels,
  startPaste,
} from './pixels.js';

/** Wires the shortcuts. */
export function tileKeys() {
  StudioShell.viewKeys('tiles', (e, { key, mod, handled }) => {
    if (mod && key === 'a') {
      handled();
      selectAllPixels();
      return;
    }
    // One clipboard, shared with every editor: a paste pastes whatever was
    // copied last, pixels or a color; a copy takes from whichever area — the
    // canvas or the palette dock — was used last.
    if (mod && ['c', 'x', 'v'].includes(key)) {
      handled();
      if (key === 'v') {
        if (StudioShell.clipboard.has('color')) $('pasteColor').click();
        else if (asset() && StudioShell.clipboard.has('pixels')) {
          $('pasteSource').checked = e.shiftKey;
          startPaste();
        }
      } else if (key === 'c')
        (tl.clipboardArea === 'color' ? $('copyColor') : $('copyPixels')).click();
      else cutSelection();
      return;
    }
    if (key === 'escape') {
      handled();
      dropPixelSelection();
      return;
    }
    if (mod) return;
    if (/** @type {HTMLElement} */ (e.target).closest?.('[role="option"]')) return;
    if ((key === 'delete' || key === 'backspace') && tl.pixelSelection && !tl.pasteAnchor) {
      handled();
      clearSelection();
      return;
    }
    if (key.startsWith('arrow') && tl.pixelSelection && !tl.pasteAnchor) {
      handled();
      const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[
        key
      ];
      if (d)
        movePixels(
          tl.pixelSelection,
          capturePixels(tl.pixelSelection),
          movePosition(...d, tl.pixelSelection),
        );
      return;
    }
    if (e.shiftKey && (key === 'h' || key === 'v')) {
      handled();
      $(key === 'h' ? 'flipHorizontal' : 'flipVertical').click();
      return;
    }
    const tools = {
      s: 'selectionTool',
      b: 'pencilTool',
      e: 'eraserTool',
      g: 'fillTool',
      l: 'lineTool',
      r: 'rectangleTool',
      o: 'ellipseTool',
      i: 'pickerTool',
      h: 'panTool',
    };
    if (!e.shiftKey && tools[key]) {
      handled();
      $(tools[key]).click();
    }
  });
}
/** Builds the zoom buttons into the top bar. */
export function tileZoom() {
  // Tilesets draw at physical resolution, so they never zoom below 100%.
  tl.zoomControls = StudioShell.canvasZoom({
    view: 'tiles',
    ids: {
      fit: 'fitDrawing',
      actual: 'actualSize',
      zoomOut: 'zoomOut',
      label: 'zoomLabel',
      zoomIn: 'zoomIn',
    },
    min: 1,
    max: 32,
    get: () => tl.zoom,
    set: (next, x, y) =>
      StudioShell.zoomScrolled(
        scroll,
        $('bankSelection'),
        tl.zoom,
        next,
        (z) => {
          tl.zoom = z;
          tl.render();
        },
        x,
        y,
      ),
    fit: () => {
      tl.zoom = StudioShell.fitZoom(
        scroll.clientWidth - 48,
        scroll.clientHeight - 48,
        tl.selection.width * 8,
        tl.selection.height * 8,
        1,
        32,
      );
      tl.render();
      scroll.scrollLeft = scroll.scrollTop = 0;
    },
    wheel: scroll,
    busy: () =>
      !!(tl.shapeStart || tl.stroke !== null || tl.moveDrag || tl.selectStart || tl.panDrag),
  });
  $('canvasTop').querySelector('.studioBarStart').after(tl.zoomControls.group);
}
/** Pans the canvas while Space is held, with the middle button, or with the Pan tool. */
export function spacePan() {
  StudioShell.viewKeys('tiles', (e) => {
    if (e.code !== 'Space') return;
    tl.spaceHeld = true;
    e.preventDefault();
    scroll.style.cursor = 'grab';
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      tl.spaceHeld = false;
      scroll.style.cursor = tl.panToolActive ? 'grab' : '';
    }
  });
  window.addEventListener('blur', () => {
    tl.spaceHeld = false;
    tl.panDrag = null;
    scroll.style.cursor = tl.panToolActive ? 'grab' : '';
  });
  scroll.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button === 2 || (!tl.spaceHeld && e.button !== 1 && !tl.panToolActive)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      tl.panDrag = { x: e.clientX, y: e.clientY, left: scroll.scrollLeft, top: scroll.scrollTop };
      scroll.setPointerCapture(e.pointerId);
      scroll.style.cursor = 'grabbing';
    },
    true,
  );
  scroll.addEventListener(
    'pointermove',
    (e) => {
      if (!tl.panDrag) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      scroll.scrollLeft = tl.panDrag.left + tl.panDrag.x - e.clientX;
      scroll.scrollTop = tl.panDrag.top + tl.panDrag.y - e.clientY;
    },
    true,
  );
  for (const type of ['pointerup', 'pointercancel'])
    scroll.addEventListener(
      type,
      (e) => {
        if (!tl.panDrag) return;
        tl.panDrag = null;
        e.stopImmediatePropagation();
        scroll.style.cursor = tl.spaceHeld || tl.panToolActive ? 'grab' : '';
      },
      true,
    );
}
