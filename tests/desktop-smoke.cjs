const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});
 ipcMain.handle('bank:import',()=>({name:'Imported',mode:3,chr:Array(6144).fill(42)}));
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 try {
  await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));
  const state=await window.webContents.executeJavaScript(`(() => {
   bankBpp[0]=3; setPixelIndex(0,0,0,0,5); redrawAll();
   const p=studioProject();
   return {empty:p.bankAssets.length,bridge:typeof window.studio.save,pixel:pixelIndex(0,0,0,0),banks:p.modes.length,painted:p.chr[0],title:document.title};
  })()`);
  assert.equal(state.empty,0);assert.equal(state.bridge,'function');assert.equal(state.pixel,5);assert.equal(state.banks,8);assert.equal(state.painted,1);assert.equal(state.title,'Clementina Studio');
  const sprite=await window.webContents.executeJavaScript(`(() => {
   showView('animations');$('addAnimation').click(); $('quadParts').click(); $('duplicateFrame').click();
   $('frameTicks').value='12';$('frameTicks').dispatchEvent(new Event('change'));
   $('spriteParts').querySelector('input').value='23';$('spriteParts').querySelector('input').dispatchEvent(new Event('change'));
   const before=studioProject();$('spriteUndo').click();const after=studioProject();
   $('playAnimation').click();const started=playing;$('playAnimation').click();
   $('spritePanel').scrollIntoView();
   return {before:before.animations,after:after.animations,started,stopped:!playing,rows:$('spriteParts').children.length,dirty};
  })()`);
  assert.equal(sprite.before[0].frames.length,2);assert.equal(sprite.before[0].frames[1].ticks,12);
  assert.equal(sprite.before[0].frames[1].parts[0].tile,23);assert.equal(sprite.after[0].frames[1].parts[0].tile,0);
  assert.deepEqual(sprite.after[0].frames[0].parts.map(p=>[p.tile,p.x,p.y]),[[0,0,0],[1,8,0],[16,0,8],[17,8,8]]);
  assert.equal(sprite.rows,4);assert.ok(sprite.started&&sprite.stopped&&sprite.dirty);
  const workflow=await window.webContents.executeJavaScript(`(() => {
   showView('sprites');$('addAnimation').click();$('quadParts').click();
   const staticCount=studioProject().sprites.length;
   showView('animations');$('useSpriteFrame').click();
   const copied=studioProject().animations[0].frames[0].parts.length;
   showView('build');const buildVisible=!$('buildPanel').hidden&&$('spritePanel').hidden;
   showView('palettes');const paletteVisible=!$('paletteHost').hidden&&$('graphicsMain').hidden;
   showView('sprites');
   return {staticCount,copied,buildVisible,paletteVisible,singleFrame:studioProject().sprites[0].frames.length};
  })()`);
  assert.equal(workflow.staticCount,1);assert.equal(workflow.singleFrame,1);assert.equal(workflow.copied,4);assert.ok(workflow.buildVisible&&workflow.paletteVisible);
  const bankResult=await window.webContents.executeJavaScript(`(() => {
   showView('tiles');for(let i=0;i<10;i++)$('addBankFile').click();
   document.querySelector('[aria-label="Objects & tile map"]').click();const map=$('bankMap'),canvas=$('bankSelection');map.setPointerCapture=()=>{};canvas.setPointerCapture=()=>{};
   const mr=map.getBoundingClientRect();
   function pointer(el,type,x,y){el.dispatchEvent(new PointerEvent(type,{clientX:x,clientY:y,pointerId:1,bubbles:true,button:0}));}
   pointer(map,'pointerdown',mr.left+2,mr.top+2);pointer(map,'pointermove',mr.left+5*(mr.width/16)+2,mr.top+5*(mr.width/16)+2);pointer(map,'pointerup',mr.left+5*(mr.width/16)+2,mr.top+5*(mr.width/16)+2);
   const house=$('bankSelectionInfo').textContent;
   pointer(map,'pointerdown',mr.left+2,mr.top+2);pointer(map,'pointermove',mr.left+(mr.width/16)+2,mr.top+5*(mr.width/16)+2);pointer(map,'pointerup',mr.left+(mr.width/16)+2,mr.top+5*(mr.width/16)+2);
   const character=$('bankSelectionInfo').textContent;
   document.querySelector('[aria-label="Objects & tile map"]').click();const cr=canvas.getBoundingClientRect();pointer(canvas,'pointerdown',cr.left+7*8+2,cr.top+2);pointer(canvas,'pointermove',cr.left+9*8+2,cr.top+2);pointer(canvas,'pointerup',cr.left+9*8+2,cr.top+2);
   pointer(canvas,'pointermove',cr.left+9*8+2,cr.top+2);
   $('bankSwatches').querySelector('[data-palette="3"][data-ink="1"]').click();
   const unchanged=studioProject().bankAssets.at(-1).cellPalettes[1]===0;
   pointer(canvas,'pointerleave',cr.right+1,cr.top);
   const noHoverHighlight=!$('bankSwatches').querySelector('.activePalette');
   pointer(canvas,'pointermove',cr.left+9*8+2,cr.top+2);
   const preservedInk=$('bankSwatches').querySelector('.chosenColor').dataset.palette==='3'&&$('bankSwatches').querySelector('.chosenColor').dataset.ink==='1';
   pointer(canvas,'pointerdown',cr.left+9*8+2,cr.top+2);pointer(canvas,'pointerup',cr.left+9*8+2,cr.top+2);
   const a=studioProject().bankAssets.at(-1),count=studioProject().bankAssets.length;
   return {unchanged,noHoverHighlight,preservedInk,house,character,left:a.chr[0],right:a.chr[8],palette:a.cellPalettes[1],other:a.cellPalettes[0],count};
  })()`);
  assert.ok(bankResult.unchanged&&bankResult.noHoverHighlight&&bankResult.preservedInk);assert.match(bankResult.house,/6 × 6 tiles/);assert.match(bankResult.character,/2 × 6 tiles/);
  assert.equal(bankResult.left,128);assert.equal(bankResult.right,3);assert.equal(bankResult.palette,3);assert.equal(bankResult.other,0);assert.ok(bankResult.count>8);
  const toolsResult=await window.webContents.executeJavaScript(`(() => {
   const canvas=$('bankSelection'),map=$('bankMap'),mr=map.getBoundingClientRect();
   const pointer=(el,type,x,y)=>el.dispatchEvent(new PointerEvent(type,{clientX:x,clientY:y,pointerId:1,bubbles:true,button:0}));
   $('saveComposition').click();const rename=$('compositionList').querySelector('input');rename.value='Character';rename.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   const created=studioProject().bankAssets.at(-1).compositions.length;
   const before=JSON.stringify(studioProject().bankAssets.at(-1).chr);
   const originalConfirm=window.confirm;window.confirm=()=>false;$('deleteComposition').click();
   const canceled=studioProject().bankAssets.at(-1).compositions.length===1;
   window.confirm=()=>true;$('deleteComposition').click();
   const intact=before===JSON.stringify(studioProject().bankAssets.at(-1).chr);
   $('zoomIn').click();const zoomed=canvas.width;$('zoomOut').click();const normal=canvas.width;
   $('previewBackground').value='#112233';$('previewBackground').dispatchEvent(new Event('change'));
   const palBefore=JSON.stringify(studioProject().bankAssets.at(-1).palettes);
   const background=studioProject().bankAssets.at(-1).previewBackground;
   // Fill an empty new bank through the drawing tool, then undo it.
   $('addBankFile').click();$('fillTool').click();
   const cr=canvas.getBoundingClientRect();pointer(canvas,'pointerdown',cr.left+2,cr.top+2);pointer(canvas,'pointerup',cr.left+2,cr.top+2);
   const filled=studioProject().bankAssets.at(-1).chr[0]===255;
   $('bankUndo').click();const undone=studioProject().bankAssets.at(-1).chr[0]===0;
   const count=studioProject().bankAssets.length;window.confirm=()=>false;$('deleteBankFile').click();const bankCancel=studioProject().bankAssets.length===count;
   window.confirm=()=>true;$('deleteBankFile').click();const bankDeleted=studioProject().bankAssets.length===count-1;
   window.confirm=originalConfirm;
   return {created,canceled,intact,zoomed,normal,background,filled,undone,bankCancel,bankDeleted};
  })()`);
  assert.equal(toolsResult.created,1);assert.ok(toolsResult.canceled&&toolsResult.intact);assert.equal(toolsResult.zoomed,toolsResult.normal*2);
  assert.equal(toolsResult.background,'#112233');assert.ok(toolsResult.filled&&toolsResult.undone&&toolsResult.bankCancel&&toolsResult.bankDeleted);
  const imported=await window.webContents.executeJavaScript(`(async()=>{
   $('importBankFile').click();
   for(let n=0;n<100&&!studioProject().bankAssets.some(a=>a.name==='Imported');n++)await new Promise(r=>setTimeout(r,10));
   const a=studioProject().bankAssets.at(-1);
   const swatch=$('bankSwatches').querySelector('[data-palette="0"][data-ink="1"]');
   const oldClick=$('bankColor').click;$('bankColor').click=()=>{};
   swatch.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));$('bankColor').value='#ff0000';$('bankColor').dispatchEvent(new Event('change'));$('bankColor').click=oldClick;
   return {name:a.name,byte:a.chr[0],color:studioProject().bankAssets.at(-1).palettes[1]};
  })()`);
  assert.equal(imported.name,'Imported');assert.equal(imported.byte,42);assert.equal(imported.color,0xf800);
  const polish=await window.webContents.executeJavaScript(`(async()=>{
   $('addBankFile').click();const bank=studioProject().bankAssets.at(-1);
   const row=$('bankFiles').lastElementChild;row.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));let input=row.querySelector('input');input.value='Shapes';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   row.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));input=row.querySelector('input');input.value='Abandoned';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   const name=studioProject().bankAssets.at(-1).name;
   const canvas=$('bankSelection'),scroll=canvas.parentElement;
   function ptr(type,x,y){const r=canvas.getBoundingClientRect(),scale=Number($('zoomLabel').textContent.replace('×',''));canvas.dispatchEvent(new PointerEvent(type,{clientX:r.left+x*scale+1,clientY:r.top+y*scale+1,pointerId:1,bubbles:true,button:0}));}
   $('rectangleTool').click();const before=JSON.stringify(studioProject().bankAssets.at(-1).chr);ptr('pointerdown',1,1);ptr('pointermove',6,6);
   const previewOnly=before===JSON.stringify(studioProject().bankAssets.at(-1).chr);ptr('pointerup',6,6);
   let a=studioProject().bankAssets.at(-1);const rectTop=a.chr[1],rectMid=a.chr[3];
   $('bankUndo').click();const undone=before===JSON.stringify(studioProject().bankAssets.at(-1).chr);
   $('ellipseTool').click();ptr('pointerdown',1,1);ptr('pointermove',6,6);ptr('pointercancel',6,6);const canceled=before===JSON.stringify(studioProject().bankAssets.at(-1).chr);
   ptr('pointerdown',1,1);ptr('pointermove',6,6);ptr('pointerup',6,6);const ellipse=studioProject().bankAssets.at(-1).chr.some(v=>v!==0);
   $('miniatureToggle').click();const mini=$('miniatureCanvas'),widthBefore=mini.width;
   const r=canvas.getBoundingClientRect(),oldZoom=Number($('zoomLabel').textContent.replace('×',''));
   scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:r.left+10,clientY:r.top+10,bubbles:true,cancelable:true}));const zoomIn=Number($('zoomLabel').textContent.replace('×',''));
   await new Promise(r=>setTimeout(r,80));scroll.dispatchEvent(new WheelEvent('wheel',{deltaY:100,clientX:r.left+10,clientY:r.top+10,bubbles:true,cancelable:true}));const zoomBack=Number($('zoomLabel').textContent.replace('×',''));
   $('pencilTool').click();$('bankSwatches').querySelector('[data-palette="0"][data-ink="1"]').click();ptr('pointerdown',0,0);ptr('pointerup',0,0);
   const miniPixel=Array.from(mini.getContext('2d').getImageData(0,0,1,1).data);
   return {name,previewOnly,rectTop,rectMid,undone,canceled,ellipse,oldZoom,zoomIn,zoomBack,widthBefore,miniWidth:mini.width,miniPixel,iconOnly:[...$('drawingTools').children].every(b=>b.querySelector('svg')&&b.textContent===''),noColorChip:!$('drawingColor')};
  })()`);
  assert.equal(polish.name,'Shapes');assert.ok(polish.previewOnly&&polish.undone&&polish.canceled&&polish.ellipse);
  assert.equal(polish.rectTop,126);assert.equal(polish.rectMid,66);assert.equal(polish.zoomIn,polish.oldZoom*2);assert.equal(polish.zoomBack,polish.oldZoom);
  assert.equal(polish.miniWidth,polish.widthBefore);assert.equal(polish.miniPixel[3],255);assert.ok(polish.iconOnly&&polish.noColorChip);
  const clipboard=await window.webContents.executeJavaScript(`(()=>{
   const sw=(p,i)=>$('bankSwatches').querySelector('[data-palette="'+p+'"][data-ink="'+i+'"]');
   const a=()=>studioProject().bankAssets.at(-1);
   sw(0,1).click();const color=a().palettes[1],attrs=JSON.stringify(a().cellPalettes);$('copyColor').click();sw(4,2).click();const old=a().palettes[34];$('pasteColor').click();
   const colorCopied=a().palettes[34]===color&&JSON.stringify(a().cellPalettes)===attrs;$('bankUndo').click();const colorUndo=a().palettes[34]===old;
   const transparent=sw(0,0).style.background.includes('gradient'),noRow=!$('bankSwatches').querySelector('.selectedPalette');
   $('addBankFile').click();sw(0,1).click();$('pencilTool').click();
   const canvas=$('bankSelection');function ptr(type,x,y){const r=canvas.getBoundingClientRect(),z=Number($('zoomLabel').textContent.replace('×',''));canvas.dispatchEvent(new PointerEvent(type,{clientX:r.left+x*z+1,clientY:r.top+y*z+1,pointerId:1,bubbles:true,button:0}));}
   function dot(x,y){ptr('pointerdown',x,y);ptr('pointerup',x,y);}
   dot(0,0);dot(1,1);sw(0,2).click();dot(4,4);dot(5,4);dot(4,5);dot(5,5);
   const before=JSON.stringify(a().chr),palettes=JSON.stringify(a().cellPalettes);
   $('selectionTool').click();ptr('pointerdown',0,0);ptr('pointermove',1,1);ptr('pointerup',1,1);$('copyPixels').click();$('pastePixels').click();ptr('pointermove',4,4);
   const preview=before===JSON.stringify(a().chr);ptr('pointerdown',4,4);ptr('pointerup',4,4);
   const pixel=(x,y)=>[0,1,2].reduce((v,p)=>v|(((a().chr[p*2048+y]>>x)&1)<<p),0);
   const pasted=[pixel(4,4),pixel(5,4),pixel(4,5),pixel(5,5)],samePalettes=palettes===JSON.stringify(a().cellPalettes);
   $('bankUndo').click();const undo=before===JSON.stringify(a().chr);$('pastePixels').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const canceled=before===JSON.stringify(a().chr);
   return {colorCopied,colorUndo,transparent,noRow,preview,pasted,samePalettes,undo,canceled};
  })()`);
  assert.deepEqual(clipboard.pasted,[1,2,2,1]);for(const [key,value] of Object.entries(clipboard))if(key!=='pasted')assert.ok(value,key);
  const phase=await window.webContents.executeJavaScript(`(()=>{
   const canvas=$('bankSelection'),a=()=>studioProject().bankAssets.at(-1);function ptr(type,x,y){const r=canvas.getBoundingClientRect(),z=Number($('zoomLabel').textContent.replace('×',''));canvas.dispatchEvent(new PointerEvent(type,{clientX:r.left+(x+.5)*z,clientY:r.top+(y+.5)*z,pointerId:1,bubbles:true,button:0}));}
   const pix=(x,y)=>[0,1,2].reduce((v,p)=>v|(((a().chr[p*2048+Math.floor(y/8)*128+Math.floor(x/8)*8+y%8]>>(x%8))&1)<<p),0);
   const select=(x,y,x1,y1)=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));$('selectionTool').click();ptr('pointerdown',x,y);ptr('pointermove',x1,y1);ptr('pointerup',x1,y1);};
   select(0,0,1,1);$('flipHorizontal').click();const flipped=pix(1,0)===1&&pix(0,1)===1&&pix(0,0)===0;$('bankUndo').click();
   $('rotateSelection').click();const rotated=pix(1,0)===1&&pix(0,1)===1;$('bankUndo').click();
   ptr('pointerdown',0,0);ptr('pointermove',2,2);const preview=pix(0,0)===1;ptr('pointerup',2,2);const moved=pix(0,0)===0&&pix(2,2)===1&&pix(3,3)===1;$('bankUndo').click();
   select(0,0,1,1);document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));const nudged=pix(1,0)===1&&pix(2,1)===1;$('bankUndo').click();
   select(0,0,1,1);$('copyPixels').click();$('pasteOpaque').checked=true;$('pastePixels').click();ptr('pointermove',4,4);ptr('pointerdown',4,4);ptr('pointerup',4,4);const opaque=pix(5,4)===0&&pix(4,5)===0;$('bankUndo').click();$('pasteOpaque').checked=false;
   $('filledShapes').checked=true;$('rectangleTool').click();ptr('pointerdown',8,8);ptr('pointermove',11,11);ptr('pointerup',11,11);const filled=pix(9,9)!==0;$('bankUndo').click();
   $('ellipseTool').click();ptr('pointerdown',8,8);ptr('pointermove',12,12);ptr('pointerup',12,12);const ellipseFilled=pix(10,10)!==0;$('bankUndo').click();
   ptr('pointermove',3,4);const status=$('drawingStatus').textContent.includes('Pixel 3, 4')&&$('drawingStatus').textContent.includes('Selection');
   $('actualSize').click();const actual=$('zoomLabel').textContent==='1×';$('fitDrawing').click();const fits=canvas.width<=canvas.parentElement.clientWidth&&canvas.height<=canvas.parentElement.clientHeight;
   select(0,0,1,1);$('copyPixels').click();const source=a().palettes.slice(0,8);ensureBankAssets().at(-1).palettes[1]=12345;document.dispatchEvent(new KeyboardEvent('keydown',{key:'V',ctrlKey:true,shiftKey:true,bubbles:true}));const shortcutSource=$('pasteSource').checked;ptr('pointermove',8,0);const noMutation=a().cellPalettes[1]===0;ptr('pointerdown',8,0);ptr('pointerup',8,0);const paletteImported=a().cellPalettes[1]!==0&&source.every((v,i)=>v===a().palettes[a().cellPalettes[1]*8+i]);$('bankUndo').click();document.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,bubbles:true}));const shortcutRegular=!$('pasteSource').checked;document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
   for(let i=0;i<3;i++)$('zoomIn').click();const sc=canvas.parentElement;sc.setPointerCapture=()=>{};sc.scrollTop=100;const oldScroll=sc.scrollTop,beforePan=JSON.stringify(a().chr);document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));ptr('pointerdown',1,1);ptr('pointermove',1,0);ptr('pointerup',1,0);document.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}));const panned=sc.scrollTop>oldScroll&&beforePan===JSON.stringify(a().chr);$('fitDrawing').click();
   return {flipped,rotated,preview,moved,nudged,opaque,filled,ellipseFilled,status,actual,fits,noMutation,paletteImported,panned,shortcutSource,shortcutRegular};
  })()`);for(const [key,value] of Object.entries(phase))assert.ok(value,key);
  const finishing=await window.webContents.executeJavaScript(`(()=>{
   const before=JSON.stringify(studioProject());document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));const all=$('drawingStatus').textContent.includes('Selection 16 × 48');
   const canvas=$('bankSelection'),r=canvas.getBoundingClientRect(),z=Number($('zoomLabel').textContent.replace('×',''));canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+.5,clientY:r.top+.5,pointerId:1,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+2.5*z,clientY:r.top+2.5*z,pointerId:1,bubbles:true}));canvas.dispatchEvent(new PointerEvent('pointerup',{clientX:r.left+2.5*z,clientY:r.top+2.5*z,pointerId:1,bubbles:true}));const resized=$('drawingStatus').textContent.includes('Selection 14 × 46');
   const counts=[...document.querySelectorAll('.paletteUsage')].map(b=>Number(b.textContent)||0);const total=counts.reduce((a,b)=>a+b,0);const usage=document.querySelector('.paletteUsage');usage.dispatchEvent(new MouseEvent('mouseenter'));const mapShown=!$('drawingFlyout').hidden;usage.dispatchEvent(new MouseEvent('mouseleave'));
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'?',bubbles:true}));const help=$('shortcutHelp').open;$('shortcutHelp').close();
   const unchanged=before===JSON.stringify(studioProject());const snapshot=studioProject();restoreStudioProject(snapshot);markDirty();const restored=JSON.stringify(snapshot)===JSON.stringify(studioProject())&&dirty;
   return {all,resized,total,mapShown,help,unchanged,restored};
  })()`);assert.equal(finishing.total,256);for(const [key,value] of Object.entries(finishing))if(key!=='total')assert.ok(value,key);
  const composed=await window.webContents.executeJavaScript(`(()=>{
   showView('sprites');$('scNew').click();const a=()=>sprites[animationIndex];
   const b=ensureBankAssets()[0];b.chr[0]=255;b.compositions=[{name:'Pair',x:0,y:0,width:2,height:1}];renderSprites();
   $('scObjects').value='1';$('scObjects').dispatchEvent(new Event('change'));
   const c=$('scCanvas');c.setPointerCapture=()=>{};
   function ptr(type,x,y,shift=false){const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent(type,{clientX:r.left+r.width/2+x,clientY:r.top+r.height/2+y,pointerId:1,bubbles:true,shiftKey:shift,button:0}));}
   $('scPlace').click();ptr('pointerdown',0,0);ptr('pointerup',0,0);
   const placed=a().frames[0].parts.length===2&&a().frames[0].parts.every(p=>p.bankId===b.id);
   $('scX').value='-3';$('scX').dispatchEvent(new Event('change'));$('scY').value='5';$('scY').dispatchEvent(new Event('change'));const free=a().frames[0].parts[0].x===-3&&a().frames[0].parts[1].x===5;
   const absolute=a().frames[0].parts.map(p=>[p.x+(a().originX||0),p.y+(a().originY||0)]);
   document.querySelector('[data-origin="bottom-center"]').click();const anchored=a().frames[0].parts.every((p,i)=>p.x+a().originX===absolute[i][0]&&p.y+a().originY===absolute[i][1]);
   const original=a().frames[0].parts.map(p=>p.x);$('scFlipX').click();const flipped=a().frames[0].parts[0].x===original[1]&&a().frames[0].parts.every(p=>p.flipX);$('scUndo').click();$('scRedo').click();const redone=a().frames[0].parts.every(p=>p.flipX);
   document.dispatchEvent(new KeyboardEvent('keydown',{key:'a',ctrlKey:true,bubbles:true}));const x=a().frames[0].parts[0].x;document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));const nudged=a().frames[0].parts[0].x===x+1;
   const id=b.id;b.name='RenamedSource';renderSprites();const reference=a().frames[0].parts.every(p=>p.bankId===id)&&$('scParts').textContent.includes('RenamedSource');
   $('scNew').click();$('scPlace').click();ptr('pointerdown',0,0);ptr('pointerup',0,0);const initial=a().frames[0].parts[0].x,z=Number($('scZoomLabel').textContent.replace('×',''));
   ptr('pointerdown',z,z);ptr('pointermove',4*z,3*z);ptr('pointerup',4*z,3*z);const dragged=a().frames[0].parts[0].x===initial+3;
   $('scUndo').click();$('scSnap').checked=true;ptr('pointerdown',z,z);ptr('pointermove',6*z,z);ptr('pointerup',6*z,z);const snapped=a().frames[0].parts[0].x===initial+8;$('scSnap').checked=false;
   const dt=new DataTransfer();dt.setData('application/x-clementina-tiles','selection');const cr=c.getBoundingClientRect();c.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,clientX:cr.left+cr.width/2,clientY:cr.top+cr.height/2,bubbles:true}));const dropped=a().frames[0].parts.length===4;
   $('scPalettes').children[3].click();const paletteAssigned=a().frames[0].parts.slice(2).every(p=>p.palette===3);
   $('scParts').children[0].click();const firstPart=structuredClone(a().frames[0].parts[0]);$('scFront').click();const ordered=JSON.stringify(a().frames[0].parts.at(-1))===JSON.stringify(firstPart);
   const beforeResize=JSON.stringify(a().frames[0].parts);$('scWidth').value='1';$('scWidth').dispatchEvent(new Event('change'));const unclipped=JSON.stringify(a().frames[0].parts)===beforeResize;
   const saved=studioProject();restoreStudioProject(saved);const restored=JSON.stringify(saved.sprites)===JSON.stringify(studioProject().sprites);showView('sprites');$('scSprites').value=String(sprites.length-1);$('scSprites').dispatchEvent(new Event('change'));$('scFit').click();
   return {placed,free,anchored,flipped,redone,nudged,reference,dragged,snapped,dropped,paletteAssigned,ordered,unclipped,restored,visible:!$('spriteComposer').hidden&&$('spritePanel').hidden};
  })()`);for(const [key,value] of Object.entries(composed))assert.ok(value,key);
  await window.webContents.executeJavaScript("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  await require('node:fs/promises').writeFile('/tmp/clementina-studio-phase2.png',(await window.webContents.capturePage()).toPNG());
  console.log('Desktop smoke passed: tile painting, composite frame creation, duplication, timing edit, part edit, undo and playback controls.');
  const {installCloseGuard}=await import('../dist/apps/desktop/close-guard.js');
  installCloseGuard(window,{snapshot:()=>window.webContents.executeJavaScript('({dirty,project:studioProject()})'),decide:async()=> 'discard',save:async()=>false,unchanged:async()=>true,error:e=>{throw e;}});
  window.close();for(let i=0;i<100&&!window.isDestroyed();i++)await new Promise(r=>setTimeout(r,10));
  assert.ok(window.isDestroyed(),'Dirty Electron window must close after Discard');
  app.exit(0);
 }catch(error){console.error(error);app.exit(1);}
});
