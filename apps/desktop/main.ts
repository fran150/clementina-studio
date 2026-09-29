// The main process: opens Studio's window and wires it to the parts that run
// outside the page: the application menu (app-menu.ts), project files and
// imports (project-files.ts), the Builder (builder-ipc.ts) and crash recovery
// (recovery-session.ts).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, dialog } from 'electron';
import type { StudioProject } from '../../packages/assets/index.js';
import { installAppMenu } from './app-menu.js';
import { installBuilder } from './builder-ipc.js';
import { installCloseGuard } from './close-guard.js';
import { pageBridge } from './page-bridge.js';
import { installProjectFiles, ProjectLocation, saveProject } from './project-files.js';
import { RecoveryStore } from './recovery.js';
import { RecoverySession } from './recovery-session.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Opens Studio's window, sandboxed: the page reaches the system only through preload.cts. */
function createWindow() {
  return new BrowserWindow({
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
}

/** Asks what to do with unsaved changes before the window closes. */
async function askToSave(win: BrowserWindow) {
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    message: 'Save changes before closing?',
    detail: 'Unsaved changes will be lost if you discard them.',
    buttons: ['Save', 'Discard', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  return (['save', 'discard', 'cancel'] as const)[result.response];
}

app.whenReady().then(() => {
  const win = createWindow();
  const askPage = pageBridge(win);
  const location = new ProjectLocation();
  const recovery = new RecoverySession(
    win,
    RecoveryStore.forProcess(path.join(app.getPath('userData'), 'recovery')),
    askPage,
  );

  installCloseGuard<StudioProject>(win, {
    snapshot: () => askPage('snapshot'),
    decide: () => askToSave(win),
    save: async (p) => (await saveProject(win, location, p)) !== null,
    unchanged: async (p) => JSON.stringify(p) === (await askPage('projectJson')),
    beforeClose: () => recovery.stop(),
    error: (error) => {
      void dialog.showMessageBox(win, {
        type: 'error',
        message: 'Could not close safely',
        detail: String(error),
      });
    },
  });
  installAppMenu(win);
  installProjectFiles(win, location);
  const stopEmulator = installBuilder(win, location);

  // Ctrl/Cmd+Q closes through the close guard on every platform, even while
  // the page has focus.
  win.webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.key.toLowerCase() === 'q' &&
      (input.control || input.meta)
    ) {
      event.preventDefault();
      win.close();
    }
  });
  // The page never opens other windows or navigates away from itself.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  void win.loadFile(path.resolve(here, '../../../apps/desktop/editor.html'));
  win.webContents.once('did-finish-load', () => void recovery.start());
  win.on('closed', stopEmulator);
});
app.on('window-all-closed', () => app.quit());
