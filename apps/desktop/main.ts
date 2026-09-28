import { RecoveryStore } from './recovery.js';
import { installCloseGuard } from './close-guard.js';
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startEmulatorProcess, type EmulatorProcess } from '@clementina/emulator-client/node';
import {
  defaultAssets,
  inspectBuilder,
  readBuilderFolder,
  readPortableStudioProject,
  writeBuilderProject,
  writePortableStudioProject,
  buildStudioProject,
  type ConfirmRemoval,
  type RemovedAsset,
} from './builder.js';
import type { ProjectAssetsBuild } from '@clementina/project';
import {
  encodeProject,
  decodeProject,
  importTilesetFile,
  type StudioProject,
} from '../../packages/assets/index.js';
const here = path.dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow;
let projectPath: string | undefined;
let portableRoot: string | undefined;
let builderRoot: string | undefined;
let pendingBuilderRoot: string | undefined;
let builderEmulator: EmulatorProcess | undefined;
let builderBusy = false;
const builderTools = { emulator: 'clementina-automation', renderer: 'clementina-render' };
let confirmRemoval: ConfirmRemoval = async () => false;
// Asks the page for something only it knows, such as the current project.
// The page answers on studio:response with the same id.
type PageRequests = {
  snapshot: [undefined, { dirty: boolean; project: StudioProject }];
  projectJson: [undefined, string];
  recover: [StudioProject, void];
  status: [string, void];
};
const pageReplies = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>();
let pageRequestId = 0;
ipcMain.on('studio:response', (_event, id: number, error: string | null, value: unknown) => {
  const reply = pageReplies.get(id);
  if (!reply) return;
  pageReplies.delete(id);
  if (error === null) reply.resolve(value);
  else reply.reject(new Error(error));
});
function askPage<K extends keyof PageRequests>(
  name: K,
  ...arg: PageRequests[K][0] extends undefined ? [] : [PageRequests[K][0]]
): Promise<PageRequests[K][1]> {
  const id = ++pageRequestId;
  return new Promise((resolve, reject) => {
    pageReplies.set(id, { resolve: resolve as (value: unknown) => void, reject });
    win.webContents.send('studio:request', id, name, arg[0]);
  });
}
function representFile(file: string) {
  if (process.platform === 'darwin' && win && !win.isDestroyed()) win.setRepresentedFilename(file);
}
async function saveProject(p: StudioProject, saveAs = false): Promise<string | null> {
  if (portableRoot && !saveAs) {
    const saved = await writePortableStudioProject(
      portableRoot,
      p,
      p.builder ?? defaultAssets(),
      path.basename(portableRoot),
      confirmRemoval,
    );
    return saved ? path.basename(portableRoot) : null;
  }
  const bytes = encodeProject(p);
  let target = projectPath;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: target ?? 'project.cstudio',
      filters: [{ name: 'Studio project', extensions: ['cstudio'] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await writeFile(target, bytes);
  projectPath = target;
  if (saveAs) {
    portableRoot = undefined;
    builderRoot = undefined;
  }
  representFile(target);
  return path.basename(target);
}
app.whenReady().then(() => {
  const recovery = new RecoveryStore(
    path.join(app.getPath('userData'), 'recovery'),
    String(process.pid) + '-' + Date.now(),
  );
  let recoveryTimer: ReturnType<typeof setInterval> | undefined;
  let recoveryWork: Promise<void> = Promise.resolve(),
    lastObserved = '',
    lastSaved = '',
    stableSince = 0,
    lastWrite = Date.now(),
    recoveryStopped = false;
  async function tickRecovery() {
    if (recoveryStopped || win.isDestroyed()) return;
    const state = await askPage('snapshot');
    if (!state.dirty) {
      await recovery.clear();
      lastSaved = '';
      lastObserved = '';
      return;
    }
    const serialized = JSON.stringify(state.project),
      now = Date.now();
    if (serialized !== lastObserved) {
      lastObserved = serialized;
      stableSince = now;
    }
    if (serialized !== lastSaved && (now - stableSince >= 2000 || now - lastWrite >= 10000)) {
      await recovery.save(state.project);
      lastSaved = serialized;
      lastWrite = now;
    }
  }

  win = new BrowserWindow({
    width: 1440,
    height: 960,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  installCloseGuard<StudioProject>(win, {
    snapshot: () => askPage('snapshot'),
    decide: async () => {
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
    },
    save: async (p) => (await saveProject(p)) !== null,
    unchanged: async (p) => JSON.stringify(p) === (await askPage('projectJson')),
    beforeClose: async () => {
      recoveryStopped = true;
      clearInterval(recoveryTimer);
      await recoveryWork;
      await recovery.clear();
    },
    error: (error) => {
      void dialog.showMessageBox(win, {
        type: 'error',
        message: 'Could not close safely',
        detail: String(error),
      });
    },
  });
  // Menu shortcuts reach the page as commands (see runCommand in editor.html).
  const command = (name: string) => () => win.webContents.send('studio:command', name);
  // The menu is rebuilt whenever the page's undo history changes, so Edit ▸
  // Undo and Redo name the step they would take (see history.js).
  type HistoryItem = { label: string; enabled: boolean };
  const menu = (history: { undo: HistoryItem; redo: HistoryItem }) =>
    Menu.buildFromTemplate([
      {
        label: 'Clementina Studio',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          {
            label: 'Quit Clementina Studio',
            accelerator: 'CommandOrControl+Q',
            click: () => win.close(),
          },
        ],
      },
      {
        label: 'File',
        submenu: [
          { label: 'New Project', accelerator: 'CommandOrControl+N', click: command('newProject') },
          { label: 'Open Project…', accelerator: 'CommandOrControl+O', click: command('open') },
          { type: 'separator' },
          { label: 'Save Project', accelerator: 'CommandOrControl+S', click: command('save') },
          {
            label: 'Save Project As…',
            accelerator: 'CommandOrControl+Shift+S',
            click: command('saveAs'),
          },
          { type: 'separator' },
          { label: 'Close Window', accelerator: 'CommandOrControl+W', click: () => win.close() },
        ],
      },
      // Undo and Redo are the project's own history (history.js); inside a text
      // field the page hands them back to it. Cut, Copy and Paste keep their
      // native roles, which the page answers for the canvas (studio-shell.js).
      // registerAccelerator:false leaves the keys to the page on Windows and
      // Linux, which handles them first everywhere.
      {
        label: 'Edit',
        submenu: [
          {
            ...history.undo,
            accelerator: 'CommandOrControl+Z',
            registerAccelerator: false,
            click: command('undo'),
          },
          {
            ...history.redo,
            accelerator: 'Shift+CommandOrControl+Z',
            registerAccelerator: false,
            click: command('redo'),
          },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { type: 'separator' },
          { role: 'selectAll' },
        ],
      },
      // Replaces the default View menu, whose page zoom scaled the whole interface
      // and whose Reload dropped the open project. These zoom the canvas.
      // Ctrl/Cmd+1–9 switch editors, the way they switch tabs in a browser, in
      // the tabs' order; Actual Size takes Photoshop's Ctrl/Cmd+Alt+0 instead.
      {
        label: 'View',
        submenu: [
          ...(
            [
              ['Palettes', 'palettes'],
              ['Tilesets', 'tiles'],
              ['Shapes', 'shapes'],
              ['Animations', 'animations'],
              ['Backgrounds', 'backgrounds'],
              ['Overlays', 'overlays'],
              ['Sounds', 'sounds'],
              ['Music', 'music'],
              ['Builder', 'builder'],
            ] as const
          ).map(([label, view], i) => ({
            label,
            accelerator: `CommandOrControl+${i + 1}`,
            click: command('view:' + view),
          })),
          { type: 'separator' },
          { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: command('zoomIn') },
          { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: command('zoomOut') },
          { label: 'Zoom to Fit', accelerator: 'CommandOrControl+0', click: command('zoomFit') },
          {
            label: 'Actual Size',
            accelerator: 'CommandOrControl+Alt+0',
            click: command('zoomActual'),
          },
          { type: 'separator' },
          { role: 'toggleDevTools' },
          { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
      {
        role: 'help',
        submenu: [
          {
            label: 'Keyboard Shortcuts',
            accelerator: 'CommandOrControl+/',
            registerAccelerator: false,
            click: command('shortcuts'),
          },
        ],
      },
    ]);
  Menu.setApplicationMenu(
    menu({ undo: { label: 'Undo', enabled: true }, redo: { label: 'Redo', enabled: true } }),
  );
  const historyItem = (item: unknown, fallback: string): HistoryItem => {
    const { label, enabled } = (item ?? {}) as Partial<HistoryItem>;
    return {
      label: typeof label === 'string' && label.length <= 120 ? label : fallback,
      enabled: enabled !== false,
    };
  };
  ipcMain.on('menu:history', (_event, history: { undo?: unknown; redo?: unknown }) => {
    if (!win.isDestroyed())
      Menu.setApplicationMenu(
        menu({
          undo: historyItem(history?.undo, 'Undo'),
          redo: historyItem(history?.redo, 'Redo'),
        }),
      );
  });
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
  void win.loadFile(path.resolve(here, '../../../apps/desktop/editor.html'));
  win.webContents.once('did-finish-load', () => {
    void (async () => {
      try {
        for (const name of await recovery.candidates()) {
          const pid = Number(name.split('-')[0]);
          try {
            process.kill(pid, 0);
            continue;
          } catch {} // Leave running sessions' snapshots alone.
          const result = await dialog.showMessageBox(win, {
            type: 'question',
            message: 'Recover unsaved work?',
            detail:
              'A whole-project recovery snapshot was found. Recover opens it as an unsaved project. Your saved project file is unchanged.',
            buttons: ['Recover', 'Discard snapshot', 'Later'],
            defaultId: 0,
            cancelId: 2,
          });
          if (result.response === 2) continue;
          if (result.response === 1) {
            await recovery.remove(name);
            continue;
          }
          const project = await recovery.read(name);
          await askPage('recover', project);
          await recovery.save(project);
          await recovery.remove(name);
          break;
        }
      } catch (error) {
        await dialog.showMessageBox(win, {
          type: 'error',
          message: 'Could not restore recovery snapshot',
          detail: String(error),
        });
      }
      recoveryTimer = setInterval(() => {
        recoveryWork = recoveryWork.then(tickRecovery).catch((error) => {
          if (!win.isDestroyed())
            void askPage('status', 'Recovery snapshot failed: ' + String(error));
        });
      }, 1000);
    })();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  ipcMain.handle('tileset:import', async () => {
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'CHR bank', extensions: ['prg', 'bin', 'chr'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const selected = result.filePaths[0];
    const bytes = await readFile(selected);
    return {
      ...importTilesetFile(bytes, path.extname(selected)),
      name: path.basename(selected, path.extname(selected)),
    };
  });
  ipcMain.handle('image:import', async () => {
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Pixel artwork', extensions: ['png', 'bmp', 'gif'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const selected = result.filePaths[0],
      bytes = await readFile(selected);
    if (bytes.length > 20971520) throw Error('Choose an image smaller than 20 MB.');
    const ext = path.extname(selected).toLowerCase(),
      mime = (
        { '.png': 'image/png', '.bmp': 'image/bmp', '.gif': 'image/gif' } as Record<string, string>
      )[ext];
    if (!mime) throw Error('Choose a PNG, BMP or GIF image.');
    return {
      name: path.basename(selected),
      dataUrl: 'data:' + mime + ';base64,' + bytes.toString('base64'),
      format: ext.slice(1),
    };
  });
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog(win, {
      filters: [{ name: 'Studio or portable project', extensions: ['cstudio', 'yaml'] }],
      properties: ['openFile'],
    });
    if (result.canceled) return null;
    const selected = result.filePaths[0];
    if (path.basename(selected) === 'clementina.yaml') {
      const opened = await readPortableStudioProject(path.dirname(selected));
      return {
        path: selected,
        kind: 'portable',
        name: opened.portable.manifest.name,
        root: path.dirname(selected),
        project: opened.project,
      };
    }
    if (path.extname(selected) !== '.cstudio')
      throw Error('Choose a .cstudio file or clementina.yaml.');
    return {
      path: selected,
      kind: 'studio',
      name: path.basename(selected),
      project: decodeProject(await readFile(selected, 'utf8')),
    };
  });
  ipcMain.handle(
    'project:opened',
    (_event, selected: string, kind: 'studio' | 'portable' = 'studio') => {
      portableRoot = kind === 'portable' ? path.dirname(selected) : undefined;
      builderRoot = portableRoot;
      pendingBuilderRoot = undefined;
      projectPath = kind === 'studio' ? selected : undefined;
      representFile(selected);
    },
  );
  // macOS shows unsaved edits as a dot in the close button, and the file as
  // the title's proxy icon.
  ipcMain.on('project:edited', (_event, edited: boolean) => {
    if (process.platform === 'darwin' && !win.isDestroyed()) win.setDocumentEdited(!!edited);
  });
  ipcMain.handle('project:new', () => {
    projectPath = undefined;
    portableRoot = undefined;
    builderRoot = undefined;
    representFile('');
  });
  ipcMain.handle('project:save', (_event, p: StudioProject, saveAs: boolean) =>
    saveProject(p, saveAs),
  );
  ipcMain.handle(
    'builder:plan',
    (_event, p: StudioProject, settings: ProjectAssetsBuild, name: string) =>
      inspectBuilder(p, settings, name),
  );
  ipcMain.handle('builder:folder', async () => {
    const chosen = await dialog.showOpenDialog(win, {
      title: 'Portable SDK project — choose an assembly project or an empty folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (chosen.canceled) return null;
    const root = chosen.filePaths[0],
      info = await readBuilderFolder(root);
    pendingBuilderRoot = root;
    return { root, ...info };
  });
  ipcMain.handle('builder:folder-selected', (_event, root: string) => {
    if (root !== pendingBuilderRoot) throw Error('Choose a project folder first.');
    builderRoot = root;
    pendingBuilderRoot = undefined;
  });
  ipcMain.handle('builder:tool', async (_event, kind: 'emulator' | 'renderer') => {
    if (kind !== 'emulator' && kind !== 'renderer') throw Error('Unknown Builder tool');
    const chosen = await dialog.showOpenDialog(win, {
      title: kind === 'emulator' ? 'Choose clementina-automation' : 'Choose clementina-render',
      properties: ['openFile'],
    });
    if (chosen.canceled) return null;
    return (builderTools[kind] = chosen.filePaths[0]);
  });
  // Studio writes only the assets it holds. A save that would take others out
  // of the folder's clementina.yaml asks first, and Cancel is the default.
  confirmRemoval = async (removed: RemovedAsset[]) => {
    const kinds: Record<string, string> = {
      palettes: 'palette',
      paletteConfigs: 'palette config',
      tilesets: 'tileset',
      backgrounds: 'background',
      overlays: 'overlay',
      shapes: 'shape',
      animations: 'animation',
      instruments: 'instrument',
      sounds: 'sound',
      songs: 'song',
    };
    const names =
      removed
        .slice(0, 8)
        .map((a) => `${a.name} (${kinds[a.kind] ?? a.kind})`)
        .join(', ') + (removed.length > 8 ? ` and ${removed.length - 8} more` : '');
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', 'Remove and Save'],
      defaultId: 0,
      cancelId: 0,
      message: `Remove ${removed.length} ${removed.length === 1 ? 'asset' : 'assets'} from clementina.yaml?`,
      detail: `The project folder lists assets this Studio project doesn't have: ${names}. Saving takes them out of clementina.yaml; their files stay in the folder.`,
    });
    return response === 1;
  };
  const declined = {
    ok: false,
    diagnostics: [],
    message: 'Nothing saved. The project folder keeps its assets.',
  };
  ipcMain.handle(
    'builder:action',
    async (
      _event,
      action: string,
      p: StudioProject,
      settings: ProjectAssetsBuild,
      name: string,
    ) => {
      if (!['save', 'build', 'run', 'stop'].includes(action)) throw Error('Unknown Builder action');
      if (builderBusy) throw Error('A Builder operation is already running.');
      builderBusy = true;
      try {
        if (action === 'stop') {
          await builderEmulator?.close();
          builderEmulator = undefined;
          return { ok: true, diagnostics: [] };
        }
        if (!builderRoot) throw Error('Choose a portable project folder first.');
        if (action === 'save')
          return (await writeBuilderProject(builderRoot, p, settings, name, confirmRemoval))
            ? { ok: true, diagnostics: [], message: 'Saved clementina.yaml and portable assets.' }
            : declined;
        const result = await buildStudioProject(builderRoot, p, settings, name, confirmRemoval);
        if (!result) return declined;
        if (!result.ok) return result;
        if (action === 'run') {
          await builderEmulator?.close();
          builderEmulator = undefined;
          const session = await startEmulatorProcess({
            executable: builderTools.emulator,
            sdRoot: path.resolve(builderRoot, result.value.sdRoot),
          });
          try {
            await session.client.launchLoadPlan(result.value.loadPlan);
            builderEmulator = session;
          } catch (error) {
            await session.close();
            throw error;
          }
        }
        return {
          ok: true,
          diagnostics: result.diagnostics,
          sdRoot: path.resolve(builderRoot, result.value.sdRoot),
          report: result.value.assets?.report,
          moduleSizes: result.value.assets?.report.runtimeCode,
          running: !!builderEmulator,
        };
      } finally {
        builderBusy = false;
      }
    },
  );
  ipcMain.handle('builder:frame', async () => {
    if (!builderEmulator) return null;
    const video = await builderEmulator.client.video();
    return new Promise<string>((resolve, reject) => {
      const child = spawn(builderTools.renderer, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [],
        errors: Buffer[] = [];
      child.stdout.on('data', (b) => chunks.push(b));
      child.stderr.on('data', (b) => errors.push(b));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0
          ? resolve('data:image/png;base64,' + Buffer.concat(chunks).toString('base64'))
          : reject(Error(Buffer.concat(errors).toString() || 'Renderer failed')),
      );
      child.stdin.on('error', reject);
      child.stdin.end(JSON.stringify(video));
    });
  });
  win.on('closed', () => {
    void builderEmulator?.close();
    builderEmulator = undefined;
  });
});
app.on('window-all-closed', () => app.quit());
