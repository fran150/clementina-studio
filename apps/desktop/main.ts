import { RecoveryStore } from './recovery.js';
import { installCloseGuard } from './close-guard.js';
import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeProject, decodeProject, importBankPrg, runtimePackage, type TileProject } from '../../packages/assets/index.js';
const here=path.dirname(fileURLToPath(import.meta.url));
let win: BrowserWindow;
let projectPath: string | undefined;
async function saveProject(p:TileProject,saveAs=false):Promise<string|null>{
 const bytes=encodeProject(p);let target=projectPath;
 if(!target||saveAs){const r=await dialog.showSaveDialog(win,{defaultPath:target??'project.cstudio',filters:[{name:'Studio project',extensions:['cstudio']}]});if(r.canceled||!r.filePath)return null;target=r.filePath;}
 await writeFile(target,bytes);projectPath=target;return path.basename(target);
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
 installCloseGuard<TileProject>(win,{
  snapshot:()=>win.webContents.executeJavaScript('({dirty,project:studioProject()})'),
  decide:async()=>{const result=await dialog.showMessageBox(win,{type:'question',message:'Save changes before closing?',detail:'Unsaved changes will be lost if you discard them.',buttons:['Save','Discard','Cancel'],defaultId:0,cancelId:2,noLink:true});return (['save','discard','cancel'] as const)[result.response];},
  save:async p=>(await saveProject(p))!==null,
  unchanged:async p=>JSON.stringify(p)===await win.webContents.executeJavaScript('JSON.stringify(studioProject())'),
  beforeClose:async()=>{recoveryStopped=true;clearInterval(recoveryTimer);await recoveryWork;await recovery.clear();},
  error:error=>{void dialog.showMessageBox(win,{type:'error',message:'Could not close safely',detail:String(error)});}
 });
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'Clementina Studio',submenu:[{role:'about'},{type:'separator'},{label:'Quit Clementina Studio',accelerator:'CommandOrControl+Q',click:()=>win.close()}]},
  {label:'File',submenu:[{label:'Close window',accelerator:'CommandOrControl+W',click:()=>win.close()}]},
  {role:'editMenu'},{role:'viewMenu'},{role:'windowMenu'}
 ]));
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
 ipcMain.handle('bank:import',async()=>{
  const result=await dialog.showOpenDialog(win,{filters:[{name:'CHR bank PRG',extensions:['prg']}],properties:['openFile']});
  if(result.canceled)return null;
  const selected=result.filePaths[0];const bytes=await readFile(selected);
  return {...importBankPrg(bytes),name:path.basename(selected,path.extname(selected))};
 });
 ipcMain.handle('project:open',async()=>{
  const result=await dialog.showOpenDialog(win,{filters:[{name:'Studio or legacy tile projects',extensions:['cstudio','mtb']}],properties:['openFile']});
  if(result.canceled)return null;
  const selected=result.filePaths[0]; const bytes=await readFile(selected);
  if(path.extname(selected).toLowerCase()==='.cstudio')return {path:selected,name:path.basename(selected),project:decodeProject(bytes.toString('utf8'))};
  return {path:selected,name:path.basename(selected),bytes:Array.from(bytes)};
 });
 ipcMain.handle('project:opened',(_event,selected:string)=>{projectPath=path.extname(selected).toLowerCase()==='.cstudio'?selected:undefined;});
 ipcMain.handle('project:new',()=>{projectPath=undefined;});
 ipcMain.handle('project:save',(_event,p:TileProject,saveAs:boolean)=>saveProject(p,saveAs));
 ipcMain.handle('assets:export',async(_event,p:TileProject)=>{
  const files=runtimePackage(p);
  const result=await dialog.showOpenDialog(win,{properties:['openDirectory','createDirectory']});if(result.canceled)return null;
  // Create a unique child folder so exports never overwrite another package.
  const {mkdtemp}=await import('node:fs/promises');
  const target=await mkdtemp(path.join(result.filePaths[0],'clementina-assets-'));
  for(const [name,bytes] of Object.entries(files))await writeFile(path.join(target,name),bytes);
  return target;
 });
});
app.on('window-all-closed',()=>app.quit());
