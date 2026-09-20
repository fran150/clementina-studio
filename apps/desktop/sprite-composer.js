// Shape authoring: one arrangement of sprites from a single tileset. Coordinates
// are pixels relative to the shape's origin; list order is OAM order.
(() => {
 const host=document.createElement('section');host.id='spriteComposer';host.hidden=true;
 host.innerHTML=`<aside class="scLibrary"><h2>Shapes</h2><div id="scShapeActions" class="assetToolbar"></div><div id="scSprites" role="listbox" aria-label="Shapes"></div><p>Double-click a shape to rename it.</p></aside><aside class="scTileLibrary"><h2>Tileset</h2><div id="scBank" role="listbox" aria-label="Source tileset"></div><p id="scTilesetNote">A shape draws from one tileset: Clementina has a single sprite CHR bank.</p><h2>Tile selector</h2><canvas id="scBankMap" width="256" height="256"></canvas><label>Object <select id="scObjects"></select></label><p>Left-drag to select tiles. Right-click to pick them up, then click the canvas. Or right-drag directly onto it.</p><button id="scPlace">Place selection</button></aside>
 <main><div class="scTop"><div id="scZoomGroup"><button id="scFit">Fit</button><button id="scActualSize">100%</button><button id="scZoomOut" title="Zoom out" aria-label="Zoom out">−</button><span id="scZoomLabel"></span><button id="scZoomIn" title="Zoom in" aria-label="Zoom in">+</button></div><label>Canvas <input id="scWidth" type="number" min="1" max="128" value="4" aria-label="Editing width in tiles"> × <input id="scHeight" type="number" min="1" max="128" value="4" aria-label="Editing height in tiles"> <select id="scUnits" aria-label="Canvas units"><option value="tiles">tiles</option><option value="pixels">pixels</option></select></label></div>
 <div class="scOrigin">Origin <button data-origin="top-left">Top-left</button><button data-origin="center">Center</button><button data-origin="bottom-center">Bottom-center</button><button id="scOriginTool">Place origin</button><label id="scSnapRow" hidden><input id="scSnap" type="checkbox">Snap</label><details id="scDisplaySettings"><summary></summary><div><label id="scGridRow"><span>Grid</span><input id="scGrid" type="checkbox" checked></label><label id="scBackgroundRow"><span>Background</span><input type="color" id="scBackground" value="#252830"></label></div></details></div>
 <div id="scViewport"><canvas id="scCanvas" tabindex="0" aria-label="Sprite composition canvas"></canvas><canvas id="scMini" width="144" height="112" title="Sprite miniature"></canvas></div><div id="scStatus"></div><section id="scPaletteDock"><div class="paletteDockHead"><label id="scConfigWrap">Group <select id="scConfigPicker" aria-label="Palette bank group"></select></label><span id="scPaletteHint">Click a bank to set it on the selected sprites.</span></div><div id="scPalettes"></div></section></main>
 <aside class="scInspector"><button id="scRemove">Remove</button><h2>Draw order</h2><p>Later sprites draw on top. Position in this list is the offset from wherever the shape is loaded into OAM. Flip and reorder selected sprites from the bar on the right.</p><div id="scParts"></div><p>Shift-click or drag empty space to select multiple parts. Arrows nudge 1 px. Space-drag pans. Scroll zooms. Escape cancels placement.</p></aside>`;
 $('spritePanel').after(host);
 const style=document.createElement('style');style.textContent=`body.spriteCompose{padding-left:0;overflow:hidden}body.spriteCompose #workflowNav{position:static;width:auto;height:44px;display:flex;align-items:center;gap:6px;padding:5px 12px}body.spriteCompose #workflowNav .brand{font-size:12px;margin-right:18px}body.spriteCompose #workflowNav .brand span,body.spriteCompose #workflowNav .navGroup,body.spriteCompose #workflowNav .navNote,body.spriteCompose #workflowHeading{display:none}body.spriteCompose #workflowNav button{width:auto;margin:0;padding:6px 12px}body.spriteCompose header{height:46px;padding:5px 12px}body.spriteCompose footer{left:0;height:28px}#spriteComposer{height:calc(100vh - 118px);display:grid;grid-template-columns:280px minmax(350px,1fr) 220px;gap:0}#spriteComposer aside{padding:12px;background:var(--panel);overflow:auto;border-right:1px solid var(--line)}#spriteComposer h2{font-size:12px;margin:12px 0 8px}#spriteComposer p{font-size:10px;line-height:1.5;color:var(--text-dim)}#spriteComposer select{width:100%;margin:5px 0}#spriteComposer button{margin:3px 1px;padding:5px 8px}#spriteComposer input[type=number]{width:65px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:4px}#scName{display:block;padding:7px;cursor:text}#scName input{width:100%}#scBankMap{width:100%;touch-action:none;image-rendering:pixelated}#scSource{display:block;max-width:100%;max-height:128px;image-rendering:pixelated;cursor:grab;border:1px solid var(--line);margin:8px 0}#spriteComposer main{padding:0;gap:0;align-items:stretch;display:flex;flex-direction:column;min-width:0;min-height:0}.scTop,.scOrigin{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:5px 10px;background:var(--panel);font-size:11px}#scViewport{position:relative;flex:1;min-height:100px;background:#17191e;overflow:hidden}#scCanvas{width:100%;height:100%;touch-action:none;outline:none}#scMini{position:absolute;right:12px;top:12px;background:#202329;border:1px solid var(--line);pointer-events:none}#scStatus{padding:6px 10px;font-size:10px;color:var(--text-dim)}#scPaletteDock{width:100%;align-self:stretch;background:var(--panel);border-top:1px solid var(--line);padding:10px 18px;box-sizing:border-box}#scPaletteHint{font-size:10px;color:var(--text-dim);margin-left:auto}#scConfigWrap{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-dim)}#scConfigPicker{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-size:11px;max-width:190px}#scPalettes{width:100%;box-sizing:border-box;display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:7px 16px;max-height:220px;overflow:auto;justify-items:start}#scPalettes button{margin:0;padding:0}#scBank{border:1px solid var(--line);background:var(--bg);max-height:180px;overflow:auto;margin:5px 0}#scParts{max-height:45vh;overflow:auto}#scParts button{display:block;width:100%;text-align:left;font-size:10px}#spriteComposer .on{outline:1px solid #36c9d6}#spriteComposer .missing{color:#ff7777}@media(max-width:1100px){#spriteComposer{grid-template-columns:240px minmax(300px,1fr) 180px}}`;
 document.head.append(style);
 // Built this early, before anything below wires up onclick handlers by id,
 // since these buttons don't exist in the static template above.
 function iconButton(id,label,path){const b=document.createElement('button');b.id=id;b.title=label;b.setAttribute('aria-label',label);b.innerHTML='<svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" stroke-width="1.7">'+path+'</svg>';return b;}
 for(const [id,label,path] of [['scNew','New shape','<path d="M12 4v16M4 12h16"/>'],['scDuplicate','Duplicate shape','<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5"/>'],['scDelete','Delete shape','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>']]){$('scShapeActions').append(iconButton(id,label,path));}
 // Undo/redo move into the left rail once it exists (see below); created here,
 // ahead of the onclick wiring further down, since they don't exist in the
 // static template above.
 for(const [id,label,path] of [['scUndo','Undo','<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>'],['scRedo','Redo','<path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7"/>']]){host.append(iconButton(id,label,path));}
 // Box select likewise moves into the left rail once it exists.
 host.append(iconButton('scBoxSelect','Box select — drag to select every sprite the box touches, even starting on top of one','<rect x="3" y="3" width="19" height="19" stroke-dasharray="3 3"/>'));
 let units='tiles',sourceDrag=null,ghostPoint=null;
 let selected=new Set(),sourceRect={x:0,y:0,width:1,height:1},sourceAnchor=null,zoom=8,camera={x:16,y:16},drag=null,placing=false,originTool=false,boxSelect=false,space=false,redo=[],lastSprite=null;
 const shape=()=>shapes[shapeIndex],spritesOf=()=>shape()?.sprites??[],source=()=>shapeTileset();
 const byId=id=>tilesets.find(t=>t.id===id);
 // Every sprite in a shape comes from the shape's one tileset.
 function shapeTileset(){return byId(shape()?.tilesetId);}
 const width=()=>Math.min(320,shape()?.canvasPixelWidth??(shape()?.canvasWidth??4)*8),height=()=>Math.min(200,shape()?.canvasPixelHeight??(shape()?.canvasHeight??4)*8);
 const ox=()=>shape()?.originX??0,oy=()=>shape()?.originY??0;
 function bounds(list=spritesOf()){if(!list.length)return {x:0,y:0,width:0,height:0};const x=Math.min(...list.map(p=>p.x)),y=Math.min(...list.map(p=>p.y));return {x,y,width:Math.max(...list.map(p=>p.x+8))-x,height:Math.max(...list.map(p=>p.y+8))-y};}
 function checkpoint(){shapeHistory.push(JSON.stringify({animations,shapes}));if(shapeHistory.length>50)shapeHistory.shift();redo=[];}
 function edit(fn){checkpoint();fn();markDirty();renderAnimations();render();}
 // OAM carries X as 10-bit signed and Y as 9-bit signed.
 function valid(list){return list.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=-512&&p.x<=511&&p.y>=-256&&p.y<=255);}
 function names(select,items,current){select.replaceChildren(...items.map((n,i)=>new Option(n,String(i),false,i===current)));}
 function render(){
  host.hidden=currentView!=='shapes';document.body.classList.toggle('spriteCompose',!host.hidden);if(host.hidden){hideGhost();return;}$('spritePanel').hidden=true;
  const a=shape();$('scGroupTitle').textContent=a?.name??'New shape';if(lastSprite!==a){selected=new Set();lastSprite=a;drag=null;placing=false;sourceDrag=null;hideGhost();}
  selected=new Set([...selected].filter(i=>i<spritesOf().length));
  renderShapeList();renderTilesetPicker();renderPaletteDock();syncScConfigPicker();
  $('scWidth').value=units==='pixels'?width():width()/8;$('scHeight').value=units==='pixels'?height():height()/8;$('scWidth').max=units==='pixels'?320:40;$('scHeight').max=units==='pixels'?200:25;$('scWidth').step=$('scHeight').step=1;$('scZoomLabel').textContent=Number(zoom.toFixed(2))+'×';
  for(const id of ['scDelete','scDuplicate','scWidth','scHeight','scOriginTool'])$(id).disabled=!a;
  $('scPlace').disabled=!a||!shapeTileset();$('scPlace').classList.toggle('on',placing);$('scOriginTool').classList.toggle('on',originTool);
  $('scBoxSelect').disabled=!a;$('scBoxSelect').classList.toggle('on',boxSelect);
  $('scUndo').disabled=!shapeHistory.length;$('scRedo').disabled=!redo.length;
  for(const id of ['scFlipX','scFlipY','scRemove','scBack','scFront','scMoveUp','scMoveDown'])$(id).disabled=!selected.size;
  $('scParts').replaceChildren(...spritesOf().map((p,i)=>{const b=document.createElement('button');b.textContent=`#${i} · ${shapeTileset()?.name??'No tileset'} / ${p.tile} (${p.x}, ${p.y})`;b.classList.toggle('on',selected.has(i));b.classList.toggle('missing',!shapeTileset());b.onclick=e=>{if(!e.shiftKey)selected.clear();selected.has(i)?selected.delete(i):selected.add(i);render();};return b;}));
  const objectSelect=$('scObjects'),previous=objectSelect.value;names(objectSelect,['Select an object…',...(source()?.compositions??[]).map(c=>c.name)],0);if([...objectSelect.options].some(o=>o.value===previous))objectSelect.value=previous;
  drawBank();draw();
 }
 // A 1bpp tileset's three pages are independent; sprites read whichever plane
 // CHRPLANE selects, so the picker previews page 0.
 function pixel(tileset,t,x,y){if(tileset.bpp===1)return (tileset.chr[t*8+y]>>x)&1;let v=0;for(let p=0;p<3;p++)v|=((tileset.chr[p*2048+t*8+y]>>x)&1)<<p;return v;}
 function tile(ctx,tileset,p,x,y,scale){if(!tileset){ctx.strokeStyle='#f66';ctx.strokeRect(x,y,8*scale,8*scale);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+8*scale,y+8*scale);ctx.stroke();return;}for(let py=0;py<8;py++)for(let px=0;px<8;px++){const v=pixel(tileset,p.tile,p.flipX?7-px:px,p.flipY?7-py:py);if(v){ctx.fillStyle=css565(bankColor(p.paletteBank,v));ctx.fillRect(x+px*scale,y+py*scale,scale,scale);}}}
 function drawBank(){const b=source(),c=$('scBankMap'),ctx=c.getContext('2d');ctx.fillStyle='#252830';ctx.fillRect(0,0,256,256);if(!b)return;for(let t=0;t<256;t++)tile(ctx,b,{tile:t,paletteBank:b.tilePaletteBanks[t]},t%16*16,Math.floor(t/16)*16,2);ctx.strokeStyle='#ffffff20';ctx.lineWidth=1;ctx.beginPath();for(let n=0;n<=16;n++){ctx.moveTo(n*16,0);ctx.lineTo(n*16,256);ctx.moveTo(0,n*16);ctx.lineTo(256,n*16);}ctx.stroke();ctx.strokeStyle='#36c9d6';ctx.lineWidth=2;ctx.strokeRect(sourceRect.x*16+1,sourceRect.y*16+1,sourceRect.width*16-2,sourceRect.height*16-2);}

 const canvas=$('scCanvas');
 function viewport(){return {w:canvas.clientWidth||500,h:canvas.clientHeight||400};}
 function screen(x,y){const {w,h}=viewport();return [(x-camera.x)*zoom+w/2,(y-camera.y)*zoom+h/2];}
 function world(e){const r=canvas.getBoundingClientRect(),{w,h}=viewport();return {x:Math.floor((e.clientX-r.left-w/2)/zoom+camera.x),y:Math.floor((e.clientY-r.top-h/2)/zoom+camera.y)};}
 function draw(){if(host.hidden)return;canvas.style.cursor=placing?'copy':originTool||boxSelect?'crosshair':drag?.kind==='pan'?'grabbing':'default';const {w,h}=viewport();canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#111318';ctx.fillRect(0,0,w,h);const a=shape();if(!a){ctx.fillStyle='#ccc';ctx.fillText('Create a sprite, then place tiles from a bank.',20,30);return;}
  const [left,top]=screen(0,0);ctx.fillStyle=$('scBackground').value;ctx.fillRect(left,top,width()*zoom,height()*zoom);ctx.save();ctx.beginPath();ctx.rect(left,top,width()*zoom,height()*zoom);ctx.clip();
  if($('scGrid').checked&&zoom>=2){ctx.strokeStyle='#ffffff16';ctx.beginPath();for(let x=Math.floor((camera.x-w/2/zoom)/8)*8;x<camera.x+w/2/zoom;x+=8){const [sx]=screen(x,0);ctx.moveTo(sx,0);ctx.lineTo(sx,h);}for(let y=Math.floor((camera.y-h/2/zoom)/8)*8;y<camera.y+h/2/zoom;y+=8){const [,sy]=screen(0,y);ctx.moveTo(0,sy);ctx.lineTo(w,sy);}ctx.stroke();}
  const [ax,ay]=screen(0,0);ctx.strokeStyle='#ffffff60';ctx.setLineDash([5,5]);ctx.strokeRect(ax,ay,width()*zoom,height()*zoom);ctx.setLineDash([]);
  const preview=drag?.kind==='move'?drag.sprites:spritesOf();preview.map((p,i)=>({p,i})).forEach(({p,i})=>{const [x,y]=screen(p.x+ox(),p.y+oy());tile(ctx,shapeTileset(),p,x,y,zoom);if(selected.has(i)){ctx.strokeStyle='#36c9d6';ctx.lineWidth=2;ctx.strokeRect(x+.5,y+.5,8*zoom-1,8*zoom-1);}});
  ctx.restore();ctx.strokeStyle='#687482';ctx.strokeRect(left+.5,top+.5,width()*zoom-1,height()*zoom-1);ctx.fillStyle='#36c9d6';ctx.fillRect(left+width()*zoom-5,top+height()*zoom-5,10,10);
  // Drawn after the clip is lifted, so a box that starts or ends outside the
  // canvas still shows — only its selection test, not its outline, cares about
  // where the tiles actually are.
  if(drag?.kind==='marquee'){const [x,y]=screen(drag.start.x,drag.start.y),[ex,ey]=screen(drag.end.x,drag.end.y);ctx.save();ctx.strokeStyle='#36c9d6';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.strokeRect(x+.5,y+.5,ex-x-1,ey-y-1);ctx.restore();}
  const origin=drag?.kind==='origin'?drag.point:{x:ox(),y:oy()},[cx,cy]=screen(origin.x,origin.y);ctx.save();ctx.setLineDash([]);ctx.lineWidth=4;ctx.strokeStyle='#111';ctx.beginPath();ctx.moveTo(cx-11,cy);ctx.lineTo(cx+11,cy);ctx.moveTo(cx,cy-11);ctx.lineTo(cx,cy+11);ctx.stroke();ctx.lineWidth=2;ctx.strokeStyle='#ffcb52';ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,4,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#ffcb52';ctx.fillText('0,0',cx+8,cy-8);ctx.restore();

  const outside=spritesOf().filter(p=>p.x+ox()<0||p.y+oy()<0||p.x+ox()+8>width()||p.y+oy()+8>height()).length;const b=bounds();$('scStatus').textContent=`${width()} × ${height()} px · ${spritesOf().length}/64 sprites · ${selected.size} selected · Bounds ${b.width} × ${b.height} px at (${b.x}, ${b.y})`+(outside?` · ${outside} outside canvas`:'')+(placing?' · Click to place tiles':originTool?' · Click to position origin':'');
  const mini=$('scMini'),mc=mini.getContext('2d');mc.fillStyle=$('scBackground').value;mc.fillRect(0,0,mini.width,mini.height);const scale=Math.min(4,128/width(),96/height());mc.save();mc.beginPath();mc.rect(8,8,width()*scale,height()*scale);mc.clip();preview.map((p,i)=>({p,i})).forEach(({p})=>tile(mc,shapeTileset(),p,8+(p.x+ox())*scale,8+(p.y+oy())*scale,scale));mc.restore();
 }
 function fit(){if(!shape())return;const {w,h}=viewport();camera={x:width()/2,y:height()/2};zoom=Math.max(.25,Math.min(8,Math.floor(Math.min((w-64)/width(),(h-64)/height())*4)/4));render();}
 function resizeCanvas(w,h){w=Math.max(1,Math.min(320,Math.round(w)));h=Math.max(1,Math.min(200,Math.round(h)));const a=shape();if(!a)return;const anchor=a.originAnchor??'custom',nx=anchor==='top-left'?0:anchor==='center'||anchor==='bottom-center'?Math.floor(w/2):Math.round(ox()/width()*w),ny=anchor==='top-left'?0:anchor==='center'?Math.floor(h/2):anchor==='bottom-center'?h:Math.round(oy()/height()*h);const next=spritesOf().map(p=>({...p,x:p.x+ox()-nx,y:p.y+oy()-ny}));if(!valid(next))return;edit(()=>{a.canvasPixelWidth=w;a.canvasPixelHeight=h;a.canvasWidth=Math.ceil(w/8);a.canvasHeight=Math.ceil(h/8);a.originX=nx;a.originY=ny;a.sprites=next;});}
 function setOrigin(x,y,anchor='custom'){x=Math.max(0,Math.min(width(),x));y=Math.max(0,Math.min(height(),y));if(!shape()||!Number.isInteger(x)||!Number.isInteger(y)||Math.abs(x)>32767||Math.abs(y)>32767)return;const dx=x-ox(),dy=y-oy(),next=spritesOf().map(p=>({...p,x:p.x-dx,y:p.y-dy}));if(!valid(next)){setStatus('Origin would put a part outside its supported coordinate range.');return;}edit(()=>{shape().originX=x;shape().originY=y;shape().originAnchor=anchor;shape().sprites=next;});}
 function place(pos){const b=source();if(!shape()||!b)return;if(pos.x<0||pos.y<0||pos.x+sourceRect.width*8>width()||pos.y+sourceRect.height*8>height()){setStatus('Place the selected tiles inside the canvas, or resize the canvas.');return;}if(spritesOf().length+sourceRect.width*sourceRect.height>64){setStatus('A shape holds at most 64 sprites.');return;}let x=pos.x-ox(),y=pos.y-oy();if($('scSnap').checked){x=Math.round(x/8)*8;y=Math.round(y/8)*8;}if(x+ox()<0||y+oy()<0||x+ox()+sourceRect.width*8>width()||y+oy()+sourceRect.height*8>height()){setStatus('Snapped tiles would exceed the canvas.');return;}const add=[];for(let row=0;row<sourceRect.height;row++)for(let col=0;col<sourceRect.width;col++){const t=(sourceRect.y+row)*16+sourceRect.x+col;add.push({tile:t,x:x+col*8,y:y+row*8,paletteBank:b.tilePaletteBanks[t],flipX:false,flipY:false});}if(!valid(add))return;
  // New sprites go on the end, which puts them on top.
  edit(()=>{const start=spritesOf().length;spritesOf().push(...add);selected=new Set(add.map((_,i)=>start+i));});
  placing=false;hideGhost();render();}
 function hit(pos){// Hit-test from the top down, which is the end of the list.
  const ordered=spritesOf().map((p,i)=>({p,i})).reverse();for(const {p,i} of ordered){if(pos.x>=p.x+ox()&&pos.x<p.x+ox()+8&&pos.y>=p.y+oy()&&pos.y<p.y+oy()+8)return i;}return -1;}
 canvas.onpointerdown=e=>{if(!shape())return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);const pos=world(e),corner=screen(width(),height()),cr=canvas.getBoundingClientRect(),origin=screen(ox(),oy());if(e.button===0&&!space&&!placing&&Math.hypot(e.clientX-cr.left-origin[0],e.clientY-cr.top-origin[1])<=11){drag={kind:'origin',point:{x:ox(),y:oy()}};return;}if(e.button===0&&Math.abs(e.clientX-cr.left-corner[0])<8&&Math.abs(e.clientY-cr.top-corner[1])<8){drag={kind:'resize',size:{w:width(),h:height()}};return;}if(e.button===2){place(pos);return;}if(space||e.button===1){drag={kind:'pan',start:{x:e.clientX,y:e.clientY},camera:{...camera}};return;}if(originTool){setOrigin(pos.x,pos.y);originTool=false;render();return;}if(placing){place(pos);return;}
  // Box select always drags a marquee, even starting on top of a sprite, so
  // overlapping or tightly packed sprites can still be rubber-banded together.
  if(boxSelect){if(!e.shiftKey)selected.clear();drag={kind:'marquee',start:pos,end:pos,initial:new Set(selected)};draw();return;}
  const i=hit(pos);if(i>=0){if(e.shiftKey){selected.has(i)?selected.delete(i):selected.add(i);render();return;}if(!selected.has(i))selected=new Set([i]);const original=structuredClone(spritesOf());drag={kind:'move',start:pos,original,sprites:original};render();}else if(pos.x<0||pos.y<0||pos.x>=width()||pos.y>=height()){if(!e.shiftKey)selected.clear();drag={kind:'pan',start:{x:e.clientX,y:e.clientY},camera:{...camera}};draw();}else{if(!e.shiftKey)selected.clear();drag={kind:'marquee',start:pos,end:pos,initial:new Set(selected)};draw();}};
 canvas.onpointermove=e=>{if(placing){showGhost(e);if(!drag)return;}if(!drag){const r=canvas.getBoundingClientRect(),p=screen(ox(),oy()),pos=world(e);canvas.style.cursor=Math.hypot(e.clientX-r.left-p[0],e.clientY-r.top-p[1])<=11?'move':pos.x<0||pos.y<0||pos.x>=width()||pos.y>=height()?'grab':'default';return;}const pos=world(e);if(drag.kind==='origin'){drag.point={x:Math.max(0,Math.min(width(),pos.x)),y:Math.max(0,Math.min(height(),pos.y))};draw();return;}if(drag.kind==='resize'){drag.size={w:Math.max(units==='tiles'?8:1,Math.min(320,units==='tiles'?Math.round(pos.x/8)*8:pos.x)),h:Math.max(units==='tiles'?8:1,Math.min(200,units==='tiles'?Math.round(pos.y/8)*8:pos.y))};draw();const ctx=canvas.getContext('2d'),at=screen(0,0);ctx.strokeStyle='#36c9d6';ctx.setLineDash([5,4]);ctx.strokeRect(at[0],at[1],drag.size.w*zoom,drag.size.h*zoom);$('scStatus').textContent=`Resize canvas: ${drag.size.w} × ${drag.size.h} px`;return;}if(drag.kind==='pan'){camera={x:drag.camera.x-(e.clientX-drag.start.x)/zoom,y:drag.camera.y-(e.clientY-drag.start.y)/zoom};draw();return;}if(drag.kind==='move'){let dx=pos.x-drag.start.x,dy=pos.y-drag.start.y;if($('scSnap').checked){dx=Math.round(dx/8)*8;dy=Math.round(dy/8)*8;}const next=drag.original.map((p,i)=>selected.has(i)?{...p,x:p.x+dx,y:p.y+dy}:p);if(valid(next))drag.sprites=next;}else{drag.end=pos;selected=new Set(drag.initial);spritesOf().forEach((p,i)=>{if(p.x+ox()+8>Math.min(pos.x,drag.start.x)&&p.x+ox()<Math.max(pos.x,drag.start.x)&&p.y+oy()+8>Math.min(pos.y,drag.start.y)&&p.y+oy()<Math.max(pos.y,drag.start.y))selected.add(i);});}draw();};
 canvas.onpointerup=()=>{const d=drag;drag=null;if(d?.kind==='origin'){if(d.point.x!==ox()||d.point.y!==oy())setOrigin(d.point.x,d.point.y);else render();return;}if(d?.kind==='resize'){resizeCanvas(d.size.w,d.size.h);return;}if(d?.kind==='move'&&JSON.stringify(d.original)!==JSON.stringify(d.sprites))edit(()=>shape().sprites=d.sprites);else render();};canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointercancel=()=>{drag=null;render();};
 canvas.onwheel=e=>{e.preventDefault();if(drag||!e.deltaY)return;const r=canvas.getBoundingClientRect(),{w,h}=viewport(),dx=e.clientX-r.left-w/2,dy=e.clientY-r.top-h/2,px=camera.x+dx/zoom,py=camera.y+dy/zoom,delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?h:1);zoom=Math.max(.25,Math.min(32,zoom*Math.exp(-Math.max(-200,Math.min(200,delta))*.0015)));camera={x:px-dx/zoom,y:py-dy/zoom};render();if(placing)showGhost(e);};
 canvas.ondragover=e=>{if(e.dataTransfer.types.includes('application/x-clementina-tiles')){e.preventDefault();showGhost(e);}};canvas.ondrop=e=>{e.preventDefault();if(e.dataTransfer.getData('application/x-clementina-tiles')==='selection')place(world(e));};
 const mapCell=e=>{const r=$('scBankMap').getBoundingClientRect();return {x:Math.max(0,Math.min(15,Math.floor((e.clientX-r.left)/r.width*16))),y:Math.max(0,Math.min(15,Math.floor((e.clientY-r.top)/r.height*16)))};};
 $('scBankMap').tabIndex=0;$('scBankMap').oncontextmenu=e=>e.preventDefault();
 $('scBankMap').onpointerdown=e=>{e.preventDefault();$('scBankMap').focus();$('scBankMap').setPointerCapture(e.pointerId);if(e.button===2){sourceDrag={x:e.clientX,y:e.clientY};placing=true;originTool=false;render();showGhost(e);return;}sourceAnchor=mapCell(e);sourceRect={...sourceAnchor,width:1,height:1};drawBank();};
 $('scBankMap').onpointermove=e=>{if(sourceDrag){showGhost(e);return;}if(!sourceAnchor)return;const p=mapCell(e);sourceRect={x:Math.min(p.x,sourceAnchor.x),y:Math.min(p.y,sourceAnchor.y),width:Math.abs(p.x-sourceAnchor.x)+1,height:Math.abs(p.y-sourceAnchor.y)+1};drawBank();};
 $('scBankMap').onpointerup=e=>{if(sourceDrag){const r=canvas.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom)place(world(e));sourceDrag=null;if(placing)showGhost(e);else hideGhost();}sourceAnchor=null;};$('scBankMap').onpointercancel=()=>{sourceAnchor=null;sourceDrag=null;placing=false;hideGhost();render();};
 $('scObjects').onchange=()=>{const c=source()?.compositions[+$('scObjects').value-1];if(c){sourceRect={x:c.x,y:c.y,width:c.width,height:c.height};drawBank();}};
 $('scPlace').onclick=()=>{placing=!placing;originTool=false;boxSelect=false;if(!placing)hideGhost();render();};$('scOriginTool').onclick=()=>{originTool=!originTool;placing=false;boxSelect=false;hideGhost();render();};
 $('scBoxSelect').onclick=()=>{boxSelect=!boxSelect;placing=false;originTool=false;hideGhost();render();};
 host.querySelectorAll('[data-origin]').forEach(b=>b.onclick=()=>{if(!shape())return;const w=width(),h=height();setOrigin(b.dataset.origin==='top-left'?0:Math.floor(w/2),b.dataset.origin==='top-left'?0:b.dataset.origin==='center'?Math.floor(h/2):h,b.dataset.origin);});
 function freshName(){let n=1;while(shapes.some(a=>a.name.toLowerCase()==='shape_'+n))n++;return 'shape_'+n;}
 $('scNew').onclick=()=>{if(shapes.length>=255)return;edit(()=>{shapes.push({id:crypto.randomUUID(),name:freshName(),tilesetId:tilesets[0]?.id,canvasWidth:4,canvasHeight:4,originX:0,originY:0,originAnchor:'top-left',sprites:[]});shapeIndex=shapes.length-1;frameIndex=0;});fit();};
 $('scDuplicate').onclick=()=>{if(!shape()||shapes.length>=255)return;edit(()=>{const copy=structuredClone(shape());copy.id=crypto.randomUUID();copy.name=freshName();shapes.push(copy);shapeIndex=shapes.length-1;});};$('scDelete').onclick=()=>{if(shape()&&confirm('Delete sprite '+shape().name+'?'))edit(()=>{shapes.splice(shapeIndex,1);shapeIndex=Math.max(0,shapeIndex-1);});};
 $('scUnits').onchange=()=>{units=$('scUnits').value;render();};
 for(const id of ['scWidth','scHeight'])$(id).onchange=()=>{const n=Number($(id).value)*(units==='tiles'?8:1);if(shape()&&Number.isInteger(n)&&(units==='pixels'||Number.isInteger(Number($(id).value)))&&n>=1&&n<=(id==='scWidth'?320:200)){resizeCanvas(id==='scWidth'?n:width(),id==='scHeight'?n:height());fit();}else render();};
 function translate(dx,dy){const next=spritesOf().map((p,i)=>selected.has(i)?{...p,x:p.x+dx,y:p.y+dy}:p);if(valid(next))edit(()=>shape().sprites=next);else setStatus('Offset is outside the supported range.');}
 function flip(axis){const b=bounds([...selected].map(i=>spritesOf()[i]));edit(()=>selected.forEach(i=>{const p=spritesOf()[i];p[axis]=2*b[axis]+b[axis==='x'?'width':'height']-8-p[axis];p[axis==='x'?'flipX':'flipY']=!p[axis==='x'?'flipX':'flipY'];}));}
 $('scRemove').onclick=()=>edit(()=>{shape().sprites=spritesOf().filter((_,i)=>!selected.has(i));selected.clear();});
 // Bring-to-front/send-to-back move the whole selection to one end of the list,
 // where OAM index order draws it last (front) or first (back).
 function moveToEnd(front){edit(()=>{const chosen=spritesOf().filter((_,i)=>selected.has(i)),other=spritesOf().filter((_,i)=>!selected.has(i));shape().sprites=front?[...other,...chosen]:[...chosen,...other];selected=new Set(chosen.map((_,i)=>i+(front?other.length:0)));});}
 // Move up/down shifts each selected run past its single non-selected neighbor,
 // one OAM index at a time; runs are processed from the move's leading edge so a
 // multi-sprite selection stays contiguous instead of tangling with itself.
 function moveSelection(dir){
  if(!shape()||!selected.size)return;
  const idxs=[...selected].sort((a,b)=>a-b),runs=[];
  for(const i of idxs){const last=runs[runs.length-1];if(last&&i===last[1]+1)last[1]=i;else runs.push([i,i]);}
  const ordered=dir>0?[...runs].reverse():runs,next=[...spritesOf()],moved=[];
  for(const run of ordered){
   const [lo,hi]=run;
   if(dir>0){if(hi+1>=next.length)continue;const [item]=next.splice(hi+1,1);next.splice(lo,0,item);}
   else{if(lo-1<0)continue;const [item]=next.splice(lo-1,1);next.splice(hi,0,item);}
   moved.push(run);
  }
  if(!moved.length)return;
  // Two passes, so a run's own vacated indices can't collide with the indices
  // it is about to occupy (they can be adjacent, e.g. a two-sprite block).
  const newSelected=new Set(selected);
  for(const [lo,hi] of moved)for(let k=lo;k<=hi;k++)newSelected.delete(k);
  for(const [lo,hi] of moved)for(let k=lo;k<=hi;k++)newSelected.add(k+dir);
  edit(()=>{shape().sprites=next;selected=newSelected;});
 }
 $('scUndo').onclick=()=>{if(!shapeHistory.length)return;redo.push(JSON.stringify({animations,shapes}));({animations,shapes}=JSON.parse(shapeHistory.pop()));shapeIndex=Math.min(shapeIndex,Math.max(0,shapes.length-1));markDirty();renderAnimations();};$('scRedo').onclick=()=>{if(!redo.length)return;shapeHistory.push(JSON.stringify({animations,shapes}));({animations,shapes}=JSON.parse(redo.pop()));shapeIndex=Math.min(shapeIndex,Math.max(0,shapes.length-1));markDirty();renderAnimations();};
 $('scFit').onclick=fit;$('scActualSize').onclick=()=>{zoom=1;render();};$('scZoomIn').onclick=()=>{zoom=Math.min(32,zoom*2);render();};$('scZoomOut').onclick=()=>{zoom=Math.max(.25,zoom/2);render();};$('scGrid').onchange=$('scBackground').oninput=draw;
 // Snap becomes a toggle button next to the zoom controls, matching the tileset
 // editor's Tile-grid button; the checkbox stays as the value every drag/place/
 // ghost check already reads, just hidden from view.
 $('scSnapRow').hidden=true;
 const snapToggle=iconButton('scSnapToggle','Snap','<path d="M4 4h16M4 12h16M4 20h16M4 4v16M12 4v16M20 4v16"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>');
 const syncSnap=()=>{snapToggle.classList.toggle('on',$('scSnap').checked);snapToggle.setAttribute('aria-pressed',String($('scSnap').checked));};
 snapToggle.onclick=()=>{$('scSnap').checked=!$('scSnap').checked;syncSnap();};
 syncSnap();$('scSnapRow').after(snapToggle);
 // "Display settings" popover, matching the tileset editor's gear-icon popup.
 const settingsSummary=$('scDisplaySettings').querySelector('summary');
 settingsSummary.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h20M3 13h20M3 20h20"/><rect x="7" y="3" width="4" height="6" fill="var(--panel)"/><rect x="16" y="10" width="4" height="6" fill="var(--panel)"/><rect x="8" y="17" width="4" height="6" fill="var(--panel)"/></svg>';
 settingsSummary.title='Display settings';settingsSummary.setAttribute('aria-label','Display settings');
 window.addEventListener('keydown',e=>{if(currentView!=='shapes'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;const key=e.key.toLowerCase();if(e.code==='Space'){space=true;e.preventDefault();return;}if(key==='escape'){drag=null;sourceDrag=null;placing=false;originTool=false;boxSelect=false;hideGhost();render();return;}if((e.ctrlKey||e.metaKey)&&key==='a'){e.preventDefault();e.stopImmediatePropagation();selected=new Set(spritesOf().map((_,i)=>i));render();return;}if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();e.stopImmediatePropagation();$(e.shiftKey?'scRedo':'scUndo').click();return;}if(selected.size&&['delete','backspace'].includes(key)){e.preventDefault();$('scRemove').click();}const d={arrowleft:[-1,0],arrowright:[1,0],arrowup:[0,-1],arrowdown:[0,1]}[key];if(d&&selected.size){e.preventDefault();translate(...d);}},true);
 window.addEventListener('keyup',e=>{if(e.code==='Space')space=false;});window.addEventListener('blur',()=>{space=false;drag=null;sourceDrag=null;placing=false;hideGhost();draw();});

 // Matches the tileset editor's #canvasAssetLabel: ink-colored and sized off
 // the page's own 13px base, rather than inheriting .scTop's smaller 11px.
 const groupTitle=document.createElement('strong');groupTitle.id='scGroupTitle';groupTitle.style.marginRight='auto';groupTitle.style.color='var(--ink)';groupTitle.style.fontSize='13px';host.querySelector('.scTop').prepend(groupTitle);
 const rail=document.createElement('nav');rail.id='scRail';host.prepend(rail);
 const library=host.querySelector('.scLibrary'),tileLibrary=host.querySelector('.scTileLibrary'),inspector=host.querySelector('.scInspector');
 for(const [panel,id,label,path] of [[tileLibrary,'scTileLibraryToggle','Tile selector and group banks','<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'],[library,'scLibraryToggle','Sprite groups','<path d="M4 2h11l5 5v15H4zM15 2v6h5M7 12h10v7H7z"/>'],[inspector,'scInspectorToggle','Draw order','<path d="M3 5h18M3 12h18M3 19h18M8 2v6M16 9v6M9 16v6"/>']]){const b=iconButton(id,label,path);rail.append(b);b.onclick=()=>{panel.hidden=!panel.hidden;if(!panel.hidden){for(const other of [library,tileLibrary])if(other!==panel)other.hidden=true;}b.setAttribute('aria-expanded',String(!panel.hidden));};const close=iconButton(id+'Close','Close panel','<path d="m6 6 12 12M18 6 6 18"/>');close.className='scClose';close.onclick=()=>{panel.hidden=true;b.setAttribute('aria-expanded','false');};panel.prepend(close);}
 rail.append($('scBoxSelect'));
 {const old=$('scRemove'),b=iconButton('scRemove','Remove selected sprites','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 9v9M14 9v9"/>');b.onclick=old.onclick;old.replaceWith(b);rail.append(b);}
 // Undo/redo live at the end of the left rail, matching the tileset editor.
 rail.append($('scUndo'),$('scRedo'));
 inspector.hidden=true;library.hidden=true;tileLibrary.hidden=true;rail.insertBefore($('scLibraryToggle'),$('scTileLibraryToggle'));for(const id of ['scLibraryToggle','scTileLibraryToggle','scInspectorToggle'])$(id).setAttribute('aria-expanded','false');
 // A dedicated right-hand bar, always visible, for flip and stacking order —
 // operations that only ever act on whatever sprites are currently selected.
 const orderRail=document.createElement('nav');orderRail.id='scOrderRail';orderRail.setAttribute('aria-label','Flip and sprite order');host.append(orderRail);
 for(const [id,label,path,fn] of [
  ['scFlipX','Flip horizontally','<path d="M12 2v20M3 5l6 7-6 7zM21 5l-6 7 6 7z"/>',()=>flip('x')],
  ['scFlipY','Flip vertically','<path d="M2 12h20M5 3l7 6 7-6zM5 21l7-6 7 6z"/>',()=>flip('y')]
 ]){const b=iconButton(id,label,path);b.onclick=fn;orderRail.append(b);}
 orderRail.append(document.createElement('hr'));
 for(const [id,label,path,fn] of [
  ['scFront','Bring to front — draws last, in front of everything','<path d="M12 20V9M6 14l6-6 6 6"/><path d="M5 3h14"/>',()=>moveToEnd(true)],
  ['scMoveUp','Move up — draws later, in front of the next sprite','<path d="M12 19V5M5 12l7-7 7 7"/>',()=>moveSelection(1)],
  ['scMoveDown','Move down — draws earlier, behind the next sprite','<path d="M12 5v14M19 12l-7 7-7-7"/>',()=>moveSelection(-1)],
  ['scBack','Move to bottom — draws first, behind everything','<path d="M12 4v11M6 10l6 6 6-6"/><path d="M5 21h14"/>',()=>moveToEnd(false)]
 ]){const b=iconButton(id,label,path);b.onclick=fn;orderRail.append(b);}
 const groupStyle=document.createElement('style');groupStyle.textContent='#spriteComposer{position:relative;grid-template-columns:64px minmax(0,1fr) 52px}#spriteComposer main{grid-column:2;grid-row:1}#scRail{grid-column:1;grid-row:1;display:flex;flex-direction:column;gap:3px;padding:8px 5px;background:var(--panel);border-right:1px solid var(--line)}#scRail button{padding:6px;margin:0;min-height:40px;height:40px;display:flex;align-items:center;justify-content:center}#scRail svg{width:29px;height:29px}#scOrderRail{grid-column:3;grid-row:1;display:flex;flex-direction:column;gap:3px;padding:8px 5px;background:var(--panel);border-left:1px solid var(--line);overflow-y:auto}#scOrderRail button{padding:6px;margin:0;min-height:40px;height:40px;display:flex;align-items:center;justify-content:center}#scOrderRail svg{width:29px;height:29px}#scOrderRail hr{width:70%;border:0;border-top:1px solid var(--line);margin:2px auto}#spriteComposer .scLibrary,#spriteComposer .scTileLibrary,#spriteComposer .scInspector{position:absolute;z-index:8;left:64px;top:0;bottom:0;width:285px;padding-top:38px;box-shadow:6px 0 20px #0008}#spriteComposer .scInspector{left:auto;right:52px;width:240px}#spriteComposer .scClose{position:absolute;top:4px;right:4px;padding:3px}#scUnits{width:auto!important;margin:0!important}#scOriginTool.on{background:var(--ink)}#scViewport{background:#111318}';document.head.append(groupStyle);
 const oldRestore=restoreStudioProject;restoreStudioProject=function(...args){redo=[];selected.clear();placing=false;originTool=false;oldRestore(...args);};const oldNew=newProject;newProject=function(...args){redo=[];selected.clear();placing=false;originTool=false;oldNew(...args);};
 const oldRender=renderAnimations;renderAnimations=function(){oldRender();render();};const oldShow=showView;showView=function(v){oldShow(v);render();if(v==='shapes')fit();};const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};

 function chooseShape(i){shapeIndex=i;sourceRect={x:0,y:0,width:1,height:1};redo=[];renderAnimations();fit();}
 function renderShapeList(){const list=$('scSprites');while(list.children.length>shapes.length)list.lastElementChild.remove();shapes.forEach((a,i)=>{let row=list.children[i];if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}row.dataset.index=i;row.setAttribute('aria-selected',String(i===shapeIndex));if(!row.querySelector('input'))row.textContent=a.name;row.onclick=e=>{if(e.target.tagName!=='INPUT')chooseShape(i);};row.ondblclick=e=>{if(e.target.tagName!=='INPUT')renameShape(row,i);};row.onkeydown=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='Enter')chooseShape(i);if(e.key==='F2'){e.preventDefault();renameShape(row,i);}};});}
 function renameShape(row,i){if(row.querySelector('input'))return;const input=document.createElement('input');input.value=shapes[i].name;input.maxLength=32;input.setAttribute('aria-label','Rename group');row.replaceChildren(input);input.focus();input.select();let done=false;const finish=save=>{if(done)return;done=true;const value=input.value.trim();input.remove();if(save&&value!==shapes[i].name){if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value)||shapes.some((s,j)=>j!==i&&s.name.toLowerCase()===value.toLowerCase()))setStatus('Use a unique group name: letters, digits and underscores, starting with a letter.');else edit(()=>shapes[i].name=value);}render();};input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);};input.onblur=()=>finish(true);}
 // Switching tileset repoints every sprite's tile index at whatever graphics sit
 // at that index in the new tileset. Sprites carry no other reference to the
 // tileset, so nothing needs migrating, and switching back restores this shape
 // exactly — there is nothing to lock.
 function renderTilesetPicker(){
  const a=shape(),current=shapeTileset(),list=$('scBank');
  while(list.children.length>tilesets.length)list.lastElementChild.remove();
  tilesets.forEach((t,i)=>{
   let row=list.children[i];
   if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
   row.textContent=t.name;
   row.setAttribute('aria-selected',String(t.id===a?.tilesetId));
   row.onclick=()=>{if(!a||t.id===a.tilesetId)return;edit(()=>{shape().tilesetId=t.id;sourceRect={x:0,y:0,width:1,height:1};});};
   row.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();row.onclick();}};
  });
  $('scTilesetNote').textContent=!a?'Create a shape to choose its tileset.'
   :!tilesets.length?'Create a tileset first.'
   :spritesOf().length?`Drawing from ${current?.name??'a missing tileset'}. Switching repoints every sprite's tile at the new tileset — switch back and this shape looks right again.`
   :'A shape draws from one tileset: Clementina has a single sprite CHR bank.';
 }
 // A tile's palette bank comes along for free when it is placed (see `place`),
 // so the dock below just needs to show and let the user override it. Built
 // from the same .paletteGroup markup the tileset editor uses for its own
 // palette dock, so both pick up identical styling from its stylesheet with
 // nothing duplicated here — only the click behavior differs (a whole bank
 // rather than one ink, since a sprite has no ink of its own to pick).
 function ensurePaletteDockRows(){
  const host=$('scPalettes');
  if(host.querySelectorAll('.paletteGroup').length===16)return;
  host.replaceChildren(...Array.from({length:16},(_,bank)=>{
   const group=document.createElement('div');group.className='paletteGroup';group.dataset.palette=bank;
   const label=document.createElement('span');label.textContent=String(bank).padStart(2,'0');group.append(label);
   for(let ink=0;ink<8;ink++){const button=document.createElement('button');button.dataset.palette=bank;button.dataset.ink=ink;group.append(button);}
   return group;
  }));
 }
 function renderPaletteDock(){
  ensurePaletteDockRows();
  const picked=[...selected].map(i=>spritesOf()[i]),used=new Set(spritesOf().map(p=>p.paletteBank));
  const commonBank=picked.length&&picked.every(p=>p.paletteBank===picked[0].paletteBank)?picked[0].paletteBank:null;
  $('scPalettes').querySelectorAll('.paletteGroup').forEach(group=>{
   const bank=Number(group.dataset.palette);
   const title=`Bank ${String(bank).padStart(2,'0')} · ${bankPalette(bank)?.name??'empty in "'+(activeConfig()?.name??'none')+'"'}`+(picked.length?' · Click a swatch to set this bank on the selected sprites':'');
   group.title=title;
   group.classList.toggle('activePalette',used.has(bank));
   group.querySelectorAll('button[data-ink]').forEach(button=>{
    const ink=Number(button.dataset.ink);
    // Color 0 is transparent for sprites — always the tileset editor's
    // diagonal white-and-red swatch, since a sprite has no reading of it as
    // a background color the way a background cell does.
    button.style.background=ink===0?'linear-gradient(135deg,white 43%,#e32636 44%,#e32636 56%,white 57%)':css565(bankColor(bank,ink));
    button.classList.toggle('chosenColor',commonBank===bank);
    button.disabled=!picked.length;
    button.setAttribute('aria-label',title);
    button.onclick=()=>{if(!picked.length)return;edit(()=>selected.forEach(i=>spritesOf()[i].paletteBank=bank));};
   });
  });
 }
 // The picker is rebuilt only when the groups themselves change, matching the
 // tileset editor's equivalent picker.
 function syncScConfigPicker(){
  const picker=$('scConfigPicker'),signature=paletteConfigs.map(c=>c.id+'|'+c.name).join(',');
  if(picker.dataset.signature!==signature){picker.dataset.signature=signature;picker.replaceChildren(...paletteConfigs.map(c=>new Option(c.name,c.id)));}
  picker.value=activeConfig()?.id??'';picker.disabled=paletteConfigs.length<2;
  $('scConfigWrap').title=paletteConfigs.length<2?'Add more bank groups in Palettes to switch between them'
   :'Which group of palette banks every editor previews with. Preview only — it does not change what a project exports.';
 }
 $('scConfigPicker').onchange=()=>{activeConfigId=$('scConfigPicker').value;redrawAll();};
 const ghost=document.createElement('canvas');ghost.id='scDragGhost';ghost.hidden=true;document.body.append(ghost);
 function hideGhost(){if($('scDragGhost'))$('scDragGhost').hidden=true;ghostPoint=null;}
 function showGhost(e){if(!source()||host.hidden||!shape()){hideGhost();return;}ghostPoint={x:e.clientX,y:e.clientY};const r=canvas.getBoundingClientRect(),inside=e.clientX>=r.left&&e.clientX<r.right&&e.clientY>=r.top&&e.clientY<r.bottom,b=source(),w=sourceRect.width*8,h=sourceRect.height*8,scale=inside?zoom:Math.min(4,180/Math.max(w,h));ghost.width=w;ghost.height=h;const ctx=ghost.getContext('2d');for(let y=0;y<sourceRect.height;y++)for(let x=0;x<sourceRect.width;x++){const t=(sourceRect.y+y)*16+sourceRect.x+x;tile(ctx,b,{tile:t,paletteBank:b.tilePaletteBanks[t]},x*8,y*8,1);}ghost.style.width=w*scale+'px';ghost.style.height=h*scale+'px';let left=e.clientX+12,top=e.clientY+12;if(inside){let p=world(e);if($('scSnap').checked)p={x:Math.round((p.x-ox())/8)*8+ox(),y:Math.round((p.y-oy())/8)*8+oy()};const s=screen(p.x,p.y);left=r.left+s[0];top=r.top+s[1];ghost.style.borderColor=p.x<0||p.y<0||p.x+w>width()||p.y+h>height()?'#ff7777':'#36c9d6';}else ghost.style.borderColor='#36c9d6';ghost.style.left=left+'px';ghost.style.top=top+'px';ghost.hidden=false;}
 document.addEventListener('pointermove',e=>{if(currentView==='shapes'&&(placing||sourceDrag))showGhost(e);});
 for(const button of host.querySelectorAll('[data-origin],#scOriginTool')){const preset=button.dataset.origin,x=preset==='top-left'?5:12,y=preset==='top-left'?5:preset==='bottom-center'?19:12,label=preset?{ 'top-left':'Origin at canvas top-left',center:'Origin at canvas center','bottom-center':'Origin at canvas bottom-center'}[preset]:'Place origin (or drag its crosshair)';button.title=label;button.setAttribute('aria-label',label);button.innerHTML='<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" opacity=".5"/><path d="M'+(x-4)+' '+y+'h8M'+x+' '+(y-4)+'v8"/></svg>';}
 const refineStyle=document.createElement('style');refineStyle.textContent='#scSprites{border:1px solid var(--line);background:var(--bg);min-height:130px;max-height:55vh;overflow:auto}#scSprites input{width:100%;background:var(--bg);color:var(--text);font:inherit;border:1px solid var(--sel)}.sourceBankRow{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}.sourceBankRow span{overflow:hidden;text-overflow:ellipsis}.sourceBankRow button{padding:0 6px!important}#scBankCount{font-weight:normal;color:var(--text-dim)}#scDragGhost{position:fixed;pointer-events:none;z-index:9000;opacity:.8;image-rendering:pixelated;border:1px solid #36c9d6;background:#25283055}.scOrigin button{display:inline-flex;align-items:center;justify-content:center}';document.head.append(refineStyle);
 // Top-bar polish: an icon-only Snap toggle and a "Display settings" popover,
 // matching the tileset editor's own top-bar controls.
 const topStyle=document.createElement('style');topStyle.textContent=`
 .scTop{position:relative}
 #scZoomGroup{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:7px}
 #scSnapToggle,#scDisplaySettings summary{display:inline-flex;align-items:center;justify-content:center;padding:4px;cursor:pointer;border:1px solid var(--line);border-radius:4px;background:var(--panel)}#scSnapToggle svg,#scDisplaySettings summary svg{width:20px;height:20px}#scSnapToggle.on{background:var(--ink);color:#111}
 .scOrigin{justify-content:flex-end}
 #scDisplaySettings{position:relative;list-style:none}#scDisplaySettings summary{list-style:none}#scDisplaySettings summary::-webkit-details-marker{display:none}#scDisplaySettings[open]>summary{border-color:var(--sel)}
 #scDisplaySettings>div{position:absolute;right:0;top:36px;width:230px;padding:12px;border:1px solid var(--line);background:var(--panel);box-shadow:0 8px 20px #0008;font-size:11px;z-index:7}
 #scDisplaySettings>div label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:9px 0}#scDisplaySettings>div input[type=color]{width:54px;height:32px;padding:3px}
 `;document.head.append(topStyle);
 new ResizeObserver(()=>draw()).observe($('scViewport'));render();
})();
