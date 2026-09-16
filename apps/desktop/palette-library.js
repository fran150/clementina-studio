// The project's palette library. One palette can be bound by many banks and
// named by many sprite parts, so every edit here is visible everywhere at once.
(() => {
 const host=document.createElement('section');host.id='paletteWorkspace';host.hidden=true;
 host.innerHTML=`<nav id="palRail" aria-label="Palette tools"></nav>
 <aside id="palLibrary"><h2>Palettes</h2><div id="palList" role="listbox" aria-label="Palettes"></div>
  <p>Double-click a palette to rename it. Deleting one that is in use asks which palette its bank slots and sprite parts should move to.</p></aside>
 <main><div id="palTop"><strong id="palName"></strong><span id="palUse"></span></div>
  <div id="palStage"><div id="palColors"></div></div>
  <div id="palStatus"></div></main>
 <input id="palColorInput" type="color" style="position:absolute;opacity:0;width:1px;height:1px">`;
 $('paletteHost').after(host);
 const style=document.createElement('style');style.textContent=`
 body.paletteWorkspaceView{padding-left:0;overflow:hidden}
 body.paletteWorkspaceView #workflowNav{position:static;width:auto;height:44px;display:flex;align-items:center;gap:6px;padding:5px 12px;border-bottom:1px solid var(--line)}
 body.paletteWorkspaceView #workflowNav .brand{font-size:12px;margin-right:18px}
 body.paletteWorkspaceView #workflowNav .brand span,body.paletteWorkspaceView #workflowNav .navGroup,body.paletteWorkspaceView #workflowNav .navNote,body.paletteWorkspaceView #workflowHeading{display:none}
 body.paletteWorkspaceView #workflowNav button{width:auto;margin:0;padding:6px 12px}
 body.paletteWorkspaceView header{height:46px;padding:5px 12px}
 body.paletteWorkspaceView footer{left:0;height:28px;padding:6px 12px;font-size:11px}
 #paletteWorkspace{position:relative;height:calc(100vh - 118px);display:grid;grid-template-columns:64px auto minmax(0,1fr)}
 #palRail{grid-column:1;display:flex;flex-direction:column;gap:5px;padding:8px 5px;background:var(--panel);border-right:1px solid var(--line)}
 #palRail button{height:46px;padding:6px;display:flex;align-items:center;justify-content:center}
 #palRail svg{width:30px;height:30px}
 #paletteWorkspace main{grid-column:3;display:flex;flex-direction:column;min-width:0;min-height:0}
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
 #palStatus{padding:6px 18px;font-size:10px;color:var(--text-dim)}`;
 document.head.append(style);

 let index=0,editing=0;
 const palette=()=>paletteLibrary[index];
 const groups=()=>[...sprites,...animations];
 function iconButton(id,label,path){
  const button=document.createElement('button');button.id=id;button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML=`<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
  return button;
 }
 function usage(id){
  return {banks:ensureBankAssets().filter(b=>b.paletteSlots?.includes(id)),
   parts:groups().flatMap(g=>g.frames.flatMap(f=>f.parts.filter(p=>p.paletteId===id))).length};
 }
 function describe(id){
  const {banks,parts}=usage(id);
  if(!banks.length&&!parts)return 'Unused — bind it to a bank slot to paint with it';
  const slots=banks.map(b=>`${b.name} · ${b.paletteSlots.map((s,i)=>s===id?String(i).padStart(2,'0'):null).filter(Boolean).join(', ')}`);
  return [slots.join('  ·  '),parts?`${parts} sprite part${parts===1?'':'s'}`:''].filter(Boolean).join('  ·  ');
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
  ['palNew','New palette','<path d="M12 4v16M4 12h16"/>',()=>{graphicsEdit(()=>{createPalette(Array(8).fill(0));index=paletteLibrary.length-1;});setStatus('Added a palette. Bind it from a bank slot to use it.');render();}],
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
 /** Repoints every bank slot and sprite part from one palette to another. */
 function repoint(fromId,toId){
  let slots=0,parts=0;
  for(const bank of ensureBankAssets()){
   bank.paletteSlots.forEach((id,slot)=>{if(id===fromId){bank.paletteSlots[slot]=toId;slots++;}});
   compactBankSlots(bank);
  }
  for(const group of groups())for(const frame of group.frames)for(const part of frame.parts)if(part.paletteId===fromId){part.paletteId=toId;parts++;}
  return {slots,parts};
 }
 const doubledUp=id=>ensureBankAssets().filter(b=>b.paletteSlots.filter(s=>s===id).length>1);
 function destroy(){
  const target=palette();if(!target)return;
  if(paletteLibrary.length===1){setStatus('A project keeps at least one palette.');return;}
  const {banks,parts}=usage(target.id),inUse=banks.length||parts;
  $('palDeleteSummary').textContent=inUse
   ?`"${target.name}" is used by ${describe(target.id)}. Choose the palette those should use instead; the colors they show will change to it.`
   :`"${target.name}" is not used by any bank slot or sprite part.`;
  $('palReplacementRow').hidden=!inUse;
  const others=paletteLibrary.filter(p=>p!==target);
  $('palReplacement').replaceChildren(...others.map(p=>new Option(p.name,p.id)));
  $('palReplacement').value=(others[index-1]??others[0]).id;
  $('palDeleteConfirm').onclick=()=>{
   const replacement=inUse?$('palReplacement').value:null;
   dialog.close();
   graphicsEdit(()=>{
    const moved=replacement?repoint(target.id,replacement):{slots:0,parts:0};
    paletteLibrary.splice(paletteLibrary.indexOf(target),1);
    index=Math.min(index,paletteLibrary.length-1);
    if(replacement){
     const shared=doubledUp(replacement);
     setStatus(`Deleted ${target.name}. Moved ${moved.slots} bank slot${moved.slots===1?'':'s'} and ${moved.parts} sprite part${moved.parts===1?'':'s'} onto ${libraryPalette(replacement).name}.`
      +(shared.length?` ${shared.map(b=>b.name).join(', ')} now hold${shared.length===1?'s':''} it in more than one slot — free one to reclaim a hardware palette.`:''));
    }else setStatus('Deleted '+target.name+'.');
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
 function renderList(){
  const list=$('palList');
  while(list.children.length>paletteLibrary.length)list.lastElementChild.remove();
  paletteLibrary.forEach((entry,i)=>{
   let row=list.children[i];
   if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');list.append(row);}
   const {banks,parts}=usage(entry.id);
   row.classList.toggle('unusedPalette',!banks.length&&!parts);
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
  if(index>=paletteLibrary.length)index=Math.max(0,paletteLibrary.length-1);
  const entry=palette();
  $('palDelete').disabled=!entry||paletteLibrary.length===1;
  $('palDuplicate').disabled=!entry;
  $('palName').textContent=entry?entry.name:'No palettes';
  $('palUse').textContent=entry?describe(entry.id):'';
  $('palStatus').textContent=`${paletteLibrary.length} palette${paletteLibrary.length===1?'':'s'} in this project · MIA holds 16 at a time, shared by background tiles, sprites and the overlay · click a color to edit it`;
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
