// Overlay authoring. The overlay is the fixed 40×25 hardware text/HUD layer —
// unlike a background it never scrolls and has no BGMODE, its own OVLBANK/
// OVLALT bank pair, and the identical cell attribute layout (tile, palette
// bank, flips, priority, CHR_ALT) — see docs/model.md and specs/video.json.
//
// A placeholder is pure geometry: {id, name, col, row, width, height}. It
// carries no content of its own — whatever is painted in its cells with the
// normal tools is the real initial nametable data, not a discardable mockup.
// A build step can later generate a primitive that overwrites just the
// tile-ID bytes in that region, left-to-right/top-to-bottom; mapping a value
// (a score, a string) to tile IDs is the programmer's job, not Studio's.
(() => {
 const host=document.createElement('section');host.id='overlayEditor';host.hidden=true;
 host.innerHTML=`<aside class="ovLibrary"><h2>Overlays</h2><div id="ovActions" class="assetToolbar"></div><div id="ovList" role="listbox" aria-label="Overlays"></div><p>Double-click an overlay to rename it.</p></aside>
 <aside class="ovTileLibrary"><h2>Tilesets</h2>
  <strong>Primary — reads when CHR_ALT is 0</strong><div id="ovPrimaryList" role="listbox" aria-label="Primary tileset"></div>
  <label id="ovPrimaryPlaneLabel">Plane <select id="ovPrimaryPlane" aria-label="Which 1bpp page the primary tileset shows"><option>0</option><option>1</option><option>2</option></select></label>
  <strong>Alternate — reads when CHR_ALT is 1</strong><div id="ovAltList" role="listbox" aria-label="Alternate tileset"></div>
  <label id="ovAltPlaneLabel">Plane <select id="ovAltPlane" aria-label="Which 1bpp page the alternate tileset shows"><option>0</option><option>1</option><option>2</option></select></label>
  <h2>Tile picker</h2>
  <label id="ovPickSlotWrap">Show <select id="ovPickSlot" aria-label="Which tileset the tile picker shows"><option value="primary">Primary</option><option value="alt">Alternate</option></select></label>
  <canvas id="ovTileMap" width="256" height="256"></canvas>
  <p id="ovTileNote">Click a tile to paint with it.</p>
 </aside>
 <aside class="ovPlaceholderLibrary"><h2>Placeholders</h2><div id="ovPlaceholderActions" class="assetToolbar"></div><div id="ovPlaceholderList" role="listbox" aria-label="Placeholders"></div>
  <div class="ovPhFields">
   <label>Col <input id="ovPhCol" type="number" min="0" max="39" aria-label="Placeholder column"></label>
   <label>Row <input id="ovPhRow" type="number" min="0" max="24" aria-label="Placeholder row"></label>
   <label>Width <input id="ovPhWidth" type="number" min="1" max="40" aria-label="Placeholder width in tiles"></label>
   <label>Height <input id="ovPhHeight" type="number" min="1" max="25" aria-label="Placeholder height in tiles"></label>
  </div>
  <p>Select the Placeholder tool and drag on the canvas to define a new region, or edit the fields above for the selected one.</p>
 </aside>
 <main><div id="ovEmpty" role="status"><p id="ovEmptyMessage"></p><button id="ovCreateTileset">Go to Tilesets</button></div>
  <div id="ovWork">
   <div class="ovTop"><strong id="ovTitle"></strong>
    <button id="ovZoomOut" aria-label="Zoom out">−</button><span id="ovZoomLabel"></span><button id="ovZoomIn" aria-label="Zoom in">+</button>
   </div>
   <div id="ovStage"><div id="ovCanvasWrap"><canvas id="ovCanvas"></canvas><div id="ovPlaceholderOverlay"></div></div></div>
   <div id="ovStampBar">
    <span>Tile <b id="ovStampTile"></b></span>
    <button id="ovFlipX">Flip X</button><button id="ovFlipY">Flip Y</button><button id="ovPriority">Priority</button>
    <span id="ovStampSource"></span>
    <span id="ovBankLabel"></span><button id="ovBankReset" hidden>Reset to default</button>
   </div>
   <section id="ovPaletteDock"><div class="paletteDockHead"><label id="ovConfigWrap">Group <select id="ovConfigPicker" aria-label="Palette bank group"></select></label></div><div id="ovSwatches"></div></section>
   <div id="ovStatus"></div>
  </div>
 </main>`;
 // Inserted before the footer, like every other editor host.
 $('spritePanel').after(host);

 const style=document.createElement('style');style.textContent=`
 #overlayEditor{position:relative;height:calc(100vh - 118px);display:grid;grid-template-columns:64px minmax(0,1fr)}
 #overlayEditor main{grid-column:2;display:flex;flex-direction:column;min-width:0;min-height:0}
 #ovEmpty{padding:12px 18px;background:var(--panel);border-bottom:1px solid var(--line)}
 #ovWork{flex:1;width:100%;max-width:100%;min-width:0;min-height:0;display:flex;flex-direction:column}
 .ovTop{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 18px;background:var(--panel)}
 #ovTitle{color:var(--ink);font-size:13px;margin-right:auto}
 #ovStage{flex:1;min-width:0;min-height:0;overflow:auto;background:#101113;padding:24px;display:flex;align-items:flex-start;justify-content:flex-start}
 #ovCanvasWrap{position:relative;display:inline-block;border:1px solid var(--text-dim);box-shadow:0 6px 24px #0008}
 #ovCanvas{image-rendering:pixelated;display:block;touch-action:none;cursor:crosshair;background:#000}
 #ovPlaceholderOverlay{position:absolute;inset:0;pointer-events:none}
 .ovPlaceholderRect{position:absolute;border:1px dashed #ffcf40;box-shadow:0 0 0 1px #111,0 0 0 2px #ffcf40 inset;display:flex;align-items:flex-start;justify-content:flex-start;overflow:hidden}
 .ovPlaceholderRect.selected{border-color:#36c9d6;box-shadow:0 0 0 1px #111,0 0 0 2px #36c9d6 inset}
 .ovPlaceholderRect span{font-size:9px;color:#ffcf40;background:#111318cc;padding:1px 3px;white-space:nowrap}
 .ovPlaceholderRect.selected span{color:#36c9d6}
 #ovStampBar{display:flex;align-items:center;gap:14px;padding:8px 18px;background:var(--panel);border-top:1px solid var(--line);font-size:11px}
 #ovStampSource{color:var(--text-dim)}
 #ovBankLabel{color:var(--text-dim)}
 #ovPaletteDock{background:var(--panel);border-top:1px solid var(--line);padding:10px 18px}
 #ovConfigWrap{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-dim)}
 #ovConfigPicker{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-size:11px;max-width:190px}
 #ovSwatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px;max-width:660px}
 #ovSwatches .paletteGroup{display:flex;align-items:center;gap:6px;height:26px;padding:0 6px;border-radius:3px;border:2px solid var(--line);background:none;cursor:pointer;font:inherit;color:var(--text-dim)}
 #ovSwatches .paletteGroup.chosenColor{border-color:var(--sel);box-shadow:0 0 0 1px var(--sel)}
 #ovSwatches .paletteGroup span:first-child{width:16px;flex-shrink:0;text-align:right;font-size:10px}
 #ovSwatches .rowChips{display:flex;gap:1px;flex-shrink:0}
 #ovSwatches .rowChips i{width:9px;height:16px;border-radius:1px;display:block}
 #ovStatus{padding:6px 18px;font-size:10px;color:var(--text-dim);background:var(--panel);border-top:1px solid var(--line)}
 .ovLibrary,.ovTileLibrary,.ovPlaceholderLibrary{position:absolute;z-index:8;left:64px;top:0;bottom:0;width:285px;padding:12px;padding-top:38px;background:var(--panel);border-right:1px solid var(--line);box-shadow:6px 0 20px #0008;display:flex;flex-direction:column;overflow:auto}
 .ovLibrary h2,.ovTileLibrary h2,.ovPlaceholderLibrary h2{font-size:12px;color:var(--text-dim);margin:0 0 8px;flex-shrink:0}
 .ovTileLibrary strong{display:block;font-size:10px;color:var(--text-dim);margin:8px 0 4px}
 .ovLibrary p,.ovTileLibrary p,.ovPlaceholderLibrary p{font-size:10px;line-height:1.5;color:var(--text-dim)}
 #ovList,#ovPrimaryList,#ovAltList,#ovPlaceholderList{border:1px solid var(--line);background:var(--bg);min-height:70px;max-height:140px;overflow:auto}
 #ovTileMap{width:100%;image-rendering:pixelated;touch-action:none;cursor:crosshair;margin-top:6px}
 .ovPhFields{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0}
 .ovPhFields label{font-size:10px;color:var(--text-dim);display:inline-flex;flex-direction:column;gap:2px}
 .ovPhFields input{width:60px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:4px}
 #overlayEditor:has(>.ovLibrary:not([hidden])),#overlayEditor:has(>.ovTileLibrary:not([hidden])),#overlayEditor:has(>.ovPlaceholderLibrary:not([hidden])){grid-template-columns:64px 285px minmax(0,1fr)}
 #overlayEditor main{grid-column:-2 / -1;grid-row:1;overflow:hidden}
 #overlayEditor>.ovLibrary,#overlayEditor>.ovTileLibrary,#overlayEditor>.ovPlaceholderLibrary{position:relative;grid-column:2;grid-row:1;left:auto;top:auto;bottom:auto;width:auto;min-width:0;min-height:0;box-shadow:none}
 `;
 document.head.append(style);

 // The overlay's fixed hardware size — specs/video.json's overlay entry
 // (columns:40, rows:25, scrolls:false).
 const OVERLAY_COLUMNS=40,OVERLAY_ROWS=25,OVERLAY_CELLS=1000;

 let overlayIndex=0,ovUndo=[],ovRedo=[];
 let ovTool='pencil',ovZoom=1,ovErasing=false,ovPainting=false,ovLast=null,ovAnchor=null;
 // Panning at high zoom: the Pan tool, Space-drag and middle-drag all scroll
 // #ovStage instead of painting, mirroring the tileset editor's shortcut.
 let ovSpaceHeld=false,ovPanDrag=null;
 let ovStamp={tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false};
 let ovPickAlt=false,placeholderIndex=-1;
 // Which of a 1bpp tileset's three pages the primary/alternate picker shows —
 // ephemeral preview state; the real CHRPLANE register is a build/runtime
 // concern, not authored here.
 let ovPrimaryPlane=0,ovAltPlane=0;

 const overlay=()=>overlays[overlayIndex];
 const ovTilesetById=id=>tilesets.find(t=>t.id===id);
 const primaryTileset=()=>ovTilesetById(overlay()?.tilesetId);
 const altTileset=()=>ovTilesetById(overlay()?.altTilesetId);
 const pickingTileset=()=>ovPickAlt?altTileset():primaryTileset();
 function blankCell(){return {tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false};}
 function makeCells(){return Array.from({length:OVERLAY_CELLS},blankCell);}
 function overlapsRect(a,b){return a.col<b.col+b.width&&b.col<a.col+a.width&&a.row<b.row+b.height&&b.row<a.row+a.height;}
 function firstFreeSpot(width,height,placeholders){
  for(let row=0;row<=OVERLAY_ROWS-height;row++)for(let col=0;col<=OVERLAY_COLUMNS-width;col++){
   const rect={col,row,width,height};
   if(!placeholders.some(p=>overlapsRect(p,rect)))return rect;
  }
  return null;
 }

 // An overlay's own data never mutates tilesets/palettes/shapes/animations/
 // backgrounds and nothing in those domains mutates an overlay, so this
 // history is independent rather than shared with theirs.
 function ovCheckpoint(){ovUndo.push(JSON.stringify({overlays}));if(ovUndo.length>50)ovUndo.shift();ovRedo=[];}
 function ovEdit(fn){ovCheckpoint();fn();markDirty();render();}
 function ovStepUndo(){if(!ovUndo.length)return;ovRedo.push(JSON.stringify({overlays}));({overlays}=JSON.parse(ovUndo.pop()));overlayIndex=Math.min(overlayIndex,Math.max(0,overlays.length-1));markDirty();render();}
 function ovStepRedo(){if(!ovRedo.length)return;ovUndo.push(JSON.stringify({overlays}));({overlays}=JSON.parse(ovRedo.pop()));overlayIndex=Math.min(overlayIndex,Math.max(0,overlays.length-1));markDirty();render();}

 function freshOverlayName(){let n=1;while(overlays.some(o=>o.name.toLowerCase()==='overlay_'+n))n++;return 'Overlay_'+n;}
 function freshPlaceholderName(a){let n=1;while(a.placeholders.some(p=>p.name.toLowerCase()==='placeholder_'+n))n++;return 'Placeholder_'+n;}
 function chooseOverlay(i){overlayIndex=i;placeholderIndex=-1;ovPrimaryPlane=0;ovAltPlane=0;render();}
 function renameOverlay(i,name){
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)||overlays.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique filename: letters, digits, underscore or hyphen.');return false;}
  ovEdit(()=>overlays[i].name=name);return true;
 }
 function renderOverlayList(){
  StudioShell.renderList($('ovList'),overlays,{selected:(o,i)=>i===overlayIndex,choose:(o,i)=>chooseOverlay(i),rename:renameOverlay,render,maxLength:48});
 }

 function renderTilesetAssignment(){
  const a=overlay();
  for(const [listId,field] of [['ovPrimaryList','tilesetId'],['ovAltList','altTilesetId']]){
   const list=$(listId);
   while(list.children.length>tilesets.length)list.lastElementChild.remove();
   tilesets.forEach((t,i)=>{
    let row=list.children[i];
    if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
    row.textContent=t.name;
    row.setAttribute('aria-selected',String(!!a&&t.id===a[field]));
    row.onclick=()=>{if(!a||t.id===a[field])return;ovEdit(()=>{a[field]=t.id;});};
    row.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();row.onclick();}};
   });
  }
  $('ovPrimaryPlaneLabel').hidden=primaryTileset()?.bpp!==1;$('ovPrimaryPlane').value=ovPrimaryPlane;
  $('ovAltPlaneLabel').hidden=altTileset()?.bpp!==1;$('ovAltPlane').value=ovAltPlane;
 }
 $('ovPrimaryPlane').onchange=()=>{ovPrimaryPlane=Number($('ovPrimaryPlane').value);paintCanvas();drawTileMap();};
 $('ovAltPlane').onchange=()=>{ovAltPlane=Number($('ovAltPlane').value);paintCanvas();drawTileMap();};

 function drawTileMap(){
  const source=pickingTileset(),canvas=$('ovTileMap'),ctx=canvas.getContext('2d');
  ctx.fillStyle='#252830';ctx.fillRect(0,0,256,256);
  if(source)for(let t=0;t<256;t++){
   const bank=source.tilePaletteBanks[t];
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const ink=tilePixel(source,t,x,y,ovPickAlt?ovAltPlane:ovPrimaryPlane);
    ctx.fillStyle=ink===0?'#252830':css565(bankColor(bank,ink));
    ctx.fillRect((t%16*8+x)*2,(Math.floor(t/16)*8+y)*2,2,2);
   }
  }
  ctx.strokeStyle='#ffffff30';ctx.lineWidth=1;ctx.beginPath();
  for(let n=0;n<=16;n++){ctx.moveTo(n*16,0);ctx.lineTo(n*16,256);ctx.moveTo(0,n*16);ctx.lineTo(256,n*16);}
  ctx.stroke();
  if(source&&ovStamp.chrAlt===ovPickAlt){
   ctx.strokeStyle='#36c9d6';ctx.lineWidth=2;
   ctx.strokeRect(ovStamp.tile%16*16+1,Math.floor(ovStamp.tile/16)*16+1,14,14);
  }
 }
 function tileMapCell(e){const r=$('ovTileMap').getBoundingClientRect();return {x:Math.max(0,Math.min(15,Math.floor((e.clientX-r.left)/r.width*16))),y:Math.max(0,Math.min(15,Math.floor((e.clientY-r.top)/r.height*16)))};}
 $('ovTileMap').onpointerdown=e=>{
  const source=pickingTileset();if(!source)return;
  const {x,y}=tileMapCell(e),tile=y*16+x;
  ovStamp={tile,paletteBank:source.tilePaletteBanks[tile],flipX:ovStamp.flipX,flipY:ovStamp.flipY,priority:ovStamp.priority,chrAlt:ovPickAlt};
  render();
 };
 $('ovPickSlot').onchange=()=>{ovPickAlt=$('ovPickSlot').value==='alt';render();};

 function paintCellAt(col,row){
  const a=overlay();
  if(col<0||row<0||col>=OVERLAY_COLUMNS||row>=OVERLAY_ROWS)return;
  a.cells[row*OVERLAY_COLUMNS+col]=ovErasing?blankCell():{...ovStamp};
 }
 function paintCanvas(){
  const a=overlay();if(!a)return;
  const canvas=$('ovCanvas');canvas.width=OVERLAY_COLUMNS*8;canvas.height=OVERLAY_ROWS*8;
  canvas.style.width=(OVERLAY_COLUMNS*8*ovZoom)+'px';canvas.style.height=(OVERLAY_ROWS*8*ovZoom)+'px';
  const ctx=canvas.getContext('2d'),primary=primaryTileset(),alt=altTileset();
  for(let row=0;row<OVERLAY_ROWS;row++)for(let col=0;col<OVERLAY_COLUMNS;col++){
   const cell=a.cells[row*OVERLAY_COLUMNS+col],source=cell.chrAlt?alt:primary;
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const px=cell.flipX?7-x:x,py=cell.flipY?7-y:y;
    const ink=source?tilePixel(source,cell.tile,px,py,cell.chrAlt?ovAltPlane:ovPrimaryPlane):0;
    ctx.fillStyle=ink===0?'#101113':css565(bankColor(cell.paletteBank,ink));
    ctx.fillRect(col*8+x,row*8+y,1,1);
   }
  }
 }
 function canvasCell(e){
  const r=$('ovCanvas').getBoundingClientRect();
  const px=(e.clientX-r.left)/r.width*OVERLAY_COLUMNS*8,py=(e.clientY-r.top)/r.height*OVERLAY_ROWS*8;
  return {col:Math.max(0,Math.min(OVERLAY_COLUMNS-1,Math.floor(px/8))),row:Math.max(0,Math.min(OVERLAY_ROWS-1,Math.floor(py/8)))};
 }
 function ovDrawTo(col,row){
  if(ovLast){
   const steps=Math.max(Math.abs(col-ovLast.col),Math.abs(row-ovLast.row));
   for(let i=0;i<=steps;i++)paintCellAt(Math.round(ovLast.col+(col-ovLast.col)*i/(steps||1)),Math.round(ovLast.row+(row-ovLast.row)*i/(steps||1)));
  }else paintCellAt(col,row);
  ovLast={col,row};markDirty();paintCanvas();
 }
 function ovFlood(col,row){
  const old=overlay().cells[row*OVERLAY_COLUMNS+col].tile,seen=new Uint8Array(OVERLAY_CELLS),stack=[[col,row]];
  while(stack.length){
   const [x,y]=stack.pop();
   if(x<0||y<0||x>=OVERLAY_COLUMNS||y>=OVERLAY_ROWS||seen[y*OVERLAY_COLUMNS+x]||overlay().cells[y*OVERLAY_COLUMNS+x].tile!==old)continue;
   seen[y*OVERLAY_COLUMNS+x]=1;paintCellAt(x,y);stack.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);
  }
 }
 function previewRectangle(col,row){
  paintCanvas();
  const ctx=$('ovCanvas').getContext('2d');
  const x0=Math.min(ovAnchor.col,col),x1=Math.max(ovAnchor.col,col),y0=Math.min(ovAnchor.row,row),y1=Math.max(ovAnchor.row,row);
  ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  ctx.strokeRect(x0*8+.5,y0*8+.5,(x1-x0+1)*8-1,(y1-y0+1)*8-1);
  ctx.lineDashOffset=4;ctx.strokeStyle='#111';
  ctx.strokeRect(x0*8+.5,y0*8+.5,(x1-x0+1)*8-1,(y1-y0+1)*8-1);
  ctx.restore();
 }
 function commitRectangle(col,row){
  const x0=Math.min(ovAnchor.col,col),x1=Math.max(ovAnchor.col,col),y0=Math.min(ovAnchor.row,row),y1=Math.max(ovAnchor.row,row);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)paintCellAt(x,y);
  ovAnchor=null;markDirty();paintCanvas();
 }
 function previewPlaceholder(col,row){
  paintCanvas();layoutPlaceholders();
  const ctx=$('ovCanvas').getContext('2d');
  const x0=Math.min(ovAnchor.col,col),x1=Math.max(ovAnchor.col,col),y0=Math.min(ovAnchor.row,row),y1=Math.max(ovAnchor.row,row);
  ctx.save();ctx.strokeStyle='#ffcf40';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  ctx.strokeRect(x0*8+.5,y0*8+.5,(x1-x0+1)*8-1,(y1-y0+1)*8-1);
  ctx.restore();
 }
 function addPlaceholder(rect){
  const a=overlay();
  if(a.placeholders.some(p=>overlapsRect(p,rect))){setStatus('That region overlaps an existing placeholder.');render();return;}
  ovEdit(()=>{a.placeholders.push({id:crypto.randomUUID(),name:freshPlaceholderName(a),...rect});placeholderIndex=a.placeholders.length-1;});
 }
 function commitPlaceholder(col,row){
  const x0=Math.min(ovAnchor.col,col),x1=Math.max(ovAnchor.col,col),y0=Math.min(ovAnchor.row,row),y1=Math.max(ovAnchor.row,row);
  ovAnchor=null;
  addPlaceholder({col:x0,row:y0,width:x1-x0+1,height:y1-y0+1});
 }
 $('ovCanvas').onpointerdown=e=>{
  e.preventDefault();if(!overlay())return;
  const {col,row}=canvasCell(e);
  if(ovTool==='picker'){const cell=overlay().cells[row*OVERLAY_COLUMNS+col];ovStamp={...cell};ovPickAlt=cell.chrAlt;render();return;}
  if(ovTool==='placeholder'){ovAnchor={col,row};$('ovCanvas').setPointerCapture(e.pointerId);previewPlaceholder(col,row);return;}
  ovErasing=e.button===2||ovTool==='eraser';
  ovCheckpoint();
  if(ovTool==='fill'){ovFlood(col,row);markDirty();paintCanvas();return;}
  if(ovTool==='rectangle'){ovAnchor={col,row};$('ovCanvas').setPointerCapture(e.pointerId);previewRectangle(col,row);return;}
  ovPainting=true;ovLast=null;$('ovCanvas').setPointerCapture(e.pointerId);ovDrawTo(col,row);
 };
 $('ovCanvas').onpointermove=e=>{
  if(!overlay())return;
  const {col,row}=canvasCell(e);
  if(ovAnchor){ovTool==='placeholder'?previewPlaceholder(col,row):previewRectangle(col,row);return;}
  if(ovPainting)ovDrawTo(col,row);
 };
 $('ovCanvas').onpointerup=e=>{
  if(!overlay())return;
  if(ovAnchor){const {col,row}=canvasCell(e);ovTool==='placeholder'?commitPlaceholder(col,row):commitRectangle(col,row);return;}
  ovPainting=false;ovLast=null;
 };
 $('ovCanvas').onpointercancel=()=>{ovAnchor=null;ovPainting=false;ovLast=null;paintCanvas();layoutPlaceholders();};
 $('ovCanvas').oncontextmenu=e=>e.preventDefault();

 function layoutPlaceholders(){
  const a=overlay(),wrap=$('ovPlaceholderOverlay');
  if(!a){wrap.replaceChildren();return;}
  wrap.replaceChildren(...a.placeholders.map((p,i)=>{
   const el=document.createElement('div');el.className='ovPlaceholderRect';el.classList.toggle('selected',i===placeholderIndex);
   el.style.left=(p.col*8*ovZoom)+'px';el.style.top=(p.row*8*ovZoom)+'px';
   el.style.width=(p.width*8*ovZoom)+'px';el.style.height=(p.height*8*ovZoom)+'px';
   const label=document.createElement('span');label.textContent=p.name;el.append(label);
   return el;
  }));
 }

 function choosePlaceholder(i){placeholderIndex=i;render();}
 function renamePlaceholder(i,name){
  const a=overlay();
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)||a.placeholders.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique name: letters, digits, underscore or hyphen.');return false;}
  ovEdit(()=>a.placeholders[i].name=name);return true;
 }
 function renderPlaceholderList(){
  const a=overlay(),items=a?.placeholders??[];
  StudioShell.renderList($('ovPlaceholderList'),items,{selected:(p,i)=>i===placeholderIndex,choose:(p,i)=>choosePlaceholder(i),rename:renamePlaceholder,render,maxLength:48});
 }
 function updatePlaceholderFields(){
  const a=overlay(),p=a?.placeholders[placeholderIndex];
  for(const id of ['ovPhCol','ovPhRow','ovPhWidth','ovPhHeight'])$(id).disabled=!p;
  $('ovPlaceholderDuplicate').disabled=!p;$('ovPlaceholderDelete').disabled=!p;
  if(!p)return;
  $('ovPhCol').value=p.col;$('ovPhRow').value=p.row;$('ovPhWidth').value=p.width;$('ovPhHeight').value=p.height;
 }
 function applyPlaceholderField(input,field,min,max){
  const a=overlay(),p=a?.placeholders[placeholderIndex];if(!p)return;
  const value=Math.max(min,Math.min(max,Math.round(Number(input.value))||min));
  const next={...p,[field]:value};
  if(next.col+next.width>OVERLAY_COLUMNS||next.row+next.height>OVERLAY_ROWS){setStatus(`That placeholder would fall outside the ${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} grid.`);render();return;}
  if(a.placeholders.some((q,i)=>i!==placeholderIndex&&overlapsRect(q,next))){setStatus('That change overlaps another placeholder.');render();return;}
  ovEdit(()=>{a.placeholders[placeholderIndex]=next;});
 }
 $('ovPhCol').onchange=()=>applyPlaceholderField($('ovPhCol'),'col',0,OVERLAY_COLUMNS-1);
 $('ovPhRow').onchange=()=>applyPlaceholderField($('ovPhRow'),'row',0,OVERLAY_ROWS-1);
 $('ovPhWidth').onchange=()=>applyPlaceholderField($('ovPhWidth'),'width',1,OVERLAY_COLUMNS);
 $('ovPhHeight').onchange=()=>applyPlaceholderField($('ovPhHeight'),'height',1,OVERLAY_ROWS);

 function updateStampBar(){
  $('ovStampTile').textContent=String(ovStamp.tile);
  $('ovFlipX').classList.toggle('on',ovStamp.flipX);
  $('ovFlipY').classList.toggle('on',ovStamp.flipY);
  $('ovPriority').classList.toggle('on',ovStamp.priority);
  $('ovStampSource').textContent=ovStamp.chrAlt?'Reads: Alternate':'Reads: Primary';
  const source=ovStamp.chrAlt?altTileset():primaryTileset(),authored=source?.tilePaletteBanks?.[ovStamp.tile];
  $('ovBankLabel').textContent='Bank '+String(ovStamp.paletteBank).padStart(2,'0');
  $('ovBankReset').hidden=authored===undefined||authored===ovStamp.paletteBank;
 }
 $('ovFlipX').onclick=()=>{ovStamp={...ovStamp,flipX:!ovStamp.flipX};render();};
 $('ovFlipY').onclick=()=>{ovStamp={...ovStamp,flipY:!ovStamp.flipY};render();};
 $('ovPriority').onclick=()=>{ovStamp={...ovStamp,priority:!ovStamp.priority};render();};
 $('ovBankReset').onclick=()=>{const source=ovStamp.chrAlt?altTileset():primaryTileset();if(source)ovStamp={...ovStamp,paletteBank:source.tilePaletteBanks[ovStamp.tile]};render();};

 // Each bank is a full 8-color palette, not one representative color — a
 // single swatch per bank made two banks that only differed past color 1
 // look identical. Clicking anywhere on a bank's row selects it, same as
 // the single-swatch buttons this replaces.
 function renderPaletteDock(){
  const dock=$('ovSwatches');
  if(dock.querySelectorAll('.paletteGroup').length!==16)dock.replaceChildren(...Array.from({length:16},(_,b)=>{
   const row=document.createElement('button');row.type='button';row.className='paletteGroup';row.dataset.palette=String(b);
   const label=document.createElement('span');label.textContent=String(b).padStart(2,'0');
   const chips=document.createElement('span');chips.className='rowChips';
   for(let i=0;i<8;i++)chips.append(document.createElement('i'));
   row.append(label,chips);
   row.onclick=()=>{ovStamp={...ovStamp,paletteBank:b};render();};
   return row;
  }));
  dock.querySelectorAll('.paletteGroup').forEach(row=>{
   const b=Number(row.dataset.palette),chips=row.querySelectorAll('.rowChips i');
   for(let i=0;i<8;i++)chips[i].style.background=css565(bankColor(b,i));
   row.classList.toggle('chosenColor',b===ovStamp.paletteBank);
   row.title=`Bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`;
  });
  syncOvConfigPicker();
 }
 function syncOvConfigPicker(){
  const picker=$('ovConfigPicker'),signature=paletteConfigs.map(c=>c.id+'|'+c.name).join(',');
  if(picker.dataset.signature!==signature){picker.dataset.signature=signature;picker.replaceChildren(...paletteConfigs.map(c=>new Option(c.name,c.id)));}
  picker.value=activeConfig()?.id??'';picker.disabled=paletteConfigs.length<2;
 }
 $('ovConfigPicker').onchange=()=>{activeConfigId=$('ovConfigPicker').value;redrawAll();};

 function render(){
  host.hidden=currentView!=='overlays';
  document.body.classList.toggle('overlayView',!host.hidden);
  if(host.hidden)return;
  overlayIndex=Math.min(overlayIndex,Math.max(0,overlays.length-1));
  const a=overlay();
  $('ovEmpty').hidden=!!a;
  $('ovEmptyMessage').textContent=!tilesets.length?'Create a tileset first. An overlay draws from two tilesets.':'Choose New overlay in the Overlays library to start painting.';
  $('ovCreateTileset').hidden=!!tilesets.length;
  $('ovWork').hidden=!a;
  renderOverlayList();
  if(!a)return;
  placeholderIndex=Math.min(placeholderIndex,a.placeholders.length-1);
  $('ovTitle').textContent=a.name;
  $('ovZoomLabel').textContent=ovZoom+'×';$('ovZoomOut').disabled=ovZoom===1;$('ovZoomIn').disabled=ovZoom===8;
  for(const [id,tool] of [['ovPencilTool','pencil'],['ovRectangleTool','rectangle'],['ovFillTool','fill'],['ovEraserTool','eraser'],['ovPickerTool','picker'],['ovPlaceholderTool','placeholder'],['ovPanTool','pan']])$(id).classList.toggle('on',ovTool===tool);
  $('ovCanvas').style.cursor=ovTool==='pan'?'grab':'';
  $('ovUndo').disabled=!ovUndo.length;$('ovRedo').disabled=!ovRedo.length;
  renderTilesetAssignment();
  $('ovPickSlot').value=ovPickAlt?'alt':'primary';
  drawTileMap();
  paintCanvas();
  layoutPlaceholders();
  renderPlaceholderList();
  updatePlaceholderFields();
  renderPaletteDock();
  updateStampBar();
  $('ovStatus').textContent=`${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} tiles · ${a.cells.length} cells · ${a.placeholders.length} placeholder(s) · primary ${primaryTileset()?.name??'missing'} · alternate ${altTileset()?.name??'missing'}`;
 }

 $('ovZoomIn').onclick=()=>{ovZoom=Math.min(8,ovZoom*2);render();};
 $('ovZoomOut').onclick=()=>{ovZoom=Math.max(1,ovZoom/2);render();};
 $('ovCreateTileset').onclick=()=>{showView('tiles');};

 const toolbarButton=(id,label,path)=>{const b=StudioShell.iconButton(id,label,path);b.querySelector('svg').setAttribute('width','20');b.querySelector('svg').setAttribute('height','20');return b;};
 for(const [id,label,path] of [
  ['ovNewAction','New overlay','<path d="M12 4v16M4 12h16"/>'],
  ['ovDuplicateAction','Duplicate overlay','<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5"/>'],
  ['ovDeleteAction','Delete overlay','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>']
 ]){$('ovActions').append(toolbarButton(id,label,path));}
 $('ovNewAction').onclick=()=>{
  if(overlays.length>=255){setStatus('A project holds at most 255 overlays.');return;}
  if(!tilesets.length){setStatus('Create a tileset first.');return;}
  ovEdit(()=>{
   overlays.push({id:crypto.randomUUID(),name:freshOverlayName(),tilesetId:tilesets[0].id,altTilesetId:tilesets[0].id,cells:makeCells(),placeholders:[]});
   overlayIndex=overlays.length-1;placeholderIndex=-1;ovPrimaryPlane=0;ovAltPlane=0;
  });
  setStatus('Created '+overlay().name+'.');
 };
 $('ovDuplicateAction').onclick=()=>{
  if(!overlay()||overlays.length>=255)return;
  ovEdit(()=>{const copy=structuredClone(overlay());copy.id=crypto.randomUUID();copy.name=freshOverlayName();overlays.push(copy);overlayIndex=overlays.length-1;placeholderIndex=-1;});
 };
 $('ovDeleteAction').onclick=()=>{
  if(!overlay()||!confirm('Delete overlay "'+overlay().name+'"?'))return;
  ovEdit(()=>{overlays.splice(overlayIndex,1);overlayIndex=Math.max(0,overlayIndex-1);placeholderIndex=-1;});
 };

 for(const [id,label,path] of [
  ['ovPlaceholderNew','New placeholder','<path d="M12 4v16M4 12h16"/>'],
  ['ovPlaceholderDuplicate','Duplicate placeholder','<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5"/>'],
  ['ovPlaceholderDelete','Delete placeholder','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>']
 ]){$('ovPlaceholderActions').append(toolbarButton(id,label,path));}
 $('ovPlaceholderNew').onclick=()=>{
  const a=overlay();if(!a)return;
  const rect=firstFreeSpot(Math.min(4,OVERLAY_COLUMNS),1,a.placeholders);
  if(!rect){setStatus('No free space for a new placeholder — resize or delete one first.');return;}
  addPlaceholder(rect);
 };
 $('ovPlaceholderDuplicate').onclick=()=>{
  const a=overlay();if(!a||placeholderIndex<0)return;
  const src=a.placeholders[placeholderIndex],rect=firstFreeSpot(src.width,src.height,a.placeholders);
  if(!rect){setStatus('No free space to duplicate this placeholder.');return;}
  addPlaceholder(rect);
 };
 $('ovPlaceholderDelete').onclick=()=>{
  const a=overlay();if(!a||placeholderIndex<0)return;
  if(!confirm('Delete placeholder "'+a.placeholders[placeholderIndex].name+'"?'))return;
  ovEdit(()=>{a.placeholders.splice(placeholderIndex,1);placeholderIndex=Math.min(placeholderIndex,a.placeholders.length-1);});
 };

 const rail=StudioShell.toolRail('ovRail','Overlay tools');host.prepend(rail);
 const library=host.querySelector('.ovLibrary'),tileLibrary=host.querySelector('.ovTileLibrary'),placeholderLibrary=host.querySelector('.ovPlaceholderLibrary');
 for(const [panel,id,label,path] of [
  [library,'ovLibraryToggle','Overlays','<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16"/><path d="M3 9h5M16 9h5M3 15h5M16 15h5"/>'],
  [tileLibrary,'ovTileLibraryToggle','Tilesets','<path d="M5 2h11l5 5v17H5zM16 2v6h5"/><path d="M8 12h10v8H8zM13 12v8M8 16h10"/>'],
  [placeholderLibrary,'ovPlaceholderLibraryToggle','Placeholders','<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/>']
 ]){
  const b=StudioShell.iconButton(id,label,path);rail.append(b);
  StudioShell.bindPanel({panel,button:b,group:'overlay',closeGroups:['overlay']});
 }
 library.hidden=true;tileLibrary.hidden=true;placeholderLibrary.hidden=true;
 for(const id of ['ovLibraryToggle','ovTileLibraryToggle','ovPlaceholderLibraryToggle'])$(id).setAttribute('aria-expanded','false');
 for(const [id,label,path,fn] of [
  ['ovPencilTool','Pencil (B)','<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',()=>{ovTool='pencil';render();}],
  ['ovRectangleTool','Rectangle fill (R)','<rect x="3" y="5" width="18" height="14"/>',()=>{ovTool='rectangle';render();}],
  ['ovFillTool','Fill (G)','<path d="m4 12 8-8 9 9-8 8z"/><path d="M7 9V5a3 3 0 0 1 6 0v3M4 12h16"/>',()=>{ovTool='fill';render();}],
  ['ovEraserTool','Eraser (E)','<path d="m3 15 9-10a2 2 0 0 1 3 0l7 6a2 2 0 0 1 0 3l-6 7H9z"/><path d="m8 10 10 8M9 21h14"/>',()=>{ovTool='eraser';render();}],
  ['ovPickerTool','Pick tile (I)','<path d="m15 4 2-2a3 3 0 0 1 4 4l-2 2 2 2-3 3-7-7 3-3z" fill="currentColor"/><path d="m12 8-9 9v4h4l9-9"/>',()=>{ovTool='picker';render();}],
  ['ovPlaceholderTool','Placeholder — drag to define a region','<rect x="4" y="4" width="16" height="10" rx="1" stroke-dasharray="3 3"/>',()=>{ovTool='placeholder';render();}],
  ['ovPanTool','Pan (H) — drag the canvas to scroll it; Space or the middle button pan with any other tool active','<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10V6a2 2 0 0 0-4 0v8c0 4 2 7 7 7s7-3 7-7v-4a2 2 0 0 0-4 0v1"/>',()=>{ovTool='pan';render();}],
  ['ovUndo','Undo','<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>',ovStepUndo],
  ['ovRedo','Redo','<path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7"/>',ovStepRedo],
 ]){const b=StudioShell.iconButton(id,label,path);b.onclick=fn;rail.append(b);}

 window.addEventListener('keydown',e=>{
  if(currentView!=='overlays'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();(e.shiftKey?ovStepRedo:ovStepUndo)();}
  // No `!ovSpaceHeld` guard here: held keys repeat-fire keydown, and every
  // one of those must be prevented too, or the un-prevented repeats leave
  // the browser's native "Space pages the nearest scrollable ancestor down"
  // behavior free to fire on #ovStage in between them.
  if(e.code==='Space'){ovSpaceHeld=true;e.preventDefault();$('ovCanvas').style.cursor='grab';}
 },true);
 window.addEventListener('keyup',e=>{if(e.code==='Space'){ovSpaceHeld=false;$('ovCanvas').style.cursor=ovTool==='pan'?'grab':'';}});
 window.addEventListener('blur',()=>{ovSpaceHeld=false;ovPanDrag=null;$('ovCanvas').style.cursor=ovTool==='pan'?'grab':'';});
 $('ovStage').addEventListener('pointerdown',e=>{
  if(!ovSpaceHeld&&e.button!==1&&ovTool!=='pan')return;
  e.preventDefault();e.stopImmediatePropagation();
  ovPanDrag={x:e.clientX,y:e.clientY,left:$('ovStage').scrollLeft,top:$('ovStage').scrollTop};
  $('ovStage').setPointerCapture(e.pointerId);$('ovCanvas').style.cursor='grabbing';
 },true);
 $('ovStage').addEventListener('pointermove',e=>{
  if(!ovPanDrag)return;e.preventDefault();e.stopImmediatePropagation();
  $('ovStage').scrollLeft=ovPanDrag.left+ovPanDrag.x-e.clientX;
  $('ovStage').scrollTop=ovPanDrag.top+ovPanDrag.y-e.clientY;
 },true);
 for(const type of ['pointerup','pointercancel'])$('ovStage').addEventListener(type,e=>{
  if(!ovPanDrag)return;ovPanDrag=null;e.stopImmediatePropagation();
  $('ovCanvas').style.cursor=ovSpaceHeld||ovTool==='pan'?'grab':'';
 },true);

 window.renderOverlays=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){oldShow(v);render();};
 render();
})();
