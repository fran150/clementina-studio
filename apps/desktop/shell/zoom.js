// Canvas navigation, the same in every zoomable editor: the wheel or a
// two-finger swipe pans, and a pinch or Ctrl/Cmd+wheel zooms around the
// pointer — a trackpad pinch arrives as a wheel event with ctrlKey set.
// Space-drag, the middle button and the Pan tool stay with each editor.
//
// Whole-number steps above 100% keep every art pixel the same size on
// screen; below it the steps halve, for art bigger than the window.
import { $ } from '../dom.js';
import { clamp } from '../domain/geometry.js';

const ZOOM_STEPS = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
const zoomSteps = (min, max) => ZOOM_STEPS.filter((z) => z >= min && z <= max);
function stepZoom(zoom, direction, min, max) {
  const steps = zoomSteps(min, max);
  return direction > 0
    ? (steps.find((z) => z > zoom) ?? steps.at(-1))
    : (steps.findLast((z) => z < zoom) ?? steps[0]);
}
/** The largest step at which `width × height` art pixels fit the available space. */
export function fitZoom(
  availableWidth,
  availableHeight,
  width,
  height,
  min = ZOOM_STEPS[0],
  max = ZOOM_STEPS.at(-1),
) {
  const steps = zoomSteps(min, max);
  return (
    steps.findLast((z) => width * z <= availableWidth && height * z <= availableHeight) ?? steps[0]
  );
}
// For a canvas inside a native scroll container: changes the zoom through
// `apply`, then scrolls so the art under (clientX, clientY) — the view's
// center when omitted — stays under it.
export function zoomScrolled(scroller, content, from, to, apply, clientX, clientY) {
  const view = scroller.getBoundingClientRect();
  clientX ??= view.left + scroller.clientWidth / 2;
  clientY ??= view.top + scroller.clientHeight / 2;
  const before = content.getBoundingClientRect(),
    x = (clientX - before.left) / from,
    y = (clientY - before.top) / from;
  apply(to);
  const after = content.getBoundingClientRect();
  scroller.scrollLeft += after.left + x * to - clientX;
  scroller.scrollTop += after.top + y * to - clientY;
}
// A mouse notch zooms one step. A pinch follows the fingers: Chromium turns
// each pinch update into a Ctrl+wheel event with deltaY = 100·ln(scale)
// (components/input/touchpad_pinch_event_queue.cc), so the gesture's
// running scale is recovered exactly and the canvas shows the step nearest
// it. A step changes only once the fingers are clearly past the midpoint
// between two steps, so the zoom holds still where the gesture stops.
// wheelDelta cannot tell the two apart: Chromium gives every pinch event
// a whole ±120 tick, the same as a mouse notch.
//
// Without `pan` the plain wheel is left to scroll the element natively,
// momentum included; `pan(dx, dy)` is for canvases with their own camera.
function canvasWheel(element, { get, steps, zoomTo, pan, busy }) {
  let gesture = null,
    lastAt = -Infinity;
  const HYSTERESIS = 0.12; // in ln(zoom) units, about 12%
  element.addEventListener(
    'wheel',
    (event) => {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        if (busy() || !event.deltaY) return;
        const delta = event.deltaY * unit,
          current = get();
        // A mouse notch is at least 40 px on macOS (kScrollbarPixelsPerCocoaTick)
        // and 100 elsewhere; one pinch update is a few units.
        if (event.deltaMode !== 0 || Math.abs(delta) >= 30) {
          gesture = null;
          const next =
            delta < 0
              ? (steps.find((z) => z > current) ?? steps.at(-1))
              : (steps.findLast((z) => z < current) ?? steps[0]);
          if (next !== current) zoomTo(next, event.clientX, event.clientY);
          return;
        }
        if (!gesture || event.timeStamp - lastAt > 250) gesture = { target: Math.log(current) };
        lastAt = event.timeStamp;
        gesture.target = Math.max(
          Math.log(steps[0]),
          Math.min(Math.log(steps.at(-1)), gesture.target - delta / 100),
        );
        const distance = (z) => Math.abs(Math.log(z) - gesture.target);
        const nearest = steps.reduce((a, b) => (distance(b) < distance(a) ? b : a));
        if (nearest !== current && distance(nearest) < distance(current) - HYSTERESIS)
          zoomTo(nearest, event.clientX, event.clientY);
        return;
      }
      if (!pan) return;
      event.preventDefault();
      let dx = event.deltaX * unit,
        dy = event.deltaY * unit;
      if (event.shiftKey && !dx) {
        dx = dy;
        dy = 0;
      }
      pan(dx, dy);
    },
    { passive: false },
  );
}
const canvasCommands = new Map();
// One editor's zoom: the Fit, 100%, −, level, + cluster every canvas editor
// shows in the middle of its top bar, the wheel, and the View menu's zoom
// commands. The cluster's elements are `prefix` + Fit, ActualSize, ZoomOut,
// ZoomLabel and ZoomIn, or as `ids` names them; missing ones are created.
// `set(zoom, clientX, clientY)` applies a level, keeping that point — the
// view's center when omitted — in place; `fit()` applies the fitting one.
// A canvas that sits in a scrolled stage passes `scrolled` in place of `set`:
// its `apply(zoom)` stores the level and redraws, the stage scrolls to keep
// the point in place, and Fit scrolls back to the top-left corner.
// Returns the cluster and a `sync()` for the editor's render.
/**
 * @param {{ view: string, prefix?: string, ids?: Record<string, string>, min?: number,
 *   max?: number, get: () => number,
 *   set?: (zoom: number, clientX?: number, clientY?: number) => void,
 *   scrolled?: { stage: HTMLElement, content: HTMLElement, apply: (zoom: number) => void },
 *   fit: () => void, wheel: HTMLElement, pan?: any, busy?: () => boolean }} options
 */
export function canvasZoom({
  view,
  prefix,
  ids = {
    fit: prefix + 'Fit',
    actual: prefix + 'ActualSize',
    zoomOut: prefix + 'ZoomOut',
    label: prefix + 'ZoomLabel',
    zoomIn: prefix + 'ZoomIn',
  },
  min = ZOOM_STEPS[0],
  max = ZOOM_STEPS.at(-1),
  get,
  scrolled,
  set = (next, x, y) =>
    zoomScrolled(scrolled.stage, scrolled.content, get(), next, scrolled.apply, x, y),
  fit: fitLevel,
  wheel,
  pan,
  busy = () => false,
}) {
  const fit = () => {
    fitLevel();
    if (scrolled) scrolled.stage.scrollLeft = scrolled.stage.scrollTop = 0;
  };
  const group = document.createElement('div');
  group.className = 'studioZoom';
  const make = (key, tag, text, label) => {
    const el = $(ids[key]) ?? Object.assign(document.createElement(tag), { id: ids[key] });
    if (tag === 'button') {
      el.type = 'button';
      el.textContent = text;
      el.title = label;
      el.setAttribute('aria-label', label);
    }
    group.append(el);
    return el;
  };
  const fitButton = make('fit', 'button', 'Fit', 'Zoom to fit (Ctrl/Cmd+0)'),
    actual = make('actual', 'button', '100%', 'Actual size (Ctrl/Cmd+Alt+0)');
  const out = make('zoomOut', 'button', '−', 'Zoom out (Ctrl/Cmd+−)'),
    level = make('label', 'span'),
    into = make('zoomIn', 'button', '+', 'Zoom in (Ctrl/Cmd+=)');
  const step = (direction, clientX, clientY) => {
    const next = stepZoom(get(), direction, min, max);
    if (next !== get()) set(next, clientX, clientY);
  };
  const actualSize = () => {
    const next = clamp(1, min, max);
    if (next !== get()) set(next);
  };
  fitButton.onclick = () => fit();
  actual.onclick = actualSize;
  out.onclick = () => step(-1);
  into.onclick = () => step(1);
  canvasWheel(wheel, { get, steps: zoomSteps(min, max), zoomTo: set, pan, busy });
  canvasCommands.set(view, {
    zoomIn: () => step(1),
    zoomOut: () => step(-1),
    zoomFit: () => fit(),
    zoomActual: actualSize,
  });
  return {
    group,
    sync() {
      const zoom = get();
      level.textContent = Math.round(zoom * 100) / 100 + '×';
      out.disabled = zoom <= min;
      into.disabled = zoom >= max;
    },
  };
}
/** Runs a View menu zoom command against the canvas `view` shows, if it has one. */
export function canvasCommand(view, command) {
  canvasCommands.get(view)?.[command]?.();
}
