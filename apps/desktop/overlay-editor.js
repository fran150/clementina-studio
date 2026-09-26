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
 const host=document.createElement('section');host.id='overlayEditor';host.className='studioEditor';host.hidden=true;
 host.innerHTML=`<aside class="ovLibrary studioDock studioDockLeft"><h2>Overlays</h2><div id="ovActions" class="assetToolbar"></div><div id="ovList" role="listbox" aria-label="Overlays"></div><p>Double-click an overlay to rename it.</p></aside>
 <aside class="ovTileLibrary studioDock studioDockLeft"><h2>Tilesets</h2>
  <strong>Primary — reads when CHR_ALT is 0</strong><div id="ovPrimaryList" role="listbox" aria-label="Primary tileset"></div>
  <label id="ovPrimaryPlaneLabel">Plane <select id="ovPrimaryPlane" aria-label="Which 1bpp page the primary tileset shows"><option>0</option><option>1</option><option>2</option></select></label>
  <strong>Alternate — reads when CHR_ALT is 1</strong><div id="ovAltList" role="listbox" aria-label="Alternate tileset"></div>
  <label id="ovAltPlaneLabel">Plane <select id="ovAltPlane" aria-label="Which 1bpp page the alternate tileset shows"><option>0</option><option>1</option><option>2</option></select></label>
  <h2>Tile picker</h2>
  <label id="ovPickSlotWrap">Show <select id="ovPickSlot" aria-label="Which tileset the tile picker shows"><option value="primary">Primary</option><option value="alt">Alternate</option></select></label>
  <canvas id="ovTileMap" width="256" height="256"></canvas>
  <p id="ovTileNote">Click a tile to paint with it, or drag to pick a group.</p>
  <h2>Objects</h2>
  <div id="ovObjectList" role="listbox" aria-label="Tileset objects"></div>
  <p id="ovObjectNote">Click an object to pick its tiles as a group. Objects are named and edited in the Tilesets editor.</p>
 </aside>
 <aside class="ovPlaceholderLibrary studioDock studioDockLeft"><h2>Placeholders</h2><div id="ovPlaceholderActions" class="assetToolbar"></div><div id="ovPlaceholderList" role="listbox" aria-label="Placeholders"></div>
  <p>Drag one out with the Placeholder tool, or add one here. The selected placeholder's position and size are in the Placeholder panel on the right.</p>
 </aside>
 <aside class="ovPlaceholderProps studioDock studioDockRight"><h2>Placeholder</h2><p id="ovPhEmpty">Select a placeholder to edit its position and size.</p>
  <div class="ovPhFields">
   <label>Col <input id="ovPhCol" type="number" min="0" max="39" aria-label="Placeholder column"></label>
   <label>Row <input id="ovPhRow" type="number" min="0" max="24" aria-label="Placeholder row"></label>
   <label>Width <input id="ovPhWidth" type="number" min="1" max="40" aria-label="Placeholder width in tiles"></label>
   <label>Height <input id="ovPhHeight" type="number" min="1" max="25" aria-label="Placeholder height in tiles"></label>
  </div>
 </aside>
 <main class="studioMain"><div id="ovEmpty" class="studioEmpty" role="status"><p id="ovEmptyMessage"></p><div class="studioEmptyActions"><button id="ovEmptyNew">New overlay</button><button id="ovCreateTileset">Go to Tilesets</button></div></div>
  <div id="ovWork">
   <div class="ovTop"><div class="studioBarStart"><strong id="ovTitle"></strong></div><div class="studioBarEnd"></div></div>
   <div id="ovStage"><div id="ovCanvasWrap"><canvas id="ovCanvas"></canvas><div id="ovMarquee" class="cellMarquee" hidden></div><div id="ovPlaceholderOverlay"></div></div></div>
   <div id="ovStampBar">
    <span>Tile <b id="ovStampTile"></b></span>
    <span id="ovGroupLabel" hidden></span>
    <span id="ovSelectionLabel" hidden></span><button id="ovSelectionClear" hidden>Clear selection</button>
    <button id="ovFlipX">Flip X</button><button id="ovFlipY">Flip Y</button><button id="ovPriority">Priority</button>
    <span id="ovStampSource"></span>
    <span id="ovBankLabel"></span><button id="ovBankReset" hidden>Reset to default</button>
   </div>
   <section id="ovPaletteDock"><div id="ovSwatches"></div></section>
   <div id="ovStatus"></div>
  </div>
 </main>`;
 // Inserted before the footer, like every other editor host.
 $('spritePanel').after(host);

 const style=document.createElement('style');style.textContent=`
 #overlayEditor main{display:flex;flex-direction:column;overflow:hidden}
 #ovWork{flex:1;width:100%;max-width:100%;min-width:0;min-height:0;display:flex;flex-direction:column}
 .ovTop{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 18px;background:var(--panel)}
 #ovTitle{color:var(--ink);font-size:13px}
 #ovStage{flex:1;min-width:0;min-height:0;overflow:auto;background:#101113;padding:24px;display:flex;align-items:safe center;justify-content:safe center}
 #ovCanvasWrap{position:relative;flex:none;border:1px solid var(--text-dim);box-shadow:0 6px 24px #0008}
 #ovCanvas{image-rendering:pixelated;display:block;touch-action:none;cursor:crosshair;background:#000}
 #ovPlaceholderOverlay{position:absolute;inset:0;pointer-events:none}
 .ovPlaceholderRect{position:absolute;border:1px dashed #ffcf40;box-shadow:0 0 0 1px #111,0 0 0 2px #ffcf40 inset;display:flex;align-items:flex-start;justify-content:flex-start;overflow:hidden}
 .ovPlaceholderRect.selected{border-color:#36c9d6;box-shadow:0 0 0 1px #111,0 0 0 2px #36c9d6 inset}
 .ovPlaceholderRect span{font-size:9px;color:#ffcf40;background:#111318cc;padding:1px 3px;white-space:nowrap}
 .ovPlaceholderRect.selected span{color:#36c9d6}
 #ovStampBar{display:flex;align-items:center;gap:14px;padding:8px 18px;background:var(--panel);border-top:1px solid var(--line);font-size:11px}
 /* One fixed-height line, always: the canvas above is centered, so a bar
    that wrapped, or grew when a button appeared in it, would shift the art
    under the pointer mid-drag. */
 #ovStampBar{white-space:nowrap;overflow:hidden;height:42px;padding-top:0;padding-bottom:0}
 #ovStampBar>*{flex-shrink:0}
 #ovStampBar>span{flex-shrink:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
 #ovStampSource{color:var(--text-dim)}
 #ovGroupLabel{color:var(--ink)}
 #ovSelectionLabel{color:var(--sel)}
 #ovBankLabel{color:var(--text-dim)}
 #ovPaletteDock{background:var(--panel);border-top:1px solid var(--line);padding:10px 18px}
 #ovStatus{padding:6px 18px;font-size:10px;color:var(--text-dim);background:var(--panel);border-top:1px solid var(--line)}
 .ovTileLibrary strong{display:block;font-size:10px;color:var(--text-dim);margin:8px 0 4px}
 #ovList,#ovPrimaryList,#ovAltList,#ovPlaceholderList,#ovObjectList{border:1px solid var(--line);background:var(--bg);min-height:70px;max-height:140px;overflow:auto}
 #ovTileMap{width:100%;image-rendering:pixelated;touch-action:none;cursor:crosshair;margin-top:6px}
 .ovPhFields{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:6px 0}
 .ovPhFields[hidden]{display:none}
 .ovPhFields label{font-size:10px;color:var(--text-dim);display:inline-flex;flex-direction:column;gap:2px}
 .ovPhFields input{width:60px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:4px}
 `;
 document.head.append(style);

 // The overlay's fixed hardware size — specs/video.json's overlay entry
 // (columns:40, rows:25, scrolls:false).
 const OVERLAY_COLUMNS=40,OVERLAY_ROWS=25,OVERLAY_CELLS=1000;

 let overlayIndex=0;
 let ovTool='pencil',ovZoom=1,ovFittedId=null,zoomControls=null,ovErasing=false,ovPainting=false,ovLast=null,ovAnchor=null;
 // Panning at high zoom: the Pan tool, Space-drag and middle-drag all scroll
 // #ovStage instead of painting, mirroring the tileset editor's shortcut.
 let ovSpaceHeld=false,ovPanDrag=null;
 let ovStamp={tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false};
 let ovPickAlt=false,placeholderIndex=-1;
 // The tile picker's current pick, in tile coordinates of whichever tileset
 // ovPickAlt points at: one tile, or a group dragged out or loaded from an
 // Object, which the pencil stamps whole.
 let ovPickAnchor=null,ovPickRegion={col:0,row:0,width:1,height:1};
 // Which of a 1bpp tileset's three pages the primary/alternate picker shows —
 // ephemeral preview state; the real CHRPLANE register is a build/runtime
 // concern, not authored here.
 let ovPrimaryPlane=0,ovAltPlane=0;

 const overlay=()=>overlays[overlayIndex];
 // The Select tool (cell-grid.js): with cells selected, the flips, Priority
 // and a palette bank click edit those cells rather than the next stamp.
 const selection=CellGrid.cellSelection({grid:()=>overlay()?{width:OVERLAY_COLUMNS,height:OVERLAY_ROWS,cells:overlay().cells}:null,edit:(label,fn)=>ovEdit(label,fn),render:()=>{paintCanvas();layoutPlaceholders();updateStampBar();renderPaletteDock();syncEditActions();}});
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
 function ovCheckpoint(label='Edit the overlay'){ProjectHistory.checkpoint(['overlays'],label);}
 // An edit's label names it in the history: ovEdit('Delete X', fn).
 function ovEdit(...args){const label=typeof args[0]==='string'?args.shift():'Edit the overlay';ovCheckpoint(label);args[0]();markDirty();render();}
 document.addEventListener('studiohistory',()=>{overlayIndex=Math.max(0,Math.min(overlayIndex,overlays.length-1));selection.revalidate();});

 function freshOverlayName(){let n=1;while(overlays.some(o=>o.name.toLowerCase()==='overlay_'+n))n++;return 'Overlay_'+n;}
 function freshPlaceholderName(a){let n=1;while(a.placeholders.some(p=>p.name.toLowerCase()==='placeholder_'+n))n++;return 'Placeholder_'+n;}
 function chooseOverlay(i){overlayIndex=i;placeholderIndex=-1;ovPrimaryPlane=0;ovAltPlane=0;ovPickRegion={col:0,row:0,width:1,height:1};selection.reset();render();}
 function renameOverlay(i,name){
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)||overlays.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique filename: letters, digits, underscore or hyphen.');return false;}
  ovEdit('Rename an overlay',()=>overlays[i].name=name);return true;
 }
 function renderOverlayList(){
  StudioShell.renderList($('ovList'),overlays,{selected:(o,i)=>i===overlayIndex,choose:(o,i)=>chooseOverlay(i),rename:renameOverlay,render,maxLength:48,duplicate:(o,i)=>{chooseOverlay(i);$('ovDuplicateAction').click();},remove:(o,i)=>{chooseOverlay(i);$('ovDeleteAction').click();}});
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
    row.onclick=()=>{if(!a||t.id===a[field])return;ovEdit(field==='tilesetId'?'Change the primary tileset':'Change the alternate tileset',()=>{a[field]=t.id;});};
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
   ctx.strokeRect(ovPickRegion.col*16+1,ovPickRegion.row*16+1,ovPickRegion.width*16-2,ovPickRegion.height*16-2);
  }
 }
 function tileMapCell(e){const r=$('ovTileMap').getBoundingClientRect();return {x:Math.max(0,Math.min(15,Math.floor((e.clientX-r.left)/r.width*16))),y:Math.max(0,Math.min(15,Math.floor((e.clientY-r.top)/r.height*16)))};}
 // Dragging on the tile picker picks a rectangular group, as in the
 // background editor; a click is a 1×1 drag.
 function selectPickRegion(x,y){
  const source=pickingTileset();if(!source||!ovPickAnchor)return;
  pick({col:Math.min(ovPickAnchor.x,x),row:Math.min(ovPickAnchor.y,y),width:Math.abs(x-ovPickAnchor.x)+1,height:Math.abs(y-ovPickAnchor.y)+1});
 }
 function pick(region){
  const source=pickingTileset();ovPickRegion=region;
  const tile=region.row*16+region.col;
  ovStamp={...ovStamp,tile,paletteBank:source.tilePaletteBanks[tile],chrAlt:ovPickAlt};
  stampTool();render();
 }
 // Picking tiles is picking what to paint, so it switches to the pencil
 // unless a stamping tool is already active.
 function stampTool(){if(!['pencil','rectangle','fill'].includes(ovTool))setTool('pencil');}
 // The selection belongs to the Select tool, as in Photoshop: taking up a
 // painting tool drops it (panning keeps it), so the flips, Priority and a
 // palette bank click act on the selection while selecting and on the next
 // stamp while painting — never ambiguously on both.
 function setTool(name){if(name!=='select'&&name!=='pan')selection.reset();ovTool=name;render();}
 $('ovTileMap').onpointerdown=e=>{
  if(!pickingTileset())return;
  ovPickAnchor=tileMapCell(e);$('ovTileMap').setPointerCapture(e.pointerId);selectPickRegion(ovPickAnchor.x,ovPickAnchor.y);
 };
 $('ovTileMap').onpointermove=e=>{if(ovPickAnchor){const {x,y}=tileMapCell(e);selectPickRegion(x,y);}};
 $('ovTileMap').onpointerup=$('ovTileMap').onpointercancel=()=>ovPickAnchor=null;
 $('ovPickSlot').onchange=()=>{ovPickAlt=$('ovPickSlot').value==='alt';ovPickRegion={col:0,row:0,width:1,height:1};render();};
 // Objects are managed in the tileset editor; here they re-pick a saved group.
 function renderObjectList(){
  const objects=pickingTileset()?.compositions??[];
  StudioShell.renderList($('ovObjectList'),objects,{
   selected:o=>o.x===ovPickRegion.col&&o.y===ovPickRegion.row&&o.width===ovPickRegion.width&&o.height===ovPickRegion.height,
   choose:o=>pick({col:o.x,row:o.y,width:o.width,height:o.height}),render
  });
 }

 function paintCellAt(col,row){
  const a=overlay();
  if(col<0||row<0||col>=OVERLAY_COLUMNS||row>=OVERLAY_ROWS)return;
  a.cells[row*OVERLAY_COLUMNS+col]=ovErasing?blankCell():{...ovStamp};
 }
 // A multi-tile pick stamps its whole footprint with the pencil, each tile
 // keeping its own authored bank; a flipped group is mirrored whole.
 function paintGroupAt(col,row){
  if(ovErasing){paintCellAt(col,row);return;}
  const a=overlay(),source=ovStamp.chrAlt?altTileset():primaryTileset();
  for(let dy=0;dy<ovPickRegion.height;dy++)for(let dx=0;dx<ovPickRegion.width;dx++){
   const cx=col+dx,cy=row+dy;
   if(cx>=OVERLAY_COLUMNS||cy>=OVERLAY_ROWS)continue;
   const sx=ovStamp.flipX?ovPickRegion.width-1-dx:dx,sy=ovStamp.flipY?ovPickRegion.height-1-dy:dy;
   const tile=(ovPickRegion.row+sy)*16+(ovPickRegion.col+sx);
   a.cells[cy*OVERLAY_COLUMNS+cx]={tile,paletteBank:source?.tilePaletteBanks[tile]??0,flipX:ovStamp.flipX,flipY:ovStamp.flipY,priority:ovStamp.priority,chrAlt:ovStamp.chrAlt};
  }
 }
 function paintAt(col,row){(ovPickRegion.width>1||ovPickRegion.height>1?paintGroupAt:paintCellAt)(col,row);}
 function drawCell(ctx,cell,col,row){
  const source=cell.chrAlt?altTileset():primaryTileset();
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const px=cell.flipX?7-x:x,py=cell.flipY?7-y:y;
   const ink=source?tilePixel(source,cell.tile,px,py,cell.chrAlt?ovAltPlane:ovPrimaryPlane):0;
   ctx.fillStyle=ink===0?'#101113':css565(bankColor(cell.paletteBank,ink));
   ctx.fillRect(col*8+x,row*8+y,1,1);
  }
 }
 function paintCanvas(){
  const a=overlay();if(!a)return;
  const canvas=$('ovCanvas');canvas.width=OVERLAY_COLUMNS*8;canvas.height=OVERLAY_ROWS*8;
  canvas.style.width=(OVERLAY_COLUMNS*8*ovZoom)+'px';canvas.style.height=(OVERLAY_ROWS*8*ovZoom)+'px';
  const ctx=canvas.getContext('2d');
  for(let row=0;row<OVERLAY_ROWS;row++)for(let col=0;col<OVERLAY_COLUMNS;col++)drawCell(ctx,a.cells[row*OVERLAY_COLUMNS+col],col,row);
  selection.drawFloating(ctx,drawCell);
  selection.layout($('ovMarquee'),ovZoom);
 }
 function canvasCell(e){
  const r=$('ovCanvas').getBoundingClientRect();
  const px=(e.clientX-r.left)/r.width*OVERLAY_COLUMNS*8,py=(e.clientY-r.top)/r.height*OVERLAY_ROWS*8;
  return {col:Math.max(0,Math.min(OVERLAY_COLUMNS-1,Math.floor(px/8))),row:Math.max(0,Math.min(OVERLAY_ROWS-1,Math.floor(py/8)))};
 }
 function ovDrawTo(col,row){
  if(ovLast){
   const steps=Math.max(Math.abs(col-ovLast.col),Math.abs(row-ovLast.row));
   for(let i=0;i<=steps;i++)paintAt(Math.round(ovLast.col+(col-ovLast.col)*i/(steps||1)),Math.round(ovLast.row+(row-ovLast.row)*i/(steps||1)));
  }else paintAt(col,row);
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
  ovEdit('New placeholder',()=>{a.placeholders.push({id:crypto.randomUUID(),name:freshPlaceholderName(a),...rect});placeholderIndex=a.placeholders.length-1;});
 }
 function commitPlaceholder(col,row){
  const x0=Math.min(ovAnchor.col,col),x1=Math.max(ovAnchor.col,col),y0=Math.min(ovAnchor.row,row),y1=Math.max(ovAnchor.row,row);
  ovAnchor=null;
  addPlaceholder({col:x0,row:y0,width:x1-x0+1,height:y1-y0+1});
 }
 $('ovCanvas').onpointerdown=e=>{
  e.preventDefault();if(!overlay()||(e.button===2&&!painting()))return;
  const {col,row}=canvasCell(e);
  if(selection.pasting||ovTool==='select'){$('ovCanvas').setPointerCapture(e.pointerId);selection.down({col,row});return;}
  if(ovTool==='picker'){const cell=overlay().cells[row*OVERLAY_COLUMNS+col];ovStamp={...cell};ovPickAlt=cell.chrAlt;ovPickRegion={col:cell.tile%16,row:Math.floor(cell.tile/16),width:1,height:1};render();return;}
  if(ovTool==='placeholder'){ovAnchor={col,row};$('ovCanvas').setPointerCapture(e.pointerId);previewPlaceholder(col,row);return;}
  ovErasing=e.button===2||ovTool==='eraser';
  ovCheckpoint(ovTool==='fill'?'Fill':ovTool==='rectangle'?'Draw a rectangle':ovErasing?'Erase':'Paint');
  if(ovTool==='fill'){ovFlood(col,row);markDirty();paintCanvas();return;}
  if(ovTool==='rectangle'){ovAnchor={col,row};$('ovCanvas').setPointerCapture(e.pointerId);previewRectangle(col,row);return;}
  ovPainting=true;ovLast=null;$('ovCanvas').setPointerCapture(e.pointerId);ovDrawTo(col,row);
 };
 $('ovCanvas').onpointermove=e=>{
  if(!overlay())return;
  const {col,row}=canvasCell(e);
  if(selection.move({col,row}))return;
  if(ovTool==='select')$('ovCanvas').style.cursor=selection.contains({col,row})?'move':'';
  if(ovAnchor){ovTool==='placeholder'?previewPlaceholder(col,row):previewRectangle(col,row);return;}
  if(ovPainting)ovDrawTo(col,row);
 };
 $('ovCanvas').onpointerup=e=>{
  if(!overlay())return;
  if(selection.up())return;
  if(ovAnchor){const {col,row}=canvasCell(e);ovTool==='placeholder'?commitPlaceholder(col,row):commitRectangle(col,row);return;}
  ovPainting=false;ovLast=null;
 };
 $('ovCanvas').onpointercancel=()=>{ovAnchor=null;ovPainting=false;ovLast=null;selection.cancel();layoutPlaceholders();};
 // Right-click erases while a painting tool is active, the Aseprite way;
 // with any other tool it opens the edit menu for the selection.
 function painting(){return ['pencil','rectangle','fill','eraser'].includes(ovTool);}
 $('ovCanvas').oncontextmenu=e=>{e.preventDefault();if(!overlay()||painting())return;const sel=!!selection.rect,paste=()=>{if(selection.startPaste()){setTool('select');setStatus('Click to place the paste. Escape cancels.');}};
  StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Cut',hint:'Mod+X',disabled:!sel,run:()=>selection.cut()},{label:'Copy',hint:'Mod+C',disabled:!sel,run:()=>selection.copy()},{label:'Paste',hint:'Mod+V',disabled:!StudioShell.clipboard.has('cells'),run:paste},{label:'Delete',hint:'Delete',disabled:!sel,run:()=>selection.remove()},'-',
   {label:'Flip horizontally',hint:'Shift+H',disabled:!sel,run:()=>selection.flip('x')},{label:'Flip vertically',hint:'Shift+V',disabled:!sel,run:()=>selection.flip('y')},{label:'Priority',disabled:!sel,run:()=>$('ovPriority').click()},'-',
   {label:'Select all',hint:'Mod+A',run:()=>{setTool('select');selection.selectAll();}},{label:'Deselect',hint:'Esc',disabled:!sel,run:()=>selection.deselect()}]);};

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
  ovEdit('Rename a placeholder',()=>a.placeholders[i].name=name);return true;
 }
 function renderPlaceholderList(){
  const a=overlay(),items=a?.placeholders??[];
  StudioShell.renderList($('ovPlaceholderList'),items,{selected:(p,i)=>i===placeholderIndex,choose:(p,i)=>choosePlaceholder(i),rename:renamePlaceholder,render,maxLength:48,duplicate:(p,i)=>{choosePlaceholder(i);$('ovPlaceholderDuplicate').click();},remove:(p,i)=>{choosePlaceholder(i);$('ovPlaceholderDelete').click();}});
 }
 function updatePlaceholderFields(){
  const a=overlay(),p=a?.placeholders[placeholderIndex];
  for(const id of ['ovPhCol','ovPhRow','ovPhWidth','ovPhHeight'])$(id).disabled=!p;
  $('ovPlaceholderDuplicate').disabled=!p;$('ovPlaceholderDelete').disabled=!p;
  $('ovPhEmpty').hidden=!!p;host.querySelector('.ovPhFields').hidden=!p;
  if(!p)return;
  $('ovPhCol').value=p.col;$('ovPhRow').value=p.row;$('ovPhWidth').value=p.width;$('ovPhHeight').value=p.height;
 }
 function applyPlaceholderField(input,field,min,max){
  const a=overlay(),p=a?.placeholders[placeholderIndex];if(!p)return;
  const value=Math.max(min,Math.min(max,Math.round(Number(input.value))||min));
  const next={...p,[field]:value};
  if(next.col+next.width>OVERLAY_COLUMNS||next.row+next.height>OVERLAY_ROWS){setStatus(`That placeholder would fall outside the ${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} grid.`);render();return;}
  if(a.placeholders.some((q,i)=>i!==placeholderIndex&&overlapsRect(q,next))){setStatus('That change overlaps another placeholder.');render();return;}
  ovEdit('Move or resize a placeholder',()=>{a.placeholders[placeholderIndex]=next;});
 }
 $('ovPhCol').onchange=()=>applyPlaceholderField($('ovPhCol'),'col',0,OVERLAY_COLUMNS-1);
 $('ovPhRow').onchange=()=>applyPlaceholderField($('ovPhRow'),'row',0,OVERLAY_ROWS-1);
 $('ovPhWidth').onchange=()=>applyPlaceholderField($('ovPhWidth'),'width',1,OVERLAY_COLUMNS);
 $('ovPhHeight').onchange=()=>applyPlaceholderField($('ovPhHeight'),'height',1,OVERLAY_ROWS);

 function updateStampBar(){
  const group=ovPickRegion.width>1||ovPickRegion.height>1,sel=selection.rect;
  $('ovStampTile').textContent=String(ovStamp.tile);
  $('ovGroupLabel').hidden=!group;
  $('ovGroupLabel').textContent=`Group ${ovPickRegion.width} × ${ovPickRegion.height} — each tile keeps its own bank`;
  $('ovSelectionLabel').hidden=!sel;
  if(sel)$('ovSelectionLabel').textContent=`Selected ${sel.width} × ${sel.height} — flips, Priority and a palette bank edit these tiles in place`;
  $('ovSelectionClear').hidden=!sel;
  // With a selection the flips and Priority act on it; otherwise they are the
  // next stamp's settings, shown pressed when on.
  $('ovFlipX').classList.toggle('on',!sel&&ovStamp.flipX);
  $('ovFlipY').classList.toggle('on',!sel&&ovStamp.flipY);
  $('ovPriority').classList.toggle('on',!sel&&ovStamp.priority);
  $('ovStampSource').textContent=ovStamp.chrAlt?'Reads: Alternate':'Reads: Primary';
  const source=ovStamp.chrAlt?altTileset():primaryTileset(),authored=source?.tilePaletteBanks?.[ovStamp.tile];
  $('ovBankLabel').textContent=group&&!sel?'':'Bank '+String(ovStamp.paletteBank).padStart(2,'0');
  $('ovBankReset').hidden=sel?false:(group||authored===undefined||authored===ovStamp.paletteBank);
 }
 // With a selection these edit the selected cells, as one undo step, the
 // same as in the background editor; otherwise they set up the next stamp.
 $('ovFlipX').onclick=()=>{if(selection.rect)selection.flip('x');else{ovStamp={...ovStamp,flipX:!ovStamp.flipX};render();}};
 $('ovFlipY').onclick=()=>{if(selection.rect)selection.flip('y');else{ovStamp={...ovStamp,flipY:!ovStamp.flipY};render();}};
 $('ovPriority').onclick=()=>{if(selection.rect){const on=!selection.selected().every(c=>c.priority);selection.apply(c=>c.priority=on,on?'Set priority':'Clear priority');}else{ovStamp={...ovStamp,priority:!ovStamp.priority};render();}};
 $('ovBankReset').onclick=()=>{
  if(selection.rect){selection.apply(cell=>{const source=cell.chrAlt?altTileset():primaryTileset();if(source)cell.paletteBank=source.tilePaletteBanks[cell.tile];},'Reset palette banks');return;}
  const source=ovStamp.chrAlt?altTileset():primaryTileset();if(source)ovStamp={...ovStamp,paletteBank:source.tilePaletteBanks[ovStamp.tile]};render();
 };
 $('ovSelectionClear').onclick=()=>selection.deselect();

 // Each bank is a full 8-color palette, not one representative color — a
 // single swatch per bank made two banks that only differed past color 1
 // look identical. Clicking anywhere on a bank's row selects it, same as
 // the single-swatch buttons this replaces.
 function renderPaletteDock(){
  StudioShell.bankDock($('ovSwatches'),b=>{if(selection.rect)selection.apply(cell=>cell.paletteBank=b,`Set bank ${b}`);else{ovStamp={...ovStamp,paletteBank:b};render();}});
  // A picked group has no single bank to set — unless cells are selected,
  // which a bank click then sets whatever is picked.
  const sel=selection.rect,group=!sel&&(ovPickRegion.width>1||ovPickRegion.height>1);
  StudioShell.syncBankDock($('ovSwatches'),{color:(b,i)=>css565(bankColor(b,i)),transparentZero:true,chosen:group||sel?null:ovStamp.paletteBank,used:new Set(overlay().cells.map(c=>c.paletteBank)),disabled:group,
   title:b=>group?'A group keeps each tile\'s own authored bank':sel?`Set the selected tiles to bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`:`Bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`});
 }

 function render(){
  host.hidden=currentView!=='overlays';
  document.body.classList.toggle('overlayView',!host.hidden);
  if(host.hidden)return;
  overlayIndex=Math.min(overlayIndex,Math.max(0,overlays.length-1));
  const a=overlay();
  $('ovEmpty').hidden=!!a;
  $('ovEmptyMessage').textContent=!tilesets.length?'Create a tileset first. An overlay draws from two tilesets.':'No overlays yet. An overlay draws from two tilesets.';$('ovEmptyNew').hidden=!tilesets.length;
  $('ovCreateTileset').hidden=!!tilesets.length;
  $('ovWork').hidden=!a;
  renderOverlayList();
  if(!a){$('ovStatus').textContent='';return;}
  placeholderIndex=Math.min(placeholderIndex,a.placeholders.length-1);
  $('ovTitle').textContent=a.name;
  zoomControls?.sync();
  for(const [id,tool] of [['ovSelectTool','select'],['ovPencilTool','pencil'],['ovRectangleTool','rectangle'],['ovFillTool','fill'],['ovEraserTool','eraser'],['ovPickerTool','picker'],['ovPlaceholderTool','placeholder'],['ovPanTool','pan']])$(id).classList.toggle('on',ovTool===tool);
  $('ovCanvas').style.cursor=ovTool==='pan'?'grab':'';
  $('ovUndo').disabled=!ProjectHistory.canUndo();$('ovRedo').disabled=!ProjectHistory.canRedo();syncEditActions();
  renderTilesetAssignment();
  $('ovPickSlot').value=ovPickAlt?'alt':'primary';
  drawTileMap();
  renderObjectList();
  paintCanvas();
  layoutPlaceholders();
  renderPlaceholderList();
  updatePlaceholderFields();
  renderPaletteDock();
  updateStampBar();
  $('ovStatus').textContent=`${OVERLAY_COLUMNS} × ${OVERLAY_ROWS} tiles · ${a.cells.length} cells · ${a.placeholders.length} placeholder(s) · primary ${primaryTileset()?.name??'missing'} · alternate ${altTileset()?.name??'missing'}`;
  // An overlay opens fitted to the window; returning to one keeps its zoom.
  // Measured last, once the docks around the stage have their final size.
  if(a.id!==ovFittedId){ovFittedId=a.id;ovZoom=fitLevel();render();}
 }

 const fitLevel=()=>StudioShell.fitZoom($('ovStage').clientWidth-48,$('ovStage').clientHeight-48,OVERLAY_COLUMNS*8,OVERLAY_ROWS*8);
 zoomControls=StudioShell.canvasZoom({view:'overlays',ids:{fit:'ovFit',actual:'ovActualSize',zoomOut:'ovZoomOut',label:'ovZoomLabel',zoomIn:'ovZoomIn'},
  get:()=>ovZoom,set:(next,x,y)=>StudioShell.zoomScrolled($('ovStage'),$('ovCanvas'),ovZoom,next,z=>{ovZoom=z;render();},x,y),
  fit:()=>{if(!overlay())return;ovZoom=fitLevel();render();$('ovStage').scrollLeft=$('ovStage').scrollTop=0;},
  wheel:$('ovStage'),busy:()=>!!(ovPainting||ovAnchor||selection.busy||ovPanDrag)});
 host.querySelector('.ovTop .studioBarStart').after(zoomControls.group);host.querySelector('.ovTop .studioBarEnd').append(StudioShell.helpButton());
 $('ovCreateTileset').onclick=()=>{showView('tiles');};$('ovEmptyNew').onclick=()=>$('ovNewAction').click();

 for(const [id,label,icon] of [['ovNewAction','New overlay','newItem'],['ovDuplicateAction','Duplicate overlay','duplicate'],['ovDeleteAction','Delete overlay','delete']])
  $('ovActions').append(StudioShell.iconButton(id,label,icon));
 $('ovNewAction').onclick=()=>{
  if(overlays.length>=255){setStatus('A project holds at most 255 overlays.');return;}
  if(!tilesets.length){setStatus('Create a tileset first.');return;}
  ovEdit('New overlay',()=>{
   overlays.push({id:crypto.randomUUID(),name:freshOverlayName(),tilesetId:tilesets[0].id,altTilesetId:tilesets[0].id,cells:makeCells(),placeholders:[]});
   overlayIndex=overlays.length-1;placeholderIndex=-1;ovPrimaryPlane=0;ovAltPlane=0;
  });
  setStatus('Created '+overlay().name+'.');
 };
 $('ovDuplicateAction').onclick=()=>{
  if(!overlay()||overlays.length>=255)return;
  ovEdit('Duplicate '+overlay().name,()=>{const copy=structuredClone(overlay());copy.id=crypto.randomUUID();copy.name=freshOverlayName();overlays.push(copy);overlayIndex=overlays.length-1;placeholderIndex=-1;});
 };
 $('ovDeleteAction').onclick=()=>{
  if(!overlay())return;setStatus(`Deleted ${overlay().name}. Ctrl/Cmd+Z brings it back.`);
  ovEdit('Delete '+overlay().name,()=>{overlays.splice(overlayIndex,1);overlayIndex=Math.max(0,overlayIndex-1);placeholderIndex=-1;});
 };

 for(const [id,label,icon] of [['ovPlaceholderNew','New placeholder','newItem'],['ovPlaceholderDuplicate','Duplicate placeholder','duplicate'],['ovPlaceholderDelete','Delete placeholder','delete']])
  $('ovPlaceholderActions').append(StudioShell.iconButton(id,label,icon));
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
  setStatus(`Deleted ${a.placeholders[placeholderIndex].name}. Ctrl/Cmd+Z brings it back.`);
  ovEdit('Delete '+a.placeholders[placeholderIndex].name,()=>{a.placeholders.splice(placeholderIndex,1);placeholderIndex=Math.min(placeholderIndex,a.placeholders.length-1);});
 };

 // Left rail: the panels to pick from, then the tools. Right rail: the flips
 // and priority the next stamp takes.
 const library=host.querySelector('.ovLibrary'),tileLibrary=host.querySelector('.ovTileLibrary'),placeholderLibrary=host.querySelector('.ovPlaceholderLibrary');
 const panelToggle=(panel,id,label,icon)=>{const b=StudioShell.iconButton(id,label,icon);StudioShell.bindPanel({panel,button:b,group:'ovLeft',closeGroups:['ovLeft']});return b;};
 const tool=(id,label,icon,name)=>{const b=StudioShell.iconButton(id,label,icon);b.onclick=()=>setTool(name);return b;};
 const rail=StudioShell.toolRail('ovRail','Overlay tools');host.prepend(rail);
 StudioShell.railLayout(rail,[
  [panelToggle(library,'ovLibraryToggle','Overlays','overlay'),panelToggle(tileLibrary,'ovTileLibraryToggle','Tilesets and tile picker','tilePicker'),panelToggle(placeholderLibrary,'ovPlaceholderLibraryToggle','Placeholders','placeholder')],
  [tool('ovSelectTool','Select (S) — drag over cells, then flip, set Priority, click a palette bank, copy or move them','select','select'),
   tool('ovPencilTool','Pencil (B)','pencil','pencil'),tool('ovEraserTool','Eraser (E)','eraser','eraser'),tool('ovFillTool','Fill (G)','fill','fill'),
   tool('ovRectangleTool','Rectangle (R)','rectangle','rectangle'),tool('ovPickerTool','Pick tile (I)','picker','picker'),
   tool('ovPlaceholderTool','Placeholder — drag to define a region','placeholderTool','placeholder'),
   tool('ovPanTool','Pan (H) — drag the canvas to scroll it; Space or the middle button pan with any other tool active','pan','pan')],
 ],[Object.assign(StudioShell.iconButton('ovCopy','Copy selection (Ctrl/Cmd+C)','copy'),{onclick:()=>selection.copy()&&syncEditActions()}),
  Object.assign(StudioShell.iconButton('ovPaste','Paste (Ctrl/Cmd+V) — click to place it','paste'),{onclick:()=>{if(selection.startPaste()){setTool('select');setStatus('Click to place the paste. Escape cancels.');}}}),
  Object.assign(StudioShell.iconButton('ovUndo','Undo (Ctrl/Cmd+Z)','undo'),{onclick:ProjectHistory.undo}),Object.assign(StudioShell.iconButton('ovRedo','Redo (Ctrl/Cmd+Shift+Z)','redo'),{onclick:ProjectHistory.redo})]);
 const sideRail=StudioShell.toolRail('ovSideRail','Selection','right');host.append(sideRail);
 for(const [id,icon,label] of [['ovFlipX','flipH','Flip horizontally (Shift+H) — the selection, or the next stamp'],['ovFlipY','flipV','Flip vertically (Shift+V) — the selection, or the next stamp'],['ovPriority','priority','Priority, drawn in front of sprites — the selection, or the next stamp']])StudioShell.setIcon($(id),icon,label);
 const placeholderPropsToggle=StudioShell.iconButton('ovPlaceholderPropsToggle','Placeholder — the selected one\'s position and size','properties');
 // Open from the start, like the animation editor's frame panel: a panel that
 // opened itself on selection would shift the centered canvas under the pointer.
 StudioShell.bindPanel({panel:host.querySelector('.ovPlaceholderProps'),button:placeholderPropsToggle,group:'ovRight',closeGroups:['ovRight']});
 StudioShell.railLayout(sideRail,[[placeholderPropsToggle],[$('ovFlipX'),$('ovFlipY'),$('ovPriority')],[Object.assign(StudioShell.iconButton('ovDeleteSelection','Clear the selected cells (Delete)','delete'),{onclick:()=>selection.remove()})]]);
 StudioShell.editActions('overlays',{copy:()=>selection.copy(),cut:()=>selection.cut(),paste:()=>{if(selection.startPaste()){setTool('select');setStatus('Click to place the paste. Escape cancels.');}}});
 // Copy, Paste and Delete follow the selection and the clipboard.
 function syncEditActions(){$('ovCopy').disabled=$('ovDeleteSelection').disabled=!selection.rect;$('ovPaste').disabled=!StudioShell.clipboard.has('cells');}
 document.addEventListener('studioclipboard',()=>{if(!host.hidden)syncEditActions();});
 library.hidden=true;tileLibrary.hidden=true;placeholderLibrary.hidden=true;
 for(const id of ['ovLibraryToggle','ovTileLibraryToggle','ovPlaceholderLibraryToggle'])$(id).setAttribute('aria-expanded','false');

 window.addEventListener('keydown',e=>{
  if(currentView!=='overlays'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  // Selection and clipboard keys, the same in every grid editor.
  const command=selection.key(e);
  if(command){e.preventDefault();e.stopImmediatePropagation();if((command==='selectAll'||command==='paste')&&ovTool!=='select')setTool('select');if(command==='paste')setStatus('Click to place the paste. Escape cancels.');return;}
  // No `!ovSpaceHeld` guard here: held keys repeat-fire keydown, and every
  // one of those must be prevented too, or the un-prevented repeats leave
  // the browser's native "Space pages the nearest scrollable ancestor down"
  // behavior free to fire on #ovStage in between them.
  if(e.code==='Space'){ovSpaceHeld=true;e.preventDefault();$('ovCanvas').style.cursor='grab';}
  // Single-key tool shortcuts, the same letters as the tileset editor's.
  if(e.metaKey||e.ctrlKey||e.altKey||document.querySelector('dialog[open]'))return;
  if(e.shiftKey&&(e.key.toLowerCase()==='h'||e.key.toLowerCase()==='v')){e.preventDefault();e.stopImmediatePropagation();$(e.key.toLowerCase()==='h'?'ovFlipX':'ovFlipY').click();return;}
  const tool={s:'ovSelectTool',b:'ovPencilTool',r:'ovRectangleTool',g:'ovFillTool',e:'ovEraserTool',i:'ovPickerTool',h:'ovPanTool'}[e.key.toLowerCase()];
  if(tool&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();$(tool).click();}
 },true);
 window.addEventListener('keyup',e=>{if(e.code==='Space'){ovSpaceHeld=false;$('ovCanvas').style.cursor=ovTool==='pan'?'grab':'';}});
 window.addEventListener('blur',()=>{ovSpaceHeld=false;ovPanDrag=null;$('ovCanvas').style.cursor=ovTool==='pan'?'grab':'';});
 $('ovStage').addEventListener('pointerdown',e=>{
  if(e.button===2||(!ovSpaceHeld&&e.button!==1&&ovTool!=='pan'))return;
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

 StudioShell.viewStatus('overlays',$('ovStatus'));
 window.renderOverlays=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){oldShow(v);render();};
 render();
})();
