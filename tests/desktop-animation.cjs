const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 const key=async(keyCode,modifiers=[])=>{window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await new Promise(r=>setTimeout(r,60));};
 try{
 await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));
 await run(`showView('tiles');$('addBankFile').click();const t=tilesets[0];t.name='Characters';for(let y=0;y<8;y++)for(let x=0;x<8;x++)setTilePixel(t,0,x,y,x===0||y===0?2:4);shapes=['Idle','Walk_A','Walk_B'].map((name,i)=>({id:'shape:'+i,name,tilesetId:t.id,sprites:[{tile:0,x:-8+i,y:-8,paletteBank:0,flipX:false,flipY:false},{tile:0,x:i,y:-8,paletteBank:0,flipX:false,flipY:false},{tile:0,x:-8+i,y:0,paletteBank:0,flipX:false,flipY:false},{tile:0,x:i,y:0,paletteBank:0,flipX:false,flipY:false}]}));tilesets.push({...structuredClone(t),id:'other-bank',name:'OtherBank'});shapes.push({id:'other',name:'Other',tilesetId:'other-bank',sprites:[]});showView('animations');$('anNew').click();`);
 assert.deepEqual(await run(`return {width:$('anCanvas').width,height:$('anCanvas').height,usable:$('anShapeList').children.length};`),{width:320,height:200,usable:3});

 // Double-clicking a list row turns it into a rename textbox; committing must
 // replace it with the new name rather than leaving the textbox stuck in place.
 await run(`$('anAnimList').children[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));`);
 assert.equal(await run(`return !!$('anAnimList').children[0].querySelector('input');`),true,'double-click must turn the row into a rename textbox');
 await run(`const input=$('anAnimList').children[0].querySelector('input');input.value='Walk_Cycle';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter'}));`);
 assert.deepEqual(await run(`return {name:animations[0].name,hasInput:!!$('anAnimList').children[0].querySelector('input'),text:$('anAnimList').children[0].textContent};`),
  {name:'Walk_Cycle',hasInput:false,text:'Walk_Cycle'},'committing a rename must swap the textbox back for text, not leave it stuck');

 const batch=await run(`$('anShapeLibraryToggle').click();const rows=$('anShapeList').children;rows[1].click();$('anShapeList').children[2].dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));$('anAppend').click();return animations[0].frames.map(f=>f.shapeId);`);
 assert.deepEqual(batch,['shape:0','shape:1','shape:2']);
 assert.equal(await run(`return $('anTimeline').children.length;`),3);
 await run(`$('anTimeline').children[2].click();$('anMoveEarlier').click();`);
 assert.deepEqual(await run(`return animations[0].frames.map(f=>f.shapeId);`),['shape:0','shape:2','shape:1']);
 await run(`$('anUndo').click();`);
 assert.deepEqual(await run(`return animations[0].frames.map(f=>f.shapeId);`),['shape:0','shape:1','shape:2']);
 await run(`$('anRedo').click();$('anTimeline').children[0].click();$('anNext').click();`);
 assert.equal(await run(`return frameIndex;`),1);
 await run(`$('anPlay').click();`);await new Promise(r=>setTimeout(r,160));
 assert.equal(await run(`return playing;`),true);
 await run(`$('anPlay').click();`);
 assert.equal(await run(`return playing;`),false);
 assert.equal(await run(`return frameIndex===playFrame;`),true);
 // Frame properties affect references, never mutate source shape sprite coordinates.
 const offset=await run(`$('anTimeline').children[0].click();const before=JSON.stringify(shapes);const dx=$('anFrames').querySelector('input[aria-label$="dx"]');dx.value='12';dx.dispatchEvent(new Event('change',{bubbles:true}));return {dx:animations[0].frames[0].dx,unchanged:JSON.stringify(shapes)===before};`);
 assert.deepEqual(offset,{dx:12,unchanged:true});
 // Exercise actual pointer capture and ensure a whole drag is one undo step.
 const pointer=await run(`const r=$('anCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:r.width,history:ProjectHistory.depth(),dx:animations[0].frames[0].dx};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:pointer.x,y:pointer.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:pointer.x+32,y:pointer.y+16,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:pointer.x+32,y:pointer.y+16,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,80));
 assert.equal(await run(`return ProjectHistory.depth();`),pointer.history+1);
 assert.ok(await run(`return animations[0].frames[0].dx>12;`));
 await run(`$('anUndo').click();`);
 assert.equal(await run(`return animations[0].frames[0].dx;`),12);
 // Reordering by drop uses the same undoable model operation as the buttons.
 const order=await run(`return animations[0].frames.map(f=>f.shapeId);`);
 await run(`const transfer=new DataTransfer();transfer.setData('application/x-clementina-frame','0');$('anTimeline').children[2].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));`);
 assert.deepEqual(await run(`return animations[0].frames.map(f=>f.shapeId);`),[order[1],order[2],order[0]]);
 await run(`$('anUndo').click();`);
 // A flip mirrors the frame's shape about its origin, then the offset moves
 // it: the tile's left edge (color 2) lands on the right of the left tile.
 await run(`$('anTimeline').children[0].click();`);
 const edges=()=>run(`const c=$('anCanvas').getContext('2d'),f=animations[0].frames[0],at=x=>Array.from(c.getImageData(160+(f.dx??0)+x,95+(f.dy??0),1,1).data).join();return [at(-8),at(-1)];`);
 const before=await edges(),shapesBefore=await run(`return JSON.stringify(shapes);`);
 assert.notEqual(before[0],before[1],'the probe must straddle the tile edge');
 await key('H',['shift']);
 const flipped=await run(`const b=$('anFlipX'),card=$('anTimeline').children[0];return {flipX:animations[0].frames[0].flipX,on:b.classList.contains('on'),pressed:b.getAttribute('aria-pressed'),mark:card.querySelectorAll('span')[1].textContent,label:card.getAttribute('aria-label').includes('flipped horizontally'),undo:$('anUndo').title.startsWith('Undo Flip the frame horizontally')};`);
 assert.deepEqual(flipped,{flipX:true,on:true,pressed:'true',mark:'6 ticks ↔',label:true,undo:true},'Shift+H must flip the selected frame, shown pressed and marked');
 assert.deepEqual(await edges(),[before[1],before[0]],'a horizontal flip must mirror the preview about the origin');
 assert.equal(await run(`return JSON.stringify(shapes);`),shapesBefore,'flipping a frame must not change its shape');
 await run(`$('anUndo').click();`);
 assert.equal(await run(`return 'flipX' in animations[0].frames[0];`),false,'undo must take the flip back off');
 const menu=await run(`const card=$('anTimeline').children[0],r=card.getBoundingClientRect();card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+5,clientY:r.top+5}));const m=document.querySelector('.studioMenu'),labels=[...m.querySelectorAll('button span')].map(s=>s.textContent);m.remove();return labels;`);
 assert.ok(menu.includes('Flip horizontally')&&menu.includes('Flip vertically'),'the frame menu must offer the flips');
 await run(`$('anFlipY').click();`);
 assert.deepEqual(await run(`return {flipY:animations[0].frames[0].flipY,on:$('anFlipY').classList.contains('on'),x:$('anFlipX').classList.contains('on')};`),{flipY:true,on:true,x:false});
 for(const width of [1440,1024]){
  window.setSize(width,900);await new Promise(r=>setTimeout(r,150));
  for(const toggle of ['anLibraryToggle','anShapeLibraryToggle']){
   await run(`if($('${toggle}').getAttribute('aria-expanded')!=='true')$('${toggle}').click();`);await new Promise(r=>setTimeout(r,80));
   const bounds=await run(`const panel=$($('${toggle}').getAttribute('aria-controls')).getBoundingClientRect(),main=document.querySelector('#animationEditor main').getBoundingClientRect(),canvas=$('anCanvas').getBoundingClientRect(),timeline=$('anTimeline').getBoundingClientRect();return {clear:panel.right<=main.left,canvas:canvas.left>=main.left&&canvas.right<=main.right,timeline:timeline.left>=main.left&&timeline.right<=main.right,stretch:Math.abs(timeline.width-main.width)<2,large:canvas.width};`);
   assert.equal(bounds.clear,true);assert.equal(bounds.canvas,true);assert.equal(bounds.timeline,true);assert.equal(bounds.stretch,true);assert.ok(bounds.large>=320);
  }
  if(process.env.STUDIO_CAPTURE_DIR)fs.writeFileSync(path.join(process.env.STUDIO_CAPTURE_DIR,`animation-${width}.png`),(await window.webContents.capturePage()).toPNG());
 }
 const data=await run(`return studioProject();`);
 const {validateProject}=await import('../dist/packages/assets/index.js');validateProject(data);
 assert.deepEqual(errors,[]);console.log('desktop animation: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
