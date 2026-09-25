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
 const host=document.createElement('section');host.id='backgroundEditor';host.hidden=true;
 host.innerHTML=`<aside class="bgLibrary"><h2>Backgrounds</h2><div id="bgActions" class="assetToolbar"></div><div id="bgList" role="listbox" aria-label="Backgrounds"></div><p>Double-click a background to rename it.</p></aside>
 <aside class="bgTileLibrary"><h2>Tilesets</h2>
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
 <aside class="bgStatusPanel"><h2>Status</h2>
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
 <main><div id="bgEmpty" role="status"><p id="bgEmptyMessage"></p><button id="bgCreateTileset">Go to Tilesets</button></div>
  <div id="bgWork">
   <div class="bgTop"><strong id="bgTitle"></strong>
    <label>Size <input id="bgWidth" type="number" min="1" max="1024" aria-label="Background width in tiles"> × <input id="bgHeight" type="number" min="1" max="1024" aria-label="Background height in tiles"><button id="bgResize">Resize</button></label>
    <label id="bgPreviewModeWrap">Viewport preview <select id="bgPreviewMode" aria-label="Viewport preview size"></select></label>
    <button id="bgZoomOut" aria-label="Zoom out">−</button><span id="bgZoomLabel"></span><button id="bgZoomIn" aria-label="Zoom in">+</button>
   </div>
   <div id="bgStage"><div id="bgCanvasWrap"><canvas id="bgCanvas"></canvas><div id="bgViewportOverlay" hidden><div id="bgViewportHandle" title="Drag to move the loaded window"></div></div><div id="bgScrollClip" hidden><div class="bgScrollRect"></div><div class="bgScrollRect"></div><div class="bgScrollRect"></div><div class="bgScrollRect"></div><div id="bgScrollHandle" title="Drag to preview scroll position (SCROLL_X/SCROLL_Y)"></div></div></div></div>
   <div id="bgStampBar">
    <span>Tile <b id="bgStampTile"></b></span>
    <span id="bgGroupLabel" hidden></span>
    <span id="bgSelectionLabel" hidden></span><button id="bgSelectionClear" hidden>Clear selection</button>
    <button id="bgFlipX">Flip X</button><button id="bgFlipY">Flip Y</button><button id="bgPriority">Priority</button>
    <span id="bgStampSource"></span>
    <span id="bgBankLabel"></span><button id="bgBankReset" hidden>Reset to default</button>
   </div>
   <section id="bgPaletteDock"><div class="paletteDockHead"><label id="bgConfigWrap">Group <select id="bgConfigPicker" aria-label="Palette bank group"></select></label></div><div id="bgSwatches"></div></section>
   <div id="bgStatus"></div>
  </div>
 </main>`;
 // Inserted before the footer, not appended to #workspace, so the status bar
 // stays at the bottom of the page instead of landing above this section.
 $('spritePanel').after(host);

 const style=document.createElement('style');style.textContent=`
 #backgroundEditor{position:relative;height:calc(100vh - 118px);display:grid;grid-template-columns:64px minmax(0,1fr)}
 #backgroundEditor main{grid-column:2;display:flex;flex-direction:column;min-width:0;min-height:0}
 #bgEmpty{padding:12px 18px;background:var(--panel);border-bottom:1px solid var(--line)}
 #bgWork{flex:1;width:100%;max-width:100%;min-width:0;min-height:0;display:flex;flex-direction:column}
 .bgTop{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 18px;background:var(--panel)}
 #bgTitle{color:var(--ink);font-size:13px;margin-right:auto}
 #bgWidth,#bgHeight{width:64px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:5px}
 #bgPreviewModeWrap{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-dim)}
 #bgStage{flex:1;min-width:0;min-height:0;overflow:auto;background:#101113;padding:24px}
 #bgCanvasWrap{position:relative;display:inline-block;border:1px solid var(--text-dim);box-shadow:0 6px 24px #0008}
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
 #bgStampSource{color:var(--text-dim)}
 #bgBankLabel{color:var(--text-dim)}
 #bgGroupLabel{color:var(--ink)}
 #bgSelectionLabel{color:var(--sel)}
 #bgSwatches .paletteGroup:disabled{opacity:.4;cursor:default}
 #bgPaletteDock{background:var(--panel);border-top:1px solid var(--line);padding:10px 18px}
 #bgConfigWrap{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-dim)}
 #bgConfigPicker{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-size:11px;max-width:190px}
 #bgSwatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px;max-width:660px}
 #bgSwatches .paletteGroup{display:flex;align-items:center;gap:6px;height:26px;padding:0 6px;border-radius:3px;border:2px solid var(--line);background:none;cursor:pointer;font:inherit;color:var(--text-dim)}
 #bgSwatches .paletteGroup.chosenColor{border-color:var(--sel);box-shadow:0 0 0 1px var(--sel)}
 #bgSwatches .paletteGroup span:first-child{width:16px;flex-shrink:0;text-align:right;font-size:10px}
 #bgSwatches .rowChips{display:flex;gap:1px;flex-shrink:0}
 #bgSwatches .rowChips i{width:9px;height:16px;border-radius:1px;display:block}
 #bgStatus{padding:6px 18px;font-size:10px;color:var(--text-dim);background:var(--panel);border-top:1px solid var(--line)}
 .bgLibrary,.bgTileLibrary,.bgStatusPanel{position:absolute;z-index:8;left:64px;top:0;bottom:0;width:285px;padding:12px;padding-top:38px;background:var(--panel);border-right:1px solid var(--line);box-shadow:6px 0 20px #0008;display:flex;flex-direction:column;overflow:auto}
 .bgLibrary h2,.bgTileLibrary h2,.bgStatusPanel h2{font-size:12px;color:var(--text-dim);margin:0 0 8px;flex-shrink:0}
 .bgTileLibrary strong{display:block;font-size:10px;color:var(--text-dim);margin:8px 0 4px}
 .bgLibrary p,.bgTileLibrary p{font-size:10px;line-height:1.5;color:var(--text-dim)}
 #bgList,#bgPrimaryList,#bgAltList,#bgObjectList{border:1px solid var(--line);background:var(--bg);min-height:70px;max-height:140px;overflow:auto}
 #bgTileMap{width:100%;image-rendering:pixelated;touch-action:none;cursor:crosshair;margin-top:6px}
 #backgroundEditor:has(>.bgLibrary:not([hidden])),#backgroundEditor:has(>.bgTileLibrary:not([hidden])),#backgroundEditor:has(>.bgStatusPanel:not([hidden])){grid-template-columns:64px 285px minmax(0,1fr)}
 #backgroundEditor main{grid-column:-2 / -1;grid-row:1;overflow:hidden}
 #backgroundEditor>.bgLibrary,#backgroundEditor>.bgTileLibrary,#backgroundEditor>.bgStatusPanel{position:relative;grid-column:2;grid-row:1;left:auto;top:auto;bottom:auto;width:auto;min-width:0;min-height:0;box-shadow:none}
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

 let backgroundIndex=0,bgUndo=[],bgRedo=[];
 let bgTool='pencil',bgZoom=1,bgErasing=false,bgPainting=false,bgLast=null,bgAnchor=null;
 // The Select tool marks an existing range of cells so Flip X/Y, Priority
 // and a palette bank click below edit them in place — tile and CHR_ALT are
 // never touched by this, only the four attribute fields.
 let bgSelection=null,bgSelectAnchor=null;
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
 const bgTilesetById=id=>tilesets.find(t=>t.id===id);
 const primaryTileset=()=>bgTilesetById(background()?.tilesetId);
 const altTileset=()=>bgTilesetById(background()?.altTilesetId);
 const pickingTileset=()=>bgPickAlt?altTileset():primaryTileset();
 function blankCell(){return {tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false};}
 function makeCells(width,height){return Array.from({length:width*height},blankCell);}

 // A background's own data never mutates tilesets/palettes/shapes/animations
 // and nothing in those domains mutates a background, so this history is
 // independent rather than shared with theirs.
 function bgCheckpoint(){bgUndo.push(JSON.stringify({backgrounds}));if(bgUndo.length>50)bgUndo.shift();bgRedo=[];}
 function bgEdit(fn){bgCheckpoint();fn();markDirty();render();}
 function bgStepUndo(){if(!bgUndo.length)return;bgRedo.push(JSON.stringify({backgrounds}));({backgrounds}=JSON.parse(bgUndo.pop()));backgroundIndex=Math.min(backgroundIndex,Math.max(0,backgrounds.length-1));markDirty();render();}
 function bgStepRedo(){if(!bgRedo.length)return;bgUndo.push(JSON.stringify({backgrounds}));({backgrounds}=JSON.parse(bgRedo.pop()));backgroundIndex=Math.min(backgroundIndex,Math.max(0,backgrounds.length-1));markDirty();render();}

 function freshBackgroundName(){let n=1;while(backgrounds.some(b=>b.name.toLowerCase()==='background_'+n))n++;return 'Background_'+n;}
 function chooseBackground(i){backgroundIndex=i;bgViewportOrigin={x:0,y:0};bgScroll={x:0,y:0};bgActiveSet=0;bgPrimaryPlane=0;bgAltPlane=0;bgPickRegion={col:0,row:0,width:1,height:1};bgSelection=null;render();}
 function renameBackground(i,name){
  if(!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(name)||backgrounds.some((x,j)=>j!==i&&x.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique filename: letters, digits, underscore or hyphen.');return false;}
  bgEdit(()=>backgrounds[i].name=name);return true;
 }
 function renderBackgroundList(){
  StudioShell.renderList($('bgList'),backgrounds,{selected:(b,i)=>i===backgroundIndex,choose:(b,i)=>chooseBackground(i),rename:renameBackground,render,maxLength:48});
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
    row.onclick=()=>{if(!a||t.id===a[field])return;bgEdit(()=>{a[field]=t.id;});};
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
    const ink=tilePixel(source,t,x,y,bgPickAlt?bgAltPlane:bgPrimaryPlane);
    ctx.fillStyle=ink===0?'#252830':css565(bankColor(bank,ink));
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
  render();
 }
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
    render();
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
 // keeps its own authored palette bank; flip and priority from the stamp
 // bar apply uniformly across the group.
 function paintGroupAt(col,row){
  if(bgErasing){paintCellAt(col,row);return;}
  const a=background(),source=bgStamp.chrAlt?altTileset():primaryTileset();
  for(let dy=0;dy<bgPickRegion.height;dy++)for(let dx=0;dx<bgPickRegion.width;dx++){
   const cx=col+dx,cy=row+dy;
   if(cx<0||cy<0||cx>=a.width||cy>=a.height)continue;
   const tile=(bgPickRegion.row+dy)*16+(bgPickRegion.col+dx);
   a.cells[cy*a.width+cx]={tile,paletteBank:source?.tilePaletteBanks[tile]??0,flipX:bgStamp.flipX,flipY:bgStamp.flipY,priority:bgStamp.priority,chrAlt:bgStamp.chrAlt};
  }
 }
 function paintAt(col,row){(bgPickRegion.width>1||bgPickRegion.height>1?paintGroupAt:paintCellAt)(col,row);}
 function paintCanvas(){
  const a=background();if(!a)return;
  const canvas=$('bgCanvas');canvas.width=a.width*8;canvas.height=a.height*8;
  canvas.style.width=(a.width*8*bgZoom)+'px';canvas.style.height=(a.height*8*bgZoom)+'px';
  const ctx=canvas.getContext('2d'),primary=primaryTileset(),alt=altTileset();
  for(let row=0;row<a.height;row++)for(let col=0;col<a.width;col++){
   const cell=a.cells[row*a.width+col],source=cell.chrAlt?alt:primary;
   for(let y=0;y<8;y++)for(let x=0;x<8;x++){
    const px=cell.flipX?7-x:x,py=cell.flipY?7-y:y;
    const ink=source?tilePixel(source,cell.tile,px,py,cell.chrAlt?bgAltPlane:bgPrimaryPlane):0;
    ctx.fillStyle=ink===0?'#101113':css565(bankColor(cell.paletteBank,ink));
    ctx.fillRect(col*8+x,row*8+y,1,1);
   }
  }
  // Marks where each cell — one nametable + attribute table entry — begins
  // and ends, so an empty cell doesn't read as featureless background.
  ctx.strokeStyle='#ffffff26';ctx.lineWidth=1;ctx.beginPath();
  for(let col=0;col<=a.width;col++){ctx.moveTo(col*8+.5,0);ctx.lineTo(col*8+.5,a.height*8);}
  for(let row=0;row<=a.height;row++){ctx.moveTo(0,row*8+.5);ctx.lineTo(a.width*8,row*8+.5);}
  ctx.stroke();
  if(bgShowOverlay)drawOverlayComposite(ctx);
  if(bgSelection){
   ctx.save();ctx.strokeStyle='#36c9d6';ctx.lineWidth=2;ctx.setLineDash([4,4]);
   ctx.strokeRect(bgSelection.x0*8+1,bgSelection.y0*8+1,(bgSelection.x1-bgSelection.x0+1)*8-2,(bgSelection.y1-bgSelection.y0+1)*8-2);
   ctx.restore();
  }
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
 // The Select tool never edits a cell itself — it just marks a range for
 // the attribute controls below (Flip X/Y, Priority, palette bank) to apply
 // to in one step, each cell keeping its own tile and CHR_ALT.
 function selectRegion(col,row){
  bgSelection={x0:Math.min(bgSelectAnchor.col,col),y0:Math.min(bgSelectAnchor.row,row),x1:Math.max(bgSelectAnchor.col,col),y1:Math.max(bgSelectAnchor.row,row)};
  updateStampBar();paintCanvas();
 }
 function applyToSelection(mutate){
  if(!bgSelection)return;
  const a=background(),sel=bgSelection;
  bgEdit(()=>{for(let row=sel.y0;row<=sel.y1;row++)for(let col=sel.x0;col<=sel.x1;col++)mutate(a.cells[row*a.width+col]);});
 }
 $('bgCanvas').onpointerdown=e=>{
  e.preventDefault();if(!background())return;
  bgErasing=e.button===2||bgTool==='eraser';
  const {col,row}=canvasCell(e);
  if(bgTool==='picker'){const cell=background().cells[row*background().width+col];bgStamp={...cell};bgPickAlt=cell.chrAlt;bgPickRegion={col:cell.tile%16,row:Math.floor(cell.tile/16),width:1,height:1};render();return;}
  if(bgTool==='select'){bgSelectAnchor={col,row};$('bgCanvas').setPointerCapture(e.pointerId);selectRegion(col,row);return;}
  bgCheckpoint();
  if(bgTool==='fill'){bgFlood(col,row);markDirty();paintCanvas();return;}
  if(bgTool==='rectangle'){bgAnchor={col,row};$('bgCanvas').setPointerCapture(e.pointerId);previewRectangle(col,row);return;}
  bgPainting=true;bgLast=null;$('bgCanvas').setPointerCapture(e.pointerId);bgDrawTo(col,row);
 };
 $('bgCanvas').onpointermove=e=>{
  if(!background())return;
  const {col,row}=canvasCell(e);
  if(bgSelectAnchor){selectRegion(col,row);return;}
  if(bgAnchor){previewRectangle(col,row);return;}
  if(bgPainting)bgDrawTo(col,row);
 };
 $('bgCanvas').onpointerup=e=>{
  if(!background())return;
  if(bgSelectAnchor){bgSelectAnchor=null;return;}
  if(bgAnchor){const {col,row}=canvasCell(e);commitRectangle(col,row);return;}
  bgPainting=false;bgLast=null;
 };
 $('bgCanvas').onpointercancel=()=>{bgAnchor=null;bgPainting=false;bgLast=null;bgSelectAnchor=null;paintCanvas();};
 $('bgCanvas').oncontextmenu=e=>e.preventDefault();

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
  if(cropsContent&&!confirm('Shrinking crops painted cells outside the new size. Continue?')){render();return;}
  bgSelection=null;
  bgEdit(()=>{
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

 $('bgZoomIn').onclick=()=>{bgZoom=Math.min(8,bgZoom*2);render();};
 $('bgZoomOut').onclick=()=>{bgZoom=Math.max(1,bgZoom/2);render();};

 function updateStampBar(){
  const group=bgPickRegion.width>1||bgPickRegion.height>1;
  $('bgStampTile').textContent=String(bgStamp.tile);
  $('bgGroupLabel').hidden=!group;
  $('bgGroupLabel').textContent=`Group ${bgPickRegion.width} × ${bgPickRegion.height} — each tile keeps its own bank`;
  $('bgSelectionLabel').hidden=!bgSelection;
  if(bgSelection)$('bgSelectionLabel').textContent=`Selected ${bgSelection.x1-bgSelection.x0+1} × ${bgSelection.y1-bgSelection.y0+1} — Flip/Priority/bank below edit these tiles in place`;
  $('bgSelectionClear').hidden=!bgSelection;
  $('bgFlipX').classList.toggle('on',bgStamp.flipX);
  $('bgFlipY').classList.toggle('on',bgStamp.flipY);
  $('bgPriority').classList.toggle('on',bgStamp.priority);
  $('bgStampSource').textContent=bgStamp.chrAlt?'Reads: Alternate':'Reads: Primary';
  const source=bgStamp.chrAlt?altTileset():primaryTileset(),authored=source?.tilePaletteBanks?.[bgStamp.tile];
  $('bgBankLabel').textContent=group&&!bgSelection?'':'Bank '+String(bgStamp.paletteBank).padStart(2,'0');
  $('bgBankReset').hidden=bgSelection?false:(group||authored===undefined||authored===bgStamp.paletteBank);
 }
 // With an active Select-tool range, these edit every selected cell's
 // attribute in place instead of just updating the next stamp — the tile
 // and CHR_ALT of each selected cell are never touched.
 $('bgFlipX').onclick=()=>{bgStamp={...bgStamp,flipX:!bgStamp.flipX};if(bgSelection)applyToSelection(cell=>cell.flipX=bgStamp.flipX);else render();};
 $('bgFlipY').onclick=()=>{bgStamp={...bgStamp,flipY:!bgStamp.flipY};if(bgSelection)applyToSelection(cell=>cell.flipY=bgStamp.flipY);else render();};
 $('bgPriority').onclick=()=>{bgStamp={...bgStamp,priority:!bgStamp.priority};if(bgSelection)applyToSelection(cell=>cell.priority=bgStamp.priority);else render();};
 $('bgBankReset').onclick=()=>{
  if(bgSelection){applyToSelection(cell=>{const source=cell.chrAlt?altTileset():primaryTileset();if(source)cell.paletteBank=source.tilePaletteBanks[cell.tile];});return;}
  const source=bgStamp.chrAlt?altTileset():primaryTileset();if(source)bgStamp={...bgStamp,paletteBank:source.tilePaletteBanks[bgStamp.tile]};render();
 };
 $('bgSelectionClear').onclick=()=>{bgSelection=null;render();};

 // Each bank is a full 8-color palette, not one representative color — a
 // single swatch per bank made two banks that only differed past color 1
 // look identical. Clicking anywhere on a bank's row selects it, same as
 // the single-swatch buttons this replaces.
 function renderPaletteDock(){
  const host=$('bgSwatches');
  if(host.querySelectorAll('.paletteGroup').length!==16)host.replaceChildren(...Array.from({length:16},(_,b)=>{
   const row=document.createElement('button');row.type='button';row.className='paletteGroup';row.dataset.palette=String(b);
   const label=document.createElement('span');label.textContent=String(b).padStart(2,'0');
   const chips=document.createElement('span');chips.className='rowChips';
   for(let i=0;i<8;i++)chips.append(document.createElement('i'));
   row.append(label,chips);
   row.onclick=()=>{bgStamp={...bgStamp,paletteBank:b};if(bgSelection)applyToSelection(cell=>cell.paletteBank=b);else render();};
   return row;
  }));
  // A picked group has no single bank to preview or apply — unless a Select
  // range is active, in which case a bank click applies to that range
  // regardless of what's picked in the tile picker.
  const group=!bgSelection&&(bgPickRegion.width>1||bgPickRegion.height>1);
  host.querySelectorAll('.paletteGroup').forEach(row=>{
   const b=Number(row.dataset.palette),chips=row.querySelectorAll('.rowChips i');
   for(let i=0;i<8;i++)chips[i].style.background=css565(bankColor(b,i));
   row.classList.toggle('chosenColor',!group&&!bgSelection&&b===bgStamp.paletteBank);
   row.disabled=group;
   row.title=group?'A group keeps each tile\'s own authored bank':bgSelection?`Set the selected tiles to bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`:`Bank ${String(b).padStart(2,'0')} · ${bankPalette(b)?.name??'empty'}`;
  });
  syncBgConfigPicker();
 }
 function syncBgConfigPicker(){
  const picker=$('bgConfigPicker'),signature=paletteConfigs.map(c=>c.id+'|'+c.name).join(',');
  if(picker.dataset.signature!==signature){picker.dataset.signature=signature;picker.replaceChildren(...paletteConfigs.map(c=>new Option(c.name,c.id)));}
  picker.value=activeConfig()?.id??'';picker.disabled=paletteConfigs.length<2;
 }
 $('bgConfigPicker').onchange=()=>{activeConfigId=$('bgConfigPicker').value;redrawAll();};

 function render(){
  host.hidden=currentView!=='backgrounds';
  document.body.classList.toggle('backgroundView',!host.hidden);
  if(host.hidden)return;
  backgroundIndex=Math.min(backgroundIndex,Math.max(0,backgrounds.length-1));
  const a=background();
  $('bgEmpty').hidden=!!a;
  $('bgEmptyMessage').textContent=!tilesets.length?'Create a tileset first. A background draws from two tilesets.':'Choose New background in the Backgrounds library to start painting.';
  $('bgCreateTileset').hidden=!!tilesets.length;
  $('bgWork').hidden=!a;
  renderBackgroundList();
  if(!a)return;
  $('bgTitle').textContent=a.name;
  $('bgWidth').value=a.width;$('bgHeight').value=a.height;
  $('bgPreviewMode').value=String(bgPreviewModeId);
  $('bgZoomLabel').textContent=bgZoom+'×';$('bgZoomOut').disabled=bgZoom===1;$('bgZoomIn').disabled=bgZoom===8;
  for(const [id,tool] of [['bgPencilTool','pencil'],['bgRectangleTool','rectangle'],['bgFillTool','fill'],['bgEraserTool','eraser'],['bgPickerTool','picker'],['bgSelectTool','select'],['bgPanTool','pan']])$(id).classList.toggle('on',bgTool===tool);
  $('bgCanvas').style.cursor=bgTool==='pan'?'grab':'';
  $('bgUndo').disabled=!bgUndo.length;$('bgRedo').disabled=!bgRedo.length;
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
 }

 $('bgCreateTileset').onclick=()=>{showView('tiles');};
 const toolbarButton=(id,label,path)=>{const b=StudioShell.iconButton(id,label,path);b.querySelector('svg').setAttribute('width','20');b.querySelector('svg').setAttribute('height','20');return b;};
 for(const [id,label,path] of [
  ['bgNewAction','New background','<path d="M12 4v16M4 12h16"/>'],
  ['bgDuplicateAction','Duplicate background','<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5"/>'],
  ['bgDeleteAction','Delete background','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>']
 ]){$('bgActions').append(toolbarButton(id,label,path));}
 $('bgNewAction').onclick=()=>{
  if(backgrounds.length>=255){setStatus('A project holds at most 255 backgrounds.');return;}
  if(!tilesets.length){setStatus('Create a tileset first.');return;}
  bgEdit(()=>{
   const width=40,height=25;
   backgrounds.push({id:crypto.randomUUID(),name:freshBackgroundName(),width,height,tilesetId:tilesets[0].id,altTilesetId:tilesets[0].id,cells:makeCells(width,height)});
   backgroundIndex=backgrounds.length-1;bgViewportOrigin={x:0,y:0};bgScroll={x:0,y:0};bgActiveSet=0;bgPrimaryPlane=0;bgAltPlane=0;
  });
  setStatus('Created '+background().name+'.');
 };
 $('bgDuplicateAction').onclick=()=>{
  if(!background()||backgrounds.length>=255)return;
  bgEdit(()=>{const copy=structuredClone(background());copy.id=crypto.randomUUID();copy.name=freshBackgroundName();backgrounds.push(copy);backgroundIndex=backgrounds.length-1;});
 };
 $('bgDeleteAction').onclick=()=>{
  if(!background()||!confirm('Delete background "'+background().name+'"?'))return;
  bgEdit(()=>{backgrounds.splice(backgroundIndex,1);backgroundIndex=Math.max(0,backgroundIndex-1);});
 };

 const rail=StudioShell.toolRail('bgRail','Background tools');host.prepend(rail);
 const library=host.querySelector('.bgLibrary'),tileLibrary=host.querySelector('.bgTileLibrary'),statusPanel=host.querySelector('.bgStatusPanel');
 for(const [panel,id,label,path] of [
  [library,'bgLibraryToggle','Backgrounds','<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16"/><path d="M3 9h5M16 9h5M3 15h5M16 15h5"/>'],
  [tileLibrary,'bgTileLibraryToggle','Tilesets','<path d="M5 2h11l5 5v17H5zM16 2v6h5"/><path d="M8 12h10v8H8zM13 12v8M8 16h10"/>'],
  [statusPanel,'bgStatusToggle','Status — loaded window and screen position','<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>']
 ]){
  const b=StudioShell.iconButton(id,label,path);rail.append(b);
  StudioShell.bindPanel({panel,button:b,group:'background',closeGroups:['background']});
 }
 library.hidden=true;tileLibrary.hidden=true;statusPanel.hidden=true;
 for(const id of ['bgLibraryToggle','bgTileLibraryToggle','bgStatusToggle'])$(id).setAttribute('aria-expanded','false');
 for(const [id,label,path,fn] of [
  ['bgPencilTool','Pencil (B)','<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',()=>{bgTool='pencil';render();}],
  ['bgRectangleTool','Rectangle fill (R)','<rect x="3" y="5" width="18" height="14"/>',()=>{bgTool='rectangle';render();}],
  ['bgFillTool','Fill (G)','<path d="m4 12 8-8 9 9-8 8z"/><path d="M7 9V5a3 3 0 0 1 6 0v3M4 12h16"/>',()=>{bgTool='fill';render();}],
  ['bgEraserTool','Eraser (E)','<path d="m3 15 9-10a2 2 0 0 1 3 0l7 6a2 2 0 0 1 0 3l-6 7H9z"/><path d="m8 10 10 8M9 21h14"/>',()=>{bgTool='eraser';render();}],
  ['bgPickerTool','Pick tile (I)','<path d="m15 4 2-2a3 3 0 0 1 4 4l-2 2 2 2-3 3-7-7 3-3z" fill="currentColor"/><path d="m12 8-9 9v4h4l9-9"/>',()=>{bgTool='picker';render();}],
  ['bgSelectTool','Select tiles — drag to select existing cells, then use Flip X/Y, Priority or a palette bank below to edit them in place without repainting the tile itself','<rect x="4" y="4" width="16" height="16" rx="1" stroke-dasharray="3 3"/>',()=>{bgTool='select';render();}],
  ['bgPanTool','Pan (H) — drag the canvas to scroll it; Space or the middle button pan with any other tool active','<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10V6a2 2 0 0 0-4 0v8c0 4 2 7 7 7s7-3 7-7v-4a2 2 0 0 0-4 0v1"/>',()=>{bgTool='pan';render();}],
  ['bgUndo','Undo','<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>',bgStepUndo],
  ['bgRedo','Redo','<path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7"/>',bgStepRedo],
 ]){const b=StudioShell.iconButton(id,label,path);b.onclick=fn;rail.append(b);}

 window.addEventListener('keydown',e=>{
  if(currentView!=='backgrounds'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();(e.shiftKey?bgStepRedo:bgStepUndo)();}
  if(e.key==='Escape'&&bgSelection){e.preventDefault();bgSelection=null;render();}
  // No `!bgSpaceHeld` guard here: held keys repeat-fire keydown, and every
  // one of those must be prevented too, or the un-prevented repeats leave
  // the browser's native "Space pages the nearest scrollable ancestor down"
  // behavior free to fire on #bgStage in between them.
  if(e.code==='Space'){bgSpaceHeld=true;e.preventDefault();$('bgCanvas').style.cursor='grab';}
 },true);
 window.addEventListener('keyup',e=>{if(e.code==='Space'){bgSpaceHeld=false;$('bgCanvas').style.cursor=bgTool==='pan'?'grab':'';}});
 window.addEventListener('blur',()=>{bgSpaceHeld=false;bgPanDrag=null;$('bgCanvas').style.cursor=bgTool==='pan'?'grab':'';});
 // Space-drag, the middle button, or the Pan tool all scroll #bgStage instead
 // of painting. Capture phase + stopImmediatePropagation so this runs before
 // the canvas's own paint handlers or the rectangle handles' drag handlers.
 $('bgStage').addEventListener('pointerdown',e=>{
  if(!bgSpaceHeld&&e.button!==1&&bgTool!=='pan')return;
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

 window.renderBackgrounds=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){oldShow(v);render();};
 render();
})();
