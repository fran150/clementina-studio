// Shared shell behavior, exercised in the real Electron renderer.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];
 window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 try {
 await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));
 for(const view of ['palettes','tiles','shapes','animations']){
  const state=await run(`showView('${view}');return {current:document.querySelector('[aria-current="page"]')?.dataset.view,nav:Math.round($('workflowNav').getBoundingClientRect().height),header:Math.round(document.querySelector('header').getBoundingClientRect().height),status:document.querySelector('#status').getAttribute('role'),tooltips:document.querySelectorAll('#studioTooltip').length};`);
  assert.deepEqual(state,{current:view,nav:44,header:46,status:'status',tooltips:1});
 }
 for(const [view,first,second] of [['animations','anLibraryToggle','anShapeLibraryToggle'],['shapes','scLibraryToggle','scTileLibraryToggle']]){
  const states=await run(`showView('${view}');const a=$('${first}'),b=$('${second}');a.click();b.click();const panel=$(b.getAttribute('aria-controls'));const state={first:a.getAttribute('aria-expanded'),second:b.getAttribute('aria-expanded'),hidden:panel.hidden};panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return {...state,closed:panel.hidden,expanded:b.getAttribute('aria-expanded'),focus:document.activeElement.id};`);
  assert.deepEqual(states,{first:'false',second:'true',hidden:false,closed:true,expanded:'false',focus:second});
 }
 const independent=await run(`showView('palettes');const a=$('palLibraryToggle'),b=$('palConfigsToggle');if(a.getAttribute('aria-expanded')==='false')a.click();if(b.getAttribute('aria-expanded')==='false')b.click();$('palClose').click();return {closed:$('palLibrary').hidden,other:$('palConfigs').hidden,focus:document.activeElement.id};`);
 assert.deepEqual(independent,{closed:true,other:false,focus:'palLibraryToggle'});
 const roundTrip=await run(`const before=JSON.stringify(studioProject());for(const view of ['tiles','animations','palettes','shapes'])showView(view);return before===JSON.stringify(studioProject());`);
 assert.equal(roundTrip,true,'view changes must not mutate project assets');
 assert.deepEqual(errors,[]);
 console.log('desktop shell: ok');app.exit(0);
 }catch(e){console.error(e);console.error(errors);app.exit(1);}
});
