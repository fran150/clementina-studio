// Drives the real renderer in Electron. Run with `npm run test:desktop:background`.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 const click=(x,y)=>{window.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});window.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});};
 try{
 await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));

 // A tileset with a distinct tile (index 1, drawn against bank 3) and a
 // second tileset to assign as alternate.
 await run(`
  showView('tiles');$('addBankFile').click();
  const t=tilesets[0];t.name='Ground';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,1,x,y,2);
  t.tilePaletteBanks[1]=3;
  tilesets.push({id:'alt-tileset',name:'Alt',bpp:3,chr:Array(6144).fill(0),tilePaletteBanks:Array(256).fill(0),compositions:[]});
  showView('backgrounds');$('bgNewAction').click();
 `);
 const created=await run(`return {width:$('bgCanvas').width,height:$('bgCanvas').height,cells:backgrounds[0].cells.length,tileset:backgrounds[0].tilesetId===tilesets[0].id,alt:backgrounds[0].altTilesetId===tilesets[0].id};`);
 assert.deepEqual(created,{width:320,height:200,cells:1000,tileset:true,alt:true},'a new background defaults to 40x25 with both tilesets set to the sole tileset');

 // Assigning the alternate tileset via the picker only repoints the field.
 await run(`$('bgTileLibraryToggle').click();$('bgAltList').children[1].click();`);
 assert.equal(await run(`return backgrounds[0].altTilesetId;`),'alt-tileset');

 // Picking tile 1 from the primary tile map loads its authored bank into the stamp.
 const pick=await run(`const r=$('bgTileMap').getBoundingClientRect();return {x:r.left+r.width*(1.5/16),y:r.top+r.height*(0.5/16)};`);
 click(pick.x,pick.y);
 await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`return {tile:$('bgStampTile').textContent,bank:$('bgBankLabel').textContent};`),{tile:'1',bank:'Bank 03'});

 const canvas=await run(`$('bgPencilTool').click();const r=$('bgCanvas').getBoundingClientRect();return {left:r.left,top:r.top};`);
 const at=(col,row)=>({x:canvas.left+col*8+4,y:canvas.top+row*8+4});

 // A pencil click stamps the picked tile and bank, and is one undo step.
 let p=at(2,2);click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const c=backgrounds[0].cells[2*40+2];return {tile:c.tile,bank:c.paletteBank,undoEnabled:!$('bgUndo').disabled};`),{tile:1,bank:3,undoEnabled:true});
 await run(`$('bgUndo').click();`);
 assert.deepEqual(await run(`const c=backgrounds[0].cells[2*40+2];return {tile:c.tile,redoEnabled:!$('bgRedo').disabled};`),{tile:0,redoEnabled:true});
 await run(`$('bgRedo').click();`);
 assert.equal(await run(`return backgrounds[0].cells[2*40+2].tile;`),1);

 // A rectangle drag stamps every covered cell as a single undo step.
 await run(`$('bgRectangleTool').click();`);
 const from=at(5,5),to=at(7,6);
 window.webContents.sendInputEvent({type:'mouseDown',x:from.x,y:from.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:to.x,y:to.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:to.x,y:to.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const filledRect=`(()=>{let n=0;for(let y=5;y<=6;y++)for(let x=5;x<=7;x++)if(backgrounds[0].cells[y*40+x].tile===1)n++;return n;})()`;
 assert.equal(await run(`return ${filledRect};`),6);
 await run(`$('bgUndo').click();`);
 assert.equal(await run(`return ${filledRect};`),0,'one rectangle drag must be a single undo step');

 // Flood fill spreads across contiguous matching cells as a single undo step.
 await run(`$('bgFillTool').click();`);
 p=at(20,20);click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return backgrounds[0].cells[20*40+20].tile;`),1);
 await run(`$('bgUndo').click();`);
 assert.equal(await run(`return backgrounds[0].cells[20*40+20].tile;`),0);

 // The eraser resets a cell to the blank default.
 await run(`$('bgPencilTool').click();`);
 p=at(10,10);click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return backgrounds[0].cells[10*40+10].tile;`),1);
 await run(`$('bgEraserTool').click();`);
 click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const c=backgrounds[0].cells[10*40+10];return {tile:c.tile,bank:c.paletteBank};`),{tile:0,bank:0});

 // Resizing preserves existing content anchored at the top-left.
 const resized=await run(`$('bgWidth').value=50;$('bgHeight').value=25;$('bgResize').click();return {width:backgrounds[0].width,height:backgrounds[0].height,cells:backgrounds[0].cells.length,preserved:backgrounds[0].cells[2*50+2].tile};`);
 assert.deepEqual(resized,{width:50,height:25,cells:1250,preserved:1});

 // The viewport preview overlay tracks the selected mode's pixel size.
 const overlay=await run(`
  $('bgPreviewMode').value='0';$('bgPreviewMode').dispatchEvent(new Event('change',{bubbles:true}));
  const o=$('bgViewportOverlay').getBoundingClientRect(),c=$('bgCanvas').getBoundingClientRect();
  return {hidden:$('bgViewportOverlay').hidden,size:Math.abs(o.width-320)<2&&Math.abs(o.height-200)<2,withinCanvas:o.left>=c.left-1&&o.top>=c.top-1};
 `);
 assert.deepEqual(overlay,{hidden:false,size:true,withinCanvas:true});

 // Camera panel table-index math, verified against
 // clementina-video-client/internal/render/renderer.go's bgTableAndLocal
 // before implementing this: mode 0/set 0/no scroll is table 0, and BGSET
 // offsets every table index by 4.
 const camMode0=await run(`
  $('bgActiveSet').value='0';$('bgActiveSet').dispatchEvent(new Event('change',{bubbles:true}));
  return $('bgCamTables').textContent;
 `);
 assert.equal(camMode0,'Tables 0','mode 0, set 0, no scroll must resolve to table 0');
 const camSet1=await run(`
  $('bgActiveSet').value='1';$('bgActiveSet').dispatchEvent(new Event('change',{bubbles:true}));
  return $('bgCamTables').textContent;
 `);
 assert.equal(camSet1,'Tables 4','BGSET 1 must offset every table index by 4');
 await run(`$('bgActiveSet').value='0';$('bgActiveSet').dispatchEvent(new Event('change',{bubbles:true}));`);

 // At mode 0 the loaded window and the visible screen are the same size, so
 // the inner (scroll) rectangle coincides exactly with the outer (loaded) one.
 const coincide=await run(`
  const o=$('bgViewportOverlay').getBoundingClientRect(),pieces=[...document.querySelectorAll('.bgScrollRect')],visible=pieces.filter(p=>!p.hidden);
  const r=visible[0]?.getBoundingClientRect();
  return {visibleCount:visible.length,matches:!!r&&Math.abs(r.left-o.left)<2&&Math.abs(r.top-o.top)<2&&Math.abs(r.width-o.width)<2&&Math.abs(r.height-o.height)<2};
 `);
 assert.deepEqual(coincide,{visibleCount:1,matches:true});

 // Mode 5 (80×50, a 640×400px plane) with SCROLL_X 330 straddles the table
 // column boundary at x=320px: the 320-wide visible screen spans tables 0
 // and 1, and wraps into two on-screen pieces.
 const wrapped=await run(`
  $('bgPreviewMode').value='5';$('bgPreviewMode').dispatchEvent(new Event('change',{bubbles:true}));
  $('bgScrollX').value='330';$('bgScrollX').dispatchEvent(new Event('change',{bubbles:true}));
  return {tables:$('bgCamTables').textContent,visiblePieces:[...document.querySelectorAll('.bgScrollRect')].filter(p=>!p.hidden).length};
 `);
 assert.deepEqual(wrapped,{tables:'Tables 0, 1',visiblePieces:2});

 // Dragging the scroll handle moves SCROLL_X/SCROLL_Y and is reflected live
 // in the numeric inputs (zoom is still 1x here, so screen px equal canvas px).
 const beforeDrag=await run(`return {x:Number($('bgScrollX').value),y:Number($('bgScrollY').value)};`);
 const handle=await run(`const r=$('bgScrollHandle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:handle.x,y:handle.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:handle.x+10,y:handle.y+15,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:handle.x+10,y:handle.y+15,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const afterDrag=await run(`return {x:Number($('bgScrollX').value),y:Number($('bgScrollY').value)};`);
 assert.deepEqual(afterDrag,{x:beforeDrag.x+10,y:beforeDrag.y+15},'dragging the scroll handle must update SCROLL_X/SCROLL_Y');

 // Reset camera state so it doesn't affect the checks below.
 await run(`$('bgPreviewMode').value='0';$('bgPreviewMode').dispatchEvent(new Event('change',{bubbles:true}));$('bgScrollX').value='0';$('bgScrollX').dispatchEvent(new Event('change',{bubbles:true}));$('bgScrollY').value='0';$('bgScrollY').dispatchEvent(new Event('change',{bubbles:true}));`);

 // Docked-panel bounds at two window widths, matching the animation editor's check.
 for(const width of [1440,1024]){
  window.setSize(width,900);await new Promise(r=>setTimeout(r,150));
  for(const toggle of ['bgLibraryToggle','bgTileLibraryToggle']){
   await run(`if($('${toggle}').getAttribute('aria-expanded')!=='true')$('${toggle}').click();`);await new Promise(r=>setTimeout(r,80));
   const bounds=await run(`const panel=$($('${toggle}').getAttribute('aria-controls')).getBoundingClientRect(),main=document.querySelector('#backgroundEditor main').getBoundingClientRect(),canvas=$('bgCanvas').getBoundingClientRect();return {clear:panel.right<=main.left,canvasWithin:canvas.left>=main.left&&canvas.right<=main.right+1};`);
   assert.equal(bounds.clear,true);assert.equal(bounds.canvasWithin,true);
  }
  if(process.env.STUDIO_CAPTURE_DIR)fs.writeFileSync(path.join(process.env.STUDIO_CAPTURE_DIR,`background-${width}.png`),(await window.webContents.capturePage()).toPNG());
 }

 const data=await run(`return studioProject();`);
 const {validateProject}=await import('../dist/packages/assets/index.js');validateProject(data);
 assert.deepEqual(errors,[]);console.log('desktop background: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
