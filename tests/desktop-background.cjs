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

 // Double-clicking a list row turns it into a rename textbox; committing must
 // replace it with the new name rather than leaving the textbox stuck in place.
 await run(`$('bgList').children[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);
 assert.equal(await run(`return !!$('bgList').children[0].querySelector('input');`),true,'double-click must turn the row into a rename textbox');
 await run(`const input=$('bgList').children[0].querySelector('input');input.value='Level_1';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));`);
 assert.deepEqual(await run(`return {name:backgrounds[0].name,hasInput:!!$('bgList').children[0].querySelector('input'),text:$('bgList').children[0].textContent};`),
  {name:'Level_1',hasInput:false,text:'Level_1'},'committing a rename must swap the textbox back for text, not leave it stuck');
 // And the row must accept another rename afterward — cancelling must also clear the textbox.
 await run(`$('bgList').children[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);
 assert.equal(await run(`return !!$('bgList').children[0].querySelector('input');`),true,'a previously-renamed row must still accept another rename');
 await run(`$('bgList').children[0].querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));`);
 assert.deepEqual(await run(`return {name:backgrounds[0].name,hasInput:!!$('bgList').children[0].querySelector('input')};`),{name:'Level_1',hasInput:false},'cancelling a rename must also clear the textbox');

 // Assigning the alternate tileset via the picker only repoints the field.
 await run(`$('bgTileLibraryToggle').click();$('bgAltList').children[1].click();`);
 assert.equal(await run(`return backgrounds[0].altTilesetId;`),'alt-tileset');

 // Picking tile 1 from the primary tile map loads its authored bank into the stamp.
 const pick=await run(`const r=$('bgTileMap').getBoundingClientRect();return {x:r.left+r.width*(1.5/16),y:r.top+r.height*(0.5/16)};`);
 click(pick.x,pick.y);
 await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`return {tile:$('bgStampTile').textContent,bank:$('bgBankLabel').textContent};`),{tile:'1',bank:'Bank 03'});

 // A background opens fitted to the window; these cell coordinates assume 100%.
 const canvas=await run(`$('bgPencilTool').click();$('bgActualSize').click();const r=$('bgCanvas').getBoundingClientRect();return {left:r.left,top:r.top};`);
 const at=(col,row)=>({x:canvas.left+col*8+4,y:canvas.top+row*8+4});

 // Dragging on the tile picker selects a multi-tile group; painting with it
 // stamps every tile at once, each keeping its own authored bank rather than
 // one bank forced across the whole group.
 await run(`
  const t=tilesets[0];
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,32,x,y,2);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,33,x,y,2);
  t.tilePaletteBanks[32]=5;t.tilePaletteBanks[33]=6;
 `);
 const groupFrom=await run(`const r=$('bgTileMap').getBoundingClientRect();return {x:r.left+r.width*(0.5/16),y:r.top+r.height*(2.5/16)};`);
 const groupTo=await run(`const r=$('bgTileMap').getBoundingClientRect();return {x:r.left+r.width*(1.5/16),y:r.top+r.height*(2.5/16)};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:groupFrom.x,y:groupFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:groupTo.x,y:groupTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:groupTo.x,y:groupTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return $('bgGroupLabel').hidden;`),false,'a dragged multi-tile pick must show the group label');

 // Saving that same region as a named Object in the tileset editor must make
 // it appear in the background editor's Objects list, reloadable with a click.
 await run(`showView('tiles');if($('bankMapToggle').getAttribute('aria-expanded')!=='true')$('bankMapToggle').click();`);
 const bankMapRect=await run(`const r=$('bankMap').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};`);
 const bmCell=bankMapRect.width/16;
 const bmFrom={x:bankMapRect.left+bmCell*0.5,y:bankMapRect.top+bmCell*2.5},bmTo={x:bankMapRect.left+bmCell*1.5,y:bankMapRect.top+bmCell*2.5};
 window.webContents.sendInputEvent({type:'mouseDown',x:bmFrom.x,y:bmFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:bmTo.x,y:bmTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:bmTo.x,y:bmTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 await run(`$('saveComposition').click();showView('backgrounds');`);
 await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`return {count:$('bgObjectList').children.length,text:$('bgObjectList').children[0]?.textContent};`),
  {count:1,text:'Object_1'},'the background editor must list the tileset\'s saved Objects');
 await run(`$('bgPickSlot').value='primary';$('bgPickSlot').dispatchEvent(new Event('change',{bubbles:true}));`);
 assert.equal(await run(`return $('bgGroupLabel').hidden;`),true,'switching the picked tileset slot must reset the group pick');
 await run(`$('bgObjectList').children[0].click();`);
 assert.equal(await run(`return $('bgGroupLabel').textContent;`),'Group 2 × 1 — each tile keeps its own bank','clicking a saved Object must reload its region as the current group pick');

 const gp=at(15,15);click(gp.x,gp.y);await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const a=backgrounds[0];return [{tile:a.cells[15*40+15].tile,bank:a.cells[15*40+15].paletteBank},{tile:a.cells[15*40+16].tile,bank:a.cells[15*40+16].paletteBank}];`),
  [{tile:32,bank:5},{tile:33,bank:6}],'painting a group must stamp each tile with its own authored bank');

 // The rectangle tool always stays single-tile, even with a group picked —
 // otherwise a drag would stamp the whole group at every covered cell.
 await run(`$('bgRectangleTool').click();`);
 const rFrom=at(20,15),rTo=at(21,15);
 window.webContents.sendInputEvent({type:'mouseDown',x:rFrom.x,y:rFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:rTo.x,y:rTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:rTo.x,y:rTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const a=backgrounds[0];return [a.cells[15*40+20].tile,a.cells[15*40+21].tile];`),[32,32],'the rectangle tool must stay single-tile with a group picked');

 // The eraser still clears one cell at a time, even with a group picked.
 await run(`$('bgPencilTool').click();$('bgEraserTool').click();`);
 click(gp.x,gp.y);await new Promise(r=>setTimeout(r,60));
 assert.deepEqual(await run(`const a=backgrounds[0];return [a.cells[15*40+15].tile,a.cells[15*40+16].tile];`),[0,33],'the eraser must clear a single cell even with a group picked');

 // Restore a single-tile pick so the drawing tests below are unaffected.
 await run(`$('bgPickSlot').value='primary';$('bgPickSlot').dispatchEvent(new Event('change',{bubbles:true}));$('bgPencilTool').click();`);
 click(pick.x,pick.y);await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return $('bgGroupLabel').hidden;`),true,'picking a single tile again must hide the group label');

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

 // The Select tool marks existing cells; Flip X/Y, Priority and a palette
 // bank click then edit them in place without repainting the tile.
 await run(`$('bgPencilTool').click();`);
 for(const [c,r] of [[25,2],[26,2],[25,3],[26,3]]){const q=at(c,r);click(q.x,q.y);}
 await new Promise(r=>setTimeout(r,60));
 await run(`$('bgSelectTool').click();`);
 const selFrom=at(25,2),selTo=at(26,3);
 window.webContents.sendInputEvent({type:'mouseDown',x:selFrom.x,y:selFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:selTo.x,y:selTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:selTo.x,y:selTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return $('bgSelectionLabel').textContent;`),
  'Selected 2 × 2 — flips, Priority and a palette bank edit these tiles in place');

 await run(`$('bgFlipX').click();`);
 assert.deepEqual(await run(`const a=backgrounds[0];return [[25,2],[26,2],[25,3],[26,3]].map(([c,r])=>({tile:a.cells[r*40+c].tile,flipX:a.cells[r*40+c].flipX}));`),
  [{tile:1,flipX:true},{tile:1,flipX:true},{tile:1,flipX:true},{tile:1,flipX:true}],'Flip X must flip every selected cell without changing its tile');
 assert.deepEqual(await run(`return backgrounds[0].cells[0];`),{tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false},'a cell outside the selection must be untouched');

 await run(`[...$('bgSwatches').querySelectorAll('.paletteGroup')][7].click();`);
 assert.deepEqual(await run(`const a=backgrounds[0];return [[25,2],[26,3]].map(([c,r])=>({tile:a.cells[r*40+c].tile,bank:a.cells[r*40+c].paletteBank}));`),
  [{tile:1,bank:7},{tile:1,bank:7}],'a palette bank click must set every selected cell\'s bank without changing its tile');
 await run(`$('bgUndo').click();`);
 assert.equal(await run(`return backgrounds[0].cells[2*40+25].paletteBank;`),3,'undo must revert a batch attribute edit as one step');

 await run(`$('bgSelectionClear').click();`);
 assert.equal(await run(`return $('bgSelectionLabel').hidden;`),true,'the Clear selection button must hide the selection');
 window.webContents.sendInputEvent({type:'mouseDown',x:selFrom.x,y:selFrom.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:selTo.x,y:selTo.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:selTo.x,y:selTo.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return $('bgSelectionLabel').hidden;`),true,'Escape must also clear the selection');
 await run(`$('bgPencilTool').click();`);

 // Hovering a tile outlines, in the palette dock, its bank and the color
 // under the pointer; leaving the canvas clears both.
 const hoverMarks=async(x,y)=>{window.webContents.sendInputEvent({type:'mouseMove',x,y});await new Promise(r=>setTimeout(r,60));
  return run(`return {banks:[...$('bgSwatches').querySelectorAll('.hoverBank')].map(r=>Number(r.dataset.palette)),colors:[...$('bgSwatches').querySelectorAll('.hoverColor')].map(s=>s.dataset.palette+':'+s.dataset.ink)};`);};
 assert.deepEqual(await hoverMarks(at(25,2).x,at(25,2).y),{banks:[3],colors:['3:2']},'hovering a tile must outline its bank and the color under the pointer');
 assert.deepEqual(await hoverMarks(at(10,10).x,at(10,10).y),{banks:[0],colors:['0:0']},'a blank cell (erased above) draws color 0 of bank 0');
 assert.deepEqual(await hoverMarks(canvas.left-20,canvas.top-20),{banks:[],colors:[]},'leaving the canvas must clear the hover marks');

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

 // The Status panel is closed by default and opens like the other two rail
 // panels; its legend ties each rectangle's color to what it means.
 await run(`$('bgStatusToggle').click();`);
 assert.deepEqual(await run(`return {expanded:$('bgStatusToggle').getAttribute('aria-expanded'),legend:[...document.querySelectorAll('.bgLegendSwatch')].map(s=>s.className)};`),
  {expanded:'true',legend:['bgLegendSwatch bgLegendWindow','bgLegendSwatch bgLegendScreen']});

 // Dragging the loaded-window handle moves its origin and must update the
 // Status panel live, the same as dragging the screen handle already does.
 const beforeWindow=await run(`return $('bgCamWindow').textContent;`);
 const windowHandle=await run(`const r=$('bgViewportHandle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:windowHandle.x,y:windowHandle.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:windowHandle.x+8,y:windowHandle.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:windowHandle.x+8,y:windowHandle.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const afterWindow=await run(`return $('bgCamWindow').textContent;`);
 assert.notEqual(afterWindow,beforeWindow,'dragging the loaded-window handle must update the Status panel live');
 // Drag it back so the origin doesn't affect the checks below.
 const movedHandle=await run(`const r=$('bgViewportHandle').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:movedHandle.x,y:movedHandle.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:movedHandle.x-8,y:movedHandle.y,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:movedHandle.x-8,y:movedHandle.y,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 assert.equal(await run(`return $('bgCamWindow').textContent;`),beforeWindow);

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

 // A background much bigger than the window must scroll within #bgStage —
 // not grow #bgWork past its allotted space, which would push the toolbar
 // (and its zoom controls) out of reach with no way to scroll back to it.
 const big=await run(`$('bgWidth').value=200;$('bgHeight').value=150;$('bgResize').click();const s=$('bgStage');return {contained:s.clientWidth<s.scrollWidth&&s.clientHeight<s.scrollHeight,zoomInWithinWindow:$('bgZoomIn').getBoundingClientRect().right<=innerWidth};`);
 assert.deepEqual(big,{contained:true,zoomInWithinWindow:true},'a background bigger than the window must scroll inside #bgStage, leaving the toolbar reachable');

 // The Pan tool scrolls #bgStage on drag instead of painting.
 await run(`$('bgPanTool').click();`);
 const panBefore=await run(`return {left:$('bgStage').scrollLeft,top:$('bgStage').scrollTop,cells:JSON.stringify(backgrounds[0].cells)};`);
 const stageCenter=await run(`const r=$('bgStage').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:stageCenter.x,y:stageCenter.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:stageCenter.x-50,y:stageCenter.y-30,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:stageCenter.x-50,y:stageCenter.y-30,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,60));
 const panAfter=await run(`return {left:$('bgStage').scrollLeft,top:$('bgStage').scrollTop,cellsUnchanged:JSON.stringify(backgrounds[0].cells)===${JSON.stringify(panBefore.cells)}};`);
 assert.deepEqual(panAfter,{left:panBefore.left+50,top:panBefore.top+30,cellsUnchanged:true},'the Pan tool must scroll the stage and must not paint');
 await run(`$('bgPencilTool').click();$('bgWidth').value=50;$('bgHeight').value=25;$('bgResize').click();`);

 // Docked-panel bounds at two window widths: a panel docks beside the canvas
 // area — left or right — and the canvas scrolls inside what is left.
 for(const width of [1440,1024]){
  window.setSize(width,900);await new Promise(r=>setTimeout(r,150));
  for(const toggle of ['bgLibraryToggle','bgTileLibraryToggle','bgStatusToggle']){
   await run(`if($('${toggle}').getAttribute('aria-expanded')!=='true')$('${toggle}').click();`);await new Promise(r=>setTimeout(r,80));
   const bounds=await run(`const panel=$($('${toggle}').getAttribute('aria-controls')).getBoundingClientRect(),main=document.querySelector('#backgroundEditor main').getBoundingClientRect(),stage=$('bgStage').getBoundingClientRect();return {clear:panel.right<=main.left||panel.left>=main.right,canvasWithin:stage.left>=main.left&&stage.right<=main.right+1};`);
   assert.equal(bounds.clear,true);assert.equal(bounds.canvasWithin,true);
  }
  if(process.env.STUDIO_CAPTURE_DIR)fs.writeFileSync(path.join(process.env.STUDIO_CAPTURE_DIR,`background-${width}.png`),(await window.webContents.capturePage()).toPNG());
 }

 const data=await run(`return studioProject();`);
 const {validateProject}=await import('../dist/packages/assets/index.js');validateProject(data);
 assert.deepEqual(errors,[]);console.log('desktop background: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
