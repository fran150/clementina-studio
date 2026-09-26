import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('studio',{
 importImage:()=>ipcRenderer.invoke('image:import'),
 importTileset:()=>ipcRenderer.invoke('tileset:import'),
 open:()=>ipcRenderer.invoke('project:open'),
 opened:(path:string)=>ipcRenderer.invoke('project:opened',path),
 newProject:()=>ipcRenderer.invoke('project:new'),
 save:(project:unknown,saveAs:boolean)=>ipcRenderer.invoke('project:save',project,saveAs),
 // Application menu commands: New, Open, Save, Save As and the View menu's zoom.
 // Whether the project has unsaved edits, for the window's edited indicator.
 edited:(edited:boolean)=>ipcRenderer.send('project:edited',edited),
 // What Edit ▸ Undo and Redo say, and whether they can be chosen.
 historyMenu:(history:unknown)=>ipcRenderer.send('menu:history',history),
 onCommand:(listener:(command:string)=>void)=>{ipcRenderer.on('studio:command',(_event,command:string)=>listener(command));}
});
