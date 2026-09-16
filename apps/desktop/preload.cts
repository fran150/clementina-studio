import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('studio',{
 importBank:()=>ipcRenderer.invoke('bank:import'),
 open:()=>ipcRenderer.invoke('project:open'),
 opened:(path:string)=>ipcRenderer.invoke('project:opened',path),
 newProject:()=>ipcRenderer.invoke('project:new'),
 save:(project:unknown,saveAs:boolean)=>ipcRenderer.invoke('project:save',project,saveAs),
 export:(project:unknown)=>ipcRenderer.invoke('assets:export',project)
});
