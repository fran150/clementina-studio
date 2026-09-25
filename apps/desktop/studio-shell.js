// Shared presentation and interaction primitives. Asset data stays in the editors.
(() => {
 function setIcon(button,path,label,{size=27,viewBox='0 0 24 24',rounded=true}={}){
  button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML=`<svg viewBox="${viewBox}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" ${rounded?'stroke-linecap="round" stroke-linejoin="round"':''} aria-hidden="true">${path}</svg>`;
  return button;
 }
 function iconButton(id,label,path,options){
  const button=document.createElement('button');button.type='button';button.id=id;
  return setIcon(button,path,label,options);
 }
 function toolRail(id,label){
  const rail=document.createElement('nav');rail.id=id;rail.className='studioToolRail';rail.setAttribute('aria-label',label);return rail;
 }
 const projectIcons={newFile:'<path d="M5 2h11l5 5v17H5zM16 2v6h5M9 15h8M13 11v8"/>',openFile:'<path d="M3 7h8l2 3h9v3H7L3 23V7zM3 23h17l4-10H7"/>',saveFile:'<path d="M3 3h17l3 3v17H3zM7 3v7h11V3M7 23v-9h12v9M15 5v3"/>',saveAs:'<path d="M3 3h16l3 3v6M3 3v20h8M7 3v7h10V3M7 20v-6h6M14 20l7-7 3 3-7 7-4 1z"/>'};
 for(const [id,name,label] of [['newBtn','newFile','New project'],['nativeOpen','openFile','Open project…'],['nativeSave','saveFile','Save project (Ctrl/Cmd+S)'],['nativeSaveAs','saveAs','Save project as… (Ctrl/Cmd+Shift+S)']]){setIcon($(id),projectIcons[name],label,{size:30,viewBox:'0 0 26 26'});$(id).classList.add('projectIcon');}
 $('nativeOpen').before($('newBtn'));
 const panels=new Map();
 function bindPanel({panel,button,closeId=button.id+'Close',closeClass='panelClose',group,closeGroups=[]}){
  if(!panel.id)panel.id=button.id+'Panel';
  button.setAttribute('aria-controls',panel.id);
  const setOpen=(open,restoreFocus=false)=>{
   panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
   if(!open&&restoreFocus)button.focus();
  };
  const close=iconButton(closeId,'Close panel','<path d="m6 6 12 12M18 6 6 18"/>');
  close.className=closeClass;close.onclick=()=>setOpen(false,true);panel.prepend(close);
  button.onclick=()=>{
   const open=panel.hidden;
   if(open)for(const other of panels.values())if(other.panel!==panel&&closeGroups.includes(other.group))other.setOpen(false);
   setOpen(open);
  };
  panel.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();setOpen(false,true);}
  });
  panels.set(panel,{panel,button,group,setOpen});setOpen(!panel.hidden);
  return {setOpen};
 }
 function selectView(view){
  document.body.classList.add('studioWorkspace');
  document.querySelectorAll('#workflowNav [data-view]').forEach(button=>{
   if(button.dataset.view===view)button.setAttribute('aria-current','page');
   else button.removeAttribute('aria-current');
  });
 }
 document.querySelector('#workflowNav')?.setAttribute('aria-label','Editors');
 const status=document.querySelector('#status');
 status?.setAttribute('role','status');status?.setAttribute('aria-live','polite');
 const tooltip=document.createElement('div');tooltip.id='studioTooltip';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;document.body.append(tooltip);let tipTimer,tipTarget;
 function hideTip(){clearTimeout(tipTimer);tooltip.hidden=true;tipTarget=null;}
 function showTip(target){hideTip();const text=target.title||target.getAttribute('aria-label')||target.textContent.trim();if(!text)return;tipTarget=target;tipTimer=setTimeout(()=>{if(!target.isConnected)return;tooltip.textContent=text;tooltip.hidden=false;const r=target.getBoundingClientRect(),w=tooltip.offsetWidth,h=tooltip.offsetHeight;tooltip.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left+r.width/2-w/2))+'px';tooltip.style.top=(r.bottom+h+12<innerHeight?r.bottom+7:Math.max(6,r.top-h-7))+'px';},300);}
 document.addEventListener('pointerover',e=>{const b=e.target.closest?.('button,summary');if(b&&b!==tipTarget)showTip(b);});document.addEventListener('pointerout',e=>{if(tipTarget&&!tipTarget.contains(e.relatedTarget))hideTip();});document.addEventListener('focusin',e=>{const b=e.target.closest?.('button,summary');if(b)showTip(b);});document.addEventListener('focusout',hideTip);document.addEventListener('pointerdown',hideTip);window.addEventListener('blur',hideTip);document.addEventListener('keydown',hideTip);document.addEventListener('scroll',hideTip,true);

 // A selectable, optionally renameable list of named items — the palette,
 // tileset, composition, background, overlay, placeholder, animation and
 // shape libraries are all one of these. Rows are reused in place rather
 // than recreated so a render triggered mid-double-click does not swap the
 // node out from under the pointer, which would reset the browser's
 // dblclick count.
 //
 // options: {
 //   selected(item,i) -> boolean   which row shows as selected
 //   choose(item,i)                click / Enter
 //   rename(i,newName) -> any      optional; enables dblclick / F2 rename
 //   render()                      re-render, called once a rename commits, is
 //                                 cancelled or is rejected — required when
 //                                 `rename` is given
 //   content(row,item)             optional custom row body; defaults to
 //                                 `row.textContent = item.name`
 //   maxLength                     rename input's maxlength, default 48
 // }
 function renderList(container,items,options){
  const {selected,choose,rename,render,content,maxLength=48}=options;
  while(container.children.length>items.length)container.lastElementChild.remove();
  items.forEach((item,i)=>{
   let row=container.children[i];
   if(!row){row=document.createElement('div');row.className='assetRow';row.tabIndex=0;row.setAttribute('role','option');container.append(row);}
   row.dataset.index=i;row.setAttribute('aria-selected',String(selected(item,i)));
   if(!row.querySelector('input')){if(content)content(row,item);else row.textContent=item.name;}
   row.onclick=e=>{if(e.target.tagName!=='INPUT')choose(item,i);};
   row.ondblclick=rename?(e=>{if(e.target.tagName!=='INPUT')startRename(container,i,item.name,rename,render,maxLength);}):null;
   row.onkeydown=e=>{
    if(e.target.tagName==='INPUT')return;
    if(e.key==='Enter'){e.preventDefault();choose(item,i);}
    if(rename&&e.key==='F2'){e.preventDefault();startRename(container,i,item.name,rename,render,maxLength);}
   };
  });
 }
 // The one piece every rename form needs to get right: the input this
 // creates must be gone from the row — via the unconditional `render()` at
 // the end of `finish` — whether the rename is saved, cancelled, or
 // rejected by `rename` itself. Leaving it in place is what let a rename
 // get permanently stuck as a textbox.
 function startRename(container,i,name,rename,render,maxLength=48){
  const row=container.children[i];if(!row||row.querySelector('input'))return;
  const input=document.createElement('input');input.value=name;input.maxLength=maxLength;input.setAttribute('aria-label','Rename '+name);
  row.replaceChildren(input);let done=false;
  const finish=save=>{
   if(done)return;done=true;const value=input.value.trim();row.textContent=name;
   if(save&&value!==name)rename(i,value);
   render();
  };
  input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish(true);}if(e.key==='Escape'){e.preventDefault();finish(false);}};
  input.onblur=()=>finish(true);input.focus();input.select();
 }

 window.StudioShell=Object.freeze({iconButton,setIcon,toolRail,bindPanel,selectView,renderList,startRename});
})();
