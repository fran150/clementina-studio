// The Builder editor's requests: choosing the portable project folder and the
// emulator and renderer tools, then saving, building and running the project
// there, and grabbing the running emulator's screen.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { dialog, ipcMain, type BrowserWindow } from 'electron';
import { startEmulatorProcess, type EmulatorProcess } from '@clementina/emulator-client/node';
import type { ProjectAssetsBuild } from '@clementina/project';
import type { StudioProject } from '../../packages/assets/index.js';
import {
  buildStudioProject,
  inspectBuilder,
  readBuilderFolder,
  writeBuilderProject,
} from './builder.js';
import { confirmRemoval, type ProjectLocation } from './project-files.js';

type BuilderAction = 'save' | 'build' | 'run' | 'stop';
const ACTIONS: string[] = ['save', 'build', 'run', 'stop'] satisfies BuilderAction[];

/** What a save or build answers when the removal warning was cancelled. */
const DECLINED = {
  ok: false,
  diagnostics: [],
  message: 'Nothing saved. The project folder keeps its assets.',
};

/**
 * Answers the Builder's requests for `win`, writing to the folder `location`
 * holds. Returns a function that stops the emulator, for when the window closes.
 */
export function installBuilder(win: BrowserWindow, location: ProjectLocation): () => void {
  // The tools run by name from PATH until one is chosen in the Builder.
  const tools = { emulator: 'clementina-automation', renderer: 'clementina-render' };
  let emulator: EmulatorProcess | undefined;
  let busy = false;
  const confirm = confirmRemoval(win);

  async function stopEmulator() {
    await emulator?.close();
    emulator = undefined;
  }

  /** Builds the project into `root`, then (for Run) starts it in a fresh emulator. */
  async function build(
    root: string,
    action: BuilderAction,
    p: StudioProject,
    settings: ProjectAssetsBuild,
    name: string,
  ) {
    const result = await buildStudioProject(root, p, settings, name, confirm);
    if (!result) return DECLINED;
    if (!result.ok) return result;
    const sdRoot = path.resolve(root, result.value.sdRoot);
    if (action === 'run') {
      await stopEmulator();
      const session = await startEmulatorProcess({ executable: tools.emulator, sdRoot });
      try {
        await session.client.launchLoadPlan(result.value.loadPlan);
        emulator = session;
      } catch (error) {
        await session.close();
        throw error;
      }
    }
    return {
      ok: true,
      diagnostics: result.diagnostics,
      sdRoot,
      report: result.value.assets?.report,
      moduleSizes: result.value.assets?.report.runtimeCode,
      running: !!emulator,
    };
  }

  ipcMain.handle(
    'builder:plan',
    (_event, p: StudioProject, settings: ProjectAssetsBuild, name: string) =>
      inspectBuilder(p, settings, name),
  );
  // The folder picked here is used only once the page confirms it (builder:folder-selected).
  ipcMain.handle('builder:folder', async () => {
    const chosen = await dialog.showOpenDialog(win, {
      title: 'Portable SDK project — choose an assembly project or an empty folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (chosen.canceled) return null;
    const root = chosen.filePaths[0],
      info = await readBuilderFolder(root);
    location.pendingBuilderRoot = root;
    return { root, ...info };
  });
  ipcMain.handle('builder:folder-selected', (_event, root: string) => {
    if (root !== location.pendingBuilderRoot) throw Error('Choose a project folder first.');
    location.builderRoot = root;
    location.pendingBuilderRoot = undefined;
  });
  ipcMain.handle('builder:tool', async (_event, kind: 'emulator' | 'renderer') => {
    if (kind !== 'emulator' && kind !== 'renderer') throw Error('Unknown Builder tool');
    const chosen = await dialog.showOpenDialog(win, {
      title: kind === 'emulator' ? 'Choose clementina-automation' : 'Choose clementina-render',
      properties: ['openFile'],
    });
    if (chosen.canceled) return null;
    return (tools[kind] = chosen.filePaths[0]);
  });
  // One action at a time: Save, Build, Run or Stop.
  ipcMain.handle(
    'builder:action',
    async (
      _event,
      action: BuilderAction,
      p: StudioProject,
      settings: ProjectAssetsBuild,
      name: string,
    ) => {
      if (!ACTIONS.includes(action)) throw Error('Unknown Builder action');
      if (busy) throw Error('A Builder operation is already running.');
      busy = true;
      try {
        if (action === 'stop') {
          await stopEmulator();
          return { ok: true, diagnostics: [] };
        }
        const root = location.builderRoot;
        if (!root) throw Error('Choose a portable project folder first.');
        if (action === 'save')
          return (await writeBuilderProject(root, p, settings, name, confirm))
            ? { ok: true, diagnostics: [], message: 'Saved clementina.yaml and portable assets.' }
            : DECLINED;
        return await build(root, action, p, settings, name);
      } finally {
        busy = false;
      }
    },
  );
  // The running emulator's screen as a PNG data URL, drawn by the renderer tool.
  ipcMain.handle('builder:frame', async () => {
    if (!emulator) return null;
    const video = await emulator.client.video();
    return new Promise<string>((resolve, reject) => {
      const child = spawn(tools.renderer, [], { stdio: ['pipe', 'pipe', 'pipe'] });
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
  return () => void stopEmulator();
}
