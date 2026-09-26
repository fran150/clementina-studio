// Conventions every editor shares: the tab order and its shortcuts, one
// config picker, the same empty state and stage, one Preview panel,
// right-click (erase while painting, the edit menu otherwise), Shift+H/V
// flips (animation frames too), docked properties, labeled undo steps — in
// the Edit menu too — and the background layer's opaque color 0. Run with
// `npm run test:desktop:conventions`.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});
 const menus=[];ipcMain.on('menu:history',(_event,menu)=>menus.push(menu));
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const command=async name=>{window.webContents.send('studio:command',name);await wait(80);};
 const key=async(keyCode,modifiers=[])=>{window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(50);};
 const mouse=async(type,x,y,button='left')=>{window.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(y),button,clickCount:1});await wait(50);};
 const drag=async(from,to)=>{await mouse('mouseDown',from.x,from.y);await mouse('mouseMove',to.x,to.y);await mouse('mouseUp',to.x,to.y);};
 // Right-clicks an element and returns the labels of the menu that opens, if any.
 const menuOn=async selector=>run(`document.querySelector('.studioMenu')?.remove();const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect();el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));const m=document.querySelector('.studioMenu');const labels=m?[...m.querySelectorAll('button span')].map(s=>s.textContent):null;m?.remove();return labels;`);
 try{
  await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));

  // ---- Empty editors: one centered message on the same stage, and no docks for an asset that isn't there ----
  const empty=`const e=[...document.querySelectorAll('.studioEmpty')].find(x=>x.offsetParent);if(!e)return null;const p=getComputedStyle(e.querySelector('p')),s=getComputedStyle(e),r=e.getBoundingClientRect(),m=e.closest('.studioMain').getBoundingClientRect();
   return {font:p.fontSize+' '+p.color,stage:s.backgroundColor+' '+s.backgroundImage,centered:s.alignItems+' '+s.justifyContent,fills:Math.abs(r.width-m.width)<1&&Math.abs(r.height-m.height)<1,docks:[...document.querySelectorAll('.studioAssetDock')].filter(d=>d.offsetParent).length};`;
  const looks=[];
  for(const view of ['tiles','shapes','animations','backgrounds','overlays','sounds','music']){await run(`showView('${view}');`);looks.push(await run(empty));}
  for(const look of looks)assert.deepEqual(look,{...looks[0],docks:0},'every empty editor must look the same, fill its main area and hide its asset docks');
  assert.equal(looks[0].centered,'center center');assert.equal(looks[0].fills,true);
  assert.equal(await run(`const s=getComputedStyle($('palStage'));return s.backgroundColor+' '+s.backgroundImage;`),looks[0].stage,'the palette stage must be the same stage');
  await run(`showView('tiles');$('addBankFile').click();const t=tilesets[0];for(let tile=1;tile<=4;tile++)for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,tile,x,y,(x+tile)%8);redrawAll();`);

  // ---- The tabs, their shortcuts, and the one config picker ----
  assert.deepEqual(await run(`return [...document.querySelectorAll('#workflowNav [data-view]')].map(b=>b.dataset.view);`),['palettes','tiles','shapes','animations','backgrounds','overlays','sounds','music']);
  for(const view of ['shapes','overlays','sounds','music','palettes']){await command('view:'+view);assert.equal(await run(`return currentView;`),view,`the ${view} shortcut must switch editors`);}
  assert.deepEqual(await run(`return {inTabs:!!$('configPicker').closest('#workflowNav'),perEditor:['bankConfigPicker','bgConfigPicker','ovConfigPicker','scConfigPicker','anConfigPicker'].filter(id=>$(id)).length};`),{inTabs:true,perEditor:0},'one config picker, with the tabs');

  // ---- The canvas stage, and the Preview panel Tilesets and Shapes share ----
  const stage=id=>run(`const s=getComputedStyle(document.getElementById('${id}').closest('.studioStage'));return s.backgroundColor+' '+s.backgroundImage;`);
  await run(`showView('tiles');`);
  assert.equal(await stage('bankSelection'),looks[0].stage,'the tileset canvas must sit on the shared stage');
  const preview=(toggle,panel)=>run(`const b=$('${toggle}'),p=$('${panel}');return {on:b.classList.contains('on'),icon:b.querySelector('svg').innerHTML,label:b.getAttribute('aria-label'),shown:!p.hidden&&!!p.offsetParent,shared:p.classList.contains('canvasPreview'),inStage:!!p.closest('.studioStage'),title:p.querySelector('strong').textContent};`);
  const tilesPreview=await preview('miniatureToggle','miniaturePanel');
  assert.deepEqual({...tilesPreview,icon:undefined},{on:true,icon:undefined,label:'Preview',shown:true,shared:true,inStage:true,title:'Preview'});
  await run(`$('miniatureToggle').click();`);
  assert.equal((await preview('miniatureToggle','miniaturePanel')).shown,false,'the Preview button must hide the panel');
  await run(`$('miniatureToggle').click();`);

  // ---- Tilesets: Shift+V flips the selection; right-click erases or opens the menu ----
  await run(`showView('tiles');setTilePixel(tilesets[0],0,3,0,5);renderBankEditor();`);
  await key('A',['control']);await key('V',['shift']);
  assert.equal(await run(`return tilePixel(tilesets[0],0,3,7);`),5,'Shift+V must flip the selection vertically');
  assert.ok((await menuOn('#bankSelection')).includes('Flip horizontally'),'right-click with the Select tool must open the edit menu');
  await run(`$('pencilTool').click();`);
  assert.equal(await menuOn('#bankSelection'),null,'right-click with a painting tool must not open a menu');
  // The fill tools' options sit in the top bar: the filled toggle and three patterns.
  await run(`$('fillTool').click();$('fillPattern_checker').click();`);
  assert.deepEqual(await run(`const o=$('toolOptions');return {text:o.innerText.trim(),buttons:[...o.querySelectorAll('button')].map(b=>b.id),checker:$('fillPattern_checker').classList.contains('on')&&!$('fillPattern_checker').disabled};`),{text:'',buttons:['filledShapeToggle','fillPattern_solid','fillPattern_checker','fillPattern_stripes'],checker:true},'the fill patterns must be real, selectable buttons');
  await run(`$('fillPattern_solid').click();$('pencilTool').click();`);

  // ---- Backgrounds: color 0 is opaque in the cell's bank; right-click; Shift+H ----
  await run(`showView('backgrounds');$('bgNewAction').click();$('bgActualSize').click();`);
  const zero=await run(`const d=$('bgCanvas').getContext('2d').getImageData(3,3,1,1).data;return {drawn:'rgb('+d[0]+','+d[1]+','+d[2]+')',bank:css565(bankColor(0,0))};`);
  assert.equal(zero.drawn,zero.bank,"a background's color 0 must be drawn in its bank's color 0, as the hardware does");
  const canvas=await run(`const r=$('bgCanvas').getBoundingClientRect();return {left:r.left,top:r.top};`);
  const at=(col,row)=>({x:canvas.left+col*8+4,y:canvas.top+row*8+4});
  await run(`const a=backgrounds[0];a.cells[5*40+5]={...a.cells[0],tile:1};a.cells[2*40+2]={...a.cells[0],tile:1};a.cells[2*40+3]={...a.cells[0],tile:2};renderBackgrounds();`);
  await key('B');await mouse('mouseDown',at(5,5).x,at(5,5).y,'right');await mouse('mouseUp',at(5,5).x,at(5,5).y,'right');
  assert.equal(await run(`return backgrounds[0].cells[5*40+5].tile;`),0,'right-click with a painting tool must erase');
  await key('S');await drag(at(2,2),at(3,2));
  assert.deepEqual(await menuOn('#bgCanvas'),['Cut','Copy','Paste','Delete','Flip horizontally','Flip vertically','Priority','Select all','Deselect']);
  await key('H',['shift']);
  assert.deepEqual(await run(`const c=backgrounds[0].cells;return [c[2*40+2].tile,c[2*40+3].tile,c[2*40+2].flipX];`),[2,1,true],'Shift+H must flip the selected cells over');

  // ---- Undo steps are named, in the status bar and on the Undo and Redo buttons ----
  await run(`$('bgDeleteAction').click();`);
  assert.equal(await run(`return $('bgUndo').title;`),'Undo Delete Background_1 (Ctrl/Cmd+Z)');
  assert.deepEqual(menus.at(-1).undo,{label:'Undo Delete Background_1',enabled:true},'Edit ▸ Undo must name the step');
  await key('Z',['control']);
  assert.deepEqual(await run(`return {status:$('status').textContent,redo:$('bgRedo').title,back:backgrounds.length};`),{status:'Undone: Delete Background_1.',redo:'Redo Delete Background_1 (Ctrl/Cmd+Shift+Z)',back:1});
  assert.deepEqual(menus.at(-1).redo,{label:'Redo Delete Background_1',enabled:true},'Edit ▸ Redo must name the step');
  // A hidden window sends no focus events until its page has focus.
  window.webContents.focus();await wait(100);
  await run(`$('bgWidth').focus();`);await wait(50);
  assert.deepEqual(menus.at(-1),{undo:{label:'Undo',enabled:true},redo:{label:'Redo',enabled:true}},'in a text field, Undo and Redo are the field\'s own');
  await run(`$('bgWidth').blur();`);await wait(50);
  assert.equal(menus.at(-1).redo.label,'Redo Delete Background_1');
  assert.equal(await stage('bgCanvas'),looks[0].stage,'the background canvas must sit on the shared stage');

  // ---- Overlays: the selected placeholder's properties dock on the right ----
  await run(`showView('overlays');$('ovNewAction').click();$('ovPlaceholderNew').click();`);
  assert.deepEqual(await run(`const p=document.querySelector('.ovPlaceholderProps');return {right:p.classList.contains('studioDockRight'),open:!p.hidden,fields:!!p.querySelector('#ovPhCol'),col:$('ovPhCol').value};`),{right:true,open:true,fields:true,col:'0'});

  // ---- Shapes: right-click is the edit menu; the picker places only through Place tiles ----
  await run(`showView('shapes');$('scNew').click();shapes[0].sprites=[{tile:1,x:0,y:0,paletteBank:0,flipX:false,flipY:false}];renderAnimations();`);
  assert.ok((await menuOn('#scCanvas')).includes('Duplicate'),'right-click on a shape must open the edit menu');
  assert.equal(await stage('scCanvas'),looks[0].stage,'the shape canvas must sit on the shared stage');
  assert.deepEqual(await preview('scPreviewToggle','scPreview'),tilesPreview,'Shapes must show the same Preview panel, with the same button, as Tilesets');
  await run(`$('scTileLibraryToggle').click();`);
  const map=await run(`const r=$('scBankMap').getBoundingClientRect();return {x:r.left+r.width*(2.5/16),y:r.top+r.height*(0.5/16)};`);
  await mouse('mouseDown',map.x,map.y,'right');await mouse('mouseUp',map.x,map.y,'right');
  assert.equal(await run(`return $('scPlace').classList.contains('on');`),false,'the right button must not pick tiles up');
  await run(`$('scTileLibraryToggle').click();`);

  // ---- Animations: zoom, the transport, the frame dock and the frame menu ----
  await run(`showView('animations');$('anNew').click();`);
  const zoomBefore=await run(`return $('anZoomLabel').textContent;`);
  await command('zoomIn');
  assert.notEqual(await run(`return $('anZoomLabel').textContent;`),zoomBefore,'the preview must zoom');
  await command('zoomFit');
  assert.equal(await stage('anCanvas'),looks[0].stage,'the animation preview must sit on the shared stage');
  assert.deepEqual(await run(`return {play:!!$('anPlay').querySelector('svg'),inTransport:!!$('anPlay').closest('#anTransport'),dock:!document.querySelector('.anFramePanel').hidden,ticks:!!$('anFrames').querySelector('input[aria-label$="ticks"]')};`),{play:true,inTransport:true,dock:true,ticks:true});
  assert.deepEqual(await menuOn('.anFrameCard'),['Copy','Paste after','Duplicate','Delete','Flip horizontally','Flip vertically','Move earlier','Move later']);
  // Shift+H flips the selected frame, as it flips the selection elsewhere.
  await key('H',['shift']);
  assert.equal(await run(`return animations[animationIndex].frames[frameIndex].flipX;`),true,'Shift+H must flip the selected frame');
  await run(`$('anUndo').click();`);

  // ---- Sounds and Music: the same stage; right-click erases with a painting tool ----
  await run(`showView('sounds');$('sfNew').click();showView('music');$('muNew').click();`);
  for(const id of ['sfCanvas','muCanvas'])assert.equal(await stage(id),looks[0].stage,`${id} must sit on the shared stage`);
  await run(`showView('sounds');$('sfSelectTool').click();`);
  assert.ok((await menuOn('#sfCanvas')).includes('Select all'),'right-click with the Select tool must open the edit menu');
  await run(`$('sfPencilTool').click();`);
  assert.equal(await menuOn('#sfCanvas'),null,'right-click with a painting tool must not open a menu');

  // ---- Palettes: right-click a color ----
  await run(`showView('palettes');`);
  assert.deepEqual(await menuOn('#palColors button'),['Copy color','Paste color','Edit color…']);

  assert.deepEqual(errors,[]);console.log('desktop conventions: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
