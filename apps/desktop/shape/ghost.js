// The placement ghost: while placing, the picked tiles follow the pointer, at
// canvas zoom and snapped over the canvas (red where they would not fit),
// small beside the pointer elsewhere.
import { $ } from '../dom.js';
import { currentView } from '../state.js';
import { height, hideGhost, ox, oy, sc, shape, source, width } from './model.js';
import { canvas, screen, tile, world } from './view.js';

const host = $('shapeEditor');
/** @type {HTMLCanvasElement} */
let ghost;

/** Adds the ghost to the page and has it follow the pointer while placing. */
export function mountGhost() {
  ghost = document.createElement('canvas');
  ghost.id = 'scDragGhost';
  ghost.hidden = true;
  document.body.append(ghost);
  document.addEventListener('pointermove', (e) => {
    if (currentView === 'shapes' && sc.placing) showGhost(e);
  });
}
/** Shows the ghost for pointer event `e`, or hides it when nothing can be placed. */
export function showGhost(e) {
  if (!source() || host.hidden || !shape()) {
    hideGhost();
    return;
  }
  sc.ghostPoint = { x: e.clientX, y: e.clientY };
  const r = canvas.getBoundingClientRect(),
    inside =
      e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom,
    b = source(),
    w = sc.sourceRect.width * 8,
    h = sc.sourceRect.height * 8,
    scale = inside ? sc.zoom : Math.min(4, 180 / Math.max(w, h));
  ghost.width = w;
  ghost.height = h;
  const ctx = ghost.getContext('2d');
  for (let y = 0; y < sc.sourceRect.height; y++)
    for (let x = 0; x < sc.sourceRect.width; x++) {
      const t = (sc.sourceRect.y + y) * 16 + sc.sourceRect.x + x;
      tile(ctx, b, { tile: t, paletteBank: b.tilePaletteBanks[t] }, x * 8, y * 8, 1);
    }
  ghost.style.width = w * scale + 'px';
  ghost.style.height = h * scale + 'px';
  let left = e.clientX + 12,
    top = e.clientY + 12;
  if (inside) {
    let p = world(e);
    if ($('scSnap').checked)
      p = {
        x: Math.round((p.x - ox()) / 8) * 8 + ox(),
        y: Math.round((p.y - oy()) / 8) * 8 + oy(),
      };
    const s = screen(p.x, p.y);
    left = r.left + s[0];
    top = r.top + s[1];
    ghost.style.borderColor =
      p.x < 0 || p.y < 0 || p.x + w > width() || p.y + h > height() ? '#ff7777' : '#36c9d6';
  } else ghost.style.borderColor = '#36c9d6';
  ghost.style.left = left + 'px';
  ghost.style.top = top + 'px';
  ghost.hidden = false;
}
