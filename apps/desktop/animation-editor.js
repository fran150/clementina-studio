// Animation authoring. An animation is a sequence of shapes with durations; it
// names shapes rather than owning sprites, so a shape edit reaches every frame
// showing it. Loaded before sprite-composer.js, which wraps renderAnimations
// to keep its own canvas in sync with shape edits.
(() => {
 const host=document.createElement('section');host.id='animationEditor';host.hidden=true;
 host.innerHTML=`<aside class="anLibrary"><h2>Animations</h2><div id="anAnimActions" class="assetToolbar"></div><div id="anAnimList" role="listbox" aria-label="Animations"></div><p>Double-click an animation to rename it.</p></aside>
 <aside class="anShapeLibrary"><h2>Shapes</h2><div id="anShapeList" role="listbox" aria-label="Shapes to append"></div><p id="anShapeNote"></p><button id="anAppend">Append frame</button></aside>
 <main><div class="anTop"><strong id="anGroupTitle"></strong><button id="anPlay">Play</button><label id="anConfigWrap">Group <select id="anConfigPicker" aria-label="Palette bank group"></select></label></div>
 <div id="anBody"><div id="anPreviewCol"><canvas id="anCanvas" width="256" height="256"></canvas></div>
  <div id="anFramesCol"><div class="anFramesHead"><h2>Frame sequence</h2><button id="anDuplicateFrame">Duplicate frame</button></div>
   <p class="hint">An animation is a sequence of shapes. It references them, so editing a shape updates every frame showing it. Offsets nudge the whole shape, for a bob that does not need its own shape.</p>
   <table id="anFramesTable"><thead><tr><th>#</th><th>Shape</th><th>Ticks</th><th>dX</th><th>dY</th><th></th><th></th></tr></thead><tbody id="anFrames"></tbody></table>
   <p class="hint">Every shape in one animation draws from the same tileset: they play in sequence out of Clementina's single sprite CHR bank.</p>
  </div></div>
 <div id="anStatus"></div></main>`;
 // Inserted before the footer, not appended to #workspace, so the status bar
 // stays at the bottom of the page instead of landing above this section.
 $('spritePanel').after(host);
 const style=document.createElement('style');style.textContent=`
 #animationEditor{position:relative;height:calc(100vh - 118px);display:grid;grid-template-columns:64px minmax(0,1fr)}
 
 
 
 #animationEditor main{grid-column:2;display:flex;flex-direction:column;min-width:0;min-height:0}
 .anTop{display:flex;align-items:center;gap:14px;padding:8px 18px;background:var(--panel)}
 #anGroupTitle{color:var(--ink);font-size:13px;margin-right:auto}
 #anConfigWrap{display:inline-flex;align-items:center;gap:6px;font-size:10px;color:var(--text-dim);margin-left:auto}
 #anConfigPicker{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:4px;padding:3px 6px;font-size:11px;max-width:190px}
 #anBody{flex:1;min-height:0;display:flex;gap:22px;padding:20px;overflow:auto;background:#111318;flex-wrap:wrap}
 #anPreviewCol{flex-shrink:0}
 #anCanvas{image-rendering:pixelated;background:#000;border:1px solid var(--line);border-radius:4px;display:block}
 #anFramesCol{flex:1;min-width:420px;display:flex;flex-direction:column;gap:8px}
 .anFramesHead{display:flex;align-items:center;gap:12px}
 .anFramesHead h2{font-size:12px;color:var(--text-dim);margin:0;flex:1}
 #anFramesCol .hint{max-width:560px}
 #anFramesTable{width:100%;border-collapse:collapse;font-size:11px;background:var(--panel);border:1px solid var(--line);border-radius:4px}
 #anFramesTable th{text-align:left;color:var(--text-dim);font-weight:600;padding:6px;border-bottom:1px solid var(--line)}
 #anFramesTable td{padding:5px 6px}
 #anFramesTable tr.on{background:#26364a}
 #anFrames select{max-width:160px}
 #anFrames input[type=number]{width:64px}
 #anStatus{padding:6px 18px;font-size:10px;color:var(--text-dim);background:var(--panel);border-top:1px solid var(--line)}
 .anLibrary,.anShapeLibrary{position:absolute;z-index:8;left:64px;top:0;bottom:0;width:285px;padding:12px;padding-top:38px;background:var(--panel);border-right:1px solid var(--line);box-shadow:6px 0 20px #0008;display:flex;flex-direction:column;overflow:auto}
 .anLibrary h2,.anShapeLibrary h2{font-size:12px;color:var(--text-dim);margin:0 0 8px;flex-shrink:0}
 .anLibrary p,.anShapeLibrary p{font-size:10px;line-height:1.5;color:var(--text-dim)}
 #anAnimList,#anShapeList{border:1px solid var(--line);background:var(--bg);flex:1;min-height:120px;overflow:auto}
 #anAppend{margin-top:8px}`;
 document.head.append(style);

 const iconButton=(id,label,path)=>StudioShell.iconButton(id,label,path);
 for(const [id,label,path] of [['anNew','New animation','<path d="M12 4v16M4 12h16"/>'],['anDuplicateAnim','Duplicate animation','<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5"/>'],['anDelete','Delete animation','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>']]){const b=iconButton(id,label,path);b.querySelector('svg').setAttribute('width','20');b.querySelector('svg').setAttribute('height','20');$('anAnimActions').append(b);}

 let redo=[],selectedShapeId=null;
 const currentAnimation=()=>animations[animationIndex];
 const currentFrame=()=>currentAnimation()?.frames[frameIndex];
 const shapeById=id=>shapes.find(s=>s.id===id);
 /** The tileset an animation is pinned to: the one its existing frames use. */
 const animationTileset=a=>shapeById(a?.frames[0]?.shapeId)?.tilesetId;
 function checkpoint(){shapeHistory.push(JSON.stringify({animations,shapes}));if(shapeHistory.length>50)shapeHistory.shift();redo=[];}
 function edit(fn){checkpoint();fn();playing=false;markDirty();renderAnimations();}
 function usableShapes(a){const pinned=a&&animationTileset(a);return shapes.filter(s=>!pinned||s.tilesetId===pinned);}

 function freshName(){let n=1;while(animations.some(a=>a.name.toLowerCase()==='animation_'+n))n++;return 'animation_'+n;}
 $('anNew').onclick=()=>{
  if(animations.length>=255||!shapes.length){setStatus(shapes.length?'':'Create a shape first.');return;}
  edit(()=>{animations.push({name:freshName(),frames:[{shapeId:shapes[0].id,ticks:6}]});animationIndex=animations.length-1;frameIndex=0;selectedShapeId=null;});
 };
 $('anDuplicateAnim').onclick=()=>{
  if(!currentAnimation()||animations.length>=255)return;
  edit(()=>{const copy=structuredClone(currentAnimation());copy.name=freshName();animations.push(copy);animationIndex=animations.length-1;frameIndex=0;});
 };
 $('anDelete').onclick=()=>{if(!currentAnimation()||!confirm('Delete this animation?'))return;edit(()=>{animations.splice(animationIndex,1);animationIndex=Math.max(0,animationIndex-1);frameIndex=0;});};

 function chooseAnimation(i){animationIndex=i;frameIndex=0;playing=false;selectedShapeId=null;renderAnimations();}
 function renameAnimation(row,i){
  if(row.querySelector('input'))return;
  const input=document.createElement('input');input.value=animations[i].name;input.maxLength=32;input.setAttribute('aria-label','Rename animation');
  row.replaceChildren(input);let done=false;
  const finish=save=>{
   if(done)return;done=true;const value=input.value.trim();
   if(save&&value!==animations[i].name){
    if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value)||animations.some((x,j)=>j!==i&&x.name.toLowerCase()===value.toLowerCase()))setStatus('Use a unique name: letters, digits, underscores; start with a letter.');
    else edit(()=>animations[i].name=value);
   }
   render();
  };
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}};
  input.onblur=()=>finish(true);input.focus();input.select();
 }
 function renderAnimList(){
  const list=$('anAnimList');
  while(list.children.length>animations.length)list.lastElementChild.remove();
  animations.forEach((a,i)=>{
   let row=list.children[i];
   if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
   row.setAttribute('aria-selected',String(i===animationIndex));
   if(!row.querySelector('input'))row.textContent=a.name;
   row.onclick=e=>{if(e.target.tagName!=='INPUT')chooseAnimation(i);};
   row.ondblclick=e=>{if(e.target.tagName!=='INPUT')renameAnimation(row,i);};
   row.onkeydown=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='Enter'){e.preventDefault();chooseAnimation(i);}if(e.key==='F2'){e.preventDefault();renameAnimation(row,i);}};
  });
 }

 // A shape row here selects it; Append frame is the explicit action, matching
 // the tileset editor's "select an object, then Place selection" pattern.
 function renderShapeList(usable){
  if(!usable.some(s=>s.id===selectedShapeId))selectedShapeId=usable[0]?.id??null;
  const list=$('anShapeList');
  while(list.children.length>usable.length)list.lastElementChild.remove();
  usable.forEach((s,i)=>{
   let row=list.children[i];
   if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
   row.textContent=s.name;
   row.setAttribute('aria-selected',String(s.id===selectedShapeId));
   row.onclick=()=>{selectedShapeId=s.id;render();};
   row.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();row.onclick();}};
  });
 }
 $('anAppend').onclick=()=>{
  const a=currentAnimation();
  if(!a||!selectedShapeId||!shapeById(selectedShapeId)||a.frames.length>=255)return;
  edit(()=>{a.frames.push({shapeId:selectedShapeId,ticks:6});frameIndex=a.frames.length-1;});
 };
 $('anDuplicateFrame').onclick=()=>{const a=currentAnimation();if(!a||a.frames.length>=255||!currentFrame())return;edit(()=>{a.frames.splice(frameIndex+1,0,structuredClone(currentFrame()));frameIndex++;});};

 function renderFrames(a,usable){
  const tbody=$('anFrames');tbody.replaceChildren();
  a?.frames.forEach((frame,i)=>{
   const row=document.createElement('tr');row.classList.toggle('on',i===frameIndex);
   const index=document.createElement('td');index.textContent=String(i);row.append(index);
   const pick=document.createElement('td'),select=document.createElement('select');
   select.setAttribute('aria-label',`Frame ${i} shape`);
   select.replaceChildren(...usable.map(s=>new Option(s.name,s.id,false,s.id===frame.shapeId)));
   select.onchange=()=>edit(()=>frame.shapeId=select.value);
   pick.append(select);row.append(pick);
   for(const key of ['ticks','dx','dy']){
    const td=document.createElement('td'),input=document.createElement('input');
    input.type='number';input.setAttribute('aria-label',`Frame ${i} ${key}`);
    const limits=key==='ticks'?[1,255]:[-512,511];
    input.min=limits[0];input.max=limits[1];
    input.value=key==='ticks'?frame.ticks:(frame[key]??0);
    input.onchange=()=>{
     const value=Number(input.value);
     if(!Number.isInteger(value)||value<Number(input.min)||value>Number(input.max)){render();return;}
     edit(()=>{if(key==='ticks')frame.ticks=value;else if(value)frame[key]=value;else delete frame[key];});
    };
    td.append(input);row.append(td);
   }
   const show=document.createElement('td'),showBtn=document.createElement('button');
   showBtn.textContent='Show';showBtn.onclick=()=>{frameIndex=i;playing=false;render();};
   show.append(showBtn);row.append(show);
   const kill=document.createElement('td'),remove=document.createElement('button');
   remove.textContent='Remove';remove.disabled=a.frames.length===1;
   remove.onclick=()=>edit(()=>{a.frames.splice(i,1);frameIndex=Math.max(0,Math.min(frameIndex,a.frames.length-1));});
   kill.append(remove);row.append(kill);
   tbody.append(row);
  });
 }

 function drawPreview(){
  const canvas=$('anCanvas'),ctx=canvas.getContext('2d'),a=currentAnimation();
  const frame=a?.frames[playing?playFrame:Math.min(frameIndex,a.frames.length-1)];
  for(let y=0;y<256;y+=16)for(let x=0;x<256;x+=16){ctx.fillStyle=((x+y)/16)%2?'#292d35':'#22262e';ctx.fillRect(x,y,16,16);}
  ctx.fillStyle='#586174';ctx.fillRect(128,0,1,256);ctx.fillRect(0,128,256,1);
  const shape=shapeById(frame?.shapeId),source=tilesetById(shape?.tilesetId);
  // Sprites are drawn in list order, which is OAM order: later covers earlier.
  if(shape&&source)for(const sprite of shape.sprites)for(let y=0;y<8;y++)for(let x=0;x<8;x++){
   const sx=sprite.flipX?7-x:x,sy=sprite.flipY?7-y:y;
   const ink=tilePixel(source,sprite.tile,sx,sy,0);
   // Color 0 is transparent for sprites, so nothing is drawn for it.
   if(ink){ctx.fillStyle=css565(bankColor(sprite.paletteBank,ink));
    ctx.fillRect(128+(sprite.x+(frame.dx??0)+x)*4,128+(sprite.y+(frame.dy??0)+y)*4,4,4);}
  }
  $('anStatus').textContent=!a?'Create an animation to sequence your shapes.'
   :`${a.name} · frame ${(playing?playFrame:frameIndex)+1}/${a.frames.length} · ${shape?.name??'missing shape'} · 4× preview`;
 }
 $('anPlay').onclick=()=>{playing=!playing;playFrame=0;playStart=performance.now();render();};
 function tick(now){
  const a=currentAnimation();
  if(playing&&a&&currentView==='animations'){
   const total=a.frames.reduce((sum,f)=>sum+f.ticks,0);
   let t=Math.floor((now-playStart)*60/1000)%total;playFrame=0;
   while(t>=a.frames[playFrame].ticks){t-=a.frames[playFrame].ticks;playFrame++;}
  }
  if(!host.hidden)drawPreview();
  requestAnimationFrame(tick);
 }
 requestAnimationFrame(tick);

 // The picker is rebuilt only when the groups themselves change, matching the
 // tileset and shapes editors' equivalent picker.
 function syncAnConfigPicker(){
  const picker=$('anConfigPicker'),signature=paletteConfigs.map(c=>c.id+'|'+c.name).join(',');
  if(picker.dataset.signature!==signature){picker.dataset.signature=signature;picker.replaceChildren(...paletteConfigs.map(c=>new Option(c.name,c.id)));}
  picker.value=activeConfig()?.id??'';picker.disabled=paletteConfigs.length<2;
  $('anConfigWrap').title=paletteConfigs.length<2?'Add more bank groups in Palettes to switch between them'
   :'Which group of palette banks every editor previews with. Preview only — it does not change what a project exports.';
 }
 $('anConfigPicker').onchange=()=>{activeConfigId=$('anConfigPicker').value;redrawAll();};

 function render(){
  host.hidden=currentView!=='animations';
  document.body.classList.toggle('animationView',!host.hidden);
  if(host.hidden)return;
  const a=currentAnimation();
  $('anGroupTitle').textContent=a?.name??'No animations';
  $('anDuplicateAnim').disabled=$('anDelete').disabled=!a;
  $('anPlay').textContent=playing?'Stop':'Play';$('anPlay').classList.toggle('on',playing);$('anPlay').disabled=!a;
  renderAnimList();
  const usable=usableShapes(a);
  renderShapeList(usable);
  const pinned=a&&animationTileset(a);
  $('anShapeNote').textContent=!shapes.length?'Create a shape first.'
   :!a?'Create an animation, then append shapes as frames.'
   :pinned?`Only shapes on ${tilesetById(pinned)?.name??'this tileset'} can join: every frame in one animation plays from the same tileset.`
   :'A new animation is pinned to its first frame’s tileset.';
  $('anAppend').disabled=!a||!selectedShapeId||!usable.length;
  $('anDuplicateFrame').disabled=!currentFrame();
  $('anUndo').disabled=!shapeHistory.length;$('anRedo').disabled=!redo.length;
  syncAnConfigPicker();
  renderFrames(a,usable);
  drawPreview();
 }

 window.addEventListener('keydown',e=>{
  if(currentView!=='animations'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();$(e.shiftKey?'anRedo':'anUndo').click();}
 },true);

 const rail=StudioShell.toolRail('anRail','Animation tools');host.prepend(rail);
 const library=host.querySelector('.anLibrary'),shapeLibrary=host.querySelector('.anShapeLibrary');
 for(const [panel,id,label,path] of [
  [library,'anLibraryToggle','Animations','<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16"/><path d="M3 9h5M16 9h5M3 15h5M16 15h5"/>'],
  [shapeLibrary,'anShapeLibraryToggle','Shapes to append','<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4.5L6 21l1.5-7.5L2 9h7z"/>']
 ]){
  const b=iconButton(id,label,path);rail.append(b);
  StudioShell.bindPanel({panel,button:b,group:'animation',closeGroups:['animation']});
 }
 library.hidden=true;shapeLibrary.hidden=true;
 for(const id of ['anLibraryToggle','anShapeLibraryToggle'])$(id).setAttribute('aria-expanded','false');
 for(const [id,label,path,fn] of [
  ['anUndo','Undo','<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>',()=>{if(!shapeHistory.length)return;redo.push(JSON.stringify({animations,shapes}));({animations,shapes}=JSON.parse(shapeHistory.pop()));animationIndex=Math.min(animationIndex,Math.max(0,animations.length-1));frameIndex=0;playing=false;markDirty();renderAnimations();}],
  ['anRedo','Redo','<path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7"/>',()=>{if(!redo.length)return;shapeHistory.push(JSON.stringify({animations,shapes}));({animations,shapes}=JSON.parse(redo.pop()));animationIndex=Math.min(animationIndex,Math.max(0,animations.length-1));frameIndex=0;playing=false;markDirty();renderAnimations();}]
 ]){const b=iconButton(id,label,path);b.onclick=fn;rail.append(b);}

 window.renderAnimations=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){oldShow(v);render();};
 render();
})();
