// The project's files: where the open project lives, saving it, and the
// File menu's dialogs for opening a project and importing artwork.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dialog, ipcMain, type BrowserWindow, type FileFilter } from 'electron';
import {
  defaultAssets,
  readPortableStudioProject,
  writePortableStudioProject,
  type ConfirmRemoval,
  type RemovedAsset,
} from './builder.js';
import {
  encodeProject,
  decodeProject,
  importTilesetFile,
  type StudioProject,
} from '../../packages/assets/index.js';

/** The largest image Import accepts: 20 MB. */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** How many assets a removal warning names before it says "and N more". */
const LISTED_REMOVALS = 8;

/**
 * Where the open project lives: a .cstudio `file`, or a portable SDK project's
 * folder (`portableRoot`); and the folder the Builder writes to, with the one
 * picked in its dialog until the page confirms it.
 */
export class ProjectLocation {
  file: string | undefined;
  portableRoot: string | undefined;
  builderRoot: string | undefined;
  pendingBuilderRoot: string | undefined;

  /** A project was opened: a .cstudio file, or a portable project's clementina.yaml. */
  opened(selected: string, kind: 'studio' | 'portable') {
    this.portableRoot = kind === 'portable' ? path.dirname(selected) : undefined;
    this.builderRoot = this.portableRoot;
    this.pendingBuilderRoot = undefined;
    this.file = kind === 'studio' ? selected : undefined;
  }
  /** The project was saved as a .cstudio file; Save As leaves any folder behind. */
  savedTo(file: string, saveAs: boolean) {
    this.file = file;
    if (saveAs) {
      this.portableRoot = undefined;
      this.builderRoot = undefined;
    }
  }
  /** File > New: the project lives nowhere yet. */
  cleared() {
    this.file = undefined;
    this.portableRoot = undefined;
    this.builderRoot = undefined;
  }
}

/** Shows `file` as the window's proxy icon in the macOS title bar. */
function representFile(win: BrowserWindow, file: string) {
  if (process.platform === 'darwin' && win && !win.isDestroyed()) win.setRepresentedFilename(file);
}

/** Asks for one file matching `filters`; null when the dialog is cancelled. */
async function pickFile(win: BrowserWindow, filters: FileFilter[]) {
  const result = await dialog.showOpenDialog(win, { filters, properties: ['openFile'] });
  return result.canceled ? null : result.filePaths[0];
}

// What a removal warning calls each kind of asset.
const KIND_NAMES: Record<string, string> = {
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

/**
 * Studio writes only the assets it holds. A save that would take others out
 * of the folder's clementina.yaml asks first, and Cancel is the default.
 */
export function confirmRemoval(win: BrowserWindow): ConfirmRemoval {
  return async (removed: RemovedAsset[]) => {
    const names =
      removed
        .slice(0, LISTED_REMOVALS)
        .map((a) => `${a.name} (${KIND_NAMES[a.kind] ?? a.kind})`)
        .join(', ') +
      (removed.length > LISTED_REMOVALS ? ` and ${removed.length - LISTED_REMOVALS} more` : '');
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
}

/**
 * Saves the project where it lives: into its portable folder, or its .cstudio
 * file, asking for one when there is none yet or for Save As. Returns the
 * name saved under, or null when nothing was saved.
 */
export async function saveProject(
  win: BrowserWindow,
  location: ProjectLocation,
  p: StudioProject,
  saveAs = false,
): Promise<string | null> {
  if (location.portableRoot && !saveAs) {
    const saved = await writePortableStudioProject(
      location.portableRoot,
      p,
      p.builder ?? defaultAssets(),
      path.basename(location.portableRoot),
      confirmRemoval(win),
    );
    return saved ? path.basename(location.portableRoot) : null;
  }
  const bytes = encodeProject(p);
  let target = location.file;
  if (!target || saveAs) {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: target ?? 'project.cstudio',
      filters: [{ name: 'Studio project', extensions: ['cstudio'] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath;
  }
  await writeFile(target, bytes);
  location.savedTo(target, saveAs);
  representFile(win, target);
  return path.basename(target);
}

/** Answers the page's project and import requests for `win`. */
export function installProjectFiles(win: BrowserWindow, location: ProjectLocation): void {
  ipcMain.handle('tileset:import', async () => {
    const selected = await pickFile(win, [{ name: 'CHR bank', extensions: ['prg', 'bin', 'chr'] }]);
    if (!selected) return null;
    const bytes = await readFile(selected);
    return {
      ...importTilesetFile(bytes, path.extname(selected)),
      name: path.basename(selected, path.extname(selected)),
    };
  });
  ipcMain.handle('image:import', async () => {
    const selected = await pickFile(win, [
      { name: 'Pixel artwork', extensions: ['png', 'bmp', 'gif'] },
    ]);
    if (!selected) return null;
    const bytes = await readFile(selected);
    if (bytes.length > MAX_IMAGE_BYTES) throw Error('Choose an image smaller than 20 MB.');
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
    const selected = await pickFile(win, [
      { name: 'Studio or portable project', extensions: ['cstudio', 'yaml'] },
    ]);
    if (!selected) return null;
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
      location.opened(selected, kind);
      representFile(win, selected);
    },
  );
  // macOS shows unsaved edits as a dot in the close button.
  ipcMain.on('project:edited', (_event, edited: boolean) => {
    if (process.platform === 'darwin' && !win.isDestroyed()) win.setDocumentEdited(!!edited);
  });
  ipcMain.handle('project:new', () => {
    location.cleared();
    representFile(win, '');
  });
  ipcMain.handle('project:save', (_event, p: StudioProject, saveAs: boolean) =>
    saveProject(win, location, p, saveAs),
  );
}
