// The application menu. Its items reach the page as commands (see runCommand
// in studio-core.js). The menu is rebuilt whenever the page's undo history
// changes, so Edit ▸ Undo and Redo name the step they would take (see
// history.js).
import { ipcMain, Menu, type BrowserWindow } from 'electron';

type HistoryItem = { label: string; enabled: boolean };

/** The longest undo step name the Edit menu shows; longer ones read "Undo". */
const MAX_HISTORY_LABEL = 120;

// The editors, in the order of their tabs in views/editor.html; Ctrl/Cmd+1–9
// switch to them, the way they switch tabs in a browser.
const VIEWS = [
  ['Palettes', 'palettes'],
  ['Tilesets', 'tiles'],
  ['Shapes', 'shapes'],
  ['Animations', 'animations'],
  ['Backgrounds', 'backgrounds'],
  ['Overlays', 'overlays'],
  ['Sounds', 'sounds'],
  ['Music', 'music'],
  ['Builder', 'builder'],
] as const;

/** Sets `win`'s application menu, and rebuilds it as the page's history changes. */
export function installAppMenu(win: BrowserWindow): void {
  const command = (name: string) => () => win.webContents.send('studio:command', name);
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
      // Actual Size takes Photoshop's Ctrl/Cmd+Alt+0.
      {
        label: 'View',
        submenu: [
          ...VIEWS.map(([label, view], i) => ({
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
  // What the page sends is checked before it becomes a menu item.
  const historyItem = (item: unknown, fallback: string): HistoryItem => {
    const { label, enabled } = (item ?? {}) as Partial<HistoryItem>;
    return {
      label: typeof label === 'string' && label.length <= MAX_HISTORY_LABEL ? label : fallback,
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
}
