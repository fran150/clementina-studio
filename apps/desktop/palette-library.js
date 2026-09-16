// The project's palette library. One palette can be bound by many banks and
// named by many sprite parts, so every edit here is visible everywhere at once.
(() => {
 const host=document.createElement('section');host.id='paletteLibraryPanel';host.className='panel';host.hidden=true;
 host.innerHTML=`<p id="paletteLibraryIntro">MIA holds 16 palettes of 8 colors at a time, shared by background tiles, sprites and the overlay. A project may define more than 16 and swap them at runtime; each bank binds 16 of them to its slots, and each sprite part names the one it needs.</p>
 <div class="paletteActions"><button id="newPalette">New palette</button><span id="paletteLibraryCount"></span></div>
 <div id="paletteRows" role="list"></div>
 <input id="paletteLibraryColor" type="color" style="position:absolute;opacity:0;width:1px;height:1px">`;
 $('paletteHost').after(host);
 const style=document.createElement('style');style.textContent=`
 #paletteLibraryPanel{margin:16px;padding:24px;max-width:1000px}
 #paletteLibraryIntro{color:var(--text-dim);font-size:11px;line-height:1.7;max-width:660px}
 .paletteActions{display:flex;gap:10px;align-items:center;margin:14px 0;font-size:11px;color:var(--text-dim)}
 #paletteRows{display:flex;flex-direction:column;gap:6px}
 .paletteRow{display:flex;align-items:center;gap:10px;padding:7px 9px;background:var(--panel);border:1px solid var(--line);border-radius:6px}
 .paletteRow input.paletteName{width:150px;flex-shrink:0;background:var(--bg);color:var(--text);border:1px solid var(--line);padding:5px;font:inherit;font-size:11px}
 .paletteRow .paletteChips{display:flex;gap:2px;flex-shrink:0}
 .paletteRow .paletteChips button{width:24px;height:24px;padding:0;border-radius:3px;border:1px solid #0006}
 .paletteRow .paletteUse{flex:1;min-width:0;font-size:10px;color:var(--text-dim);line-height:1.5}
 .paletteRow .rowActions{display:flex;gap:6px;flex-shrink:0}
 .paletteRow .rowActions button{font-size:10px;padding:5px 9px}
 .paletteRow.unusedPalette{opacity:.72}`;
 document.head.append(style);

 let editing=null;
 const groups=()=>[...sprites,...animations];
 function usage(id){
  const banks=ensureBankAssets().filter(b=>b.paletteSlots?.includes(id));
  const parts=groups().flatMap(g=>g.frames.flatMap(f=>f.parts.filter(p=>p.paletteId===id)));
  return {banks,parts};
 }
 function describe(id){
  const {banks,parts}=usage(id);
  if(!banks.length&&!parts.length)return 'Unused';
  const slots=banks.map(b=>b.name+' · '+b.paletteSlots.map((s,i)=>s===id?i:-1).filter(i=>i>=0).map(i=>String(i).padStart(2,'0')).join(', '));
  const sprite=parts.length?`${parts.length} sprite part${parts.length===1?'':'s'}`:'';
  return [slots.join(' · '),sprite].filter(Boolean).join(' · ');
 }
 function render(){
  if(host.hidden)return;
  $('paletteLibraryCount').textContent=`${paletteLibrary.length} palette${paletteLibrary.length===1?'':'s'} · a bank can use 16 at once`;
  const rows=$('paletteRows');
  while(rows.children.length>paletteLibrary.length)rows.lastElementChild.remove();
  paletteLibrary.forEach((palette,index)=>{
   let row=rows.children[index];
   if(!row){
    row=document.createElement('div');row.className='paletteRow';row.setAttribute('role','listitem');
    const name=document.createElement('input');name.className='paletteName';name.maxLength=48;name.setAttribute('aria-label','Palette name');
    const chips=document.createElement('div');chips.className='paletteChips';
    for(let i=0;i<8;i++){const chip=document.createElement('button');chip.dataset.ink=i;chips.append(chip);}
    const use=document.createElement('span');use.className='paletteUse';
    const actions=document.createElement('div');actions.className='rowActions';
    for(const [key,label] of [['duplicate','Duplicate'],['delete','Delete']]){const b=document.createElement('button');b.dataset.action=key;b.textContent=label;actions.append(b);}
    row.append(name,chips,use,actions);rows.append(row);
   }
   const {banks,parts}=usage(palette.id),used=banks.length||parts.length;
   row.classList.toggle('unusedPalette',!used);
   const name=row.querySelector('.paletteName');
   if(document.activeElement!==name)name.value=palette.name;
   name.onchange=()=>rename(palette,name);
   row.querySelectorAll('[data-ink]').forEach(chip=>{
    const ink=Number(chip.dataset.ink);
    chip.style.background=css565(palette.colors[ink]);
    chip.title=ink===0?`${palette.name} color 0 — drawn on background tiles, transparent for sprites and the overlay`:`${palette.name} color ${ink}`;
    chip.setAttribute('aria-label',chip.title);
    chip.onclick=()=>{editing={palette,ink};$('paletteLibraryColor').value=css565ToInput(palette.colors[ink]);$('paletteLibraryColor').click();};
   });
   row.querySelector('.paletteUse').textContent=describe(palette.id);
   row.querySelector('[data-action="duplicate"]').onclick=()=>duplicate(palette);
   const remove=row.querySelector('[data-action="delete"]');
   remove.disabled=!!used||paletteLibrary.length===1;
   remove.title=used?'In use: '+describe(palette.id)+'. Rebind those slots and parts first.':paletteLibrary.length===1?'A project keeps at least one palette.':'Delete this palette';
   remove.onclick=()=>destroy(palette);
  });
 }
 function rename(palette,input){
  const name=input.value.trim();
  if(!name||paletteLibrary.some(p=>p!==palette&&p.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique, nonempty palette name.');input.value=palette.name;return;}
  graphicsEdit(()=>palette.name=name);render();
 }
 function duplicate(palette){
  graphicsEdit(()=>createPalette(palette.colors,uniquePaletteName()));
  setStatus('Added a copy of '+palette.name+'. Bind it from a bank slot to use it.');render();
 }
 function destroy(palette){
  if(!confirm('Delete palette "'+palette.name+'"?'))return;
  graphicsEdit(()=>paletteLibrary.splice(paletteLibrary.indexOf(palette),1));render();
 }
 $('newPalette').onclick=()=>{graphicsEdit(()=>createPalette(Array(8).fill(0)));setStatus('Added a palette. Bind it from a bank slot to use it.');render();};
 $('paletteLibraryColor').onchange=()=>{if(!editing)return;const {palette,ink}=editing;graphicsEdit(()=>palette.colors[ink]=inputTo565($('paletteLibraryColor').value));render();};
 // Undo lives on the bank editor's rail, which this view does not show.
 window.addEventListener('keydown',event=>{
  if(currentView!=='palettes'||!(event.metaKey||event.ctrlKey)||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;
  event.preventDefault();event.stopImmediatePropagation();
  (key==='y'||event.shiftKey?$('bankRedo'):$('bankUndo')).click();render();
 },true);
 const oldShow=showView;
 showView=function(view){oldShow(view);host.hidden=view!=='palettes';render();};
 window.renderPaletteLibrary=render;
})();
