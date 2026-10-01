// Shared harness for the Electron UI suites (tests/desktop-*.cjs).
//
// A suite is one call:
//
//   suite('animation', { width: 1440, height: 1000 }, async (studio) => {
//     await studio.run(`showView('animations');`);
//     await studio.key('H', ['shift']);
//     assert.equal(await studio.run(`return animations.length;`), 1);
//   });
//
// The harness waits for Electron, opens the studio's editor page in a hidden
// window, hands the body a `studio` of helpers for driving it, and then
// checks that the renderer logged no errors. It prints "desktop NAME: ok" and
// exits 0 on success, or logs the failure and exits 1.
//
// The helpers themselves live in studio.cjs.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createStudio } = require('./studio.cjs');

const PRELOAD = path.resolve(__dirname, '../../dist/apps/desktop/preload.cjs');
const EDITOR_PAGE = path.resolve(__dirname, '../../apps/desktop/editor.html');

/**
 * Runs one UI suite in a hidden studio window.
 *
 * @param {string} name  Short suite name, printed as "desktop NAME: ok".
 * @param {object} options
 * @param {number} [options.width=1440]  Window size the suite's layout assumes.
 * @param {number} [options.height=1000]
 * @param {object} [options.webPreferences]  Extra web preferences for the window.
 * @param {() => Promise<void>} [options.setup]  Runs once Electron is ready,
 *   before any handler is registered or the window opens.
 * @param {Record<string, Function>} [options.handlers]  ipcMain.handle handlers
 *   (request/response channels). 'project:new' defaults to a no-op.
 * @param {Record<string, Function>} [options.listeners]  ipcMain.on listeners
 *   (fire-and-forget channels).
 * @param {RegExp} [options.ignoreErrors]  Renderer errors matching this are not failures.
 * @param {boolean} [options.focus]  Focus the page once it has loaded.
 * @param {number} [options.timeout]  Fail the whole suite after this many ms.
 * @param {object} [options.input]  How input events are sent:
 *   `round` rounds pointer coordinates to whole pixels, `clickCountOnMove`
 *   sends clickCount: 1 on mouse moves too, and `settle` overrides the waits
 *   in DEFAULT_SETTLE (studio.cjs).
 * @param {(error: Error, errors: string[], studio?: object) => Promise<void>|void} [options.onFailure]
 *   Replaces the default failure log (the error and the renderer errors).
 * @param {(studio: object) => Promise<void>|void} [options.onSuccess]
 *   Runs after every check has passed, just before "ok" is printed.
 * @param {(studio: object) => Promise<void>} body  The suite's checks.
 */
function suite(name, options, body) {
  const timer =
    options.timeout &&
    setTimeout(() => {
      console.error(`desktop ${name}: timed out after ${options.timeout} ms`);
      app.exit(1);
    }, options.timeout);
  const finish = (code) => {
    clearTimeout(timer);
    app.exit(code);
  };

  app.whenReady().then(async () => {
    const errors = [];
    let studio;
    try {
      if (options.setup) await options.setup();
      registerHandlers(options);
      const window = openWindow(options, errors);
      studio = createStudio(window, errors, options.input);
      await window.loadFile(EDITOR_PAGE);
      if (options.focus) window.webContents.focus();
      await body(studio);
      assert.deepEqual(errors, [], 'the renderer logged errors');
      if (options.onSuccess) await options.onSuccess(studio);
      console.log(`desktop ${name}: ok`);
      finish(0);
    } catch (error) {
      try {
        if (options.onFailure) await options.onFailure(error, errors, studio);
        else console.error(error, errors);
      } finally {
        finish(1);
      }
    }
  });
}

// Registers the main-process IPC the page expects. Every suite answers
// 'project:new'; the rest come from the suite's options.
function registerHandlers({ handlers = {}, listeners = {} }) {
  const all = { 'project:new': () => {}, ...handlers };
  for (const [channel, handler] of Object.entries(all)) ipcMain.handle(channel, handler);
  for (const [channel, listener] of Object.entries(listeners)) ipcMain.on(channel, listener);
}

// Opens the hidden, sandboxed studio window and starts collecting the
// renderer's errors into `errors`.
function openWindow({ width = 1440, height = 1000, webPreferences, ignoreErrors }, errors) {
  const window = new BrowserWindow({
    show: false,
    enableLargerThanScreen: true,
    width,
    height,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...webPreferences,
    },
  });
  // A window is created no larger than the screen, and the CI Mac's is
  // small. Resize it to the size the test's layout and pointer positions
  // assume; enableLargerThanScreen lets macOS keep it.
  window.setSize(width, height);
  window.webContents.on('console-message', (event) => {
    if (event.level !== 'error') return;
    if (ignoreErrors && ignoreErrors.test(event.message)) return;
    errors.push(event.message);
  });
  // A crashed renderer is a failure too, whatever the checks saw last.
  window.webContents.on('render-process-gone', (_event, details) =>
    errors.push(JSON.stringify(details)),
  );
  return window;
}

module.exports = { suite };
