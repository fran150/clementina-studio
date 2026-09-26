// Canvas navigation shared by the tileset, shape, background and overlay
// editors, the application menu's commands, and the fixes that came with them.
// Run with `npm run test:desktop:navigation`.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');
app.whenReady().then(async()=>{
 const saves=[];let opens=0;
 ipcMain.handle('project:new',()=>{});
 ipcMain.handle('project:open',()=>{opens++;return null;});
 ipcMain.handle('project:save',(_event,_project,saveAs)=>{saves.push(saveAs);return 'navigation.cstudio';});
 // A 2×1 PNG: one opaque red pixel, one transparent.
 ipcMain.handle('image:import',()=>({name:'Hero.png',format:'png',dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP4z8AARAwMAAz8Af9c/RSVAAAAAElFTkSuQmCC'}));
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const command=async name=>{window.webContents.send('studio:command',name);await wait(60);};
 // Real wheel input, so native scrolling happens when nothing prevents it.
 const wheel=async(x,y,deltaY,modifiers=[])=>{window.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(x),y:Math.round(y),deltaX:0,deltaY,canScroll:true,modifiers});await wait(120);};
 const key=async keyCode=>{window.webContents.sendInputEvent({type:'keyDown',keyCode});window.webContents.sendInputEvent({type:'keyUp',keyCode});await wait(40);};
 try{
  await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));
  await run(`window.__wheel=[];addEventListener('wheel',e=>__wheel.push({deltaY:e.deltaY,ctrl:e.ctrlKey}),true);`);

  // Import image opens its dialog (it failed on an undefined variable before).
  await run(`showView('tiles');$('addBankFile').click();$('importBankImage').click();`);await wait(400);
  assert.deepEqual(await run(`return {open:$('bankImageDialog').open,object:$('iiObjectName').value};`),{open:true,object:'Hero'},'Import image must open its dialog');
  await run(`$('iiCancel').click();`);

  // Tileset: select all 16×16 tiles on the tile map, docked open by default,
  // so the zoomed canvas overflows.
  const objectsButton="if($('bankMapToggle').getAttribute('aria-expanded')!=='true')$('bankMapToggle').click();";
  const map=await run(objectsButton+`const r=$('bankMap').getBoundingClientRect();return {left:r.left+3,top:r.top+3,right:r.right-3,bottom:r.bottom-3};`);
  window.webContents.sendInputEvent({type:'mouseDown',x:Math.round(map.left),y:Math.round(map.top),button:'left',clickCount:1});
  window.webContents.sendInputEvent({type:'mouseMove',x:Math.round(map.right),y:Math.round(map.bottom),button:'left'});
  window.webContents.sendInputEvent({type:'mouseUp',x:Math.round(map.right),y:Math.round(map.bottom),button:'left',clickCount:1});
  await wait(80);
  // A tileset area opens fitted to the window.
  assert.ok(await run(`const s=document.querySelector('#canvasStage .selectionScroll'),c=$('bankSelection');return $('bankSelectionInfo').textContent.startsWith('16 × 16 tiles')&&c.offsetWidth<=s.clientWidth&&c.offsetHeight<=s.clientHeight&&parseFloat($('zoomLabel').textContent)>1;`),'a tileset area must open fitted');
  for(let i=0;i<8&&await run(`return $('zoomLabel').textContent;`)!=='8×';i++)await command('zoomIn');
  assert.equal(await run(`return $('zoomLabel').textContent;`),'8×');
  const stage=await run(`const r=document.querySelector('#canvasStage .selectionScroll').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
  // A plain wheel scrolls the canvas instead of zooming.
  await wheel(stage.x,stage.y,-240);
  const scrolled=await run(`return {top:document.querySelector('#canvasStage .selectionScroll').scrollTop,zoom:$('zoomLabel').textContent};`);
  assert.ok(scrolled.top>0,'a plain wheel must scroll the tileset canvas');assert.equal(scrolled.zoom,'8×','a plain wheel must not zoom');
  // Ctrl+wheel zooms one step around the pointer, keeping the art under it in place.
  const artAt=`const r=$('bankSelection').getBoundingClientRect(),z=parseFloat($('zoomLabel').textContent);return [(${stage.x}-r.left)/z,(${stage.y}-r.top)/z,z];`;
  const before=await run(artAt);
  await wheel(stage.x,stage.y,120,['control']);
  const after=await run(artAt);
  assert.ok((await run(`return __wheel.at(-1);`)).ctrl);
  assert.notEqual(after[2],before[2],'Ctrl+wheel must zoom');
  assert.ok(Math.abs(after[0]-before[0])<1&&Math.abs(after[1]-before[1])<1,'zooming must keep the art under the pointer in place');
  // The View menu's zoom commands drive the current canvas.
  await command('zoomActual');assert.equal(await run(`return $('zoomLabel').textContent;`),'1×');
  await command('zoomIn');assert.equal(await run(`return $('zoomLabel').textContent;`),'2×');
  await command('zoomOut');await command('zoomOut');assert.equal(await run(`return $('zoomLabel').textContent;`),'1×','tilesets never zoom below 100%');
  await command('zoomFit');assert.ok(await run(`const s=document.querySelector('#canvasStage .selectionScroll'),c=$('bankSelection');return c.offsetWidth<=s.clientWidth&&c.offsetHeight<=s.clientHeight&&parseFloat($('zoomLabel').textContent)>1;`),'Fit must fit the canvas');

  // File menu commands save and open the project.
  await command('save');await command('saveAs');await command('open');
  assert.deepEqual({saves,opens},{saves:[false,true],opens:1});

  // Shapes: the wheel pans the camera; Ctrl+wheel zooms.
  await run(`showView('shapes');$('scNew').click();`);await wait(80);
  const shapeCanvas=await run(`const r=$('scCanvas').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
  // The first row, from the top, that leaves the empty viewport color: the shape canvas's top edge.
  const artTop=`const c=$('scCanvas'),d=c.getContext('2d').getImageData(Math.floor(c.width/2),0,1,c.height).data;for(let y=0;y<c.height;y++)if(d[y*4]!==0x11||d[y*4+1]!==0x13||d[y*4+2]!==0x18)return y;return -1;`;
  const shapeZoom=await run(`return $('scZoomLabel').textContent;`),topBefore=await run(artTop);
  // Scrolls up, moving the art down, so its top edge stays on screen.
  await wheel(shapeCanvas.x,shapeCanvas.y,120);
  const panned=await run(`return __wheel.at(-1).deltaY;`),topAfter=await run(artTop);
  assert.ok(Math.abs(topAfter-(topBefore-panned))<=2,`the wheel must pan the shape canvas (${topBefore} → ${topAfter}, delta ${panned})`);
  assert.equal(await run(`return $('scZoomLabel').textContent;`),shapeZoom,'a plain wheel must not zoom shapes');
  await wheel(shapeCanvas.x,shapeCanvas.y,120,['control']);
  assert.notEqual(await run(`return $('scZoomLabel').textContent;`),shapeZoom,'Ctrl+wheel must zoom shapes');

  // Backgrounds open fitted and centered; the tool shortcuts the tooltips name work.
  await run(`showView('backgrounds');$('bgNewAction').click();`);await wait(80);
  const fitted=await run(`const s=$('bgStage'),w=s.clientWidth-48,h=s.clientHeight-48,fit=[.25,.5,1,2,3,4,6,8,12,16,24,32].findLast(z=>320*z<=w&&200*z<=h);
   const c=$('bgCanvasWrap').getBoundingClientRect(),r=s.getBoundingClientRect();return {label:$('bgZoomLabel').textContent,expected:fit+'×',centered:Math.abs((c.left-r.left)-(r.right-c.right))<2};`);
  assert.equal(fitted.label,fitted.expected,'a new background must open fitted');assert.ok(fitted.centered,'the background canvas must be centered');
  for(const [code,tool] of [['R','bgRectangleTool'],['G','bgFillTool'],['E','bgEraserTool'],['I','bgPickerTool'],['S','bgSelectTool'],['H','bgPanTool'],['B','bgPencilTool']]){
   await key(code);assert.ok(await run(`return $('${tool}').classList.contains('on');`),`${code} must select ${tool}`);
  }
  await run(`$('bgWidth').value=200;$('bgHeight').value=150;$('bgResize').click();`);
  const bgStage=await run(`const r=$('bgStage').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
  const bgZoom=await run(`return $('bgZoomLabel').textContent;`);
  await wheel(bgStage.x,bgStage.y,-240);
  assert.ok(await run(`return $('bgStage').scrollTop>0;`),'a plain wheel must scroll the background');
  assert.equal(await run(`return $('bgZoomLabel').textContent;`),bgZoom);
  await wheel(bgStage.x,bgStage.y,120,['control']);
  assert.notEqual(await run(`return $('bgZoomLabel').textContent;`),bgZoom,'Ctrl+wheel must zoom the background');

  // Overlays open fitted too, and take the same tool letters.
  await run(`showView('overlays');$('ovNewAction').click();`);await wait(80);
  const overlayFit=await run(`const s=$('ovStage'),w=s.clientWidth-48,h=s.clientHeight-48,fit=[.25,.5,1,2,3,4,6,8,12,16,24,32].findLast(z=>320*z<=w&&200*z<=h);return {label:$('ovZoomLabel').textContent,expected:fit+'×'};`);
  assert.equal(overlayFit.label,overlayFit.expected,'a new overlay must open fitted');
  for(const [code,tool] of [['G','ovFillTool'],['H','ovPanTool'],['B','ovPencilTool']]){
   await key(code);assert.ok(await run(`return $('${tool}').classList.contains('on');`),`${code} must select ${tool}`);
  }
  await command('zoomActual');assert.equal(await run(`return $('ovZoomLabel').textContent;`),'1×');

  // A real touchpad pinch, through Chromium's own pinch-to-wheel conversion:
  // every event carries a whole wheel tick, so it must follow the fingers'
  // scale rather than step once per event. A small pinch holds still.
  for(let i=0;i<3;i++)await command('zoomIn');
  const center=await run(`const r=$('ovStage').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};`);
  window.webContents.debugger.attach('1.3');
  const pinch=async scaleFactor=>{await window.webContents.debugger.sendCommand('Input.synthesizePinchGesture',{...center,scaleFactor,gestureSourceType:'mouse'});await wait(200);return run(`return $('ovZoomLabel').textContent;`);};
  assert.equal(await run(`return $('ovZoomLabel').textContent;`),'4×');
  assert.equal(await pinch(1.5),'6×','pinching out by half must zoom 4× to 6×, one step');
  assert.equal(await pinch(1.1),'6×','a small pinch must not change the step');
  assert.equal(await pinch(0.5),'3×','pinching in by half must zoom 6× to 3×');
  window.webContents.debugger.detach();

  assert.deepEqual(errors,[]);console.log('desktop navigation: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
