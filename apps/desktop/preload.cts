import { contextBridge, ipcRenderer } from 'electron';
const studio = {
  builderPlan: (project: unknown, settings: unknown, name: string) =>
    ipcRenderer.invoke('builder:plan', project, settings, name),
  builderFolder: () => ipcRenderer.invoke('builder:folder'),
  builderFolderSelected: (root: string) => ipcRenderer.invoke('builder:folder-selected', root),
  builderTool: (kind: string) => ipcRenderer.invoke('builder:tool', kind),
  builderAction: (action: string, project: unknown, settings: unknown, name: string) =>
    ipcRenderer.invoke('builder:action', action, project, settings, name),
  builderFrame: () => ipcRenderer.invoke('builder:frame'),
  importImage: () => ipcRenderer.invoke('image:import'),
  importTileset: () => ipcRenderer.invoke('tileset:import'),
  open: () => ipcRenderer.invoke('project:open'),
  opened: (path: string, kind: 'studio' | 'portable' = 'studio') =>
    ipcRenderer.invoke('project:opened', path, kind),
  newProject: () => ipcRenderer.invoke('project:new'),
  save: (project: unknown, saveAs: boolean) => ipcRenderer.invoke('project:save', project, saveAs),
  // Whether the project has unsaved edits, for the window's edited indicator.
  edited: (edited: boolean) => ipcRenderer.send('project:edited', edited),
  // What Edit ▸ Undo and Redo say, and whether they can be chosen.
  historyMenu: (history: unknown) => ipcRenderer.send('menu:history', history),
  // Application menu commands: New, Open, Save, Save As and the View menu's zoom.
  onCommand: (listener: (command: string) => void) => {
    ipcRenderer.on('studio:command', (_event, command: string) => listener(command));
  },
  // Answers the main process's questions about the page, such as the current project.
  onRequest: (handler: (name: string, arg: unknown) => unknown) => {
    ipcRenderer.on('studio:request', async (_event, id: number, name: string, arg: unknown) => {
      try {
        ipcRenderer.send('studio:response', id, null, await handler(name, arg));
      } catch (error) {
        ipcRenderer.send('studio:response', id, String(error));
      }
    });
  },
};
contextBridge.exposeInMainWorld('studio', studio);

// The renderer's window.studio, for type-checking the editor scripts.
export type StudioApi = typeof studio;
