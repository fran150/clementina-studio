// Tileset authoring. A tileset is one CHR bank's worth of graphics; its per-tile
// palette bank numbers are authoring intent, recorded alongside the pixels.
(() => {
 const host=document.createElement('section');host.id='namedBankEditor';
 host.innerHTML=`<aside class="bankLibrary"><h2>Tilesets</h2><div id="bankFileActions" class="assetToolbar"></div><div id="bankFiles" role="listbox" aria-label="Tilesets"></div></aside>
 <aside class="bankLibrary objectLibrary"><h2>Objects</h2><div id="compositionList" role="listbox" aria-label="Objects"></div><div class="bankActions"><button id="saveComposition">New</button><button id="deleteComposition">Delete</button></div></aside><div class="bankWork"><div id="emptyBank"></div><div id="bankEditorContents"><div class="bankActions"><label>Mode <select id="bankFileMode"><option value="3">3 bpp · 8 colors</option><option value="1">1 bpp · 2 colors</option></select></label><label id="bankFilePlaneLabel">Plane <select id="bankFilePlane"><option>0</option><option>1</option><option>2</option></select></label><button id="bankUndo">Undo</button><button id="bankRedo">Redo</button></div>
 <div class="bankCanvases"><div><h2>Tile map · drag to select tiles</h2><canvas id="bankMap" width="384" height="384"></canvas><p id="bankSelectionInfo"></p></div>
 <div class="selectionWork"><h2>Selected tiles</h2><div class="bankActions"><button id="pencilTool">Pencil</button><button id="fillTool">Fill</button><button id="zoomOut">−</button><span id="zoomLabel"></span><button id="zoomIn">+</button><label><input id="cellGrid" type="checkbox" checked>Tile grid</label></div><div class="selectionScroll"><canvas id="bankSelection"></canvas></div><p>Hover a tile to highlight the bank it was drawn against. Click a swatch to record that bank on the tile and choose your drawing color.</p></div></div>
 <section class="inlinePalettes"><div class="paletteDockHead"></div><div id="bankSwatches"></div><input id="bankColor" type="color" style="position:absolute;opacity:0;width:1px;height:1px"></section><div class="bankActions"><label>Preview background (color 0 / transparent) <input id="previewBackground" type="color" value="#252830"></label><span>Preview only — does not change exported palette colors.</span></div></div></div>`;
 // Inserted before the footer, not appended to #workspace, so the status bar
 // stays at the bottom of the page instead of landing above this section.
 $('spritePanel').after(host);
 const style=document.createElement('style');style.textContent=`.bankLibrary{width:210px;flex-shrink:0;background:var(--panel);padding:14px;border:1px solid var(--line);border-radius:8px}.bankLibrary select{width:100%;min-height:230px}.bankLibrary input{width:100%;margin-top:8px}.bankLibrary p,.bankWork p{color:var(--text-dim);font-size:11px;line-height:1.6}.bankWork{flex:1;min-width:0}.bankActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.bankCanvases{display:flex;flex-wrap:wrap;gap:22px}#bankMap{width:384px;height:384px;touch-action:none;cursor:crosshair}#bankSelection{image-rendering:pixelated;touch-action:none;cursor:crosshair}.selectionScroll{max-width:100%;max-height:520px;overflow:auto;background:#111}.selectionWork{flex:1;min-width:300px}#bankSwatches{display:flex;gap:5px}.inlinePalettes{padding:12px;background:var(--panel);border:1px solid var(--line);border-radius:8px;margin-top:16px}#namedBankEditor h2{font-size:12px;color:var(--text-dim)}#namedBankEditor input{background:var(--panel);color:var(--text);border:1px solid var(--line);padding:5px}#bankFiles option{padding:7px}#bankFiles{background:var(--bg)}`;style.textContent+=`.objectLibrary{width:160px}.bankLibrary{width:170px}#bankSwatches{display:grid;grid-template-columns:repeat(4,max-content);gap:2px 8px}.inlinePalettes{width:fit-content}.bankCanvases{gap:14px}#bankMap{width:320px;height:320px}.selectionWork{min-width:240px}.selectionScroll{max-height:450px}`;
 document.head.append(style);
 for(const [id,label,icon] of [['addBankFile','New tileset','newItem'],['copyBankFile','Duplicate tileset','duplicate'],['importBankFile','Import tileset…','import'],['deleteBankFile','Delete tileset','delete']])
  $('bankFileActions').append(StudioShell.iconButton(id,label,icon));
 const palettePanel=host.querySelector('.inlinePalettes');const canvasPanel=host.querySelector('.bankCanvases');canvasPanel.before(palettePanel);
 const backgroundRow=$('previewBackground').closest('.bankActions');canvasPanel.before(backgroundRow);
 let pixelSelection=null,selectStart=null,pixelClipboard=null,pasteAnchor=null,clipboardArea='pixels',lastPixel=[0,0];
 let fillPattern='solid';
 let usagePalette=null,resizeDrag=null;
 let moveDrag=null,spaceHeld=false,panDrag=null,panToolActive=false;
 let shapeStart=null,shapeEnd=null,miniVisible=true;
 let erasing=false,hovering=false,objectIndex=-1,targetTile=0,zoom=8,fittedArea=null,colorEdit={bank:0,ink:1};
 let plane=0,zoomControls=null;
 // Color 0 is a background tile’s background color and transparent for sprites.
 // Which of the two the canvas and the swatches show is a view choice.
 let zeroAsColor=false;
 let index=0,selection={x:0,y:0,width:1,height:1},palette=0,ink=1,tool='pencil',reference=null,anchor=null,stroke=null,last=null;
 const asset=()=>tilesets[index];
 // Colors live in the shared library, so history has to carry it alongside the
 // banks. Shapes keep their own history and are only folded in for the
 // rare edit that spans both, so ordinary drawing cannot revert sprite work.
 // Edits here, and in the palette library, which edits the same shared
 // state, go into the project's one history (history.js). Palettes travel
 // with every tileset edit because drawing records banks the active config
 // arranges; the rare edit that repoints sprite groups folds shapes in too.
 function remember(withGroups,label='Edit the tileset'){ProjectHistory.checkpoint(['tilesets','palettes',...(withGroups?['shapes','animations']:[])],label);}
 // An undo replaces the tilesets array; that is not a newly opened project.
 document.addEventListener('studiohistory',()=>{reference=tilesets;index=Math.max(0,Math.min(index,tilesets.length-1));});
 function changed(){markDirty();render();}
 // An edit's label names it in the history: mutate('Delete X', fn[, withGroups]).
 function mutate(...args){const label=typeof args[0]==='string'?args.shift():'Edit the tileset';const [fn,withGroups]=args;remember(withGroups,label);fn();changed();}
 function sample(a,t,x,y){let n=0;for(let p=0;p<3;p++)n|=((a.chr[p*2048+t*8+y]>>x)&1)<<p;return a.bpp===1?(n>>plane)&1:n;}
 function write(a,t,x,y,value){for(const p of a.bpp===1?[plane]:[0,1,2]){const pos=p*2048+t*8+y,bit=a.bpp===1?(value?1:0):(value>>p)&1;a.chr[pos]=(a.chr[pos]&~(1<<x))|(bit<<x);}}
 function selectedTiles(){const out=[];for(let y=selection.y;y<selection.y+selection.height;y++)for(let x=selection.x;x<selection.x+selection.width;x++)out.push(y*16+x);return out;}
 function render(){
  host.hidden=currentView!=='tiles';document.body.classList.toggle('drawingView',!host.hidden);if(host.hidden){hovering=false;return;}
  const list=tilesets;if(reference!==list){pixelSelection=null;pasteAnchor=null;selectStart=null;index=Math.min(index,list.length-1);reference=list;}
  if(index<0)index=0;const a=asset();if(a&&objectIndex>=a.compositions.length)objectIndex=-1;
  $('emptyBank').hidden=!!a;StudioShell.emptyEditor(host,!a);$('miniaturePanel').hidden=!a||!miniVisible;
  for(const id of ['copyBankFile','deleteBankFile','saveComposition','importBankImage'])$(id).disabled=!a;
  $('deleteComposition').disabled=!a||objectIndex<0;
  if(!a){if($('drawingStatus'))$('drawingStatus').textContent='';$('canvasStage').hidden=true;$('paletteDock').hidden=true;$('canvasTop').hidden=true;$('bankFiles').replaceChildren();$('compositionList').replaceChildren();return;}
  $('canvasStage').hidden=false;$('paletteDock').hidden=false;$('canvasTop').hidden=false;$('canvasAssetLabel').textContent=a.name+(objectIndex>=0?' / '+a.compositions[objectIndex].name:'');
  StudioShell.renderList($('bankFiles'),list,{selected:(t,i)=>i===index,choose:(t,i)=>selectBank(i),rename:renameBank,render,maxLength:48,duplicate:(t,i)=>{selectBank(i);$('copyBankFile').click();},remove:(t,i)=>{selectBank(i);$('deleteBankFile').click();}});
  $('bankFileMode').value=a.bpp;$('bankFilePlane').value=plane;$('bankFilePlaneLabel').hidden=a.bpp!==1;
  $('bankUndo').disabled=!ProjectHistory.canUndo();$('bankRedo').disabled=!ProjectHistory.canRedo();
  $('pencilTool').classList.toggle('on',tool==='pencil');$('eraserTool').classList.toggle('on',tool==='eraser');$('pickerTool').classList.toggle('on',tool==='picker');$('fillTool').classList.toggle('on',tool==='fill');zoomControls?.sync();
  $('panTool').classList.toggle('on',panToolActive);scroll.style.cursor=panToolActive?'grab':'';
  $('previewBackground').value=a.previewBackground??'#252830';
  $('zeroMode').value=zeroAsColor?'background':'transparent';$('previewBackground').disabled=zeroAsColor;backgroundRow.style.opacity=zeroAsColor?'.45':'';
  $('bankSelectionInfo').textContent=`${selection.width} × ${selection.height} tiles · ${selection.width*8} × ${selection.height*8} pixels`;
  const map=$('bankMap'),m=map.getContext('2d');
  for(let t=0;t<256;t++)for(let y=0;y<8;y++)for(let x=0;x<8;x++){m.fillStyle=pixelColor(a,t,x,y);m.fillRect((t%16*8+x)*3,(Math.floor(t/16)*8+y)*3,3,3);}
  m.strokeStyle='#ffffff30';m.lineWidth=1;for(let n=0;n<=16;n++){m.beginPath();m.moveTo(n*24,0);m.lineTo(n*24,384);m.moveTo(0,n*24);m.lineTo(384,n*24);m.stroke();}
  if(usagePalette!==null)for(let t=0;t<256;t++)if(a.tilePaletteBanks[t]===usagePalette){m.fillStyle='#36c9d650';m.fillRect(t%16*24,Math.floor(t/16)*24,24,24);m.strokeStyle='#fff';m.strokeRect(t%16*24+.5,Math.floor(t/16)*24+.5,23,23);}
  m.strokeStyle='#36c9d6';m.lineWidth=3;m.strokeRect(selection.x*24+1.5,selection.y*24+1.5,selection.width*24-3,selection.height*24-3);
  const canvas=$('bankSelection'),scale=zoom;canvas.width=selection.width*8*scale;canvas.height=selection.height*8*scale;const c=canvas.getContext('2d');
  for(let cy=0;cy<selection.height;cy++)for(let cx=0;cx<selection.width;cx++){const t=(selection.y+cy)*16+selection.x+cx;for(let y=0;y<8;y++)for(let x=0;x<8;x++){c.fillStyle=pixelColor(a,t,x,y);c.fillRect((cx*8+x)*scale,(cy*8+y)*scale,scale,scale);}}
  // Past 16x a solid fill no longer shows where one pixel ends and the next begins.
  if(scale>=16){c.strokeStyle='#ffffff30';c.lineWidth=1;c.beginPath();for(let px=1;px<selection.width*8;px++){c.moveTo(px*scale+.5,0);c.lineTo(px*scale+.5,selection.height*8*scale);}for(let py=1;py<selection.height*8;py++){c.moveTo(0,py*scale+.5);c.lineTo(selection.width*8*scale,py*scale+.5);}c.stroke();}
  if($('cellGrid').checked)for(let cy=0;cy<selection.height;cy++)for(let cx=0;cx<selection.width;cx++){c.strokeStyle='#36c9d680';c.strokeRect(cx*8*scale+.5,cy*8*scale+.5,8*scale-1,8*scale-1);}
  refreshPalettes();
  StudioShell.renderList($('compositionList'),a.compositions,{selected:(c,i)=>i===objectIndex,choose:(c,i)=>selectObject(i),rename:renameObject,render,maxLength:64,remove:(c,i)=>{selectObject(i);$('deleteComposition').click();}});
  for(const id of ['line','rectangle','ellipse'])$(id+'Tool').classList.toggle('on',tool===id);
  for(const name of ['solid','checker','stripes']){const b=$('fillPattern_'+name);if(b){b.disabled=!(tool==='fill'||(['rectangle','ellipse'].includes(tool)&&$('filledShapes').checked));b.classList.toggle('on',fillPattern===name);b.setAttribute('aria-pressed',String(fillPattern===name));}}if($('filledShapeToggle')){$('filledShapeToggle').disabled=!['rectangle','ellipse'].includes(tool);$('filledShapeToggle').classList.toggle('on',$('filledShapes').checked);$('filledShapeToggle').setAttribute('aria-pressed',String($('filledShapes').checked));}
  drawMiniature();drawPixelOverlay();drawUsageOverlay();updateStatus();for(const id of ['flipHorizontal','flipVertical','rotateSelection'])$(id).disabled=!pixelSelection;$('selectionTool').classList.toggle('on',tool==='select');$('copyPixels').disabled=!pixelSelection;$('pastePixels').disabled=!StudioShell.clipboard.has('pixels');$('clearPixels').disabled=!pixelSelection;$('toolOptions').hidden=!['fill','rectangle','ellipse'].includes(tool);
  // A tileset opens fitted to the window, like every canvas, and refits when
  // the area picked on the tile map changes size — not while it is being
  // dragged out. Zooming by hand holds until then. Measured last, once the
  // docks around the canvas have their final size.
  const area=a.id+':'+selection.width+'×'+selection.height;
  if(!anchor&&area!==fittedArea){fittedArea=area;const next=StudioShell.fitZoom(scroll.clientWidth-48,scroll.clientHeight-48,selection.width*8,selection.height*8,1,32);if(next!==zoom){zoom=next;render();}}
 }
 function pixelColor(a,t,x,y){const value=sample(a,t,x,y);const bank=a.tilePaletteBanks[t];return value===0?zeroColor(a,bank):css565(bankColor(bank,value));}
 function zeroColor(a,bank){return zeroAsColor?css565(bankColor(bank,0)):(a.previewBackground??'#252830');}
 function drawUsageOverlay(){
  const a=asset();if(!a||usagePalette===null)return;const ctx=$('bankSelection').getContext('2d');ctx.lineWidth=2;
  for(let y=0;y<selection.height;y++)for(let x=0;x<selection.width;x++)if(a.tilePaletteBanks[(selection.y+y)*16+selection.x+x]===usagePalette){
   ctx.fillStyle='#36c9d630';ctx.fillRect(x*8*zoom,y*8*zoom,8*zoom,8*zoom);ctx.strokeStyle='#36c9d6';ctx.strokeRect(x*8*zoom+1,y*8*zoom+1,8*zoom-2,8*zoom-2);}
 }
 function refreshPalettes(){
  const a=asset();if(!a)return;
  ensureBankRows();
  // 1bpp tiles carry colors 0 and 1 only, whichever bank they name.
  const limit=a.bpp===1?1:7;
  if(ink>limit)ink=1;
  $('bankSwatches').querySelectorAll('button[data-ink]').forEach(button=>{const p=Number(button.dataset.palette),i=Number(button.dataset.ink);button.style.background=i===0&&!zeroAsColor?'linear-gradient(135deg,white 43%,#e32636 44%,#e32636 56%,white 57%)':css565(bankColor(p,i));button.classList.toggle('chosenColor',p===palette&&i===ink);button.disabled=i>limit;
   button.title=i===0&&!zeroAsColor?'Color 0 — transparent for sprites and the overlay, drawn on background cells':`${bankPalette(p)?.name??'Empty bank'} · color ${i}`;button.setAttribute('aria-label',button.title);});
  // The bank’s palette name is on the row itself now that no button carries it.
  const used=new Set(a.tilePaletteBanks);
  $('bankSwatches').classList.add('bankSwatches');
  $('bankSwatches').querySelectorAll('.paletteGroup').forEach(row=>{
   const bank=Number(row.dataset.palette);
   row.classList.toggle('hoverBank',hovering&&bank===a.tilePaletteBanks[targetTile]);
   row.classList.toggle('chosenBank',bank===palette);row.classList.toggle('usedBank',used.has(bank));
   row.classList.toggle('usageSource',bank===usagePalette);
   row.title=`Bank ${String(bank).padStart(2,'0')} · ${bankPalette(bank)?.name??'empty in "'+activeConfig().name+'"'}`;
  });
  $('copyColor').disabled=ink===0;$('pasteColor').disabled=!StudioShell.clipboard.has('color')||ink===0;
 }
 window.renderBankEditor=render;
 // The palette library panel edits the same shared state, so it shares this history.
 // Its second argument folds sprite groups into the snapshot when an edit repoints them.
 window.graphicsEdit=mutate;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){oldShow(v);render();};
 function mapCell(e){const r=$('bankMap').getBoundingClientRect();return {x:Math.max(0,Math.min(15,Math.floor((e.clientX-r.left)/r.width*16))),y:Math.max(0,Math.min(15,Math.floor((e.clientY-r.top)/r.height*16)))};}
 function selectTo(point){pixelSelection=null;pasteAnchor=null;selection={x:Math.min(anchor.x,point.x),y:Math.min(anchor.y,point.y),width:Math.abs(point.x-anchor.x)+1,height:Math.abs(point.y-anchor.y)+1};render();}
 $('bankMap').onpointerdown=e=>{anchor=mapCell(e);$('bankMap').setPointerCapture(e.pointerId);selectTo(anchor);};
 $('bankMap').onpointermove=e=>{if(anchor)selectTo(mapCell(e));};
 $('bankMap').onpointerup=$('bankMap').onpointercancel=()=>{anchor=null;render();};
 function paintAt(x,y,value){if(x<0||y<0||x>=selection.width*8||y>=selection.height*8)return;const t=(selection.y+Math.floor(y/8))*16+selection.x+Math.floor(x/8);if(!erasing)asset().tilePaletteBanks[t]=palette;write(asset(),t,x%8,y%8,value);}
 function point(e){const r=$('bankSelection').getBoundingClientRect();return [Math.floor((e.clientX-r.left)/r.width*selection.width*8),Math.floor((e.clientY-r.top)/r.height*selection.height*8)];}
 function drawTo(pnt){const [x,y]=pnt;if(last){const steps=Math.max(Math.abs(x-last[0]),Math.abs(y-last[1]));for(let i=0;i<=steps;i++)paintAt(Math.round(last[0]+(x-last[0])*i/(steps||1)),Math.round(last[1]+(y-last[1])*i/(steps||1)),stroke);}else paintAt(x,y,stroke);last=pnt;changed();}
 // Right-click paints with color 0 — erases — while a painting tool is
 // active, the Aseprite way; with any other tool it opens the edit menu.
 const PAINT_TOOLS=['pencil','eraser','fill','line','rectangle','ellipse'],painting=()=>!panToolActive&&PAINT_TOOLS.includes(tool);
 $('bankSelection').onpointerdown=e=>{e.preventDefault();if(!asset()||(e.button===2&&!painting()))return;erasing=e.button===2||tool==='eraser';hoverTile(point(e));clipboardArea='pixels';if(pasteAnchor){pasteAnchor=boundedPoint(e);commitPaste();return;}if(tool==='select'){const pos=boundedPoint(e),handle=selectionHandle(e);if(handle){resizeDrag=handle;$('bankSelection').setPointerCapture(e.pointerId);return;}if(pixelSelection&&pos[0]>=pixelSelection.x&&pos[1]>=pixelSelection.y&&pos[0]<pixelSelection.x+pixelSelection.width&&pos[1]<pixelSelection.y+pixelSelection.height){moveDrag={start:pos,rect:{...pixelSelection},clip:capturePixels(pixelSelection),at:[pixelSelection.x,pixelSelection.y]};$('bankSelection').setPointerCapture(e.pointerId);return;}selectStart=pos;pixelSelection={x:selectStart[0],y:selectStart[1],width:1,height:1};$('bankSelection').setPointerCapture(e.pointerId);render();return;}if(tool==='picker'){const [x,y]=point(e),t=(selection.y+Math.floor(y/8))*16+selection.x+Math.floor(x/8);palette=asset().tilePaletteBanks[t];ink=sample(asset(),t,x%8,y%8);refreshPalettes();return;}if(['line','rectangle','ellipse'].includes(tool)){shapeStart=point(e);shapeEnd=shapeStart;$('bankSelection').setPointerCapture(e.pointerId);previewShape();return;}remember(false,tool==='fill'?'Fill':erasing?'Erase':'Paint');if(tool==='fill'){flood(point(e),e.button===2||tool==='eraser'?0:ink);changed();return;}stroke=e.button===2||tool==='eraser'?0:ink;last=null;$('bankSelection').setPointerCapture(e.pointerId);drawTo(point(e));};
 $('bankSelection').onpointermove=e=>{clipboardArea='pixels';hoverTile(point(e));lastPixel=boundedPoint(e);if(resizeDrag){resizeSelection(lastPixel);render();return;}if(moveDrag){moveDrag.at=movePosition(lastPixel[0]-moveDrag.start[0],lastPixel[1]-moveDrag.start[1],moveDrag.rect);render();return;}if(pasteAnchor){pasteAnchor=lastPixel;render();return;}if(selectStart){updatePixelSelection(lastPixel);render();return;}if(shapeStart){shapeEnd=boundedPoint(e);previewShape();}else if(stroke!==null)drawTo(point(e));};
 $('bankSelection').onpointerleave=()=>{hovering=false;refreshPalettes();updateStatus();};
 $('bankSelection').onpointerup=e=>{if(resizeDrag){resizeSelection(boundedPoint(e));resizeDrag=null;render();return;}if(moveDrag){const m=moveDrag;moveDrag=null;movePixels(m.rect,m.clip,m.at);return;}if(selectStart){updatePixelSelection(boundedPoint(e));selectStart=null;render();return;}if(shapeStart){shapeEnd=boundedPoint(e);const points=shapePixels(tool,shapeStart,shapeEnd);remember(false,{line:'Draw a line',rectangle:'Draw a rectangle',ellipse:'Draw an ellipse'}[tool]);points.forEach(([x,y])=>paintAt(x,y,erasing?0:ink));shapeStart=shapeEnd=null;changed();}stroke=null;last=null;};$('bankSelection').onpointercancel=()=>{resizeDrag=null;moveDrag=null;selectStart=null;pasteAnchor=null;shapeStart=shapeEnd=null;stroke=null;last=null;render();};$('bankSelection').oncontextmenu=e=>{e.preventDefault();if(!asset()||painting())return;const sel=!!pixelSelection;
  StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Cut',hint:'Mod+X',disabled:!sel,run:cutSelection},{label:'Copy',hint:'Mod+C',disabled:!sel,run:copySelection},{label:'Paste',hint:'Mod+V',disabled:!StudioShell.clipboard.has('pixels'),run:startPaste},{label:'Delete',hint:'Delete',disabled:!sel,run:clearSelection},'-',
   {label:'Flip horizontally',hint:'Shift+H',disabled:!sel,run:()=>transformSelection('horizontal')},{label:'Flip vertically',hint:'Shift+V',disabled:!sel,run:()=>transformSelection('vertical')},{label:'Rotate 90°',disabled:!sel,run:()=>transformSelection('rotate')},'-',
   {label:'Select all',hint:'Mod+A',run:selectAllPixels},{label:'Deselect',hint:'Esc',disabled:!sel,run:dropPixelSelection}]);};
 function hoverTile([x,y]){if(!asset()||x<0||y<0||x>=selection.width*8||y>=selection.height*8)return;const tile=(selection.y+Math.floor(y/8))*16+selection.x+Math.floor(x/8);hovering=true;lastPixel=[x,y];targetTile=tile;refreshPalettes();updateStatus();}
 function flood([sx,sy],value){
  const w=selection.width*8,h=selection.height*8;if(sx<0||sy<0||sx>=w||sy>=h)return;
  const get=(x,y)=>sample(asset(),(selection.y+Math.floor(y/8))*16+selection.x+Math.floor(x/8),x%8,y%8);
  const old=get(sx,sy),seen=new Uint8Array(w*h),stack=[[sx,sy]];
  while(stack.length){const [x,y]=stack.pop();if(x<0||y<0||x>=w||y>=h||seen[y*w+x]||get(x,y)!==old)continue;seen[y*w+x]=1;if(value===0||patternAt(x,y))paintAt(x,y,value);stack.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);}
 }
 // The dock shows palette RAM as the active config arranges it: sixteen banks,
 // fixed. Nothing binds a palette to this tileset, so a tile simply records the
 // bank number it was drawn against and recolors when another config loads.
 function bankRow(b){
  const group=document.createElement('div');group.className='paletteGroup';group.dataset.palette=b;
  const label=document.createElement('span');label.textContent=String(b).padStart(2,'0');group.append(label);
  for(let i=0;i<8;i++){const button=document.createElement('button');button.dataset.palette=b;button.dataset.ink=i;
   button.onclick=()=>{clipboardArea='color';palette=b;ink=i;refreshPalettes();};
   button.ondblclick=()=>{if(i===0&&!zeroAsColor)return;colorEdit={bank:b,ink:i};$('bankColor').value=css565ToInput(bankColor(b,i));$('bankColor').click();};
   button.oncontextmenu=e=>{e.preventDefault();button.click();const editable=i>0||zeroAsColor;
    StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Copy color',hint:'Mod+C',disabled:i===0,run:()=>$('copyColor').click()},{label:'Paste color',hint:'Mod+V',disabled:i===0||!StudioShell.clipboard.has('color'),run:()=>$('pasteColor').click()},'-',{label:'Edit color…',disabled:!editable,run:()=>button.ondblclick()}]);};
   group.append(button);
  }
  // Hovering a bank marks every tile drawn against it, so it is visible what
  // repointing the bank would recolor.
  const mark=()=>{usagePalette=b;render();};
  const clear=e=>{if(e&&group.contains(e.relatedTarget))return;usagePalette=null;render();};
  group.onmouseenter=group.onfocusin=mark;group.onmouseleave=group.onfocusout=clear;
  return group;
 }
 function ensureBankRows(){
  const host=$('bankSwatches');
  if(host.querySelectorAll('.paletteGroup').length===16)return;
  host.replaceChildren(...Array.from({length:16},(_,b)=>bankRow(b)));
 }
 $('bankColor').onchange=()=>mutate('Change a color',()=>setBankColor(colorEdit.bank,colorEdit.ink,inputTo565($('bankColor').value)));
 $('previewBackground').onchange=()=>mutate('Change the preview background',()=>asset().previewBackground=$('previewBackground').value);
 $('pencilTool').onclick=()=>{tool='pencil';render();};$('fillTool').onclick=()=>{tool='fill';render();};$('cellGrid').onchange=render;
 function selectBank(i){pixelSelection=null;pasteAnchor=null;index=i;plane=0;objectIndex=-1;targetTile=0;hovering=false;selection={x:0,y:0,width:1,height:1};render();}
 function freshName(){let n=1;while(tilesets.some(a=>a.name.toLowerCase()==='tileset_'+n))n++;return 'Tileset_'+n;}
 $('addBankFile').onclick=()=>mutate('New tileset',()=>{const name=freshName();tilesets.push({id:crypto.randomUUID(),name,bpp:3,chr:Array(6144).fill(0),tilePaletteBanks:Array(256).fill(0),compositions:[]});index=tilesets.length-1;objectIndex=-1;targetTile=0;palette=0;});
 $('importBankFile').onclick=()=>studioAction(async()=>{const imported=await window.studio.importTileset();if(!imported)return;let name=imported.name.replace(/[^A-Za-z0-9_-]/g,'_').slice(0,40);if(!/^[A-Za-z]/.test(name))name='Tileset_'+name;let unique=name,n=2;while(tilesets.some(a=>a.name.toLowerCase()===unique.toLowerCase()))unique=name+'_'+n++;mutate('Import a tileset',()=>{tilesets.push({id:crypto.randomUUID(),name:unique,bpp:imported.bpp,chr:imported.chr,tilePaletteBanks:Array(256).fill(0),compositions:[]});index=tilesets.length-1;objectIndex=-1;targetTile=0;palette=0;});setStatus('Imported CHR data as a tileset. Assign it to a CHR bank later, when building the game.');});
 $('deleteBankFile').onclick=()=>{if(!asset())return;setStatus(`Deleted ${asset().name} and its objects. Ctrl/Cmd+Z brings it back.`);mutate('Delete '+asset().name,()=>{tilesets.splice(index,1);index=Math.max(0,index-1);objectIndex=-1;targetTile=0;});};
 $('copyBankFile').onclick=()=>mutate('Duplicate '+asset().name,()=>{const copy=structuredClone(asset());copy.id=crypto.randomUUID();copy.name=freshName();tilesets.push(copy);index=tilesets.length-1;objectIndex=-1;targetTile=0;palette=0;});
 function renameBank(i,name){if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)||tilesets.some((a,j)=>j!==i&&a.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique filename: letters, digits, underscore or hyphen.');return false;}mutate('Rename a tileset',()=>tilesets[i].name=name);return true;}
 function renameObject(i,name){if(!name||asset().compositions.some((a,j)=>j!==i&&a.name===name)){setStatus('Use a unique object name.');return false;}mutate('Rename an object',()=>asset().compositions[i].name=name);return true;}
 function selectObject(i){pixelSelection=null;pasteAnchor=null;objectIndex=i;const c=asset().compositions[i];selection={x:c.x,y:c.y,width:c.width,height:c.height};render();}
 $('bankFileMode').onchange=()=>mutate('Change the color mode',()=>{asset().bpp=Number($('bankFileMode').value);ink=1;});
 // The plane is which of a 1bpp tileset's three pages is on screen, not a
 // property of the tileset, so switching it is not a project edit.
 $('bankFilePlane').onchange=()=>{plane=Number($('bankFilePlane').value);render();};
 $('bankUndo').onclick=ProjectHistory.undo;$('bankRedo').onclick=ProjectHistory.redo;
 $('saveComposition').onclick=()=>{let n=1;while(asset().compositions.some(c=>c.name==='Object_'+n))n++;const name='Object_'+n;mutate('New object',()=>{asset().compositions.push({name,...selection});objectIndex=asset().compositions.length-1;});StudioShell.startRename($('compositionList'),objectIndex,name,renameObject,render,64);};
 $('deleteComposition').onclick=()=>{if(objectIndex<0)return;setStatus(`Deleted ${asset().compositions[objectIndex].name}; its pixels are kept. Ctrl/Cmd+Z brings it back.`);mutate('Delete an object',()=>{asset().compositions.splice(objectIndex,1);objectIndex=-1;});};

 const rail=StudioShell.toolRail('drawingTools','Drawing tools');
 const banks=host.querySelector('.bankLibrary'),objects=host.querySelector('.objectLibrary'),mapPanel=$('bankMap').parentElement;
 const eraser=document.createElement('button');eraser.id='eraserTool';eraser.textContent='▱ Eraser';eraser.onclick=()=>{tool='eraser';render();};
 const picker=document.createElement('button');picker.id='pickerTool';picker.textContent='⌖ Pick color';picker.onclick=()=>{tool='picker';render();};
 // A sticky toggle layered over the tool system, not a tool of its own — it
 // works no matter which drawing tool was active before, the same way
 // Space-drag and middle-drag already do.
 const panButton=document.createElement('button');panButton.id='panTool';panButton.onclick=()=>{panToolActive=!panToolActive;render();};
 $('pencilTool').textContent='✎ Pencil';$('fillTool').textContent='▨ Fill';rail.append($('pencilTool'),eraser,$('fillTool'),picker,panButton,$('bankUndo'),$('bankRedo'));
 // The tileset library and the tile map dock beside the canvas like every
 // other editor's panels. The map is how a tileset's tiles are chosen for
 // drawing, so it starts open.
 objects.prepend(mapPanel);mapPanel.querySelector('h2').textContent='Tile map';
 for(const panel of [banks,objects])panel.classList.add('studioDock','studioDockLeft');
 banks.hidden=true;objects.hidden=false;
 const panelToggle=(panel,id,label,icon,asset=false)=>{const b=StudioShell.iconButton(id,label,icon);StudioShell.bindPanel({panel,button:b,group:'tilesLeft',closeGroups:['tilesLeft'],asset});return b;};
 const libraryToggle=panelToggle(banks,'bankLibraryToggle','Tilesets','tileset'),mapToggle=panelToggle(objects,'bankMapToggle','Tile map and objects','tilePicker',true);
 // Objects' New and Delete join the icon toolbar every library has.
 const objectActions=document.createElement('div');objectActions.className='assetToolbar';
 StudioShell.setIcon($('saveComposition'),'newItem','New object from the selected tiles');StudioShell.setIcon($('deleteComposition'),'delete','Delete object');
 const objectButtons=$('saveComposition').parentElement;objectActions.append($('saveComposition'),$('deleteComposition'));objectButtons.remove();$('compositionList').before(objectActions);
 const center=document.createElement('div');center.id='drawingCenter';
 const top=document.createElement('div');top.id='canvasTop';top.innerHTML='<div class="studioBarStart"><strong id="canvasAssetLabel"></strong><span id="canvasSize"></span></div>';
 top.append($('zoomOut'),$('zoomLabel'),$('zoomIn'),$('cellGrid').parentElement);
 const properties=document.createElement('details');properties.innerHTML='<summary>Display settings</summary>';
 const zeroRow=document.createElement('label');zeroRow.id='zeroModeRow';
 const zeroSelect=document.createElement('select');zeroSelect.id='zeroMode';zeroSelect.setAttribute('aria-label','How color 0 is shown');
 zeroSelect.append(new Option('Transparent','transparent'),new Option('Background color','background'));
 zeroSelect.onchange=()=>{zeroAsColor=zeroSelect.value==='background';render();};zeroRow.append(zeroSelect);
 properties.append($('bankFileMode').parentElement,$('bankFilePlaneLabel'),zeroRow,backgroundRow);top.append(properties);
 const stage=document.createElement('div');stage.id='canvasStage';stage.className='studioStage';const scroll=host.querySelector('.selectionScroll');stage.append(scroll);
 const dock=document.createElement('section');dock.id='paletteDock';
 dock.append(palettePanel);
 const hint=host.querySelector('.selectionWork p');if(hint)hint.remove();
 center.append(top,$('emptyBank'),stage,dock);
 host.replaceChildren(rail,banks,objects,center);host.classList.add('studioEditor');center.classList.add('studioMain');
 $('emptyBank').classList.add('studioEmpty');$('bankSelection').classList.add('studioArt');$('emptyBank').innerHTML='<p>No tilesets yet. A tileset is one CHR bank of 256 tiles.</p><div class="studioEmptyActions"><button id="emptyNew">New tileset</button><button id="emptyImport">Import tileset…</button></div>';
 $('emptyNew').onclick=()=>$('addBankFile').click();$('emptyImport').onclick=()=>$('importBankFile').click();
 // View switching must not repaint the hidden legacy tile editor on keyboard input.
 window.addEventListener('keydown',event=>{
  if(currentView!=='tiles'||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(document.querySelector('dialog[open]'))return;
  const key=event.key.toLowerCase();
  if((event.metaKey||event.ctrlKey)&&key==='a'){event.preventDefault();event.stopImmediatePropagation();selectAllPixels();return;}
  // One clipboard, shared with every editor: a paste pastes whatever was
  // copied last, pixels or a color; a copy takes from whichever area — the
  // canvas or the palette dock — was used last.
  if((event.metaKey||event.ctrlKey)&&['c','x','v'].includes(key)){event.preventDefault();event.stopImmediatePropagation();
   if(key==='v'){if(StudioShell.clipboard.has('color'))$('pasteColor').click();else if(asset()&&StudioShell.clipboard.has('pixels')){$('pasteSource').checked=event.shiftKey;startPaste();}}
   else if(key==='c')(clipboardArea==='color'?$('copyColor'):$('copyPixels')).click();
   else cutSelection();
   return;}
  if(key==='escape'){event.preventDefault();event.stopImmediatePropagation();dropPixelSelection();return;}
  if(event.metaKey||event.ctrlKey)return;
  if(event.target.closest?.('[role="option"]'))return;
  if((key==='delete'||key==='backspace')&&pixelSelection&&!pasteAnchor){event.preventDefault();event.stopImmediatePropagation();clearSelection();return;}
  if(key.startsWith('arrow')&&pixelSelection&&!pasteAnchor){event.preventDefault();event.stopImmediatePropagation();const d={arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1]}[key];if(d)movePixels(pixelSelection,capturePixels(pixelSelection),movePosition(...d,pixelSelection));return;}
  if(event.shiftKey&&(key==='h'||key==='v')){event.preventDefault();event.stopImmediatePropagation();$(key==='h'?'flipHorizontal':'flipVertical').click();return;}
  const tools={s:'selectionTool',b:'pencilTool',e:'eraserTool',g:'fillTool',l:'lineTool',r:'rectangleTool',o:'ellipseTool',i:'pickerTool',h:'panTool'};if(!event.shiftKey&&tools[key]){event.preventDefault();event.stopImmediatePropagation();$(tools[key]).click();}
 },true);
 const centered=document.createElement('style');centered.textContent=`

 #drawingCenter{min-width:0;min-height:0;display:flex;flex-direction:column}#canvasTop{display:flex;align-items:center;gap:10px;padding:8px 18px;background:var(--panel)}#canvasAssetLabel{margin-right:auto;color:var(--ink)}#canvasTop details{position:relative}#canvasTop details[open]{position:absolute;right:12px;top:5px;padding:12px;background:var(--panel);border:1px solid var(--line);z-index:4;max-width:500px}#canvasStage{position:relative;flex:1;min-height:0;display:flex;overflow:hidden}#canvasStage .selectionScroll{width:100%;max-width:none;max-height:none;height:100%;overflow:auto;display:flex;align-items:safe center;justify-content:safe center;padding:24px;background:none}#bankSelection{flex:none;max-width:none}
 #paletteDock{background:var(--panel);border-top:1px solid var(--line);display:flex;align-items:center;gap:18px;padding:10px 18px;max-height:210px;overflow:auto;flex-shrink:0}#drawingColor{width:145px;flex-shrink:0;display:flex;align-items:center;flex-direction:column;gap:7px;font-size:11px}#activeInk{width:40px;height:40px;border:3px solid white;box-shadow:0 0 0 1px black}#activeInkLabel{font-size:11px}#paletteDock .inlinePalettes{margin:0;border:0;padding:0;width:auto;flex:1}#paletteDock h2{margin:0 0 5px;font-size:10px}#bankSwatches{grid-template-columns:repeat(4,max-content);gap:1px 10px}

 `;document.head.append(centered);

 function boundedPoint(e){let [x,y]=point(e);x=Math.max(0,Math.min(selection.width*8-1,x));y=Math.max(0,Math.min(selection.height*8-1,y));if(e.shiftKey&&shapeStart&&['rectangle','ellipse'].includes(tool)){const [sx,sy]=shapeStart,dx=x>=sx?1:-1,dy=y>=sy?1:-1;const side=Math.min(Math.max(Math.abs(x-sx),Math.abs(y-sy)),dx>0?selection.width*8-1-sx:sx,dy>0?selection.height*8-1-sy:sy);x=sx+dx*side;y=sy+dy*side;}return [x,y];}
 function shapePixels(kind,a,b){
  const out=new Map(),add=(x,y)=>out.set(x+','+y,[x,y]);
  const line=(x0,y0,x1,y1)=>{let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;while(true){add(x0,y0);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}};
  const x0=Math.min(a[0],b[0]),x1=Math.max(a[0],b[0]),y0=Math.min(a[1],b[1]),y1=Math.max(a[1],b[1]);
  if(kind==='line'||x0===x1||y0===y1)line(...a,...b);
  else if(kind==='rectangle'){line(x0,y0,x1,y0);line(x1,y0,x1,y1);line(x1,y1,x0,y1);line(x0,y1,x0,y0);}
  else{const cx=(x0+x1)/2,cy=(y0+y1)/2,rx=(x1-x0)/2,ry=(y1-y0)/2,steps=Math.ceil(8*Math.PI*Math.max(rx,ry));let prev=[x1,Math.round(cy)];for(let n=1;n<=steps;n++){const angle=n*2*Math.PI/steps,next=[Math.round(cx+rx*Math.cos(angle)),Math.round(cy+ry*Math.sin(angle))];line(...prev,...next);prev=next;}}
  if(kind!=='line'&&$('filledShapes').checked){for(let y=y0;y<=y1;y++){const row=[...out.values()].filter(p=>p[1]===y).map(p=>p[0]);if(row.length)for(let x=Math.min(...row);x<=Math.max(...row);x++)add(x,y);}}
  return [...out.values()].filter(([x,y])=>kind==='line'||!$('filledShapes').checked||erasing||patternAt(x,y));
 }
 function previewShape(){render();if(!shapeStart)return;const c=$('bankSelection').getContext('2d');c.fillStyle=erasing?zeroColor(asset(),palette):css565(bankColor(palette,ink));for(const [x,y] of shapePixels(tool,shapeStart,shapeEnd))c.fillRect(x*zoom,y*zoom,zoom,zoom);}
 // Tool-option glyphs; every other icon comes from StudioShell.icons.
 const paths={};
 function icon(button,name,label){StudioShell.setIcon(button,paths[name]??name,label);}
 for(const [id,name,label] of [['pencilTool','pencil','Pencil (B)'],['eraserTool','eraser','Eraser (E)'],['fillTool','fill','Fill (G)'],['pickerTool','picker','Pick color (I)'],['panTool','pan','Pan (H) — drag to scroll; Space or the middle button pan with any other tool active'],['bankUndo','undo','Undo (Ctrl/Cmd+Z)'],['bankRedo','redo','Redo (Ctrl/Cmd+Shift+Z)']])icon($(id),name,label);
 for(const [kind,label] of [['line','Line (L)'],['rectangle','Rectangle (R) — Shift draws a square'],['ellipse','Ellipse (O) — Shift draws a circle']]){const button=document.createElement('button');button.id=kind+'Tool';icon(button,kind,label);button.onclick=()=>{shapeStart=null;tool=kind;render();};rail.insertBefore(button,$('bankUndo'));}
 const miniButton=document.createElement('button');miniButton.id='miniatureToggle';miniButton.setAttribute('aria-expanded','true');miniButton.classList.add('on');icon(miniButton,'miniature','Preview');top.insertBefore(miniButton,properties);
 const mini=document.createElement('aside');mini.id='miniaturePanel';mini.className='canvasPreview';mini.innerHTML='<strong>Preview</strong><canvas id="miniatureCanvas"></canvas><span id="miniatureSize"></span>';stage.append(mini);
 miniButton.onclick=()=>{miniVisible=!miniVisible;mini.hidden=!miniVisible;miniButton.classList.toggle('on',miniVisible);miniButton.setAttribute('aria-expanded',String(miniVisible));drawMiniature();};
 function drawMiniature(){if(!miniVisible||!asset())return;const canvas=$('miniatureCanvas'),w=selection.width*8,h=selection.height*8;canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');for(let y=0;y<h;y++)for(let x=0;x<w;x++){const t=(selection.y+Math.floor(y/8))*16+selection.x+Math.floor(x/8);ctx.fillStyle=pixelColor(asset(),t,x%8,y%8);ctx.fillRect(x,y,1,1);}const factor=Math.min(4,180/Math.max(w,h));canvas.style.width=w*factor+'px';canvas.style.height=h*factor+'px';$('miniatureSize').textContent=w+' × '+h+' pixels';}
 const polish=document.createElement('style');polish.textContent=`#compositionList{border:1px solid var(--line);background:var(--bg);max-height:220px;overflow:auto;min-height:60px}#bankFiles{border:1px solid var(--line);background:var(--bg);flex:1;min-height:120px;overflow:auto}.assetRow{padding:9px;cursor:pointer;border:1px solid transparent;min-height:34px}.assetRow[aria-selected="true"]{background:#423623;border-color:var(--ink)}.assetRow input{width:100%;margin:0!important;padding:2px!important;font:inherit}.assetRow:focus{outline:1px solid var(--sel)}#namedBankEditor .objectLibrary>h2{margin-top:14px}#namedBankEditor #bankMap{width:100%;height:auto;aspect-ratio:1}#drawingCenter{position:relative}#miniatureToggle{padding:3px;display:flex;align-items:center}#miniatureToggle svg{width:22px;height:22px}#miniatureCanvas{image-rendering:pixelated}#miniatureSize{font-size:10px;color:var(--text-dim)}#paletteDock{gap:0}#paletteDock .inlinePalettes{width:100%}`;document.head.append(polish);

 function updatePixelSelection(p){pixelSelection={x:Math.min(selectStart[0],p[0]),y:Math.min(selectStart[1],p[1]),width:Math.abs(p[0]-selectStart[0])+1,height:Math.abs(p[1]-selectStart[1])+1};}
 function drawPixelOverlay(){
  if(!asset())return;const ctx=$('bankSelection').getContext('2d');
  if((pasteAnchor&&pixelClipboard)||moveDrag)withScratchLibrary(()=>{const preview=structuredClone(asset());if(moveDrag){clearPixels(preview,moveDrag.rect);applyPixels(preview,moveDrag.clip,moveDrag.at,false,false);}else try{applyPixels(preview,pixelClipboard,pasteAnchor,$('pasteOpaque').checked,$('pasteSource').checked);}catch(e){setStatus(e.message);}for(let y=0;y<selection.height*8;y++)for(let x=0;x<selection.width*8;x++){ctx.fillStyle=pixelColor(preview,tileAt(x,y),x%8,y%8);ctx.fillRect(x*zoom,y*zoom,zoom,zoom);}});
  const rect=moveDrag?{...moveDrag.rect,x:moveDrag.at[0],y:moveDrag.at[1]}:pasteAnchor&&pixelClipboard?{x:pasteAnchor[0],y:pasteAnchor[1],width:pixelClipboard.width,height:pixelClipboard.height}:pixelSelection;
  if(rect){ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.strokeRect(rect.x*zoom+.5,rect.y*zoom+.5,rect.width*zoom-1,rect.height*zoom-1);ctx.lineDashOffset=4;ctx.strokeStyle='#111';ctx.strokeRect(rect.x*zoom+.5,rect.y*zoom+.5,rect.width*zoom-1,rect.height*zoom-1);ctx.restore();if(!pasteAnchor&&!moveDrag&&tool==='select'){for(const [x,y] of [[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]]){ctx.fillStyle='#fff';ctx.fillRect(x*zoom-3,y*zoom-3,6,6);}}}
 }
 function tileAt(x,y){return (selection.y+Math.floor(y/8))*16+selection.x+Math.floor(x/8);}
 // Previews may bind palettes; they must not reach the project's library.
 function withScratchLibrary(fn){const saved=paletteLibrary;paletteLibrary=structuredClone(saved);try{return fn();}finally{paletteLibrary=saved;}}
 function capturePixels(r){const data=[],banks=[];for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const sx=r.x+x,sy=r.y+y,t=tileAt(sx,sy);data.push(sample(asset(),t,sx%8,sy%8));banks.push(asset().tilePaletteBanks[t]);}return {width:r.width,height:r.height,data,banks};}
 // Pasted pixels bring the bank number they were drawn against. Banks are
 // global under a config, so the same number means the same colors and there is
 // nothing to rebind — unlike the old per-tileset slots this replaced.
 function applyPixels(a,clip,at,opaque,source){
  const assigned=new Set();for(let y=0;y<clip.height;y++)for(let x=0;x<clip.width;x++){const i=y*clip.width+x,v=clip.data[i],dx=at[0]+x,dy=at[1]+y;if((!opaque&&!v)||dx<0||dy<0||dx>=selection.width*8||dy>=selection.height*8)continue;const t=tileAt(dx,dy);
   if(source&&!assigned.has(t)){a.tilePaletteBanks[t]=clip.banks[i];assigned.add(t);}
   write(a,t,dx%8,dy%8,v);
  }
 }
 function clearPixels(a,r){for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)write(a,tileAt(x,y),x%8,y%8,0);}
 function movePosition(dx,dy,r){return [Math.max(0,Math.min(selection.width*8-r.width,r.x+dx)),Math.max(0,Math.min(selection.height*8-r.height,r.y+dy))];}
 function movePixels(r,clip,at){if(at[0]===r.x&&at[1]===r.y){render();return;}mutate('Move pixels',()=>{clearPixels(asset(),r);applyPixels(asset(),clip,at,false,false);pixelSelection={...r,x:at[0],y:at[1]};});}
 function transformSelection(kind){if(!pixelSelection)return;const r=pixelSelection,old=capturePixels(r),rot=kind==='rotate',w=rot?r.height:r.width,h=rot?r.width:r.height;if(r.x+w>selection.width*8||r.y+h>selection.height*8){setStatus('The rotated selection does not fit. Move it away from the edge or select a larger drawing area.');return;}const clip={width:w,height:h,data:Array(w*h),banks:Array(w*h)};for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const dx=rot?r.height-1-y:kind==='horizontal'?r.width-1-x:x,dy=rot?x:kind==='vertical'?r.height-1-y:y;clip.data[dy*w+dx]=old.data[y*r.width+x];clip.banks[dy*w+dx]=old.banks[y*r.width+x];}mutate(rot?'Rotate pixels':'Flip pixels',()=>{clearPixels(asset(),r);applyPixels(asset(),clip,[r.x,r.y],true,false);pixelSelection={...r,width:w,height:h};});}
 function copySelection(){if(!asset()||!pixelSelection)return;pixelClipboard=capturePixels(pixelSelection);StudioShell.clipboard.set('pixels',pixelClipboard);clipboardArea='pixels';setStatus(`Copied ${pixelClipboard.width} × ${pixelClipboard.height} pixels.`);render();}
 function startPaste(){pixelClipboard=StudioShell.clipboard.get('pixels');if(!asset()||!pixelClipboard)return;pasteAnchor=[Math.min(lastPixel[0],selection.width*8-1),Math.min(lastPixel[1],selection.height*8-1)];clipboardArea='pixels';setStatus('Position the paste and click. Escape cancels. Paste options control transparency and palettes.');render();}
 // Rehearsed on a scratch library first so a rejected paste leaves no palettes behind.
 function commitPaste(){const [left,top]=pasteAnchor,opaque=$('pasteOpaque').checked,source=$('pasteSource').checked;
  try{withScratchLibrary(()=>applyPixels(structuredClone(asset()),pixelClipboard,pasteAnchor,opaque,source));}catch(e){setStatus(e.message);return;}
  mutate('Paste pixels',()=>{applyPixels(asset(),pixelClipboard,[left,top],opaque,source);pixelSelection={x:left,y:top,width:Math.min(pixelClipboard.width,selection.width*8-left),height:Math.min(pixelClipboard.height,selection.height*8-top)};pasteAnchor=null;});}
 // Cut and Delete leave color 0 behind, the way the eraser does.
 function selectAllPixels(){if(!asset())return;tool='select';pasteAnchor=null;pixelSelection={x:0,y:0,width:selection.width*8,height:selection.height*8};render();}
 function dropPixelSelection(){resizeDrag=null;moveDrag=null;pasteAnchor=null;pixelSelection=null;selectStart=null;render();}
 function clearSelection(label='Delete pixels'){if(asset()&&pixelSelection)mutate(label,()=>clearPixels(asset(),pixelSelection));}
 function cutSelection(){if(!asset()||!pixelSelection)return;copySelection();clearSelection('Cut pixels');}
 document.addEventListener('studioclipboard',()=>{if(host.hidden)return;$('pastePixels').disabled=!StudioShell.clipboard.has('pixels');$('pasteColor').disabled=!StudioShell.clipboard.has('color')||ink===0;});
 StudioShell.editActions('tiles',{copy:()=>(clipboardArea==='color'?$('copyColor'):$('copyPixels')).click(),cut:()=>cutSelection(),paste:()=>{if(StudioShell.clipboard.has('color'))$('pasteColor').click();else startPaste();}});
 function patternAt(x,y){return fillPattern==='solid'||(fillPattern==='checker'?(x+y)%2===0:y%2===0);}
 function updateStatus(){if(!$('drawingStatus'))return;const r=pixelSelection,info=[];
  if(usagePalette!==null&&asset()){const tiles=asset().tilePaletteBanks.filter(b=>b===usagePalette).length;info.push(`Bank ${String(usagePalette).padStart(2,'0')} · ${bankPalette(usagePalette)?.name??'empty'} · ${tiles} tile${tiles===1?'':'s'}`);}
  if(hovering&&asset())info.push(`Pixel ${lastPixel[0]}, ${lastPixel[1]}`,`Tile ${targetTile}`,`Palette ${asset().tilePaletteBanks[targetTile]}`);if(r)info.push(`Selection ${r.width} × ${r.height}`);info.push(`Canvas ${selection.width*8} × ${selection.height*8} px`);$('drawingStatus').textContent=info.join(' · ');}

 for(const [id,name,label,fn] of [['selectionTool','select','Select (S)',()=>{tool='select';pasteAnchor=null;render();}],['copyPixels','copy','Copy selection (Ctrl/Cmd+C)',copySelection],['pastePixels','paste','Paste (Ctrl/Cmd+V; with Shift, the source palettes too)',startPaste]]){const button=document.createElement('button');button.id=id;icon(button,name,label);button.onclick=fn;rail.insertBefore(button,$('bankUndo'));}
 const colorActions=document.createElement('div');colorActions.className='colorClipboard';
 for(const [id,name,label,fn] of [['copyColor','copy','Copy selected color',()=>{if(!asset()||ink===0)return;StudioShell.clipboard.set('color',bankColor(palette,ink));clipboardArea='color';setStatus('Color copied. Choose another swatch, then Paste color.');refreshPalettes();}],['pasteColor','paste','Paste color into selected swatch',()=>{if(!asset()||ink===0||!StudioShell.clipboard.has('color'))return;mutate('Paste a color',()=>setBankColor(palette,ink,StudioShell.clipboard.get('color')));clipboardArea='color';}]]){const button=document.createElement('button');button.id=id;icon(button,name,label);button.onclick=fn;colorActions.append(button);}
 const note=document.createElement('span');note.textContent='Copy / paste color';colorActions.append(note);host.querySelector('.paletteDockHead').append(colorActions);
 const clipboardStyle=document.createElement('style');clipboardStyle.textContent=`.colorClipboard{display:flex;gap:6px;align-items:center;margin-left:auto;font-size:10px;color:var(--text-dim)}.colorClipboard button{padding:3px;display:flex}.colorClipboard svg{width:18px;height:18px}`;document.head.append(clipboardStyle);

 const options=document.createElement('div');options.id='drawingOptions';options.innerHTML='<label><input id="filledShapes" type="checkbox">Filled shapes</label><button id="flipHorizontal" title="Flip selection horizontally">Flip ↔</button><button id="flipVertical" title="Flip selection vertically">Flip ↕</button><button id="rotateSelection" title="Rotate selection clockwise 90 degrees">Rotate 90°</button><details><summary>Paste options</summary><label><input id="pasteOpaque" type="checkbox">Opaque (include zero pixels)</label><label><input id="pasteSource" type="checkbox">Use source palettes (Ctrl/Cmd+Shift+V)</label><p>Missing source palettes are copied into unused slots. Each touched tile uses the first pasted pixel’s palette, affecting the whole tile. The preview shows this before placement.</p></details>';
 top.after(options);for(const [id,kind] of [['flipHorizontal','horizontal'],['flipVertical','vertical'],['rotateSelection','rotate']])$(id).onclick=()=>transformSelection(kind);
 $('pasteOpaque').onchange=$('pasteSource').onchange=render;
 const status=document.createElement('div');status.id='drawingStatus';StudioShell.viewStatus('tiles',status);
 // Tilesets draw at physical resolution, so they never zoom below 100%.
 zoomControls=StudioShell.canvasZoom({view:'tiles',ids:{fit:'fitDrawing',actual:'actualSize',zoomOut:'zoomOut',label:'zoomLabel',zoomIn:'zoomIn'},min:1,max:32,
  get:()=>zoom,set:(next,x,y)=>StudioShell.zoomScrolled(scroll,$('bankSelection'),zoom,next,z=>{zoom=z;render();},x,y),
  fit:()=>{zoom=StudioShell.fitZoom(scroll.clientWidth-48,scroll.clientHeight-48,selection.width*8,selection.height*8,1,32);render();scroll.scrollLeft=scroll.scrollTop=0;},
  wheel:scroll,busy:()=>!!(shapeStart||stroke!==null||moveDrag||selectStart||panDrag)});
 top.querySelector('.studioBarStart').after(zoomControls.group);
 window.addEventListener('keydown',e=>{if(currentView==='tiles'&&e.code==='Space'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){spaceHeld=true;e.preventDefault();scroll.style.cursor='grab';}},true);
 window.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;scroll.style.cursor=panToolActive?'grab':'';}});
 window.addEventListener('blur',()=>{spaceHeld=false;panDrag=null;scroll.style.cursor=panToolActive?'grab':'';});
 scroll.addEventListener('pointerdown',e=>{if(e.button===2||(!spaceHeld&&e.button!==1&&!panToolActive))return;e.preventDefault();e.stopImmediatePropagation();panDrag={x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};scroll.setPointerCapture(e.pointerId);scroll.style.cursor='grabbing';},true);
 scroll.addEventListener('pointermove',e=>{if(!panDrag)return;e.preventDefault();e.stopImmediatePropagation();scroll.scrollLeft=panDrag.left+panDrag.x-e.clientX;scroll.scrollTop=panDrag.top+panDrag.y-e.clientY;},true);
 for(const type of ['pointerup','pointercancel'])scroll.addEventListener(type,e=>{if(!panDrag)return;panDrag=null;e.stopImmediatePropagation();scroll.style.cursor=spaceHeld||panToolActive?'grab':'';},true);
 const phaseStyle=document.createElement('style');phaseStyle.textContent='#drawingOptions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:6px 18px;background:var(--panel);font-size:11px}#drawingOptions details{position:relative}#drawingOptions details[open]{z-index:6}#drawingOptions details label,#drawingOptions details p{display:block;max-width:380px}#drawingOptions details[open]{background:var(--panel);padding:8px;border:1px solid var(--line)}#drawingStatus{padding:5px 18px;font-size:11px;color:var(--text-dim)}#canvasTop{flex-wrap:wrap}';document.head.append(phaseStyle);

 function selectionHandle(e){if(!pixelSelection||zoom<4)return null;const r=pixelSelection,c=$('bankSelection').getBoundingClientRect(),x=(e.clientX-c.left)/zoom,y=(e.clientY-c.top)/zoom;for(const [hx,hy,ox,oy] of [[r.x,r.y,r.x+r.width-1,r.y+r.height-1],[r.x+r.width,r.y,r.x,r.y+r.height-1],[r.x,r.y+r.height,r.x+r.width-1,r.y],[r.x+r.width,r.y+r.height,r.x,r.y]])if(Math.abs(x-hx)*zoom<=3&&Math.abs(y-hy)*zoom<=3)return [ox,oy];return null;}
 function resizeSelection(p){pixelSelection={x:Math.min(p[0],resizeDrag[0]),y:Math.min(p[1],resizeDrag[1]),width:Math.abs(p[0]-resizeDrag[0])+1,height:Math.abs(p[1]-resizeDrag[1])+1};}
 const helpButton=StudioShell.helpButton();

 const transforms=StudioShell.toolRail('transformTools','Selection transforms','right');
 for(const [id,name,label] of [['flipHorizontal','flipH','Flip the selection horizontally (Shift+H)'],['flipVertical','flipV','Flip the selection vertically (Shift+V)'],['rotateSelection','rotate','Rotate selection clockwise 90°']]){icon($(id),name,label);transforms.append($(id));}host.append(transforms);
 const viewTools=document.createElement('div');viewTools.id='viewTools';viewTools.className='studioBarEnd';
 const gridLabel=$('cellGrid').parentElement;gridLabel.hidden=true;
 const gridButton=document.createElement('button');gridButton.id='tileGridToggle';icon(gridButton,'grid','Toggle tile grid');gridButton.setAttribute('aria-pressed',String($('cellGrid').checked));gridButton.onclick=()=>{$('cellGrid').checked=!$('cellGrid').checked;gridButton.setAttribute('aria-pressed',String($('cellGrid').checked));gridButton.classList.toggle('on',$('cellGrid').checked);render();};gridButton.classList.toggle('on',$('cellGrid').checked);
 const pasteOptions=options.querySelector('details');pasteOptions.id='pasteOptions';properties.id='displaySettings';
 for(const [details,name,label] of [[pasteOptions,'paste','Paste options'],[properties,'settings','Display settings']]){const summary=details.querySelector('summary');icon(summary,name,label);const pop=document.createElement('div');pop.className='viewPopover';while(summary.nextSibling)pop.append(summary.nextSibling);details.append(pop);details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));if(details.open)for(const other of [pasteOptions,properties])if(other!==details)other.open=false;});}
 viewTools.append(pasteOptions,properties,gridButton,miniButton,helpButton);top.append(viewTools);
  const uiStyle=document.createElement('style');uiStyle.textContent=`
 #toolOptions{display:flex;align-items:center;gap:6px;margin-left:14px;padding-left:14px;border-left:1px solid var(--line)}#toolOptions button{padding:4px;display:flex;align-items:center;justify-content:center}#toolOptions svg{width:23px;height:23px}#toolOptions button.on{background:var(--ink);color:#111}
 #viewTools{margin-left:auto;display:flex;align-items:center;gap:6px}#viewTools button,#viewTools summary{padding:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid var(--line);border-radius:4px;background:var(--panel)}#viewTools button.on{background:var(--ink);color:#111}#viewTools details[open]>summary{border-color:var(--sel)}#viewTools svg{width:23px;height:23px}#viewTools summary{list-style:none}#viewTools summary::-webkit-details-marker{display:none}#canvasTop #viewTools details,#canvasTop #viewTools details[open]{position:relative;right:auto;top:auto;padding:0;border:0;z-index:7}#viewTools .viewPopover{position:absolute;right:0;top:36px;width:300px;padding:12px;border:1px solid var(--line);background:var(--panel);box-shadow:0 8px 20px #0008;font-size:11px}#viewTools .viewPopover label{display:block;margin:8px 0}#viewTools .viewPopover p{line-height:1.5}#drawingOptions{min-height:32px}
 `;document.head.append(uiStyle);

 // Fill controls live beside selection transforms, with tool-dependent availability.
 const filledLabel=$('filledShapes').parentElement;filledLabel.hidden=true;transforms.append(filledLabel);
 paths.filled='<rect x="4" y="4" width="18" height="18" fill="currentColor"/>';
 paths.checker='<rect x="4" y="4" width="18" height="18"/><path d="M4 4h6v6H4zM16 4h6v6h-6zM10 10h6v6h-6zM4 16h6v6H4zM16 16h6v6h-6z" fill="currentColor" stroke="none"/>';
 paths.stripes='<rect x="4" y="4" width="18" height="18"/><path d="M4 7h18M4 13h18M4 19h18" stroke-width="3"/>';
 paths.fillToggle='<rect x="3" y="3" width="20" height="20"/><path d="M5 5h16v16z" fill="currentColor" stroke="none"/>';
 const fillToggle=document.createElement('button');fillToggle.id='filledShapeToggle';icon(fillToggle,'fillToggle','Toggle filled rectangles and ellipses');fillToggle.onclick=()=>{$('filledShapes').checked=!$('filledShapes').checked;render();};transforms.append(fillToggle);
 for(const [name,label] of [['solid','Solid fill'],['checker','Checkerboard fill'],['stripes','Horizontal stripe fill']]){const button=document.createElement('button');button.id='fillPattern_'+name;icon(button,name==='solid'?'filled':name,label);button.onclick=()=>{fillPattern=name;render();};transforms.append(button);}
 options.hidden=true;
 // Rails in the order every editor uses: panels, then tools, then edit
 // actions pinned to the bottom; on the right, the selection's transforms
 // and the fill tools' options.
 StudioShell.railLayout(rail,[[libraryToggle,mapToggle],[$('selectionTool'),$('pencilTool'),$('eraserTool'),$('fillTool'),$('lineTool'),$('rectangleTool'),$('ellipseTool'),$('pickerTool'),$('panTool')]],[$('copyPixels'),$('pastePixels'),$('bankUndo'),$('bankRedo')]);
 StudioShell.railLayout(transforms,[[$('flipHorizontal'),$('flipVertical'),$('rotateSelection')],[Object.assign(StudioShell.iconButton('clearPixels','Clear the selection (Delete)','delete'),{onclick:clearSelection})]]);
 // The fill tools' options are a context bar, shown in the top bar only
 // while a tool that uses them is active, as Photoshop and Aseprite do.
 const toolOptions=document.createElement('div');toolOptions.id='toolOptions';toolOptions.setAttribute('aria-label','Fill options');
 toolOptions.append(fillToggle,$('fillPattern_solid'),$('fillPattern_checker'),$('fillPattern_stripes'),filledLabel);top.querySelector('.studioBarStart').append(toolOptions);
 paths.pasteSettings=StudioShell.icons.paste+'<circle cx="19" cy="18" r="6" fill="var(--panel)"/><path d="M19 10v3M19 23v3M11 18h3M24 18h2M13 12l2 2M23 12l-2 2M13 24l2-2M23 24l-2-2"/><circle cx="19" cy="18" r="2"/>';
 icon(pasteOptions.querySelector('summary'),'pasteSettings','Paste options');
 pasteOptions.querySelector('.viewPopover p')?.remove();
 for(const id of ['pasteOpaque','pasteSource']){const input=$(id),label=input.parentElement;const text=document.createElement('span');text.textContent=id==='pasteOpaque'?'Opaque (include zero pixels)':'Use source palettes';label.replaceChildren(input,text);if(id==='pasteSource')label.title='Paste source palettes: Ctrl/Cmd+Shift+V';}
 backgroundRow.querySelector('span')?.remove();
 const bgLabel=$('previewBackground').parentElement;for(const n of [...bgLabel.childNodes])if(n.nodeType===Node.TEXT_NODE)n.textContent='Background';
 const captions={bankFileMode:'Color mode',bankFilePlane:'Plane',zeroMode:'Color 0',previewBackground:'Background'};
 for(const [id,text] of Object.entries(captions)){const input=$(id),label=input.parentElement;const caption=document.createElement('span');caption.textContent=text;label.replaceChildren(caption,input);}
 const polishPanels=document.createElement('style');polishPanels.textContent=`
 #bankSwatches{grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:7px 16px;width:100%;justify-items:start}#paletteDock{max-height:none;overflow:auto}#paletteDock .inlinePalettes{min-width:0}.paletteDockHead{display:flex;align-items:center;gap:12px;margin-bottom:7px}
 #viewTools .viewPopover{width:290px;padding:14px;border-radius:7px;box-shadow:0 10px 30px #0009}#viewTools .viewPopover label{display:flex;align-items:center;gap:12px;margin:0;padding:9px 0;font-size:12px;line-height:1.4}#viewTools .viewPopover input[type=checkbox]{margin:0;flex:0 0 auto;width:16px;height:16px}#displaySettings .viewPopover label{justify-content:space-between}#displaySettings .viewPopover label span{white-space:nowrap}#displaySettings select{min-width:165px;padding:7px}#displaySettings .bankActions{display:block;margin:0}#displaySettings input[type=color]{width:54px;height:32px;padding:3px}
 `;document.head.append(polishPanels);


 const importArtwork=document.createElement('button');importArtwork.id='importBankImage';importArtwork.textContent='Import image…';importArtwork.title='Import PNG, BMP or GIF artwork into this tileset';$('bankMap').before(importArtwork);
 importArtwork.onclick=()=>studioAction(async()=>{const target=asset();if(!target)return;
  // Banks a shape's sprites already name are protected: reassigning their colors
  // would recolor art elsewhere in the project.
  const protectedPalettes=new Set();
  for(const shape of shapes)if(shape.tilesetId===target.id)for(const sprite of shape.sprites)protectedPalettes.add(sprite.paletteBank);
  // Import reads and writes flattened palette RAM. Whatever it invents is
  // interned into the library and placed in the active config's banks.
  await window.openTilesetImageImport({tileset:{...target,plane,palettes:resolveActiveConfig()},selection:{...selection},protectedPalettes,
   commit:(next,rect,createdObject)=>{
    if(asset()!==target)throw Error('The destination tileset changed. Reopen image import.');
    mutate('Import an image',()=>{
     const {palettes,plane:_plane,...rest}=next;
     Object.assign(target,rest);
     const config=activeConfig(),before=resolveActiveConfig();
     for(let bank=0;bank<16;bank++){
      const colors=palettes.slice(bank*8,bank*8+8);
      if(colors.every((v,i)=>v===before[bank*8+i]))continue;
      config.banks[bank]=internPalette(colors).id;
     }
     selection=rect;pixelSelection=null;pasteAnchor=null;objectIndex=createdObject?target.compositions.length-1:-1;
    });
    setStatus('Imported image into '+target.name+'. Undo restores pixels, palettes and Objects.');
   }});
 });
 render();
})();
