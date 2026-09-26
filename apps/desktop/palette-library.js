// The project's palette library. One palette can be bound by many banks and
// named by many sprite parts, so every edit here is visible everywhere at once.
(() => {
 const host=document.createElement('section');host.id='paletteWorkspace';host.className='studioEditor';host.hidden=true;
 host.innerHTML=`<nav id="palRail" class="studioToolRail" aria-label="Palette tools"></nav>
 <aside id="palLibrary" class="studioDock studioDockLeft"><h2>Palettes</h2>
  <div id="palListActions" class="assetToolbar"></div>
  <div id="palList" role="listbox" aria-label="Palettes"></div></aside>
 <aside id="palConfigs" class="studioDock studioDockLeft"><h2>Bank configs</h2>
  <div id="palConfigsBody">
   <div id="palConfigListPane">
    <div id="palConfigListActions" class="assetToolbar"></div>
    <div id="palConfigList" role="listbox" aria-label="Palette bank configs"></div>
   </div>
   <div id="palConfigRamPane"><h3>Palette RAM</h3><div id="palBankGrid"></div></div>
  </div></aside>
 <main class="studioMain"><div id="palTop"><strong id="palName"></strong></div>
  <div id="palStage" class="studioStage"><div id="palColors"></div></div>
  <div id="palStatus"></div></main>
 <input id="palColorInput" type="color" style="position:absolute;opacity:0;width:1px;height:1px">`;
 // Inserted before the footer, not appended to #workspace, so the status bar
 // stays at the bottom of the page instead of landing above this section.
 $('spritePanel').after(host);
 const style=document.createElement('style');style.textContent=`







 /* The one editor with two docks open side by side: the palette library and
    the bank configs that place its palettes, each independently toggled. */
 #paletteWorkspace{grid-template-columns:auto auto auto minmax(0,1fr) auto auto}
 #paletteWorkspace>#palConfigs{grid-column:3;width:auto}
 #paletteWorkspace>.studioMain{grid-column:4}
  #palTop{display:flex;align-items:center;gap:14px;padding:9px 18px;background:var(--panel);font-size:11px}
 #palName{color:var(--ink);font-size:12px}
 #palStage{flex:1;min-height:0;overflow:auto;display:flex;align-items:safe center;justify-content:safe center;padding:28px}
 #palColors{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
 .palColor{display:flex;flex-direction:column;align-items:center;gap:6px}
 .palColor button{width:86px;height:86px;padding:0;border-radius:6px;border:1px solid #0006;box-shadow:0 6px 18px #0007;cursor:pointer}
 .palColor button:focus{outline:2px solid var(--sel);outline-offset:2px}
 .palColor .palIndex{font-size:11px;color:var(--text-dim)}
 .palColor .palHex{font-size:10px;color:var(--text-dim)}
 #palList{border:1px solid var(--line);background:var(--bg);flex:1;overflow:auto;min-height:60px}
 #palList .assetRow{display:flex;align-items:center;gap:8px}
 #palList .rowChips{display:flex;gap:1px;margin-left:auto;flex-shrink:0}
 #palList .rowChips i{width:8px;height:14px;border-radius:1px}
 #palList .assetRow.unusedPalette{opacity:.6}
 #palStatus{padding:6px 18px;font-size:10px;color:var(--text-dim)}
 #palConfigs h3{font-size:12px;color:var(--text-dim);margin:0 0 8px;flex-shrink:0}
 #palConfigs h3{margin-top:0}
 #palConfigsBody{display:flex;flex:1;min-height:0}
 #palConfigListPane{width:261px;flex-shrink:0;display:flex;flex-direction:column;padding-right:12px;border-right:1px solid var(--line)}
 #palConfigRamPane{width:230px;flex-shrink:0;display:flex;flex-direction:column;padding-left:12px}
 #palConfigList{border:1px solid var(--line);background:var(--bg);flex:1;overflow:auto;min-height:60px}
 #palBankGrid{display:flex;flex-direction:column;gap:2px}
 .palBankRow{display:flex;align-items:center;gap:5px}
 .palBankRow>span{width:17px;font-size:10px;color:var(--text-dim);flex-shrink:0}
 .palBankRow .rowChips{display:flex;gap:1px;flex-shrink:0}
 .palBankRow .rowChips i{width:6px;height:13px;border-radius:1px}
 .palBankRow select{flex:1;min-width:0;background:var(--bg);color:var(--text);border:1px solid var(--line);font-size:10px;padding:1px}`;
 document.head.append(style);

 let index=0,editing=0;
 const palette=()=>paletteLibrary[index];
 const iconButton=(id,label,icon)=>StudioShell.iconButton(id,label,icon);
 // A palette is used by the configs that place it in a bank. Nothing else binds
 // one: a tile records a bank number, and a sprite part names a bank outright.
 function usage(id){
  return paletteConfigs.map(c=>({config:c,banks:c.banks.flatMap((b,i)=>b===id?[i]:[])})).filter(u=>u.banks.length);
 }
 const library=$('palLibrary'),configsPanel=$('palConfigs');
 $('palTop').append(Object.assign(StudioShell.helpButton(),{style:'margin-left:auto'}));
 const toggle=iconButton('palLibraryToggle','Palettes','palette');
 StudioShell.bindPanel({panel:library,button:toggle,closeId:'palClose'});

 const configsToggle=iconButton('palConfigsToggle','Bank configs','bankConfig');
 StudioShell.bindPanel({panel:configsPanel,button:configsToggle,closeId:'palConfigsClose'});
 // Copy and paste, through the app clipboard: the whole selected palette, or
 // one color when a swatch has focus. A copied color pastes into the swatch
 // with focus, or the one last edited; it is the same clipboard the tileset
 // editor's palette dock copies colors to.
 const focusedInk=()=>{const el=document.activeElement;return el?.closest?.('#palColors')&&el.dataset.ink!==undefined?Number(el.dataset.ink):null;};
 function copyPalette(){
  const entry=palette(),ink=focusedInk();if(!entry)return false;
  if(ink!==null){StudioShell.clipboard.set('color',entry.colors[ink]);setStatus(`Copied color ${ink} of ${entry.name}.`);}
  else{StudioShell.clipboard.set('palette',entry.colors);setStatus(`Copied ${entry.name}.`);}
  render();return true;
 }
 function pastePalette(){
  const entry=palette();if(!entry)return false;
  const colors=StudioShell.clipboard.get('palette'),color=StudioShell.clipboard.get('color');
  if(colors)graphicsEdit('Paste a palette',()=>entry.colors.splice(0,colors.length,...colors));
  else if(color!==null){const ink=focusedInk()??editing;graphicsEdit('Paste a color',()=>entry.colors[ink]=color);}
  else return false;
  render();return true;
 }
 StudioShell.editActions('palettes',{copy:copyPalette,paste:pastePalette});
 // Palettes and bank configs are part of the project's one history.
 const historyButton=(id,label,icon,fn)=>{const b=iconButton(id,label,icon);b.onclick=()=>{fn();render();};return b;};
 StudioShell.railLayout($('palRail'),[[toggle,configsToggle]],[
  Object.assign(iconButton('palCopy','Copy palette (Ctrl/Cmd+C) — or the focused color','copy'),{onclick:copyPalette}),
  Object.assign(iconButton('palPaste','Paste palette or color (Ctrl/Cmd+V)','paste'),{onclick:pastePalette}),
  historyButton('palUndo','Undo (Ctrl/Cmd+Z)','undo',ProjectHistory.undo),historyButton('palRedo','Redo (Ctrl/Cmd+Shift+Z)','redo',ProjectHistory.redo)]);
 document.addEventListener('studioclipboard',()=>{if(!host.hidden)$('palPaste').disabled=!palette()||!(StudioShell.clipboard.has('palette')||StudioShell.clipboard.has('color'));});

 for(const [id,label,path,fn] of [
  ['palNew','New palette','newItem',()=>{graphicsEdit('New palette',()=>{createPalette(RAINBOW_565);index=paletteLibrary.length-1;});setStatus('Added a palette. Bind it from a bank slot to use it.');render();}],
  ['palDuplicate','Duplicate palette','duplicate',()=>{graphicsEdit('Duplicate '+palette().name,()=>{createPalette(palette().colors,uniquePaletteName());index=paletteLibrary.length-1;});setStatus('Duplicated the palette.');render();}],
  ['palDelete','Delete palette','delete',()=>destroy()]
 ]){const button=iconButton(id,label,path);button.onclick=fn;$('palListActions').append(button);}

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
  $('palDeleteSummary').hidden=inUse;
  $('palDeleteSummary').textContent=inUse?'':`"${target.name}" is not in any bank of any config.`;
  $('palReplacementRow').hidden=!inUse;
  const others=paletteLibrary.filter(p=>p!==target);
  $('palReplacement').replaceChildren(...others.map(p=>new Option(p.name,p.id)),new Option('Leave those banks empty','__empty'));
  $('palReplacement').value=(others[index-1]??others[0]).id;
  $('palDeleteConfirm').onclick=()=>{
   const choice=inUse?$('palReplacement').value:null,replacement=choice==='__empty'?null:choice;
   dialog.close();
   graphicsEdit('Delete '+target.name,()=>{
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
 function renamePalette(i,name){
  if(!name)return false;
  if(paletteLibrary.some((p,j)=>j!==i&&p.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique palette name.');return false;}
  graphicsEdit('Rename a palette',()=>paletteLibrary[i].name=name);return true;
 }

 // ===== bank configs =====
 // Editing a config edits what every other editor previews, so the whole app
 // redraws rather than just this panel.
 function configEdit(...args){graphicsEdit(...args);renderConfigPicker();window.renderBankEditor?.();renderAnimations();}
 // Electron's window.prompt() throws rather than showing a dialog, so config
 // renaming uses the same inline-input pattern as every other renameable list.
 function renameConfig(i,name){
  if(!name)return false;
  if(paletteConfigs.some((c,j)=>j!==i&&c.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique config name.');return false;}
  configEdit('Rename a config',()=>paletteConfigs[i].name=name);return true;
 }
 function renderConfigs(){
  StudioShell.renderList($('palConfigList'),paletteConfigs,{
   selected:c=>c.id===activeConfigId,
   choose:c=>{activeConfigId=c.id;redrawAll();render();},
   rename:renameConfig,render,maxLength:48,
   duplicate:c=>{activeConfigId=c.id;$('palConfigCopy').click();},remove:c=>{activeConfigId=c.id;$('palConfigDelete').click();},
   content:(row,config)=>{
    let name=row.firstElementChild;
    if(!name){name=document.createElement('span');row.replaceChildren(name);}
    name.textContent=config.name;
   }
  });
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
   // configEdit alone does not touch this panel; without the extra render() the
   // chips beside this very select would keep showing the bank's old colors.
   select.onchange=()=>{configEdit(`Change bank ${bank}`,()=>config.banks[bank]=select.value||null);render();};
   row.append(label,chips,select);
   return row;
  }));
 }
 for(const [id,label,path] of [
  ['palConfigNew','New config','newItem'],
  ['palConfigCopy','Duplicate config','duplicate'],
  ['palConfigDelete','Delete config','delete']
 ]){$('palConfigListActions').append(iconButton(id,label,path));}
 $('palConfigNew').onclick=()=>{configEdit('New config',()=>{activeConfigId=createConfig().id;});render();setStatus('Added a bank config. Fill its banks, then switch to it while drawing.');};
 $('palConfigCopy').onclick=()=>{const from=activeConfig();if(!from)return;configEdit('Duplicate '+from.name,()=>{activeConfigId=createConfig(undefined,from.banks).id;});render();setStatus('Duplicated '+from.name+'.');};
 $('palConfigDelete').onclick=()=>{
  const target=activeConfig();
  if(!target||paletteConfigs.length<2){setStatus('A project keeps at least one bank config.');return;}
  setStatus(`Deleted ${target.name}. Ctrl/Cmd+Z brings it back.`);
  configEdit('Delete '+target.name,()=>{paletteConfigs.splice(paletteConfigs.indexOf(target),1);activeConfigId=paletteConfigs[0].id;});
  render();setStatus('Deleted '+target.name+'.');
 };
 function renderPaletteList(){
  StudioShell.renderList($('palList'),paletteLibrary,{
   selected:(entry,i)=>i===index,
   choose:(entry,i)=>{index=i;render();},
   rename:renamePalette,render,maxLength:48,
   duplicate:(entry,i)=>{index=i;$('palDuplicate').click();},remove:(entry,i)=>{index=i;$('palDelete').click();},
   content:(row,entry)=>{
    row.classList.toggle('unusedPalette',!usage(entry.id).length);
    // Reused in place, not recreated, so a click-triggered render happening
    // between the two clicks of a double-click does not swap out the node
    // under the pointer — swapping it resets the browser's dblclick count.
    let [name,chips]=row.children;
    if(!name||!chips){name=document.createElement('span');chips=document.createElement('span');chips.className='rowChips';row.replaceChildren(name,chips);}
    name.textContent=entry.name;
    while(chips.children.length>entry.colors.length)chips.lastElementChild.remove();
    entry.colors.forEach((color,ci)=>{
     let chip=chips.children[ci];
     if(!chip){chip=document.createElement('i');chips.append(chip);}
     chip.style.background=css565(color);
    });
   }
  });
 }
 function render(){
  if(host.hidden)return;
  renderConfigs();
  if(index>=paletteLibrary.length)index=Math.max(0,paletteLibrary.length-1);
  const entry=palette();
  $('palUndo').disabled=!ProjectHistory.canUndo();$('palRedo').disabled=!ProjectHistory.canRedo();
  $('palCopy').disabled=!entry;$('palPaste').disabled=!entry||!(StudioShell.clipboard.has('palette')||StudioShell.clipboard.has('color'));
  $('palDelete').disabled=!entry||paletteLibrary.length===1;
  $('palDuplicate').disabled=!entry;
  $('palName').textContent=entry?entry.name:'No palettes';
  $('palStatus').textContent=`${paletteLibrary.length} palette${paletteLibrary.length===1?'':'s'} · ${paletteConfigs.length} bank config${paletteConfigs.length===1?'':'s'} · previewing "${activeConfig()?.name??'none'}"`;
  const colors=$('palColors');
  for(let ink=0;ink<8;ink++){
   let cell=colors.children[ink];
   if(!cell){
    cell=document.createElement('div');cell.className='palColor';
    const swatch=document.createElement('button');swatch.dataset.ink=ink;
    const label=document.createElement('span');label.className='palIndex';label.textContent=ink===0?'0 · key':String(ink);
    const hex=document.createElement('span');hex.className='palHex';
    cell.append(swatch,label,hex);colors.append(cell);
    swatch.onclick=()=>{
     if(!palette())return;editing=ink;
     const input=$('palColorInput'),hostRect=host.getBoundingClientRect(),swatchRect=swatch.getBoundingClientRect();
     input.style.left=(swatchRect.left-hostRect.left)+'px';input.style.top=(swatchRect.top-hostRect.top)+'px';
     input.value=css565ToInput(palette().colors[ink]);input.click();
    };
    swatch.oncontextmenu=e=>{e.preventDefault();const entry=palette();if(!entry)return;
     StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Copy color',hint:'Mod+C',run:()=>{StudioShell.clipboard.set('color',entry.colors[ink]);render();}},{label:'Paste color',hint:'Mod+V',disabled:!StudioShell.clipboard.has('color'),run:()=>{const color=StudioShell.clipboard.get('color');graphicsEdit('Paste a color',()=>entry.colors[ink]=color);render();}},'-',{label:'Edit color…',run:()=>swatch.click()}]);};
   }
   const swatch=cell.querySelector('button');
   swatch.style.background=entry?css565(entry.colors[ink]):'transparent';
   swatch.title=ink===0?'Color 0 — drawn on background tiles, transparent for sprites and the overlay':`Color ${ink}`;
   swatch.setAttribute('aria-label',(entry?entry.name+' ':'')+swatch.title);
   swatch.disabled=!entry;
   cell.querySelector('.palHex').textContent=entry?'0x'+entry.colors[ink].toString(16).toUpperCase().padStart(4,'0'):'';
  }
  renderPaletteList();
 }
 $('palColorInput').onchange=()=>{if(!palette())return;graphicsEdit('Change a color',()=>palette().colors[editing]=inputTo565($('palColorInput').value));render();};
 window.addEventListener('keydown',event=>{
  if(currentView!=='palettes'||!(event.metaKey||event.ctrlKey)||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  const key=event.key.toLowerCase();if(key!=='c'&&key!=='v')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(key==='c')copyPalette();else pastePalette();
 },true);
 const oldShow=showView;
 showView=function(view){
  oldShow(view);host.hidden=view!=='palettes';
  document.body.classList.toggle('paletteWorkspaceView',view==='palettes');
  render();
 };
 StudioShell.viewStatus('palettes',$('palStatus'));
 window.renderPaletteLibrary=render;
})();
