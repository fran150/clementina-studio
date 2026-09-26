import { RecoveryStore } from './recovery.js';
import { installCloseGuard } from './close-guard.js';
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeProject, decodeProject, importTilesetFile, type StudioProject } from '../../packages/assets/index.js';
const here=path.dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow;
let projectPath: string | undefined;
function representFile(file:string){if(process.platform==='darwin'&&win&&!win.isDestroyed())win.setRepresentedFilename(file);}
async function saveProject(p:StudioProject,saveAs=false):Promise<string|null>{
 const bytes=encodeProject(p);let target=projectPath;
 if(!target||saveAs){const r=await dialog.showSaveDialog(win,{defaultPath:target??'project.cstudio',filters:[{name:'Studio project',extensions:['cstudio']}]});if(r.canceled||!r.filePath)return null;target=r.filePath;}
 await writeFile(target,bytes);projectPath=target;representFile(target);return path.basename(target);
}
app.whenReady().then(()=>{
 const recovery=new RecoveryStore(path.join(app.getPath('userData'),'recovery'),String(process.pid)+'-'+Date.now());
 let recoveryTimer:ReturnType<typeof setInterval>|undefined;
 let recoveryWork:Promise<void>=Promise.resolve(),lastObserved='',lastSaved='',stableSince=0,lastWrite=Date.now(),recoveryStopped=false;
 async function tickRecovery(){
  if(recoveryStopped||win.isDestroyed())return;
  const state=await win.webContents.executeJavaScript('({dirty,project:studioProject()})');
  if(!state.dirty){await recovery.clear();lastSaved='';lastObserved='';return;}
  const serialized=JSON.stringify(state.project),now=Date.now();
  if(serialized!==lastObserved){lastObserved=serialized;stableSince=now;}
  if(serialized!==lastSaved&&(now-stableSince>=2000||now-lastWrite>=10000)){await recovery.save(state.project);lastSaved=serialized;lastWrite=now;}
 }

 win=new BrowserWindow({width:1440,height:960,webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 installCloseGuard<StudioProject>(win,{
  snapshot:()=>win.webContents.executeJavaScript('({dirty,project:studioProject()})'),
  decide:async()=>{const result=await dialog.showMessageBox(win,{type:'question',message:'Save changes before closing?',detail:'Unsaved changes will be lost if you discard them.',buttons:['Save','Discard','Cancel'],defaultId:0,cancelId:2,noLink:true});return (['save','discard','cancel'] as const)[result.response];},
  save:async p=>(await saveProject(p))!==null,
  unchanged:async p=>JSON.stringify(p)===await win.webContents.executeJavaScript('JSON.stringify(studioProject())'),
  beforeClose:async()=>{recoveryStopped=true;clearInterval(recoveryTimer);await recoveryWork;await recovery.clear();},
  error:error=>{void dialog.showMessageBox(win,{type:'error',message:'Could not close safely',detail:String(error)});}
 });
 // Menu shortcuts reach the page as commands (see runCommand in editor.html).
 const command=(name:string)=>()=>win.webContents.send('studio:command',name);
 // The menu is rebuilt whenever the page's undo history changes, so Edit ▸
 // Undo and Redo name the step they would take (see history.js).
 type HistoryItem={label:string,enabled:boolean};
 const menu=(history:{undo:HistoryItem,redo:HistoryItem})=>Menu.buildFromTemplate([
  {label:'Clementina Studio',submenu:[{role:'about'},{type:'separator'},{label:'Quit Clementina Studio',accelerator:'CommandOrControl+Q',click:()=>win.close()}]},
  {label:'File',submenu:[
   {label:'New Project',accelerator:'CommandOrControl+N',click:command('newProject')},
   {label:'Open Project…',accelerator:'CommandOrControl+O',click:command('open')},
   {type:'separator'},
   {label:'Save Project',accelerator:'CommandOrControl+S',click:command('save')},
   {label:'Save Project As…',accelerator:'CommandOrControl+Shift+S',click:command('saveAs')},
   {type:'separator'},
   {label:'Close Window',accelerator:'CommandOrControl+W',click:()=>win.close()}
  ]},
  // Undo and Redo are the project's own history (history.js); inside a text
 // field the page hands them back to it. Cut, Copy and Paste keep their
 // native roles, which the page answers for the canvas (studio-shell.js).
 // registerAccelerator:false leaves the keys to the page on Windows and
 // Linux, which handles them first everywhere.
 {label:'Edit',submenu:[
  {...history.undo,accelerator:'CommandOrControl+Z',registerAccelerator:false,click:command('undo')},
  {...history.redo,accelerator:'Shift+CommandOrControl+Z',registerAccelerator:false,click:command('redo')},
  {type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{type:'separator'},{role:'selectAll'}
 ]},
  // Replaces the default View menu, whose page zoom scaled the whole interface
  // and whose Reload dropped the open project. These zoom the canvas.
  // Ctrl/Cmd+1–8 switch editors, the way they switch tabs in a browser, in
  // the tabs' order; Actual Size takes Photoshop's Ctrl/Cmd+Alt+0 instead.
  {label:'View',submenu:[
   ...([['Palettes','palettes'],['Tilesets','tiles'],['Shapes','shapes'],['Animations','animations'],['Backgrounds','backgrounds'],['Overlays','overlays'],['Sounds','sounds'],['Music','music']] as const)
    .map(([label,view],i)=>({label,accelerator:`CommandOrControl+${i+1}`,click:command('view:'+view)})),
   {type:'separator'},
   {label:'Zoom In',accelerator:'CommandOrControl+=',click:command('zoomIn')},
   {label:'Zoom Out',accelerator:'CommandOrControl+-',click:command('zoomOut')},
   {label:'Zoom to Fit',accelerator:'CommandOrControl+0',click:command('zoomFit')},
   {label:'Actual Size',accelerator:'CommandOrControl+Alt+0',click:command('zoomActual')},
   {type:'separator'},{role:'toggleDevTools'},{role:'togglefullscreen'}
  ]},
  {role:'windowMenu'},
 {role:'help',submenu:[{label:'Keyboard Shortcuts',accelerator:'CommandOrControl+/',registerAccelerator:false,click:command('shortcuts')}]}
 ]);
 Menu.setApplicationMenu(menu({undo:{label:'Undo',enabled:true},redo:{label:'Redo',enabled:true}}));
 const historyItem=(item:unknown,fallback:string):HistoryItem=>{
  const {label,enabled}=(item??{}) as Partial<HistoryItem>;
  return {label:typeof label==='string'&&label.length<=120?label:fallback,enabled:enabled!==false};
 };
 ipcMain.on('menu:history',(_event,history:{undo?:unknown,redo?:unknown})=>{
  if(!win.isDestroyed())Menu.setApplicationMenu(menu({undo:historyItem(history?.undo,'Undo'),redo:historyItem(history?.redo,'Redo')}));
 });
 win.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&input.key.toLowerCase()==='q'&&(input.control||input.meta)){event.preventDefault();win.close();}});
 void win.loadFile(path.resolve(here,'../../../apps/desktop/editor.html'));
 win.webContents.once('did-finish-load',()=>{void (async()=>{
  try{
   for(const name of await recovery.candidates()){
    const pid=Number(name.split('-')[0]);try{process.kill(pid,0);continue;}catch{} // Leave running sessions' snapshots alone.
    const result=await dialog.showMessageBox(win,{type:'question',message:'Recover unsaved work?',detail:'A whole-project recovery snapshot was found. Recover opens it as an unsaved project. Your saved project file is unchanged.',buttons:['Recover','Discard snapshot','Later'],defaultId:0,cancelId:2});
    if(result.response===2)continue;
    if(result.response===1){await recovery.remove(name);continue;}
    const project=await recovery.read(name);
    await win.webContents.executeJavaScript('restoreStudioProject('+JSON.stringify(project)+');markDirty();');
    await recovery.save(project);await recovery.remove(name);break;
   }
  }catch(error){await dialog.showMessageBox(win,{type:'error',message:'Could not restore recovery snapshot',detail:String(error)});}
  recoveryTimer=setInterval(()=>{recoveryWork=recoveryWork.then(tickRecovery).catch(error=>{if(!win.isDestroyed())void win.webContents.executeJavaScript('setStatus('+JSON.stringify('Recovery snapshot failed: '+String(error))+')');});},1000);
 })();});
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 win.webContents.on('will-navigate',event=>event.preventDefault());
 ipcMain.handle('tileset:import',async()=>{
  const result=await dialog.showOpenDialog(win,{filters:[{name:'CHR bank',extensions:['prg','bin','chr']}],properties:['openFile']});
  if(result.canceled)return null;
  const selected=result.filePaths[0];const bytes=await readFile(selected);
  return {...importTilesetFile(bytes,path.extname(selected)),name:path.basename(selected,path.extname(selected))};
 });
 ipcMain.handle('image:import',async()=>{
  const result=await dialog.showOpenDialog(win,{filters:[{name:'Pixel artwork',extensions:['png','bmp','gif']}],properties:['openFile']});if(result.canceled)return null;
  const selected=result.filePaths[0],bytes=await readFile(selected);if(bytes.length>20971520)throw Error('Choose an image smaller than 20 MB.');
  const ext=path.extname(selected).toLowerCase(),mime=({'.png':'image/png','.bmp':'image/bmp','.gif':'image/gif'} as Record<string,string>)[ext];if(!mime)throw Error('Choose a PNG, BMP or GIF image.');
  return {name:path.basename(selected),dataUrl:'data:'+mime+';base64,'+bytes.toString('base64'),format:ext.slice(1)};
 });
 ipcMain.handle('project:open',async()=>{
  const result=await dialog.showOpenDialog(win,{filters:[{name:'Studio project',extensions:['cstudio']}],properties:['openFile']});
  if(result.canceled)return null;
  const selected=result.filePaths[0];
  return {path:selected,name:path.basename(selected),project:decodeProject(await readFile(selected,'utf8'))};
 });
 ipcMain.handle('project:opened',(_event,selected:string)=>{projectPath=selected;representFile(selected);});
 // macOS shows unsaved edits as a dot in the close button, and the file as
 // the title's proxy icon.
 ipcMain.on('project:edited',(_event,edited:boolean)=>{if(process.platform==='darwin'&&!win.isDestroyed())win.setDocumentEdited(!!edited);});
 ipcMain.handle('project:new',()=>{projectPath=undefined;representFile('');});
 ipcMain.handle('project:save',(_event,p:StudioProject,saveAs:boolean)=>saveProject(p,saveAs));
});
app.on('window-all-closed',()=>app.quit());
