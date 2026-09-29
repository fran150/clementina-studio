// The Select tool for grids of background and overlay cells, shared by both
// editors so it behaves the same in each, and like a selection anywhere else:
// drag to select, drag inside the selection to move it, arrows nudge it,
// Ctrl/Cmd+C/X/V copy, cut and paste — a paste follows the pointer until a
// click places it — Delete clears, Ctrl/Cmd+A selects all, Escape deselects,
// and a flip turns the selected block over. A region is {x, y, width, height}
// in cells; a block is {width, height, cells} lifted out of a grid. The grid
// operations themselves are in domain/cells.js.
import {
  blankCell as blank,
  clear,
  lift,
  mirror,
  place,
  regionBetween as region,
  regionContains as contains,
} from './domain/cells.js';
import { StudioShell } from './studio-shell.js';

// grid() returns {width, height, cells}; edit(label, fn) runs fn as one
// undo step named label and re-renders; render() repaints.
function cellSelection({ grid, edit, render }) {
  let rect = null,
    anchor = null,
    moving = null,
    paste = null,
    hover = { col: 0, row: 0 };
  const api = {
    get rect() {
      return rect;
    },
    /** A drag or a floating paste is under way: zooming waits for it. */
    get busy() {
      return !!(anchor || moving || paste);
    },
    get pasting() {
      return !!paste;
    },
    contains: (point) => contains(rect, point),
    reset() {
      rect = anchor = moving = paste = null;
    },
    deselect() {
      rect = null;
      render();
    },
    /** Keeps the selection across an undo unless the grid no longer holds it. */
    revalidate() {
      const g = grid();
      if (!g || (rect && (rect.x + rect.width > g.width || rect.y + rect.height > g.height)))
        api.reset();
    },
    // Pointer input, for the Select tool — and for any tool while a paste floats.
    down(point) {
      if (paste) {
        api.commitPaste();
        return;
      }
      if (contains(rect, point)) {
        moving = {
          start: point,
          from: { ...rect },
          block: lift(grid(), rect),
          at: { x: rect.x, y: rect.y },
        };
        render();
        return;
      }
      anchor = point;
      rect = region(point, point);
      render();
    },
    /** Tracks the pointer; true when a drag or a floating paste used it. */
    move(point) {
      hover = point;
      if (paste) {
        paste.at = { x: point.col, y: point.row };
        render();
        return true;
      }
      if (moving) {
        const g = grid(),
          b = moving.block;
        moving.at = {
          x: Math.max(0, Math.min(g.width - b.width, moving.from.x + point.col - moving.start.col)),
          y: Math.max(
            0,
            Math.min(g.height - b.height, moving.from.y + point.row - moving.start.row),
          ),
        };
        render();
        return true;
      }
      if (anchor) {
        rect = region(anchor, point);
        render();
        return true;
      }
      return false;
    },
    /** Ends a drag; true when there was one. */
    up() {
      if (moving) {
        const m = moving;
        moving = null;
        if (m.at.x === m.from.x && m.at.y === m.from.y) render();
        else
          edit('Move cells', () => {
            const g = grid();
            clear(g, m.from);
            place(g, m.block, m.at.x, m.at.y);
            rect = { ...m.from, x: m.at.x, y: m.at.y };
          });
        return true;
      }
      if (anchor) {
        anchor = null;
        return true;
      }
      return false;
    },
    cancel() {
      anchor = moving = null;
      render();
    },
    selectAll() {
      const g = grid();
      paste = null;
      rect = { x: 0, y: 0, width: g.width, height: g.height };
      render();
    },
    /** Escape: drops a floating paste, else the selection. True if it did either. */
    escape() {
      if (paste) {
        paste = null;
        render();
        return true;
      }
      if (rect) {
        api.deselect();
        return true;
      }
      return false;
    },
    copy() {
      if (!rect) return false;
      StudioShell.clipboard.set('cells', lift(grid(), rect));
      return true;
    },
    cut() {
      if (!api.copy()) return false;
      const r = rect;
      edit('Cut cells', () => clear(grid(), r));
      return true;
    },
    startPaste() {
      const block = StudioShell.clipboard.get('cells');
      if (!block) return false;
      paste = { block, at: { x: hover.col, y: hover.row } };
      render();
      return true;
    },
    commitPaste() {
      const p = paste;
      paste = null;
      edit('Paste cells', () => {
        const g = grid();
        place(g, p.block, p.at.x, p.at.y);
        rect = {
          x: p.at.x,
          y: p.at.y,
          width: Math.min(p.block.width, g.width - p.at.x),
          height: Math.min(p.block.height, g.height - p.at.y),
        };
      });
    },
    remove() {
      if (!rect) return false;
      const r = rect;
      edit('Delete cells', () => clear(grid(), r));
      return true;
    },
    nudge(dx, dy) {
      if (!rect) return;
      const g = grid(),
        r = rect;
      const x = Math.max(0, Math.min(g.width - r.width, r.x + dx)),
        y = Math.max(0, Math.min(g.height - r.height, r.y + dy));
      if (x === r.x && y === r.y) return;
      const block = lift(g, r);
      edit('Nudge cells', () => {
        const g = grid();
        clear(g, r);
        place(g, block, x, y);
        rect = { ...r, x, y };
      });
    },
    flip(axis) {
      if (!rect) return;
      const r = rect;
      edit('Flip cells', () => {
        const g = grid();
        place(g, mirror(lift(g, r), axis), r.x, r.y);
      });
    },
    /** Keyboard commands. Returns the command a key ran, or '' when it ran none. */
    key(event) {
      // A focused library row answers its own keys (Delete, arrows).
      if (event.target.closest?.('[role="option"]')) return '';
      const mod = event.ctrlKey || event.metaKey,
        key = event.key.toLowerCase();
      if (mod && key === 'a') {
        api.selectAll();
        return 'selectAll';
      }
      if (mod && key === 'c') return api.copy() ? 'copy' : '';
      if (mod && key === 'x') return api.cut() ? 'cut' : '';
      if (mod && key === 'v') return api.startPaste() ? 'paste' : '';
      if (event.key === 'Escape') return api.escape() ? 'escape' : '';
      if (!mod && (event.key === 'Delete' || event.key === 'Backspace'))
        return api.remove() ? 'delete' : '';
      const step = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      }[event.key];
      if (step && !mod && rect && !paste) {
        api.nudge(...step);
        return 'nudge';
      }
      return '';
    },
    /** Runs fn on every selected cell, as one undo step named label. */
    apply(fn, label = 'Edit cells') {
      if (!rect) return;
      const r = rect;
      edit(label, () => {
        const g = grid();
        for (let y = r.y; y < r.y + r.height; y++)
          for (let x = r.x; x < r.x + r.width; x++) fn(g.cells[y * g.width + x]);
      });
    },
    selected() {
      return rect ? lift(grid(), rect).cells : [];
    },
    /** The cell drawn at a point: a block in flight covers the grid, and a moved block leaves blanks behind. */
    cellAt(point) {
      const g = grid(),
        f = moving ? { block: moving.block, at: moving.at, from: moving.from } : paste;
      if (f) {
        const x = point.col - f.at.x,
          y = point.row - f.at.y;
        if (x >= 0 && y >= 0 && x < f.block.width && y < f.block.height)
          return f.block.cells[y * f.block.width + x];
        if (contains(f.from, point)) return blank();
      }
      return g.cells[point.row * g.width + point.col];
    },
    /** Paints a block being moved or pasted over the canvas, before its grid lines. */
    drawFloating(ctx, drawCell) {
      const g = grid(),
        f = moving ? { block: moving.block, at: moving.at, from: moving.from } : paste;
      if (!f) return;
      if (f.from)
        for (let y = 0; y < f.from.height; y++)
          for (let x = 0; x < f.from.width; x++) drawCell(ctx, blank(), f.from.x + x, f.from.y + y);
      for (let y = 0; y < f.block.height; y++)
        for (let x = 0; x < f.block.width; x++) {
          const gx = f.at.x + x,
            gy = f.at.y + y;
          if (gx >= 0 && gy >= 0 && gx < g.width && gy < g.height)
            drawCell(ctx, f.block.cells[y * f.block.width + x], gx, gy);
        }
    },
    /** Places the marquee element around the selection, or the block in flight. */
    layout(marquee, zoom) {
      const f = moving ? { block: moving.block, at: moving.at } : paste,
        r = f ? { x: f.at.x, y: f.at.y, width: f.block.width, height: f.block.height } : rect;
      marquee.hidden = !r;
      if (!r) return;
      Object.assign(marquee.style, {
        left: r.x * 8 * zoom + 'px',
        top: r.y * 8 * zoom + 'px',
        width: r.width * 8 * zoom + 'px',
        height: r.height * 8 * zoom + 'px',
      });
    },
  };
  return api;
}
export const CellGrid = Object.freeze({ cellSelection });
