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
/**
 * The zoom that fits the drawing area in the window, with a 24-pixel margin
 * on every side, from 1× to 32×.
 */
export function fitLevel() {
  return StudioShell.fitZoom(
    scroll.clientWidth - 48,
    scroll.clientHeight - 48,
    tl.selection.width * 8,
    tl.selection.height * 8,
    1,
    32,
  );
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
    scrolled: {
      stage: scroll,
      content: $('bankSelection'),
      apply: (z) => {
        tl.zoom = z;
        tl.render();
      },
    },
    fit: () => {
      tl.zoom = fitLevel();
      tl.render();
    },
    wheel: scroll,
    busy: () =>
      !!(tl.shapeStart || tl.stroke !== null || tl.moveDrag || tl.selectStart || tl.panDrag),
  });
  $('canvasTop').querySelector('.studioBarStart').after(tl.zoomControls.group);
}
/** Pans the canvas while Space is held, with the middle button, or with the Pan tool. */
export function spacePan() {
  StudioShell.stagePan({
    view: 'tiles',
    stage: scroll,
    cursor: scroll,
    panTool: () => tl.panToolActive,
    state: tl,
  });
}
