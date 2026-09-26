// Background authoring. A background is a free-sized canvas of cells, each
// naming a tile, a palette bank, flips, priority, and which of two tilesets it
// reads (CHR_ALT). The six hardware BGMODE viewport sizes are a preview aid
// here, not a canvas limit — see docs/model.md and specs/video.json.
//
// Two nested preview rectangles model two different hardware facts: the
// outer one is the BGMODE-sized window that would be resident in the active
// BGSET's four physical tables (what's loaded), the inner one is the fixed
// 320×200 physical screen positioned by SCROLL_X/SCROLL_Y within it (what's
// actually visible). SCROLL_X/Y wrap at the mode's own pixel size — see
// clementina-rom/docs/basic-video.md's SCROLL entry — so the inner rectangle
// wraps too, and the camera panel's table-index math mirrors
// clementina-video-client/internal/render/renderer.go's bgTableAndLocal.
(() => {
 const host=document.createElement('section');host.id='backgroundEditor';host.className='studioEditor';host.hidden=true;
 host.innerHTML=`<aside class="bgLibrary studioDock studioDockLeft"><h2>Backgrounds</h2><div id="bgActions" class="assetToolbar"></div><div id="bgList" role="listbox" aria-label="Backgrounds"></div><p>Double-click a background to rename it.</p></aside>
 <aside class="bgTileLibrary studioDock studioDockLeft"><h2>Tilesets</h2>
  <strong>Primary — reads when CHR_ALT is 0</strong><div id="bgPrimaryList" role="listbox" aria-label="Primary tileset"></div>
  <label id="bgPrimaryPlaneLabel">Plane <select id="bgPrimaryPlane" aria-label="Which 1bpp page the primary tileset shows"><option>0</option><option>1</option><option>2</option></select></label>
  <strong>Alternate — reads when CHR_ALT is 1</strong><div id="bgAltList" role="listbox" aria-label="Alternate tileset"></div>
  <label id="bgAltPlaneLabel">Plane <select id="bgAltPlane" aria-label="Which 1bpp page the alternate tileset shows"><option>0</option><option>1</option><option>2</option></select></label>
  <h2>Tile picker</h2>
  <label id="bgPickSlotWrap">Show <select id="bgPickSlot" aria-label="Which tileset the tile picker shows"><option value="primary">Primary</option><option value="alt">Alternate</option></select></label>
  <canvas id="bgTileMap" width="256" height="256"></canvas>
  <p id="bgTileNote">Click a tile to paint with it, or drag to pick a group.</p>
  <h2>Objects</h2>
  <div id="bgObjectList" role="listbox" aria-label="Tileset objects"></div>
  <p id="bgObjectNote">Click an object to pick its tiles as a group. Objects are named and edited in the Tilesets editor.</p>
 </aside>
 <aside class="bgStatusPanel studioDock studioDockRight"><h2>Status</h2>
  <div class="bgLegendRow"><span class="bgLegendSwatch bgLegendWindow"></span><p><strong>Loaded window</strong> — the BGMODE-sized region resident in the active BGSET's four physical tables. Drag its handle on the canvas to move it.</p></div>
  <div class="bgLegendRow"><span class="bgLegendSwatch bgLegendScreen"></span><p><strong>Screen</strong> — the fixed 320 × 200 visible area, positioned within the loaded window by SCROLL_X/SCROLL_Y. Drag its handle to move it.</p></div>
  <h3>Loaded window</h3>
  <span id="bgCamMode"></span>
  <label id="bgSetWrap">BGSET <select id="bgActiveSet" aria-label="Active BGSET (0 or 1)"><option value="0">0</option><option value="1">1</option></select></label>
  <span id="bgCamWindow"></span>
  <span id="bgCamTables"></span>
  <h3>Screen</h3>
  <label>SCROLL_X <input id="bgScrollX" type="number" min="0" max="65535" aria-label="Scroll X (SCROLL_X)"></label>
  <label>SCROLL_Y <input id="bgScrollY" type="number" min="0" max="65535" aria-label="Scroll Y (SCROLL_Y)"></label>
  <h3>Tilesets</h3>
  <span id="bgCamTilesets"></span>
  <h3>Overlay preview</h3>
  <label id="bgOverlayPickWrap">Overlay <select id="bgOverlayPick" aria-label="Which overlay to preview"></select></label>
  <button id="bgToggleOverlay" aria-pressed="false">Show overlay</button>
 </aside>
 <main class="studioMain"><div id="bgEmpty" class="studioEmpty" role="status"><p id="bgEmptyMessage"></p><div class="studioEmptyActions"><button id="bgEmptyNew">New background</button><button id="bgCreateTileset">Go to Tilesets</button></div></div>
  <div id="bgWork">
   <div class="bgTop"><div class="studioBarStart"><strong id="bgTitle"></strong></div>
    <div class="studioBarEnd"><label>Size <input id="bgWidth" type="number" min="1" max="1024" aria-label="Background width in tiles"> × <input id="bgHeight" type="number" min="1" max="1024" aria-label="Background height in tiles"><button id="bgResize">Resize</button></label>
    <label id="bgPreviewModeWrap">Viewport preview <select id="bgPreviewMode" aria-label="Viewport preview size"></select></label></div>
   </div>
   <div id="bgStage" class="studioStage"><div id="bgCanvasWrap" class="studioArt"><canvas id="bgCanvas"></canvas><div id="bgMarquee" class="cellMarquee" hidden></div><div id="bgViewportOverlay" hidden><div id="bgViewportHandle" title="Drag to move the loaded window"></div></div><div id="bgScrollClip" hidden><div class="bgScrollRect"></div><div class="bgScrollRect"></div><div class="bgScrollRect"></div><div class="bgScrollRect"></div><div id="bgScrollHandle" title="Drag to preview scroll position (SCROLL_X/SCROLL_Y)"></div></div></div></div>
   <div id="bgStampBar">
    <span>Tile <b id="bgStampTile"></b></span>
    <span id="bgGroupLabel" hidden></span>
    <span id="bgSelectionLabel" hidden></span><button id="bgSelectionClear" hidden>Clear selection</button>
    <button id="bgFlipX">Flip X</button><button id="bgFlipY">Flip Y</button><button id="bgPriority">Priority</button>
    <span id="bgStampSource"></span>
    <span id="bgBankLabel"></span><button id="bgBankReset" hidden>Reset to default</button>
   </div>
   <section id="bgPaletteDock"><div id="bgSwatches"></div></section>
   <div id="bgStatus"></div>
  </div>
 </main>`;
 // Inserted before the footer, not appended to #workspace, so the status bar
 // stays at the bottom of the page instead of landing above this section.
 $('spritePanel').after(host);

 const style=document.createElement('style');style.textContent=`
 #backgroundEditor main{display:flex;flex-direction:column;overflow:hidden}
 #bgWork{flex:1;width:100%;max-width:100%;min-width:0;min-height:0;display:flex;flex-direction:column}
 .bgTop{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 18px;background:var(--panel)}
 #bgTitle{color:var(--ink);font-size:13px}
 #bgWidth,#bgHeight{width:64px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:5px}
 #bgPreviewModeWrap{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-dim)}
 #bgStage{flex:1;min-width:0;min-height:0;overflow:auto;padding:24px;display:flex;align-items:safe center;justify-content:safe center}
 #bgCanvasWrap{position:relative;flex:none}
 #bgCanvas{image-rendering:pixelated;display:block;touch-action:none;cursor:crosshair;background:#000}
 #bgViewportOverlay{position:absolute;border:1px dashed #fff;box-shadow:0 0 0 1px #111,0 0 0 2px #fff inset;pointer-events:none}
 /* Anchored at the loaded window's top-left corner, not its center: at the
    default mode the window and the screen are the same size, so a
    center-anchored handle here would sit exactly under the screen handle
    below and never receive a click. White fill matches the window's own
    dashed outline, the same way the screen handle's gold fill matches
    its outline. */
 #bgViewportHandle{position:absolute;left:0;top:0;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;background:#ffffffcc;border:2px solid #111;cursor:move;pointer-events:auto}
 #bgScrollClip{position:absolute;overflow:hidden;pointer-events:none}
 .bgScrollRect{position:absolute;border:1px dashed #ffcf40;box-shadow:0 0 0 1px #111,0 0 0 2px #ffcf40 inset;pointer-events:none}
 #bgScrollHandle{position:absolute;width:16px;height:16px;border-radius:3px;background:#ffcf40cc;border:2px solid #fff;cursor:move;pointer-events:auto;transform:translate(-50%,-50%)}
 #bgStampBar{display:flex;align-items:center;gap:14px;padding:8px 18px;background:var(--panel);border-top:1px solid var(--line);font-size:11px}
 /* One fixed-height line, always: the canvas above is centered, so a bar
    that wrapped, or grew when a button appeared in it, would shift the art
    under the pointer mid-drag. */
 #bgStampBar{white-space:nowrap;overflow:hidden;height:42px;padding-top:0;padding-bottom:0}
 #bgStampBar>*{flex-shrink:0}
 #bgStampBar>span{flex-shrink:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
 #bgStampSource{color:var(--text-dim)}
 #bgBankLabel{color:var(--text-dim)}
 #bgGroupLabel{color:var(--ink)}
 #bgSelectionLabel{color:var(--sel)}
 #bgPaletteDock{background:var(--panel);border-top:1px solid var(--line);padding:10px 18px}
 #bgStatus{padding:6px 18px;font-size:10px;color:var(--text-dim);background:var(--panel);border-top:1px solid var(--line)}
 .bgTileLibrary strong{display:block;font-size:10px;color:var(--text-dim);margin:8px 0 4px}
 #bgList,#bgPrimaryList,#bgAltList,#bgObjectList{border:1px solid var(--line);background:var(--bg);min-height:70px;max-height:140px;overflow:auto}
 #bgTileMap{width:100%;image-rendering:pixelated;touch-action:none;cursor:crosshair;margin-top:6px}
 .bgStatusPanel h3{font-size:10px;color:var(--text-dim);margin:14px 0 4px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}
 .bgStatusPanel h3:first-of-type{margin-top:4px}
 .bgStatusPanel>span{display:block;font-size:11px;color:var(--text);margin:4px 0}
 .bgStatusPanel label{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-dim);margin:4px 0}
 .bgStatusPanel input,.bgStatusPanel select{margin-left:auto;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:3px 5px;font:inherit}
 .bgStatusPanel input{width:70px}
 #bgToggleOverlay{margin-top:6px}
 .bgLegendRow{display:flex;gap:8px;align-items:flex-start;margin-bottom:10px;flex-shrink:0}
 .bgLegendSwatch{width:16px;height:16px;border-radius:2px;flex-shrink:0;margin-top:2px;box-shadow:0 0 0 1px #111}
 .bgLegendWindow{border:2px dashed #fff}
 .bgLegendScreen{border:2px dashed #ffcf40}
 .bgLegendRow p{margin:0;font-size:10px;line-height:1.5;color:var(--text-dim)}
 .bgLegendRow strong{color:var(--text)}
 `;
 document.head.append(style);

 // Six fixed hardware viewport sizes, preview-only — specs/video.json
 // background.viewportModes, docs/architecture/video.md.
 const VIEWPORT_MODES=[
  {id:0,columns:40,rows:25,label:'40 × 25'},{id:1,columns:80,rows:25,label:'80 × 25'},
  {id:2,columns:40,rows:50,label:'40 × 50'},{id:3,columns:160,rows:25,label:'160 × 25'},
  {id:4,columns:40,rows:100,label:'40 × 100'},{id:5,columns:80,rows:50,label:'80 × 50'},
 ];
 $('bgPreviewMode').replaceChildren(...VIEWPORT_MODES.map(m=>new Option(m.label,String(m.id))));
 // Matches @clementina/assets' MAX_BACKGROUND_DIMENSION/MAX_BACKGROUND_CELLS —
 // duplicated here the way other hardware facts are, so the editor bounds
 // input without importing the SDK's session validator into the renderer.
 const MAX_BG_DIMENSION=1024,MAX_BG_CELLS=200000;

 let backgroundIndex=0;
 let bgTool='pencil',bgZoom=1,bgFittedId=null,zoomControls=null,bgErasing=false,bgPainting=false,bgLast=null,bgAnchor=null;
 // Panning a canvas that can be much bigger than the window: the Pan tool,
 // Space-drag and middle-drag all scroll #bgStage instead of painting,
 // mirroring the tileset editor's existing shortcut.
 let bgSpaceHeld=false,bgPanDrag=null;
 let bgStamp={tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false};
 let bgPickAlt=false,bgPreviewModeId=0,bgViewportOrigin={x:0,y:0},bgOverlayDrag=null;
 // The tile picker's current selection, in tile coordinates of whichever
 // tileset bgPickAlt points at. 1x1 is the default single-tile pick; a
 // bigger region (dragged directly, or loaded from an Object) is stamped as
 // a group, each tile keeping its own authored palette bank.
 let bgPickAnchor=null,bgPickRegion={col:0,row:0,width:1,height:1};
 // Camera preview: BGSET (0/1) and SCROLL_X/SCROLL_Y, ephemeral like the
 // viewport mode/origin above — never saved to the asset.
 let bgActiveSet=0,bgScroll={x:0,y:0},bgScrollDrag=null;
 // Which of a 1bpp tileset's three pages the primary/alternate picker shows —
 // ephemeral preview state, exactly like the camera fields above; the real
 // CHRPLANE register is a build/runtime concern, not authored here.
 let bgPrimaryPlane=0,bgAltPlane=0;
 // The "toggle overlay" composite preview — which overlay asset to render on
 // top of the inner (visible-screen) rectangle, and whether it's shown.
 let bgOverlayId=null,bgShowOverlay=false;

 function positiveMod(n,m){return ((n%m)+m)%m;}
 // Mirrors clementina-video-client/internal/render/renderer.go's
 // bgTableAndLocal: which of the active BGSET's four physical tables a
 // coarse (8px) tile column/row falls in, per BGMODE's table arrangement.
 function bgTableForCell(mode,activeSet,x,y){
  let table;
  switch(mode){
   case 1: table=Math.floor(x/40); break;
   case 2: table=y>=25?2:0; break;
   case 3: table=Math.floor(x/40); break;
   case 4: table=Math.floor(y/25); break;
   case 5: table=Math.floor(y/25)*2+Math.floor(x/40); break;
   default: table=0;
  }
  return table+(activeSet&1)*4;
 }
 // Splits a wrapping [origin, origin+span) pixel range against a periodic
 // plane size into 1 or 2 non-wrapping pieces — shared by the scroll
 // overlay's DOM layout and the visible-tables calculation below.
 function bgWrapRanges(origin,span,plane){
  return origin+span<=plane?[[origin,origin+span]]:[[origin,plane],[0,(origin+span)-plane]];
 }
 // Which physical tables the current 320×200 visible window touches — up to
 // four when it straddles a table boundary in both axes at once.
 function bgVisibleTables(){
  const mode=VIEWPORT_MODES.find(m=>m.id===bgPreviewModeId),planeW=mode.columns*8,planeH=mode.rows*8;
  const localX=positiveMod(bgScroll.x,planeW),localY=positiveMod(bgScroll.y,planeH);
  const xRanges=bgWrapRanges(localX,320,planeW),yRanges=bgWrapRanges(localY,200,planeH);
  const tables=new Set();
  for(const [x0,x1] of xRanges)for(const [y0,y1] of yRanges){
   const cx0=Math.floor(x0/8),cx1=Math.floor((x1-1)/8),cy0=Math.floor(y0/8),cy1=Math.floor((y1-1)/8);
   for(const cx of [cx0,cx1])for(const cy of [cy0,cy1])tables.add(bgTableForCell(mode.id,bgActiveSet,cx,cy));
  }
  return [...tables].sort((x,y)=>x-y);
 }

 const background=()=>backgrounds[backgroundIndex];
 // The Select tool (cell-grid.js): with cells selected, the flips, Priority
 // and a palette bank click edit those cells rather than the next stamp.
 const selection=CellGrid.cellSelection({grid:background,edit:(label,fn)=>bgEdit(label,fn),render:()=>{paintCanvas();updateStampBar();renderPaletteDock();syncEditActions();}});
 const bgTilesetById=id=>tilesets.find(t=>t.id===id);
 const primaryTileset=()=>bgTilesetById(background()?.tilesetId);
 const altTileset=()=>bgTilesetById(background()?.altTilesetId);
 const pickingTileset=()=>bgPickAlt?altTileset():primaryTileset();
 function blankCell(){return {tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false};}
 function makeCells(width,height){return Array.from({length:width*height},blankCell);}

 // A background's own data never mutates tilesets/palettes/shapes/animations
 // and nothing in those domains mutates a background, so this history is
 // independent rather than shared with theirs.
 function bgCheckpoint(label='Edit the background'){ProjectHistory.checkpoint(['backgrounds'],label);}
 // An edit's label names it in the history: bgEdit('Delete X', fn).
 function bgEdit(...args){const label=typeof args[0]==='string'?args.shift():'Edit the background';bgCheckpoint(label);args[0]();markDirty();render();}
 document.addEventListener('studiohistory',()=>{backgroundIndex=Math.max(0,Math.min(backgroundIndex,backgrounds.length-1));selection.revalidate();});

 function freshBackgroundName(){let n=1;while(backgrounds.some(b=>b.name.toLowerCase()==='background_'+n))n++;return 'Background_'+n;}
 function chooseBackground(i){backgroundIndex=i;bgViewportOrigin={x:0,y:0};bgScroll={x:0,y:0};bgActiveSet=0;bgPrimaryPlane=0;bgAltPlane=0;bgPickRegion={col:0,row:0,width:1,height:1};selection.reset();render();}
 function renameBackground(i,name){
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)||backgrounds.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique filename: letters, digits, underscore or hyphen.');return false;}
  bgEdit('Rename a background',()=>backgrounds[i].name=name);return true;
 }
 function renderBackgroundList(){
  StudioShell.renderList($('bgList'),backgrounds,{selected:(b,i)=>i===backgroundIndex,choose:(b,i)=>chooseBackground(i),rename:renameBackground,render,maxLength:48,duplicate:(b,i)=>{chooseBackground(i);$('bgDuplicateAction').click();},remove:(b,i)=>{chooseBackground(i);$('bgDeleteAction').click();}});
 }

 function renderTilesetAssignment(){
  const a=background();
  for(const [listId,field] of [['bgPrimaryList','tilesetId'],['bgAltList','altTilesetId']]){
   const list=$(listId);
   while(list.children.length>tilesets.length)list.lastElementChild.remove();
   tilesets.forEach((t,i)=>{
    let row=list.children[i];
    if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
    row.textContent=t.name;
    row.setAttribute('aria-selected',String(!!a&&t.id===a[field]));
    row.onclick=()=>{if(!a||t.id===a[field])return;bgEdit(field==='tilesetId'?'Change the primary tileset':'Change the alternate tileset',()=>{a[field]=t.id;});};
    row.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();row.onclick();}};
   });
  }
  $('bgPrimaryPlaneLabel').hidden=primaryTileset()?.bpp!==1;$('bgPrimaryPlane').value=bgPrimaryPlane;
  $('bgAltPlaneLabel').hidden=altTileset()?.bpp!==1;$('bgAltPlane').value=bgAltPlane;
 }
 $('bgPrimaryPlane').onchange=()=>{bgPrimaryPlane=Number($('bgPrimaryPlane').value);paintCanvas();drawTileMap();};
 $('bgAltPlane').onchange=()=>{bgAltPlane=Number($('bgAltPlane').value);paintCanvas();drawTileMap();};

 function drawTileMap(){
  const source=pickingTileset(),canvas=$('bgTileMap'),ctx=canvas.getContext('2d');
  ctx.fillStyle='#252830';ctx.fillRect(0,0,256,256);
  if(source)for(let t=0;t<256;t++){
   const bank=source.tilePaletteBanks[t];
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    // As on the canvas, color 0 is the tile's bank color: backgrounds draw it.
    const ink=tilePixel(source,t,x,y,bgPickAlt?bgAltPlane:bgPrimaryPlane);
    ctx.fillStyle=css565(bankColor(bank,ink));
    ctx.fillRect((t%16*8+x)*2,(Math.floor(t/16)*8+y)*2,2,2);
   }
  }
  ctx.strokeStyle='#ffffff30';ctx.lineWidth=1;ctx.beginPath();
  for(let n=0;n<=16;n++){ctx.moveTo(n*16,0);ctx.lineTo(n*16,256);ctx.moveTo(0,n*16);ctx.lineTo(256,n*16);}
  ctx.stroke();
  if(source&&bgStamp.chrAlt===bgPickAlt){
   ctx.strokeStyle='#36c9d6';ctx.lineWidth=2;
   ctx.strokeRect(bgPickRegion.col*16+1,bgPickRegion.row*16+1,bgPickRegion.width*16-2,bgPickRegion.height*16-2);
  }
 }
 function tileMapCell(e){const r=$('bgTileMap').getBoundingClientRect();return {x:Math.max(0,Math.min(15,Math.floor((e.clientX-r.left)/r.width*16))),y:Math.max(0,Math.min(15,Math.floor((e.clientY-r.top)/r.height*16)))};}
 // Dragging on the tile picker selects a rectangular group, the same way
 // the tileset editor's own tile map does; a plain click is just a 1x1 drag.
 function selectPickRegion(x,y){
  const source=pickingTileset();if(!source||!bgPickAnchor)return;
  bgPickRegion={col:Math.min(bgPickAnchor.x,x),row:Math.min(bgPickAnchor.y,y),width:Math.abs(x-bgPickAnchor.x)+1,height:Math.abs(y-bgPickAnchor.y)+1};
  const tile=bgPickRegion.row*16+bgPickRegion.col;
  bgStamp={...bgStamp,tile,paletteBank:source.tilePaletteBanks[tile],chrAlt:bgPickAlt};
  stampTool();render();
 }
 // Picking tiles — on the map or from an object — is picking what to paint,
 // so it switches to the pencil unless a stamping tool is already active.
 function stampTool(){if(!['pencil','rectangle','fill'].includes(bgTool))setTool('pencil');}
 // The selection belongs to the Select tool, as in Photoshop: taking up a
 // painting tool drops it (panning keeps it), so the flips, Priority and a
 // palette bank click act on the selection while selecting and on the next
 // stamp while painting — never ambiguously on both.
 function setTool(name){if(name!=='select'&&name!=='pan')selection.reset();bgTool=name;render();}
 $('bgTileMap').onpointerdown=e=>{
  if(!pickingTileset())return;
  bgPickAnchor=tileMapCell(e);$('bgTileMap').setPointerCapture(e.pointerId);selectPickRegion(bgPickAnchor.x,bgPickAnchor.y);
 };
 $('bgTileMap').onpointermove=e=>{if(bgPickAnchor){const {x,y}=tileMapCell(e);selectPickRegion(x,y);}};
 $('bgTileMap').onpointerup=$('bgTileMap').onpointercancel=()=>bgPickAnchor=null;
 $('bgPickSlot').onchange=()=>{bgPickAlt=$('bgPickSlot').value==='alt';bgPickRegion={col:0,row:0,width:1,height:1};render();};
 // Objects are managed in the tileset editor; here they're just a shortcut
 // to load a previously-saved region as the current group pick.
 function renderObjectList(){
  const source=pickingTileset(),objects=source?.compositions??[];
  StudioShell.renderList($('bgObjectList'),objects,{
   selected:o=>o.x===bgPickRegion.col&&o.y===bgPickRegion.row&&o.width===bgPickRegion.width&&o.height===bgPickRegion.height,
   choose:o=>{
    bgPickRegion={col:o.x,row:o.y,width:o.width,height:o.height};
    const tile=bgPickRegion.row*16+bgPickRegion.col;
    bgStamp={...bgStamp,tile,paletteBank:source.tilePaletteBanks[tile],chrAlt:bgPickAlt};
    stampTool();render();
   },
   render
  });
 }

 function paintCellAt(col,row){
  const a=background();
  if(col<0||row<0||col>=a.width||row>=a.height)return;
  a.cells[row*a.width+col]=bgErasing?blankCell():{...bgStamp};
 }
 // A multi-tile picker selection stamps its whole footprint anchored at
 // (col,row) — used only by the pencil tool, never fill/rectangle, since
 // flooding or dragging a rectangle with a group picked would stamp it
 // densely at every covered cell rather than placing it once. Each sub-tile
 // keeps its own authored palette bank. A flipped group is mirrored whole —
 // its tiles swap places as well as flipping — so the picture turns over.
 function paintGroupAt(col,row){
  if(bgErasing){paintCellAt(col,row);return;}
  const a=background(),source=bgStamp.chrAlt?altTileset():primaryTileset();
  for(let dy=0;dy<bgPickRegion.height;dy++)for(let dx=0;dx<bgPickRegion.width;dx++){
   const cx=col+dx,cy=row+dy;
   if(cx<0||cy<0||cx>=a.width||cy>=a.height)continue;
   const sx=bgStamp.flipX?bgPickRegion.width-1-dx:dx,sy=bgStamp.flipY?bgPickRegion.height-1-dy:dy;
   const tile=(bgPickRegion.row+sy)*16+(bgPickRegion.col+sx);
   a.cells[cy*a.width+cx]={tile,paletteBank:source?.tilePaletteBanks[tile]??0,flipX:bgStamp.flipX,flipY:bgStamp.flipY,priority:bgStamp.priority,chrAlt:bgStamp.chrAlt};
  }
 }
 function paintAt(col,row){(bgPickRegion.width>1||bgPickRegion.height>1?paintGroupAt:paintCellAt)(col,row);}
 function drawCell(ctx,cell,col,row){
  const source=cell.chrAlt?altTileset():primaryTileset();
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const px=cell.flipX?7-x:x,py=cell.flipY?7-y:y;
   // Color 0 is opaque on the background layer, in the cell's own bank:
   // clementina-video-client renderer.go renderBackground draws every pixel
   // with paletteColorByIndex, color 0 included. Only the overlay (and
   // sprites) treat color 0 as transparent.
   const ink=source?tilePixel(source,cell.tile,px,py,cell.chrAlt?bgAltPlane:bgPrimaryPlane):0;
   ctx.fillStyle=css565(bankColor(cell.paletteBank,ink));
   ctx.fillRect(col*8+x,row*8+y,1,1);
  }
 }
 function paintCanvas(){
  const a=background();if(!a)return;
  const canvas=$('bgCanvas');canvas.width=a.width*8;canvas.height=a.height*8;
  canvas.style.width=(a.width*8*bgZoom)+'px';canvas.style.height=(a.height*8*bgZoom)+'px';
  const ctx=canvas.getContext('2d');
  for(let row=0;row<a.height;row++)for(let col=0;col<a.width;col++)drawCell(ctx,a.cells[row*a.width+col],col,row);
  selection.drawFloating(ctx,drawCell);
  // Marks where each cell — one nametable + attribute table entry — begins
  // and ends, so an empty cell doesn't read as featureless background.
  ctx.strokeStyle='#ffffff26';ctx.lineWidth=1;ctx.beginPath();
  for(let col=0;col<=a.width;col++){ctx.moveTo(col*8+.5,0);ctx.lineTo(col*8+.5,a.height*8);}
  for(let row=0;row<=a.height;row++){ctx.moveTo(0,row*8+.5);ctx.lineTo(a.width*8,row*8+.5);}
  ctx.stroke();
  if(bgShowOverlay)drawOverlayComposite(ctx);
  selection.layout($('bgMarquee'),bgZoom);
 }
 // The overlay never scrolls — it always sits 1:1 on the physical screen, so
 // it composites onto exactly the same wrapped pieces the inner (visible)
 // rectangle guide already computes, mapping each piece back to its source
 // region of the fixed 320×200 overlay image. Plane defaults to 0 for any
 // 1bpp overlay tileset — a documented simplification; full plane accuracy
 // lives in the overlay editor itself.
 function drawOverlayComposite(ctx){
  const overlay=overlays.find(o=>o.id===bgOverlayId);if(!overlay)return;
  const primary=bgTilesetById(overlay.tilesetId),alt=bgTilesetById(overlay.altTilesetId);
  const mode=VIEWPORT_MODES.find(m=>m.id===bgPreviewModeId),planeW=mode.columns*8,planeH=mode.rows*8;
  const localX=positiveMod(bgScroll.x,planeW),localY=positiveMod(bgScroll.y,planeH);
  const xRanges=bgWrapRanges(localX,320,planeW),yRanges=bgWrapRanges(localY,200,planeH);
  let sx0=0;
  for(const [x0,x1] of xRanges){
   const sxLen=x1-x0;
   let sy0=0;
   for(const [y0,y1] of yRanges){
    const syLen=y1-y0;
    for(let dy=0;dy<syLen;dy++)for(let dx=0;dx<sxLen;dx++){
     const sx=sx0+dx,sy=sy0+dy;
     const col=Math.floor(sx/8),row=Math.floor(sy/8),px=sx%8,py=sy%8;
     const cell=overlay.cells[row*40+col];if(!cell)continue;
     const source=cell.chrAlt?alt:primary;if(!source)continue;
     const cx=cell.flipX?7-px:px,cy=cell.flipY?7-py:py;
     const ink=tilePixel(source,cell.tile,cx,cy,0);
     if(ink===0)continue;
     ctx.fillStyle=css565(bankColor(cell.paletteBank,ink));
     ctx.fillRect(bgViewportOrigin.x*8+x0+dx,bgViewportOrigin.y*8+y0+dy,1,1);
    }
    sy0+=syLen;
   }
   sx0+=sxLen;
  }
 }
 function canvasCell(e){
  const r=$('bgCanvas').getBoundingClientRect(),a=background();
  const px=(e.clientX-r.left)/r.width*a.width*8,py=(e.clientY-r.top)/r.height*a.height*8;
  return {col:Math.max(0,Math.min(a.width-1,Math.floor(px/8))),row:Math.max(0,Math.min(a.height-1,Math.floor(py/8)))};
 }
 function bgDrawTo(col,row){
  if(bgLast){
   const steps=Math.max(Math.abs(col-bgLast.col),Math.abs(row-bgLast.row));
   for(let i=0;i<=steps;i++)paintAt(Math.round(bgLast.col+(col-bgLast.col)*i/(steps||1)),Math.round(bgLast.row+(row-bgLast.row)*i/(steps||1)));
  }else paintAt(col,row);
  bgLast={col,row};markDirty();paintCanvas();
 }
 function bgFlood(col,row){
  const a=background(),w=a.width,h=a.height;
  if(col<0||row<0||col>=w||row>=h)return;
  const old=a.cells[row*w+col].tile,seen=new Uint8Array(w*h),stack=[[col,row]];
  while(stack.length){
   const [x,y]=stack.pop();
   if(x<0||y<0||x>=w||y>=h||seen[y*w+x]||a.cells[y*w+x].tile!==old)continue;
   seen[y*w+x]=1;paintCellAt(x,y);stack.push([x-1,y],[x+1,y],[x,y-1],[x,y+1]);
  }
 }
 function previewRectangle(col,row){
  paintCanvas();
  const ctx=$('bgCanvas').getContext('2d');
  const x0=Math.min(bgAnchor.col,col),x1=Math.max(bgAnchor.col,col),y0=Math.min(bgAnchor.row,row),y1=Math.max(bgAnchor.row,row);
  ctx.save();ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.setLineDash([4,4]);
  ctx.strokeRect(x0*8+.5,y0*8+.5,(x1-x0+1)*8-1,(y1-y0+1)*8-1);
  ctx.lineDashOffset=4;ctx.strokeStyle='#111';
  ctx.strokeRect(x0*8+.5,y0*8+.5,(x1-x0+1)*8-1,(y1-y0+1)*8-1);
  ctx.restore();
 }
 function commitRectangle(col,row){
  const x0=Math.min(bgAnchor.col,col),x1=Math.max(bgAnchor.col,col),y0=Math.min(bgAnchor.row,row),y1=Math.max(bgAnchor.row,row);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)paintCellAt(x,y);
  bgAnchor=null;markDirty();paintCanvas();
 }
 $('bgCanvas').onpointerdown=e=>{
  e.preventDefault();if(!background()||(e.button===2&&!painting()))return;
  bgErasing=e.button===2||bgTool==='eraser';
  const {col,row}=canvasCell(e);
  if(selection.pasting||bgTool==='select'){$('bgCanvas').setPointerCapture(e.pointerId);selection.down({col,row});return;}
  if(bgTool==='picker'){const cell=background().cells[row*background().width+col];bgStamp={...cell};bgPickAlt=cell.chrAlt;bgPickRegion={col:cell.tile%16,row:Math.floor(cell.tile/16),width:1,height:1};render();return;}
  bgCheckpoint(bgTool==='fill'?'Fill':bgTool==='rectangle'?'Draw a rectangle':bgErasing?'Erase':'Paint');
  if(bgTool==='fill'){bgFlood(col,row);markDirty();paintCanvas();return;}
  if(bgTool==='rectangle'){bgAnchor={col,row};$('bgCanvas').setPointerCapture(e.pointerId);previewRectangle(col,row);return;}
  bgPainting=true;bgLast=null;$('bgCanvas').setPointerCapture(e.pointerId);bgDrawTo(col,row);
 };
 $('bgCanvas').onpointermove=e=>{
  if(!background())return;
  const {col,row}=canvasCell(e);
  if(selection.move({col,row}))return;
  if(bgTool==='select')$('bgCanvas').style.cursor=selection.contains({col,row})?'move':'';
  if(bgAnchor){previewRectangle(col,row);return;}
  if(bgPainting)bgDrawTo(col,row);
 };
 $('bgCanvas').onpointerup=e=>{
  if(!background())return;
  if(selection.up())return;
  if(bgAnchor){const {col,row}=canvasCell(e);commitRectangle(col,row);return;}
  bgPainting=false;bgLast=null;
 };
 $('bgCanvas').onpointercancel=()=>{bgAnchor=null;bgPainting=false;bgLast=null;selection.cancel();};
 // Right-click erases while a painting tool is active, the Aseprite way;
 // with any other tool it opens the edit menu for the selection.
 function painting(){return ['pencil','rectangle','fill','eraser'].includes(bgTool);}
 $('bgCanvas').oncontextmenu=e=>{e.preventDefault();if(!background()||painting())return;const sel=!!selection.rect,paste=()=>{if(selection.startPaste()){setTool('select');setStatus('Click to place the paste. Escape cancels.');}};
  StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Cut',hint:'Mod+X',disabled:!sel,run:()=>selection.cut()},{label:'Copy',hint:'Mod+C',disabled:!sel,run:()=>selection.copy()},{label:'Paste',hint:'Mod+V',disabled:!StudioShell.clipboard.has('cells'),run:paste},{label:'Delete',hint:'Delete',disabled:!sel,run:()=>selection.remove()},'-',
   {label:'Flip horizontally',hint:'Shift+H',disabled:!sel,run:()=>selection.flip('x')},{label:'Flip vertically',hint:'Shift+V',disabled:!sel,run:()=>selection.flip('y')},{label:'Priority',disabled:!sel,run:()=>$('bgPriority').click()},'-',
   {label:'Select all',hint:'Mod+A',run:()=>{setTool('select');selection.selectAll();}},{label:'Deselect',hint:'Esc',disabled:!sel,run:()=>selection.deselect()}]);};

 function resizeBackground(newWidth,newHeight){
  const a=background();if(!a)return;
  newWidth=Math.max(1,Math.min(MAX_BG_DIMENSION,Math.round(newWidth)||1));
  newHeight=Math.max(1,Math.min(MAX_BG_DIMENSION,Math.round(newHeight)||1));
  if(newWidth*newHeight>MAX_BG_CELLS){setStatus(`That size holds too many cells — up to ${MAX_BG_CELLS} total.`);render();return;}
  if(newWidth===a.width&&newHeight===a.height){render();return;}
  let cropsContent=false;
  for(let y=0;y<a.height&&!cropsContent;y++)for(let x=0;x<a.width;x++){
   if(x<newWidth&&y<newHeight)continue;
   const cell=a.cells[y*a.width+x];
   if(cell.tile!==0||cell.paletteBank!==0||cell.flipX||cell.flipY||cell.priority||cell.chrAlt){cropsContent=true;break;}
  }
  if(cropsContent)setStatus('Cropped the painted cells outside the new size. Ctrl/Cmd+Z brings them back.');
  selection.reset();
  bgEdit('Resize the background',()=>{
   const cells=makeCells(newWidth,newHeight);
   for(let y=0;y<Math.min(a.height,newHeight);y++)for(let x=0;x<Math.min(a.width,newWidth);x++)cells[y*newWidth+x]=a.cells[y*a.width+x];
   a.width=newWidth;a.height=newHeight;a.cells=cells;
  });
 }
 $('bgResize').onclick=()=>resizeBackground(Number($('bgWidth').value),Number($('bgHeight').value));

 function layoutViewportOverlay(){
  const a=background(),overlay=$('bgViewportOverlay');
  if(!a){overlay.hidden=true;return;}
  const mode=VIEWPORT_MODES.find(m=>m.id===bgPreviewModeId);
  const cols=Math.min(mode.columns,a.width),rows=Math.min(mode.rows,a.height);
  bgViewportOrigin.x=Math.max(0,Math.min(a.width-cols,bgViewportOrigin.x));
  bgViewportOrigin.y=Math.max(0,Math.min(a.height-rows,bgViewportOrigin.y));
  overlay.hidden=false;
  overlay.style.left=(bgViewportOrigin.x*8*bgZoom)+'px';overlay.style.top=(bgViewportOrigin.y*8*bgZoom)+'px';
  overlay.style.width=(cols*8*bgZoom)+'px';overlay.style.height=(rows*8*bgZoom)+'px';
 }
 $('bgPreviewMode').onchange=()=>{bgPreviewModeId=Number($('bgPreviewMode').value);render();};
 // The overlay itself is click-through (pointer-events:none) so it never
 // blocks painting underneath it; only its small handle is draggable.
 $('bgViewportHandle').onpointerdown=e=>{e.stopPropagation();bgOverlayDrag={startX:e.clientX,startY:e.clientY,origin:{...bgViewportOrigin}};$('bgViewportHandle').setPointerCapture(e.pointerId);};
 $('bgViewportHandle').onpointermove=e=>{
  if(!bgOverlayDrag)return;
  const dx=Math.round((e.clientX-bgOverlayDrag.startX)/(8*bgZoom)),dy=Math.round((e.clientY-bgOverlayDrag.startY)/(8*bgZoom));
  bgViewportOrigin={x:bgOverlayDrag.origin.x+dx,y:bgOverlayDrag.origin.y+dy};
  layoutViewportOverlay();
  layoutScrollOverlay();
  updateCameraPanel();
 };
 $('bgViewportHandle').onpointerup=$('bgViewportHandle').onpointercancel=()=>{bgOverlayDrag=null;};

 // The inner rectangle is the fixed 320×200 physical screen, positioned by
 // SCROLL_X/SCROLL_Y within the loaded window and wrapping at the mode's own
 // pixel size — up to four pieces when it straddles both edges. #bgScrollClip
 // is sized to the mode's true plane, not the (possibly canvas-clamped)
 // outer rectangle — a small authored canvas must not clip scroll math that
 // real hardware would still apply at the mode's full size.
 function layoutScrollOverlay(){
  const a=background();if(!a)return;
  const mode=VIEWPORT_MODES.find(m=>m.id===bgPreviewModeId),planeW=mode.columns*8,planeH=mode.rows*8;
  const clip=$('bgScrollClip');
  clip.hidden=false;
  clip.style.left=(bgViewportOrigin.x*8*bgZoom)+'px';clip.style.top=(bgViewportOrigin.y*8*bgZoom)+'px';
  clip.style.width=(planeW*bgZoom)+'px';clip.style.height=(planeH*bgZoom)+'px';
  const localX=positiveMod(bgScroll.x,planeW),localY=positiveMod(bgScroll.y,planeH);
  const xRanges=bgWrapRanges(localX,320,planeW),yRanges=bgWrapRanges(localY,200,planeH);
  const pieces=host.querySelectorAll('.bgScrollRect');
  let i=0;
  for(const [x0,x1] of xRanges)for(const [y0,y1] of yRanges){
   const el=pieces[i++];el.hidden=false;
   el.style.left=(x0*bgZoom)+'px';el.style.top=(y0*bgZoom)+'px';
   el.style.width=((x1-x0)*bgZoom)+'px';el.style.height=((y1-y0)*bgZoom)+'px';
  }
  for(;i<pieces.length;i++)pieces[i].hidden=true;
  const handleX=positiveMod(localX+160,planeW),handleY=positiveMod(localY+100,planeH);
  $('bgScrollHandle').style.left=(handleX*bgZoom)+'px';$('bgScrollHandle').style.top=(handleY*bgZoom)+'px';
 }
 function clampScrollInput(v){return Math.max(0,Math.min(65535,Math.round(v)||0));}
 $('bgActiveSet').onchange=()=>{bgActiveSet=Number($('bgActiveSet').value);render();};
 $('bgScrollX').onchange=()=>{bgScroll={...bgScroll,x:clampScrollInput(Number($('bgScrollX').value))};render();};
 $('bgScrollY').onchange=()=>{bgScroll={...bgScroll,y:clampScrollInput(Number($('bgScrollY').value))};render();};
 $('bgScrollHandle').onpointerdown=e=>{e.stopPropagation();bgScrollDrag={startX:e.clientX,startY:e.clientY,origin:{...bgScroll}};$('bgScrollHandle').setPointerCapture(e.pointerId);};
 $('bgScrollHandle').onpointermove=e=>{
  if(!bgScrollDrag)return;
  const dx=Math.round((e.clientX-bgScrollDrag.startX)/bgZoom),dy=Math.round((e.clientY-bgScrollDrag.startY)/bgZoom);
  bgScroll={x:positiveMod(bgScrollDrag.origin.x+dx,65536),y:positiveMod(bgScrollDrag.origin.y+dy,65536)};
  layoutScrollOverlay();updateCameraPanel();
 };
 $('bgScrollHandle').onpointerup=$('bgScrollHandle').onpointercancel=()=>{bgScrollDrag=null;};

 function updateCameraPanel(){
  const a=background();if(!a)return;
  const mode=VIEWPORT_MODES.find(m=>m.id===bgPreviewModeId);
  $('bgActiveSet').value=String(bgActiveSet);
  $('bgScrollX').value=bgScroll.x;$('bgScrollY').value=bgScroll.y;
  $('bgCamMode').textContent=`BGMODE ${mode.id} · ${mode.label} tiles`;
  $('bgCamWindow').textContent=`Origin ${bgViewportOrigin.x}, ${bgViewportOrigin.y} tiles from top-left`;
  $('bgCamTables').textContent=`Tables ${bgVisibleTables().join(', ')}`;
  $('bgCamTilesets').textContent=`Primary ${primaryTileset()?.name??'missing'} · Alternate ${altTileset()?.name??'missing'}`;
 }

 function renderOverlayToggle(){
  const picker=$('bgOverlayPick'),signature=overlays.map(o=>o.id+'|'+o.name).join(',');
  if(picker.dataset.signature!==signature){picker.dataset.signature=signature;picker.replaceChildren(...overlays.map(o=>new Option(o.name,o.id)));}
  if(!overlays.some(o=>o.id===bgOverlayId))bgOverlayId=overlays[0]?.id??null;
  picker.value=bgOverlayId??'';
  $('bgOverlayPickWrap').hidden=!overlays.length;$('bgToggleOverlay').hidden=!overlays.length;
  $('bgToggleOverlay').textContent=bgShowOverlay?'Hide overlay':'Show overlay';
  $('bgToggleOverlay').setAttribute('aria-pressed',String(bgShowOverlay));
  $('bgToggleOverlay').classList.toggle('on',bgShowOverlay);
 }
 $('bgOverlayPick').onchange=()=>{bgOverlayId=$('bgOverlayPick').value||null;paintCanvas();};
 $('bgToggleOverlay').onclick=()=>{bgShowOverlay=!bgShowOverlay;renderOverlayToggle();paintCanvas();};

 const fitLevel=a=>StudioShell.fitZoom($('bgStage').clientWidth-48,$('bgStage').clientHeight-48,a.width*8,a.height*8);
 zoomControls=StudioShell.canvasZoom({view:'backgrounds',ids:{fit:'bgFit',actual:'bgActualSize',zoomOut:'bgZoomOut',label:'bgZoomLabel',zoomIn:'bgZoomIn'},
  get:()=>bgZoom,set:(next,x,y)=>StudioShell.zoomScrolled($('bgStage'),$('bgCanvas'),bgZoom,next,z=>{bgZoom=z;render();},x,y),
  fit:()=>{if(!background())return;bgZoom=fitLevel(background());render();$('bgStage').scrollLeft=$('bgStage').scrollTop=0;},
  wheel:$('bgStage'),busy:()=>!!(bgPainting||bgAnchor||selection.busy||bgPanDrag||bgOverlayDrag||bgScrollDrag)});
 host.querySelector('.bgTop .studioBarStart').after(zoomControls.group);host.querySelector('.bgTop .studioBarEnd').append(StudioShell.helpButton());

 function updateStampBar(){
  const group=bgPickRegion.width>1||bgPickRegion.height>1;
  $('bgStampTile').textContent=String(bgStamp.tile);
  $('bgGroupLabel').hidden=!group;
  $('bgGroupLabel').textContent=`Group ${bgPickRegion.width} × ${bgPickRegion.height} — each tile keeps its own bank`;
  const sel=selection.rect;
  $('bgSelectionLabel').hidden=!sel;
  if(sel)$('bgSelectionLabel').textContent=`Selected ${sel.width} × ${sel.height} — flips, Priority and a palette bank edit these tiles in place`;
  $('bgSelectionClear').hidden=!sel;
  // With a selection the flips and Priority act on it; otherwise they are the
  // next stamp's settings, shown pressed when on.
  $('bgFlipX').classList.toggle('on',!sel&&bgStamp.flipX);
  $('bgFlipY').classList.toggle('on',!sel&&bgStamp.flipY);
  $('bgPriority').classList.toggle('on',!sel&&bgStamp.priority);
  $('bgStampSource').textContent=bgStamp.chrAlt?'Reads: Alternate':'Reads: Primary';
  const source=bgStamp.chrAlt?altTileset():primaryTileset(),authored=source?.tilePaletteBanks?.[bgStamp.tile];
  $('bgBankLabel').textContent=group&&!sel?'':'Bank '+String(bgStamp.paletteBank).padStart(2,'0');
  $('bgBankReset').hidden=sel?false:(group||authored===undefined||authored===bgStamp.paletteBank);
 }
 // With a selection these edit the selected cells, as one undo step: a flip
 // turns the selected block over, Priority turns on for all of them unless
 // all have it already. Otherwise they set up the next stamp.
 $('bgFlipX').onclick=()=>{if(selection.rect)selection.flip('x');else{bgStamp={...bgStamp,flipX:!bgStamp.flipX};render();}};
 $('bgFlipY').onclick=()=>{if(selection.rect)selection.flip('y');else{bgStamp={...bgStamp,flipY:!bgStamp.flipY};render();}};
 $('bgPriority').onclick=()=>{if(selection.rect){const on=!selection.selected().every(c=>c.priority);selection.apply(c=>c.priority=on,on?'Set priority':'Clear priority');}else{bgStamp={...bgStamp,priority:!bgStamp.priority};render();}};
 $('bgBankReset').onclick=()=>{
  if(selection.rect){selection.apply(cell=>{const source=cell.chrAlt?altTileset():primaryTileset();if(source)cell.paletteBank=source.tilePaletteBanks[cell.tile];},'Reset palette banks');return;}
  const source=bgStamp.chrAlt?altTileset():primaryTileset();if(source)bgStamp={...bgStamp,paletteBank:source.tilePaletteBanks[bgStamp.tile]};render();
 };
 $('bgSelectionClear').onclick=()=>selection.deselect();

 // Each bank is a full 8-color palette, not one representative color — a
 // single swatch per bank made two banks that only differed past color 1
 // look identical. Clicking anywhere on a bank's row selects it, same as
 // the single-swatch buttons this replaces.
 function renderPaletteDock(){
  StudioShell.bankDock($('bgSwatches'),b=>{if(selection.rect)selection.apply(cell=>cell.paletteBank=b,`Set bank ${b}`);else{bgStamp={...bgStamp,paletteBank:b};render();}});
  // A picked group has no single bank to set — unless cells are selected,
  // which a bank click then sets whatever is picked.
  const sel=selection.rect,group=!sel&&(bgPickRegion.width>1||bgPickRegion.height>1);
  StudioShell.syncBankDock($('bgSwatches'),{color:(b,i)=>css565(bankColor(b,i)),transparentZero:false,chosen:group||sel?null:bgStamp.paletteBank,used:new Set(background().cells.map(c=>c.paletteBank)),disabled:group,
   title:b=>group?'A group keeps each tile\'s own authored bank':sel?`Set the selected tiles to bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`:`Bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`});
 }

 function render(){
  host.hidden=currentView!=='backgrounds';
  document.body.classList.toggle('backgroundView',!host.hidden);
  if(host.hidden)return;
  backgroundIndex=Math.min(backgroundIndex,Math.max(0,backgrounds.length-1));
  const a=background();
  $('bgEmpty').hidden=!!a;StudioShell.emptyEditor(host,!a);
  $('bgEmptyMessage').textContent=!tilesets.length?'Create a tileset first. A background draws from two tilesets.':'No backgrounds yet. A background draws from two tilesets.';$('bgEmptyNew').hidden=!tilesets.length;
  $('bgCreateTileset').hidden=!!tilesets.length;
  $('bgWork').hidden=!a;
  renderBackgroundList();
  if(!a){$('bgStatus').textContent='';return;}
  $('bgTitle').textContent=a.name;
  $('bgWidth').value=a.width;$('bgHeight').value=a.height;
  $('bgPreviewMode').value=String(bgPreviewModeId);
  zoomControls?.sync();
  for(const [id,tool] of [['bgPencilTool','pencil'],['bgRectangleTool','rectangle'],['bgFillTool','fill'],['bgEraserTool','eraser'],['bgPickerTool','picker'],['bgSelectTool','select'],['bgPanTool','pan']])$(id).classList.toggle('on',bgTool===tool);
  $('bgCanvas').style.cursor=bgTool==='pan'?'grab':'';
  $('bgUndo').disabled=!ProjectHistory.canUndo();$('bgRedo').disabled=!ProjectHistory.canRedo();syncEditActions();
  renderTilesetAssignment();
  $('bgPickSlot').value=bgPickAlt?'alt':'primary';
  drawTileMap();
  renderObjectList();
  renderOverlayToggle();
  paintCanvas();
  layoutViewportOverlay();
  layoutScrollOverlay();
  updateCameraPanel();
  renderPaletteDock();
  updateStampBar();
  $('bgStatus').textContent=`${a.width} × ${a.height} tiles · ${a.cells.length} cells · primary ${primaryTileset()?.name??'missing'} · alternate ${altTileset()?.name??'missing'}`;
  // A background opens fitted to the window; returning to one keeps its zoom.
  // Measured last, once the docks around the stage have their final size.
  if(a.id!==bgFittedId){bgFittedId=a.id;bgZoom=fitLevel(a);render();}
 }

 $('bgCreateTileset').onclick=()=>{showView('tiles');};$('bgEmptyNew').onclick=()=>$('bgNewAction').click();
 for(const [id,label,icon] of [['bgNewAction','New background','newItem'],['bgDuplicateAction','Duplicate background','duplicate'],['bgDeleteAction','Delete background','delete']])
  $('bgActions').append(StudioShell.iconButton(id,label,icon));
 $('bgNewAction').onclick=()=>{
  if(backgrounds.length>=255){setStatus('A project holds at most 255 backgrounds.');return;}
  if(!tilesets.length){setStatus('Create a tileset first.');return;}
  bgEdit('New background',()=>{
   const width=40,height=25;
   backgrounds.push({id:crypto.randomUUID(),name:freshBackgroundName(),width,height,tilesetId:tilesets[0].id,altTilesetId:tilesets[0].id,cells:makeCells(width,height)});
   backgroundIndex=backgrounds.length-1;bgViewportOrigin={x:0,y:0};bgScroll={x:0,y:0};bgActiveSet=0;bgPrimaryPlane=0;bgAltPlane=0;
  });
  setStatus('Created '+background().name+'.');
 };
 $('bgDuplicateAction').onclick=()=>{
  if(!background()||backgrounds.length>=255)return;
  bgEdit('Duplicate '+background().name,()=>{const copy=structuredClone(background());copy.id=crypto.randomUUID();copy.name=freshBackgroundName();backgrounds.push(copy);backgroundIndex=backgrounds.length-1;});
 };
 $('bgDeleteAction').onclick=()=>{
  if(!background())return;setStatus(`Deleted ${background().name}. Ctrl/Cmd+Z brings it back.`);
  bgEdit('Delete '+background().name,()=>{backgrounds.splice(backgroundIndex,1);backgroundIndex=Math.max(0,backgroundIndex-1);});
 };

 // Left rail: the panels to pick from, then the tools. Right rail: the
 // selection's panel, then the flips and priority that the next stamp — or
 // an active selection — takes.
 const library=host.querySelector('.bgLibrary'),tileLibrary=host.querySelector('.bgTileLibrary'),statusPanel=host.querySelector('.bgStatusPanel');
 const panelToggle=(panel,id,label,icon,group,asset=false)=>{const b=StudioShell.iconButton(id,label,icon);StudioShell.bindPanel({panel,button:b,group,closeGroups:[group],asset});return b;};
 const tool=(id,label,icon,name)=>{const b=StudioShell.iconButton(id,label,icon);b.onclick=()=>setTool(name);return b;};
 const rail=StudioShell.toolRail('bgRail','Background tools');host.prepend(rail);
 StudioShell.railLayout(rail,[
  [panelToggle(library,'bgLibraryToggle','Backgrounds','background','bgLeft'),panelToggle(tileLibrary,'bgTileLibraryToggle','Tilesets and tile picker','tilePicker','bgLeft',true)],
  [tool('bgSelectTool','Select (S) — drag over cells, then flip, set Priority or click a palette bank to edit them in place','select','select'),
   tool('bgPencilTool','Pencil (B)','pencil','pencil'),tool('bgEraserTool','Eraser (E)','eraser','eraser'),tool('bgFillTool','Fill (G)','fill','fill'),
   tool('bgRectangleTool','Rectangle (R)','rectangle','rectangle'),tool('bgPickerTool','Pick tile (I)','picker','picker'),
   tool('bgPanTool','Pan (H) — drag the canvas to scroll it; Space or the middle button pan with any other tool active','pan','pan')],
 ],[Object.assign(StudioShell.iconButton('bgCopy','Copy selection (Ctrl/Cmd+C)','copy'),{onclick:()=>selection.copy()&&syncEditActions()}),
  Object.assign(StudioShell.iconButton('bgPaste','Paste (Ctrl/Cmd+V) — click to place it','paste'),{onclick:()=>{if(selection.startPaste()){setTool('select');setStatus('Click to place the paste. Escape cancels.');}}}),
  Object.assign(StudioShell.iconButton('bgUndo','Undo (Ctrl/Cmd+Z)','undo'),{onclick:ProjectHistory.undo}),Object.assign(StudioShell.iconButton('bgRedo','Redo (Ctrl/Cmd+Shift+Z)','redo'),{onclick:ProjectHistory.redo})]);
 const sideRail=StudioShell.toolRail('bgSideRail','Selection','right');host.append(sideRail);
 for(const [id,icon,label] of [['bgFlipX','flipH','Flip horizontally (Shift+H) — the selection, or the next stamp'],['bgFlipY','flipV','Flip vertically (Shift+V) — the selection, or the next stamp'],['bgPriority','priority','Priority, drawn in front of sprites — the selection, or the next stamp']])StudioShell.setIcon($(id),icon,label);
 StudioShell.railLayout(sideRail,[[panelToggle(statusPanel,'bgStatusToggle','Status — loaded window and screen position','camera','bgRight',true)],[$('bgFlipX'),$('bgFlipY'),$('bgPriority')],
  [Object.assign(StudioShell.iconButton('bgDeleteSelection','Clear the selected cells (Delete)','delete'),{onclick:()=>selection.remove()})]]);
 StudioShell.editActions('backgrounds',{copy:()=>selection.copy(),cut:()=>selection.cut(),paste:()=>{if(selection.startPaste()){setTool('select');setStatus('Click to place the paste. Escape cancels.');}}});
 // Copy, Paste and Delete follow the selection and the clipboard.
 function syncEditActions(){$('bgCopy').disabled=$('bgDeleteSelection').disabled=!selection.rect;$('bgPaste').disabled=!StudioShell.clipboard.has('cells');}
 document.addEventListener('studioclipboard',()=>{if(!host.hidden)syncEditActions();});
 library.hidden=true;tileLibrary.hidden=true;statusPanel.hidden=true;
 for(const id of ['bgLibraryToggle','bgTileLibraryToggle','bgStatusToggle'])$(id).setAttribute('aria-expanded','false');

 window.addEventListener('keydown',e=>{
  if(currentView!=='backgrounds'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  // Selection and clipboard keys, the same in every grid editor.
  const command=selection.key(e);
  if(command){e.preventDefault();e.stopImmediatePropagation();if((command==='selectAll'||command==='paste')&&bgTool!=='select')setTool('select');if(command==='paste')setStatus('Click to place the paste. Escape cancels.');return;}
  // No `!bgSpaceHeld` guard here: held keys repeat-fire keydown, and every
  // one of those must be prevented too, or the un-prevented repeats leave
  // the browser's native "Space pages the nearest scrollable ancestor down"
  // behavior free to fire on #bgStage in between them.
  if(e.code==='Space'){bgSpaceHeld=true;e.preventDefault();$('bgCanvas').style.cursor='grab';}
  // Single-key tool shortcuts, the same letters as the tileset editor's.
  if(e.metaKey||e.ctrlKey||e.altKey||document.querySelector('dialog[open]'))return;
  if(e.shiftKey&&(e.key.toLowerCase()==='h'||e.key.toLowerCase()==='v')){e.preventDefault();e.stopImmediatePropagation();$(e.key.toLowerCase()==='h'?'bgFlipX':'bgFlipY').click();return;}
  const tool={b:'bgPencilTool',r:'bgRectangleTool',g:'bgFillTool',e:'bgEraserTool',i:'bgPickerTool',s:'bgSelectTool',h:'bgPanTool'}[e.key.toLowerCase()];
  if(tool&&!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();$(tool).click();}
 },true);
 window.addEventListener('keyup',e=>{if(e.code==='Space'){bgSpaceHeld=false;$('bgCanvas').style.cursor=bgTool==='pan'?'grab':'';}});
 window.addEventListener('blur',()=>{bgSpaceHeld=false;bgPanDrag=null;$('bgCanvas').style.cursor=bgTool==='pan'?'grab':'';});
 // Space-drag, the middle button, or the Pan tool all scroll #bgStage instead
 // of painting. Capture phase + stopImmediatePropagation so this runs before
 // the canvas's own paint handlers or the rectangle handles' drag handlers.
 $('bgStage').addEventListener('pointerdown',e=>{
  if(e.button===2||(!bgSpaceHeld&&e.button!==1&&bgTool!=='pan'))return;
  e.preventDefault();e.stopImmediatePropagation();
  bgPanDrag={x:e.clientX,y:e.clientY,left:$('bgStage').scrollLeft,top:$('bgStage').scrollTop};
  $('bgStage').setPointerCapture(e.pointerId);$('bgCanvas').style.cursor='grabbing';
 },true);
 $('bgStage').addEventListener('pointermove',e=>{
  if(!bgPanDrag)return;e.preventDefault();e.stopImmediatePropagation();
  $('bgStage').scrollLeft=bgPanDrag.left+bgPanDrag.x-e.clientX;
  $('bgStage').scrollTop=bgPanDrag.top+bgPanDrag.y-e.clientY;
 },true);
 for(const type of ['pointerup','pointercancel'])$('bgStage').addEventListener(type,e=>{
  if(!bgPanDrag)return;bgPanDrag=null;e.stopImmediatePropagation();
  $('bgCanvas').style.cursor=bgSpaceHeld||bgTool==='pan'?'grab':'';
 },true);

 StudioShell.viewStatus('backgrounds',$('bgStatus'));
 window.renderBackgrounds=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){oldShow(v);render();};
 render();
})();
