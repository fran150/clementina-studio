// The `studio` a desktop UI suite drives the editor with: page evaluation,
// polling, real keyboard, mouse and wheel input, menu commands, context menus,
// screenshots and project validation. electron.cjs creates one per
// suite, for the window it opened.
//
// Input helpers send real input events through webContents.sendInputEvent.
// Chromium handles them asynchronously, so each helper waits a moment
// afterwards. Those waits differ between suites, and changing them can change
// what a suite sees, so they are options (`input.settle`), and every helper
// also takes a per-call `settle`.
const path = require('node:path');
const fs = require('node:fs');

const ASSETS_MODULE = '../../dist/packages/assets/index.js';

// How long, in ms, each kind of input waits for the renderer to catch up.
const DEFAULT_SETTLE = {
  key: 50, // after a key press (keyDown + keyUp)
  command: 60, // after an application-menu command
  wheel: 120, // after a wheel event
  mouseDown: 0, // after each single mouse event...
  mouseMove: 0,
  mouseUp: 0,
  gesture: 60, // ...and once more after a whole click or drag
};

// Resolves after `ms` milliseconds.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits `ms` after an input event. With no wait, events go out back to back
// in the same task, as a hand-written sequence of sendInputEvent calls does.
const pause = (ms) => (ms > 0 ? wait(ms) : undefined);

// Returns the helpers for driving `window`. `errors` is the list the harness
// collects the renderer's errors into; `input` is the suite's input option.
function createStudio(window, errors, input = {}) {
  const contents = window.webContents;
  const settle = { ...DEFAULT_SETTLE, ...input.settle };
  const coordinate = input.round ? Math.round : (value) => value;

  // Runs `source` as a function body against the studio's modules (found
  // through window.__studio) and resolves to what it returns.
  const run = (source) => contents.executeJavaScript(`with (__studio) (()=>{${source}})()`);

  // Evaluates one expression against the studio's modules.
  const read = (expression) => contents.executeJavaScript(`with (__studio) ${expression}`);

  // Polls `expression` until it is truthy; throws once `timeout` ms or
  // `tries` attempts have passed.
  async function until(expression, { timeout = 4000, interval = 30, tries = Infinity } = {}) {
    const deadline = Date.now() + timeout;
    for (let attempt = 0; attempt < tries && Date.now() < deadline; attempt++) {
      if (await read(expression)) return;
      await wait(interval);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  }

  // Measures with `measure()` until `isDone(value)` holds or `timeout` ms
  // pass, and resolves to the last value either way, so the caller's
  // assertion reports what the page settled on.
  async function poll(measure, isDone, { timeout = 2000, interval = 40 } = {}) {
    let value = await measure();
    for (let deadline = Date.now() + timeout; Date.now() < deadline && !isDone(value);) {
      await wait(interval);
      value = await measure();
    }
    return value;
  }

  // Sends one key event, then waits `settle` ms (none by default).
  async function keyEvent(type, keyCode, { modifiers = [], settle: ms = 0 } = {}) {
    contents.sendInputEvent({ type, keyCode, modifiers });
    await pause(ms);
  }

  // Presses and releases a key, e.g. key('Z', ['control']).
  async function key(keyCode, modifiers = [], { settle: ms = settle.key } = {}) {
    contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await pause(ms);
  }

  // Sends one mouse event ('mouseDown', 'mouseMove' or 'mouseUp') at `point`.
  async function mouse(type, point, { button = 'left', settle: ms = settle[type] } = {}) {
    const event = { type, x: coordinate(point.x), y: coordinate(point.y), button };
    if (type !== 'mouseMove' || input.clickCountOnMove) event.clickCount = 1;
    contents.sendInputEvent(event);
    await pause(ms);
  }

  // Presses at the first point, moves through the others, releases at the
  // last, then waits for the gesture to settle. One point is a click.
  async function drag(points, { button = 'left', settle: ms = settle.gesture } = {}) {
    await mouse('mouseDown', points[0], { button });
    for (const point of points.slice(1)) await mouse('mouseMove', point, { button });
    await mouse('mouseUp', points.at(-1), { button });
    await pause(ms);
  }

  // Clicks at a point: a press and release in place.
  const click = (point, options) => drag([point], options);

  // Moves the pointer with no button held, and does not wait.
  function hover(point) {
    contents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y });
  }

  // Clicks the centre of the element matching `selector`, like a user would:
  // waits until it is enabled and visible, and fails if something covers it.
  async function clickElement(selector) {
    const quoted = JSON.stringify(selector);
    const clickable = `(() => {
      const el = document.querySelector(${quoted});
      return !!el && !el.disabled && el.checkVisibility();
    })()`;
    try {
      await until(clickable);
    } catch {
      const state = await read(
        `JSON.stringify({view: currentView, width: innerWidth, height: innerHeight, visible: [...document.querySelectorAll('#workspace > section, #workspace > div')].filter(e => e.checkVisibility()).map(e => e.id)})`,
      );
      throw new Error(`Not clickable: ${selector} ${state}`);
    }
    const point = await read(`(() => {
      const el = document.querySelector(${quoted});
      if(!el || el.disabled || !el.checkVisibility()) throw new Error('Not clickable: ' + ${quoted});
      const r = el.getBoundingClientRect(), x = Math.round(r.left + r.width/2), y = Math.round(r.top + r.height/2);
      if(!el.contains(document.elementFromPoint(x,y))) throw new Error('Covered or offscreen: ' + ${quoted});
      return {x,y};
    })()`);
    contents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
    await wait(50);
  }

  // Sends a real wheel event, so native scrolling happens when nothing
  // prevents it. Negative deltaY scrolls down.
  async function wheel(point, deltaY, modifiers = [], { settle: ms = settle.wheel } = {}) {
    contents.sendInputEvent({
      type: 'mouseWheel',
      x: coordinate(point.x),
      y: coordinate(point.y),
      deltaX: 0,
      deltaY,
      canScroll: true,
      modifiers,
    });
    await pause(ms);
  }

  // Runs an application-menu command, as the main process sends it.
  async function command(name, { settle: ms = settle.command } = {}) {
    contents.send('studio:command', name);
    await pause(ms);
  }

  // Returns at(col, row): the centre of that 8×8 cell of a cell canvas shown
  // at 100%. `canvas` is the canvas's id, measured now, or a {left, top}
  // already measured. at.left and at.top are the canvas's corner.
  async function cells(canvas) {
    const { left, top } =
      typeof canvas === 'string'
        ? await run(
            `const r=$('${canvas}').getBoundingClientRect();return {left:r.left,top:r.top};`,
          )
        : canvas;
    const at = (col, row) => ({ x: left + col * 8 + 4, y: top + row * 8 + 4 });
    return Object.assign(at, { left, top });
  }

  // Right-clicks and returns the labels of the studio menu that opens, or null
  // when none does. The menu is closed again. `target` is a selector (clicked
  // at its centre) or a {x, y} point (clicked on whatever is there).
  function contextMenuLabels(target) {
    const find =
      typeof target === 'string'
        ? `const el=document.querySelector(${JSON.stringify(target)}),r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;`
        : `const x=${target.x},y=${target.y},el=document.elementFromPoint(x,y);`;
    return run(
      `document.querySelector('.studioMenu')?.remove();${find}el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:y}));const m=document.querySelector('.studioMenu');const labels=m?[...m.querySelectorAll('button span')].map(s=>s.textContent):null;m?.remove();return labels;`,
    );
  }

  // Resizes the window, then waits `ms` for the layout to follow.
  async function resize(width, height, ms) {
    window.setSize(width, height);
    await pause(ms);
  }

  // The page as a PNG buffer.
  const png = async () => (await contents.capturePage()).toPNG();

  // Saves a screenshot as NAME.png in STUDIO_CAPTURE_DIR, when that is set.
  async function shot(name) {
    const dir = process.env.STUDIO_CAPTURE_DIR;
    if (dir) fs.writeFileSync(path.join(dir, `${name}.png`), await png());
  }

  // The built @clementina/assets module: validation, encoding and decoding.
  const assets = () => import(ASSETS_MODULE);

  // Checks the studio's current project against the real validator (which
  // throws when it is invalid) and returns the project.
  async function expectValidProject() {
    const project = await run(`return studioProject();`);
    const { validateProject } = await assets();
    validateProject(project);
    return project;
  }

  return {
    window,
    errors,
    run,
    read,
    wait,
    until,
    poll,
    keyDown: (keyCode, options) => keyEvent('keyDown', keyCode, options),
    keyUp: (keyCode, options) => keyEvent('keyUp', keyCode, options),
    key,
    mouse,
    drag,
    click,
    hover,
    clickElement,
    wheel,
    command,
    cells,
    contextMenuLabels,
    resize,
    png,
    shot,
    assets,
    expectValidProject,
  };
}

module.exports = { createStudio, wait };
