// Drives the real renderer in Electron. Run with `npm run test:desktop:overlay`.
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

 // A 3bpp tileset with a distinct tile (index 1, bank 3), plus a 1bpp
 // tileset with tile 5's plane 1 painted (plane 0 stays blank), to exercise
 // both normal painting and the plane selector.
 await run(`
  showView('tiles');$('addBankFile').click();
  const t=tilesets[0];t.name='Ground';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,1,x,y,2);
  t.tilePaletteBanks[1]=3;
  tilesets.push({id:'mono-tileset',name:'Mono',bpp:1,chr:Array(6144).fill(0),tilePaletteBanks:Array(256).fill(0),compositions:[]});
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(tilesets[1],5,x,y,1,1);
  showView('overlays');$('ovNewAction').click();
 `);
 const created=await run(`return {width:$('ovCanvas').width,height:$('ovCanvas').height,cells:overlays[0].cells.length,placeholders:overlays[0].placeholders.length,tileset:overlays[0].tilesetId===tilesets[0].id,alt:overlays[0].altTilesetId===tilesets[0].id};`);
 assert.deepEqual(created,{width:320,height:200,cells:1000,placeholders:0,tileset:true,alt:true},'a new overlay is the fixed 40x25 grid with both tilesets set to the sole tileset');

 // Double-clicking a list row turns it into a rename textbox; committing must
 // replace it with the new name rather than leaving the textbox stuck in place.
 await run(`$('ovList').children[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);
 assert.equal(await run(`return !!$('ovList').children[0].querySelector('input');`),true,'double-click must turn the row into a rename textbox');
 await run(`const input=$('ovList').children[0].querySelector('input');input.value='Hud';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));`);
 assert.deepEqual(await run(`return {name:overlays[0].name,hasInput:!!$('ovList').children[0].querySelector('input'),text:$('ovList').children[0].textContent};`),
  {name:'Hud',hasInput:false,text:'Hud'},'committing a rename must swap the textbox back for text, not leave it stuck');
 await run(`$('ovList').children[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);
 assert.equal(await run(`return !!$('ovList').children[0].querySelector('input');`),true,'a previously-renamed row must still accept another rename');
 await run(`$('ovList').children[0].querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));`);
 assert.deepEqual(await run(`return {name:overlays[0].name,hasInput:!!$('ovList').children[0].querySelector('input')};`),{name:'Hud',hasInput:false},'cancelling a rename must also clear the textbox');

 // Assigning the alternate tileset via the picker only repoints the field.
 await run(`$('ovTileLibraryToggle').click();$('ovAltList').children[1].click();`);
 assert.equal(await run(`return overlays[0].altTilesetId;`),'mono-tileset');

 // A 1bpp tileset reveals its plane selector; the 3bpp primary tileset hides its own.
 assert.deepEqual(await run(`return {alt:$('ovAltPlaneLabel').hidden,primary:$('ovPrimaryPlaneLabel').hidden};`),{alt:false,primary:true});

 // Switching the plane changes which page the tile picker shows — tile 5's
 // plane 1 was painted, plane 0 was left blank, so the sampled pixel differs.
 await run(`$('ovPickSlot').value='alt';$('ovPickSlot').dispatchEvent(new Event('change',{bubbles:true}));`);
 const plane0=await run(`const ctx=$('ovTileMap').getContext('2d');return ctx.getImageData(5*16+4,4,1,1).data.join(',');`);
 await run(`$('ovAltPlane').value='1';$('ovAltPlane').dispatchEvent(new Event('change',{bubbles:true}));`);
 const plane1=await run(`const ctx=$('ovTileMap').getContext('2d');return ctx.getImageData(5*16+4,4,1,1).data.join(',');`);
 assert.notEqual(plane0,plane1,"switching the plane selector must change the picker's rendered pixels for a 1bpp tileset");
 await run(`$('ovAltPlane').value='0';$('ovAltPlane').dispatchEvent(new Event('change',{bubbles:true}));$('ovPickSlot').value='primary';$('ovPickSlot').dispatchEvent(new Event('change',{bubbles:true}));`);

 // Picking tile 1 from the primary tile map loads its authored bank into the stamp.
 const pick=await run(`const r=$('ovTileMap').getBoundingClientRect();return {x:r.left+r.width*(1.5/16),y:r.top+r.height*(0.5/16)};`);
 click(pick.x,pick.y);
 await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`return {tile:$('ovStampTile').textContent,bank:$('ovBankLabel').textContent};`),{tile:'1',bank:'Bank 03'});

 // An overlay opens fitted to the window; these cell coordinates assume 100%.
 const canvas=await run(`$('ovPencilTool').click();$('ovActualSize').click();const r=$('ovCanvas').getBoundingClientRect();return {left:r.left,top:r.top};`);
 const at=(col,row)=>({x:canvas.left+col*8+4,y:canvas.top+row*8+4});

 // A pencil click stamps the picked tile and bank, and is one undo step.
 let p=at(2,2);click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const c=overlays[0].cells[2*40+2];return {tile:c.tile,bank:c.paletteBank,undoEnabled:!$('ovUndo').disabled};`),{tile:1,bank:3,undoEnabled:true});
 await run(`$('ovUndo').click();`);
 assert.deepEqual(await run(`const c=overlays[0].cells[2*40+2];return {tile:c.tile,redoEnabled:!$('ovRedo').disabled};`),{tile:0,redoEnabled:true});
 await run(`$('ovRedo').click();`);
 assert.equal(await run(`return overlays[0].cells[2*40+2].tile;`),1);

 // A rectangle drag stamps every covered cell as a single undo step.
 await run(`$('ovRectangleTool').click();`);
 const from=at(5,5),to=at(7,6);
 window.webContents.sendInputEvent({type:'mouseDown',x:from.x,y:from.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:to.x,y:to.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:to.x,y:to.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const filledRect=`(()=>{let n=0;for(let y=5;y<=6;y++)for(let x=5;x<=7;x++)if(overlays[0].cells[y*40+x].tile===1)n++;return n;})()`;
 assert.equal(await run(`return ${filledRect};`),6);
 await run(`$('ovUndo').click();`);
 assert.equal(await run(`return ${filledRect};`),0,'one rectangle drag must be a single undo step');

 // Flood fill spreads across contiguous matching cells as a single undo step.
 await run(`$('ovFillTool').click();`);
 p=at(20,20);click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return overlays[0].cells[20*40+20].tile;`),1);
 await run(`$('ovUndo').click();`);
 assert.equal(await run(`return overlays[0].cells[20*40+20].tile;`),0);

 // The eraser resets a cell to the blank default.
 await run(`$('ovPencilTool').click();`);
 p=at(10,10);click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return overlays[0].cells[10*40+10].tile;`),1);
 await run(`$('ovEraserTool').click();`);
 click(p.x,p.y);await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const c=overlays[0].cells[10*40+10];return {tile:c.tile,bank:c.paletteBank};`),{tile:0,bank:0});

 // Dragging the Placeholder tool over the canvas defines a new geometry-only region.
 await run(`$('ovPlaceholderTool').click();`);
 const phFrom=at(0,0),phTo=at(6,0);
 window.webContents.sendInputEvent({type:'mouseDown',x:phFrom.x,y:phFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:phTo.x,y:phTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:phTo.x,y:phTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const placed=await run(`const p=overlays[0].placeholders[0];return {count:overlays[0].placeholders.length,col:p.col,row:p.row,width:p.width,height:p.height};`);
 assert.deepEqual(placed,{count:1,col:0,row:0,width:7,height:1},'dragging the Placeholder tool must add one geometry-only region');

 // The placeholder list is the same renameable list component as the overlay
 // list above; double-click rename must not get stuck there either.
 await run(`$('ovPlaceholderList').children[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);
 assert.equal(await run(`return !!$('ovPlaceholderList').children[0].querySelector('input');`),true,'double-click must turn the placeholder row into a rename textbox');
 await run(`const input=$('ovPlaceholderList').children[0].querySelector('input');input.value='Score';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));`);
 assert.deepEqual(await run(`return {name:overlays[0].placeholders[0].name,hasInput:!!$('ovPlaceholderList').children[0].querySelector('input')};`),
  {name:'Score',hasInput:false},'committing a placeholder rename must swap the textbox back for text, not leave it stuck');

 // Dragging a second, overlapping region must be rejected — no placeholder added.
 const overFrom=at(2,0),overTo=at(4,0);
 window.webContents.sendInputEvent({type:'mouseDown',x:overFrom.x,y:overFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:overTo.x,y:overTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:overTo.x,y:overTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return overlays[0].placeholders.length;`),1,'an overlapping drag must not create a second placeholder');

 // The numeric fields edit the selected placeholder's geometry, with the
 // same bounds/overlap rejection as the drag tool.
 await run(`$('ovPlaceholderLibraryToggle').click();$('ovPlaceholderList').children[0].click();`);
 await run(`$('ovPhWidth').value='3';$('ovPhWidth').dispatchEvent(new Event('change',{bubbles:true}));`);
 assert.equal(await run(`return overlays[0].placeholders[0].width;`),3,'the width field must resize the selected placeholder');
 await run(`$('ovPhCol').value='38';$('ovPhCol').dispatchEvent(new Event('change',{bubbles:true}));`);
 assert.equal(await run(`return overlays[0].placeholders[0].col;`),0,'a field change that would exceed the 40-column grid must be rejected');

 // Undo/redo cover placeholder field edits, sharing the overlay's own
 // undo history with paint strokes.
 await run(`$('ovUndo').click();`);
 assert.equal(await run(`return overlays[0].placeholders[0].width;`),7,'undo must cover the width field edit');
 await run(`$('ovRedo').click();`);
 assert.equal(await run(`return overlays[0].placeholders[0].width;`),3);

 // Duplicate places a second placeholder in free space; delete removes the selected one.
 await run(`$('ovPlaceholderDuplicate').click();`);
 assert.equal(await run(`return overlays[0].placeholders.length;`),2,'duplicate must add a second placeholder in free space');
 await run(`const original=window.confirm;window.confirm=()=>true;$('ovPlaceholderDelete').click();window.confirm=original;`);
 assert.equal(await run(`return overlays[0].placeholders.length;`),1,'delete must remove the selected placeholder');

 // At high zoom the fixed 320x200 canvas can exceed the window; the Pan tool
 // scrolls #ovStage on drag instead of painting.
 await run(`for(let i=0;i<5;i++)$('ovZoomIn').click();$('ovPanTool').click();`);
 const panBefore=await run(`return {left:$('ovStage').scrollLeft,top:$('ovStage').scrollTop,cells:JSON.stringify(overlays[0].cells)};`);
 const stageCenter=await run(`const r=$('ovStage').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:stageCenter.x,y:stageCenter.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:stageCenter.x-40,y:stageCenter.y-25,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:stageCenter.x-40,y:stageCenter.y-25,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const panAfter=await run(`return {left:$('ovStage').scrollLeft,top:$('ovStage').scrollTop,cellsUnchanged:JSON.stringify(overlays[0].cells)===${JSON.stringify(panBefore.cells)}};`);
 assert.deepEqual(panAfter,{left:panBefore.left+40,top:panBefore.top+25,cellsUnchanged:true},'the Pan tool must scroll the stage and must not paint');
 await run(`$('ovPencilTool').click();$('ovActualSize').click();`);

 // Docked-panel bounds at two window widths, matching the other editors' check.
 for(const width of [1440,1024]){
  window.setSize(width,900);await new Promise(r=>setTimeout(r,150));
  for(const toggle of ['ovLibraryToggle','ovTileLibraryToggle','ovPlaceholderLibraryToggle']){
   await run(`if($('${toggle}').getAttribute('aria-expanded')!=='true')$('${toggle}').click();`);await new Promise(r=>setTimeout(r,80));
   const bounds=await run(`const panel=$($('${toggle}').getAttribute('aria-controls')).getBoundingClientRect(),main=document.querySelector('#overlayEditor main').getBoundingClientRect(),stage=$('ovStage').getBoundingClientRect();return {clear:panel.right<=main.left||panel.left>=main.right,canvasWithin:stage.left>=main.left&&stage.right<=main.right+1};`);
   assert.equal(bounds.clear,true);assert.equal(bounds.canvasWithin,true);
  }
  if(process.env.STUDIO_CAPTURE_DIR)fs.writeFileSync(path.join(process.env.STUDIO_CAPTURE_DIR,`overlay-${width}.png`),(await window.webContents.capturePage()).toPNG());
 }

 const data=await run(`return studioProject();`);
 const {validateProject}=await import('../dist/packages/assets/index.js');validateProject(data);
 assert.deepEqual(errors,[]);console.log('desktop overlay: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
