// The project's palette library. One palette can be bound by many banks and
// named by many sprite parts, so every edit here is visible everywhere at once.
(() => {
 const host=document.createElement('section');host.id='paletteWorkspace';host.hidden=true;
 host.innerHTML=`<nav id="palRail" aria-label="Palette tools"></nav>
 <aside id="palLibrary"><h2>Palettes</h2><div id="palList" role="listbox" aria-label="Palettes"></div>
  <p>Double-click a palette to rename it. Deleting one that is in use asks which palette its banks should hold instead.</p></aside>
 <aside id="palConfigs"><h2>Bank configs</h2><div id="palConfigList" role="listbox" aria-label="Palette bank configs"></div>
  <div class="palConfigActions"><button id="palConfigNew">New</button><button id="palConfigCopy">Duplicate</button><button id="palConfigDelete">Delete</button></div>
  <h3>Palette RAM</h3><div id="palBankGrid"></div>
  <p>A config is one palette RAM layout: the sixteen banks a game loads at once. Tiles and sprites name bank numbers, so switching config recolors everything drawn against them.</p></aside>
 <main><div id="palTop"><strong id="palName"></strong><span id="palUse"></span></div>
  <div id="palStage"><div id="palColors"></div></div>
  <div id="palStatus"></div></main>
 <input id="palColorInput" type="color" style="position:absolute;opacity:0;width:1px;height:1px">`;
 $('workspace').append(host);
 const style=document.createElement('style');style.textContent=`
 body.paletteWorkspaceView{padding-left:0;overflow:hidden}
 body.paletteWorkspaceView #workflowNav{position:static;width:auto;height:44px;display:flex;align-items:center;gap:6px;padding:5px 12px;border-bottom:1px solid var(--line)}
 body.paletteWorkspaceView #workflowNav .brand{font-size:12px;margin-right:18px}
 body.paletteWorkspaceView #workflowNav .brand span,body.paletteWorkspaceView #workflowNav .navGroup,body.paletteWorkspaceView #workflowNav .navNote,body.paletteWorkspaceView #workflowHeading{display:none}
 body.paletteWorkspaceView #workflowNav button{width:auto;margin:0;padding:6px 12px}
 body.paletteWorkspaceView header{height:46px;padding:5px 12px}
 body.paletteWorkspaceView footer{left:0;height:28px;padding:6px 12px;font-size:11px}
 #paletteWorkspace{position:relative;height:calc(100vh - 118px);display:grid;grid-template-columns:64px auto auto minmax(0,1fr)}
 #palRail{grid-column:1;display:flex;flex-direction:column;gap:5px;padding:8px 5px;background:var(--panel);border-right:1px solid var(--line)}
 #palRail button{height:46px;padding:6px;display:flex;align-items:center;justify-content:center}
 #palRail svg{width:30px;height:30px}
 #paletteWorkspace main{grid-column:4;display:flex;flex-direction:column;min-width:0;min-height:0}
 #palTop{display:flex;align-items:center;gap:14px;padding:9px 18px;background:var(--panel);font-size:11px}
 #palName{color:var(--ink);font-size:12px}
 #palUse{color:var(--text-dim)}
 #palStage{flex:1;min-height:0;overflow:auto;display:flex;align-items:safe center;justify-content:safe center;padding:28px;background:#101113;background-image:radial-gradient(#22252b 1px,transparent 1px);background-size:12px 12px}
 #palColors{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
 .palColor{display:flex;flex-direction:column;align-items:center;gap:6px}
 .palColor button{width:86px;height:86px;padding:0;border-radius:6px;border:1px solid #0006;box-shadow:0 6px 18px #0007;cursor:pointer}
 .palColor button:focus{outline:2px solid var(--sel);outline-offset:2px}
 .palColor .palIndex{font-size:11px;color:var(--text-dim)}
 .palColor .palHex{font-size:10px;color:var(--text-dim)}
 #palLibrary{position:relative;grid-column:2;width:285px;padding:12px;padding-top:38px;background:var(--panel);border-right:1px solid var(--line);overflow:auto}
 #palLibrary h2{font-size:12px;color:var(--text-dim);margin:0 0 8px}
 #palLibrary p{font-size:10px;line-height:1.6;color:var(--text-dim)}
 #palList{border:1px solid var(--line);background:var(--bg);max-height:60vh;overflow:auto;min-height:60px}
 #palList .assetRow{display:flex;align-items:center;gap:8px}
 #palList .rowChips{display:flex;gap:1px;margin-left:auto;flex-shrink:0}
 #palList .rowChips i{width:8px;height:14px;border-radius:1px}
 #palList .assetRow.unusedPalette{opacity:.6}
 #palClose{position:absolute;top:5px;right:5px;padding:3px;height:auto!important}
 #palClose svg{width:18px;height:18px}
 #palStatus{padding:6px 18px;font-size:10px;color:var(--text-dim)}
 #palConfigs{grid-column:3;width:250px;padding:12px;background:var(--panel);border-right:1px solid var(--line);overflow:auto}
 #palConfigs h2,#palConfigs h3{font-size:12px;color:var(--text-dim);margin:0 0 8px}
 #palConfigs h3{margin-top:14px}
 #palConfigs p{font-size:10px;line-height:1.6;color:var(--text-dim)}
 #palConfigList{border:1px solid var(--line);background:var(--bg);max-height:24vh;overflow:auto;min-height:44px}
 .palConfigActions{display:flex;gap:6px;margin:8px 0}
 .palConfigActions button{flex:1;padding:5px;font-size:10px}
 #palBankGrid{display:flex;flex-direction:column;gap:2px}
 .palBankRow{display:flex;align-items:center;gap:5px}
 .palBankRow>span{width:17px;font-size:10px;color:var(--text-dim);flex-shrink:0}
 .palBankRow .rowChips{display:flex;gap:1px;flex-shrink:0}
 .palBankRow .rowChips i{width:6px;height:13px;border-radius:1px}
 .palBankRow select{flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--line);font-size:10px;padding:1px}`;
 document.head.append(style);

 let index=0,editing=0;
 const palette=()=>paletteLibrary[index];
 const groups=()=>[...sprites,...animations];
 function iconButton(id,label,path){
  const button=document.createElement('button');button.id=id;button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML=`<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  return button;
 }
 // A palette is used by the configs that place it in a bank. Nothing else binds
 // one: a tile records a bank number, and a sprite part names a bank outright.
 function usage(id){
  return paletteConfigs.map(c=>({config:c,banks:c.banks.flatMap((b,i)=>b===id?[i]:[])})).filter(u=>u.banks.length);
 }
 function describe(id){
  const used=usage(id);
  if(!used.length)return 'Unused — place it in a bank to paint with it';
  return used.map(u=>`${u.config.name} · ${u.banks.map(b=>String(b).padStart(2,'0')).join(', ')}`).join('  ·  ');
 }
 const library=$('palLibrary');
 const toggle=iconButton('palLibraryToggle','Palettes','<path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a3 3 0 0 0 3-3 8 8 0 0 0-8-8z"/><circle cx="7.5" cy="12" r="1.2" fill="currentColor"/><circle cx="9.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7" r="1.2" fill="currentColor"/><circle cx="17.5" cy="11" r="1.2" fill="currentColor"/>');
 toggle.setAttribute('aria-expanded','true');
 toggle.onclick=()=>{library.hidden=!library.hidden;toggle.setAttribute('aria-expanded',String(!library.hidden));};
 const close=iconButton('palClose','Close panel','<path d="m6 6 12 12M18 6 6 18"/>');
 close.onclick=()=>{library.hidden=true;toggle.setAttribute('aria-expanded','false');};
 library.prepend(close);
 $('palRail').append(toggle);
 for(const [id,label,path,fn] of [
  ['palNew','New palette','<path d="M12 4v16M4 12h16"/>',()=>{graphicsEdit(()=>{createPalette(RAINBOW_565);index=paletteLibrary.length-1;});setStatus('Added a palette. Bind it from a bank slot to use it.');render();}],
  ['palDuplicate','Duplicate palette','<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5"/>',()=>{graphicsEdit(()=>{createPalette(palette().colors,uniquePaletteName());index=paletteLibrary.length-1;});setStatus('Duplicated the palette.');render();}],
  ['palDelete','Delete palette','<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>',()=>destroy()]
 ]){const button=iconButton(id,label,path);button.onclick=fn;$('palRail').append(button);}

 const dialog=document.createElement('dialog');dialog.id='palDeleteDialog';
 dialog.innerHTML=`<h2>Delete palette</h2><p id="palDeleteSummary"></p>
 <label id="palReplacementRow">Move its references to <select id="palReplacement"></select></label>
 <div class="palDialogActions"><button id="palDeleteCancel" type="button">Cancel</button><button id="palDeleteConfirm" type="button">Delete</button></div>`;
 document.body.append(dialog);
 const dialogStyle=document.createElement('style');dialogStyle.textContent=`
 #palDeleteDialog{background:var(--panel);color:var(--text);border:1px solid var(--line);border-radius:7px;padding:22px;max-width:430px}
 #palDeleteDialog::backdrop{background:#0009}
 #palDeleteDialog h2{font-size:13px;margin:0 0 10px}
 #palDeleteSummary{font-size:11px;line-height:1.7;color:var(--text-dim)}
 #palReplacementRow{display:block;margin:14px 0;font-size:11px}
 #palReplacementRow select{width:100%;margin-top:6px;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:6px}
 .palDialogActions{display:flex;justify-content:flex-end;gap:8px}`;
 document.head.append(dialogStyle);
 /** Repoints every bank of every config from one palette to another. */
 function repoint(fromId,toId){
  let banks=0;
  for(const config of paletteConfigs)config.banks=config.banks.map(b=>b===fromId?(banks++,toId):b);
  return banks;
 }
 /** Clears a palette out of every bank, for a delete with no replacement. */
 function unbind(id){
  let cleared=0;
  for(const config of paletteConfigs)config.banks=config.banks.map(b=>b===id?(cleared++,null):b);
  return cleared;
 }
 function destroy(){
  const target=palette();if(!target)return;
  if(paletteLibrary.length===1){setStatus('A project keeps at least one palette.');return;}
  const used=usage(target.id),inUse=used.length>0;
  $('palDeleteSummary').textContent=inUse
   ?`"${target.name}" sits in ${describe(target.id)}. Choose the palette those banks should hold instead; the colors they show will change to it.`
   :`"${target.name}" is not in any bank of any config.`;
  $('palReplacementRow').hidden=!inUse;
  const others=paletteLibrary.filter(p=>p!==target);
  $('palReplacement').replaceChildren(...others.map(p=>new Option(p.name,p.id)),new Option('Leave those banks empty','__empty'));
  $('palReplacement').value=(others[index-1]??others[0]).id;
  $('palDeleteConfirm').onclick=()=>{
   const choice=inUse?$('palReplacement').value:null,replacement=choice==='__empty'?null:choice;
   dialog.close();
   graphicsEdit(()=>{
    const moved=replacement?repoint(target.id,replacement):choice?unbind(target.id):0;
    paletteLibrary.splice(paletteLibrary.indexOf(target),1);
    index=Math.min(index,paletteLibrary.length-1);
    setStatus(!choice?'Deleted '+target.name+'.'
     :replacement?`Deleted ${target.name}. Moved ${moved} palette bank${moved===1?'':'s'} onto ${libraryPalette(replacement).name}.`
     :`Deleted ${target.name}. Emptied ${moved} palette bank${moved===1?'':'s'}.`);
   },true);
   render();
  };
  dialog.showModal();
 }
 $('palDeleteCancel').onclick=()=>dialog.close();
 function rename(row){
  if(row.querySelector('input'))return;
  const target=palette(),input=document.createElement('input');
  input.value=target.name;input.maxLength=48;input.setAttribute('aria-label','Rename '+target.name);
  row.replaceChildren(input);let done=false;
  const finish=save=>{
   if(done)return;done=true;const name=input.value.trim();row.replaceChildren();
   if(save&&name&&name!==target.name){
    if(paletteLibrary.some(p=>p!==target&&p.name.toLowerCase()===name.toLowerCase()))setStatus('Use a unique palette name.');
    else graphicsEdit(()=>target.name=name);
   }
   render();
  };
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}};
  input.onblur=()=>finish(true);input.focus();input.select();
 }

 // ===== bank configs =====
 // Editing a config edits what every other editor previews, so the whole app
 // redraws rather than just this panel.
 function configEdit(fn){graphicsEdit(fn);renderConfigPicker();window.renderBankEditor?.();renderSprites();}
 function renameConfig(config){
  const name=prompt('Config name',config.name)?.trim();
  if(!name||name===config.name)return;
  if(paletteConfigs.some(c=>c!==config&&c.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique config name.');return;}
  configEdit(()=>config.name=name);render();
 }
 function renderConfigs(){
  const list=$('palConfigList');
  list.replaceChildren(...paletteConfigs.map(config=>{
   const row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');
   row.setAttribute('aria-selected',String(config.id===activeConfigId));
   const name=document.createElement('span');name.textContent=config.name;
   const count=document.createElement('span');count.className='rowChips';
   count.textContent=config.banks.filter(Boolean).length+'/16';
   count.style.cssText='margin-left:auto;font-size:10px;color:var(--text-dim)';
   row.replaceChildren(name,count);
   row.onclick=()=>{activeConfigId=config.id;redrawAll();render();};
   row.ondblclick=()=>renameConfig(config);
   row.onkeydown=e=>{if(e.key==='Enter'){activeConfigId=config.id;redrawAll();render();}if(e.key==='F2'){e.preventDefault();renameConfig(config);}};
   return row;
  }));
  $('palConfigDelete').disabled=paletteConfigs.length<2;
  const config=activeConfig();
  $('palBankGrid').replaceChildren(...Array.from({length:16},(_,bank)=>{
   const row=document.createElement('div');row.className='palBankRow';
   const label=document.createElement('span');label.textContent=String(bank).padStart(2,'0');
   const chips=document.createElement('span');chips.className='rowChips';
   for(const color of bankColors(bank)){const chip=document.createElement('i');chip.style.background=css565(color);chips.append(chip);}
   const select=document.createElement('select');
   select.setAttribute('aria-label','Palette in bank '+bank);
   // Two banks may hold one palette: banks are an authored layout, not a set.
   select.replaceChildren(new Option('— empty —','',false,!config?.banks[bank]),
    ...paletteLibrary.map(p=>new Option(p.name,p.id,false,p.id===config?.banks[bank])));
   select.onchange=()=>configEdit(()=>config.banks[bank]=select.value||null);
   row.append(label,chips,select);
   return row;
  }));
 }
 $('palConfigNew').onclick=()=>{configEdit(()=>{activeConfigId=createConfig().id;});render();setStatus('Added a bank config. Fill its banks, then switch to it while drawing.');};
 $('palConfigCopy').onclick=()=>{const from=activeConfig();if(!from)return;configEdit(()=>{activeConfigId=createConfig(undefined,from.banks).id;});render();setStatus('Duplicated '+from.name+'.');};
 $('palConfigDelete').onclick=()=>{
  const target=activeConfig();
  if(!target||paletteConfigs.length<2){setStatus('A project keeps at least one bank config.');return;}
  if(!confirm(`Delete config "${target.name}"? Tiles and sprites keep their bank numbers.`))return;
  configEdit(()=>{paletteConfigs.splice(paletteConfigs.indexOf(target),1);activeConfigId=paletteConfigs[0].id;});
  render();setStatus('Deleted '+target.name+'.');
 };
 function renderList(){
  const list=$('palList');
  while(list.children.length>paletteLibrary.length)list.lastElementChild.remove();
  paletteLibrary.forEach((entry,i)=>{
   let row=list.children[i];
   if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
   row.classList.toggle('unusedPalette',!usage(entry.id).length);
   row.setAttribute('aria-selected',String(i===index));
   if(!row.querySelector('input')){
    const name=document.createElement('span');name.textContent=entry.name;
    const chips=document.createElement('span');chips.className='rowChips';
    for(const color of entry.colors){const chip=document.createElement('i');chip.style.background=css565(color);chips.append(chip);}
    row.replaceChildren(name,chips);
   }
   row.onclick=e=>{if(e.target.tagName!=='INPUT'){index=i;render();}};
   row.ondblclick=e=>{if(e.target.tagName!=='INPUT'){index=i;rename(row);}};
   row.onkeydown=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='Enter'){index=i;render();}if(e.key==='F2'){e.preventDefault();index=i;rename(row);}};
  });
 }
 function render(){
  if(host.hidden)return;
  renderConfigs();
  if(index>=paletteLibrary.length)index=Math.max(0,paletteLibrary.length-1);
  const entry=palette();
  $('palDelete').disabled=!entry||paletteLibrary.length===1;
  $('palDuplicate').disabled=!entry;
  $('palName').textContent=entry?entry.name:'No palettes';
  $('palUse').textContent=entry?describe(entry.id):'';
  $('palStatus').textContent=`${paletteLibrary.length} palette${paletteLibrary.length===1?'':'s'} · ${paletteConfigs.length} bank config${paletteConfigs.length===1?'':'s'} · previewing "${activeConfig()?.name??'none'}" · palette RAM holds 16 at a time, shared by background tiles, sprites and the overlay · click a color to edit it`;
  const colors=$('palColors');
  for(let ink=0;ink<8;ink++){
   let cell=colors.children[ink];
   if(!cell){
    cell=document.createElement('div');cell.className='palColor';
    const swatch=document.createElement('button');swatch.dataset.ink=ink;
    const label=document.createElement('span');label.className='palIndex';label.textContent=ink===0?'0 · key':String(ink);
    const hex=document.createElement('span');hex.className='palHex';
    cell.append(swatch,label,hex);colors.append(cell);
    swatch.onclick=()=>{if(!palette())return;editing=ink;$('palColorInput').value=css565ToInput(palette().colors[ink]);$('palColorInput').click();};
   }
   const swatch=cell.querySelector('button');
   swatch.style.background=entry?css565(entry.colors[ink]):'transparent';
   swatch.title=ink===0?'Color 0 — drawn on background tiles, transparent for sprites and the overlay':`Color ${ink}`;
   swatch.setAttribute('aria-label',(entry?entry.name+' ':'')+swatch.title);
   swatch.disabled=!entry;
   cell.querySelector('.palHex').textContent=entry?'0x'+entry.colors[ink].toString(16).toUpperCase().padStart(4,'0'):'';
  }
  renderList();
 }
 $('palColorInput').onchange=()=>{if(!palette())return;graphicsEdit(()=>palette().colors[editing]=inputTo565($('palColorInput').value));render();};
 // Undo lives on the bank editor's rail, which this workspace does not show.
 window.addEventListener('keydown',event=>{
  if(currentView!=='palettes'||!(event.metaKey||event.ctrlKey)||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;
  event.preventDefault();event.stopImmediatePropagation();
  (key==='y'||event.shiftKey?$('bankRedo'):$('bankUndo')).click();render();
 },true);
 const oldShow=showView;
 showView=function(view){
  oldShow(view);host.hidden=view!=='palettes';
  document.body.classList.toggle('paletteWorkspaceView',view==='palettes');
  render();
 };
 window.renderPaletteLibrary=render;
})();
