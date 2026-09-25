const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
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
 const pointer=await run(`const r=$('anCanvas').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),width:r.width,history:shapeHistory.length,dx:animations[0].frames[0].dx};`);
 window.webContents.sendInputEvent({type:'mouseDown',x:pointer.x,y:pointer.y,button:'left',clickCount:1});
 window.webContents.sendInputEvent({type:'mouseMove',x:pointer.x+32,y:pointer.y+16,button:'left'});
 window.webContents.sendInputEvent({type:'mouseUp',x:pointer.x+32,y:pointer.y+16,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,80));
 assert.equal(await run(`return shapeHistory.length;`),pointer.history+1);
 assert.ok(await run(`return animations[0].frames[0].dx>12;`));
 await run(`$('anUndo').click();`);
 assert.equal(await run(`return animations[0].frames[0].dx;`),12);
 // Reordering by drop uses the same undoable model operation as the buttons.
 const order=await run(`return animations[0].frames.map(f=>f.shapeId);`);
 await run(`const transfer=new DataTransfer();transfer.setData('application/x-clementina-frame','0');$('anTimeline').children[2].dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));`);
 assert.deepEqual(await run(`return animations[0].frames.map(f=>f.shapeId);`),[order[1],order[2],order[0]]);
 await run(`$('anUndo').click();`);
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
