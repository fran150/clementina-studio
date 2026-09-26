// Shared presentation and interaction primitives. Asset data stays in the editors.
(() => {
 // One glyph per concept, and each glyph means one thing everywhere: an asset
 // type looks the same on its library button in every editor, and a tool or
 // action looks the same in every rail. Drawn on a 26-unit grid; a glyph
 // drawn on 24 units is centered with c().
 const c=path=>`<g transform="translate(1 1)">${path}</g>`;
 const icons=Object.freeze({
  // Assets, as their library and picker panels show them.
  palette:c('<path d="M12 3a9 9 0 0 0 0 18h2a2 2 0 0 0 2-2 2 2 0 0 1 2-2h1a3 3 0 0 0 3-3 8 8 0 0 0-8-8z"/><circle cx="7.5" cy="12" r="1.2" fill="currentColor"/><circle cx="9.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="7" r="1.2" fill="currentColor"/><circle cx="17.5" cy="11" r="1.2" fill="currentColor"/>'),
  bankConfig:c('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  tileset:'<path d="M5 2h11l5 5v17H5zM16 2v6h5"/><path d="M8 12h10v8H8zM13 12v8M8 16h10"/>',
  tilePicker:c('<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>'),
  background:c('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 17 5-6 4 4 3-3 6 6"/><circle cx="16" cy="9" r="1.6"/>'),
  overlay:c('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M6 8h5M15 8h3M6 16h12"/>'),
  shape:c('<path d="M9 3h6v5H9zM6 8h12v7H6zM7 15h4v6H7zM13 15h4v6h-4z"/>'),
  animation:c('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4v16M16 4v16"/><path d="M3 9h5M16 9h5M3 15h5M16 15h5"/>'),
  placeholder:c('<rect x="3" y="7" width="18" height="10" rx="1" stroke-dasharray="3 2"/><path d="M7 12h7"/>'),
  // Panels showing the current selection's properties.
  drawOrder:c('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>'),
  camera:c('<rect x="2" y="6" width="14" height="12" rx="1"/><path d="m16 10 6-3v10l-6-3"/>'),
  properties:c('<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
  // Tools.
  move:c('<path d="m5 3 13 7.5-5.5 1.8L10 18z"/>'),
  select:'<rect x="3" y="3" width="19" height="19" stroke-dasharray="3 3"/>',
  pencil:'<path d="m4 16 12-12 4 4L8 20H4zM13 7l4 4"/>',
  eraser:'<path d="m3 15 9-10a2 2 0 0 1 3 0l7 6a2 2 0 0 1 0 3l-6 7H9z"/><path d="m8 10 10 8M9 21h14"/><path d="m3 15 5-5 10 8-3 3H9z" fill="currentColor" opacity=".3"/>',
  fill:'<path d="m4 12 8-8 9 9-8 8z"/><path d="M7 9V5a3 3 0 0 1 6 0v3M4 12h16"/><path d="M22 14c-1 2-3 4-3 6a3 3 0 0 0 6 0c0-2-2-4-3-6z" fill="currentColor"/><path d="m5 13 8 7 7-7" fill="currentColor" opacity=".3"/>',
  line:'<path d="M4 20 20 4"/>',
  rectangle:'<rect x="3" y="5" width="18" height="14"/>',
  ellipse:'<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  picker:'<path d="m15 4 2-2a3 3 0 0 1 4 4l-2 2 2 2-3 3-7-7 3-3z" fill="currentColor"/><path d="m12 8-9 9v4h4l9-9M3 21l-1 2"/>',
  place:c('<rect x="4" y="12" width="16" height="9"/><path d="M12 2v8M8.5 6.5 12 10l3.5-3.5"/>'),
  placeholderTool:c('<rect x="2" y="7" width="15" height="10" rx="1" stroke-dasharray="3 2"/><path d="M20 3v6M17 6h6"/>'),
  origin:c('<circle cx="12" cy="12" r="3"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>'),
  // Playback.
  play:c('<path d="M7 4l13 8-13 8z" fill="currentColor"/>'),
  pause:c('<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'),
  previous:c('<path d="M6 5v14"/><path d="M19 5 9 12l10 7z" fill="currentColor"/>'),
  next:c('<path d="M18 5v14"/><path d="M5 5l10 7-10 7z" fill="currentColor"/>'),
  pan:'<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10V6a2 2 0 0 0-4 0v8c0 4 2 7 7 7s7-3 7-7v-4a2 2 0 0 0-4 0v1"/>',
  // Actions.
  undo:'<path d="M9 5 3 11l6 6M3 11h11a7 7 0 0 1 7 7"/>',
  redo:'<path d="m15 5 6 6-6 6M21 11H10a7 7 0 0 0-7 7"/>',
  copy:'<rect x="8" y="8" width="14" height="14"/><path d="M17 8V3H3v14h5"/>',
  paste:'<path d="M9 5H5v18h16V5h-4"/><rect x="9" y="2" width="8" height="5" rx="1"/>',
  newItem:c('<path d="M12 4v16M4 12h16"/>'),
  duplicate:c('<rect x="8" y="8" width="13" height="13" rx="1"/><path d="M16 8V4H3v13h5M14.5 11.5v6M11.5 14.5h6"/>'),
  import:c('<path d="M12 3v10m0 0-3.5-3.5M12 13l3.5-3.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>'),
  delete:c('<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v8M14 10v8"/>'),
  close:c('<path d="m6 6 12 12M18 6 6 18"/>'),
  // Transforms and arrangement of the selection.
  flipH:'<path d="M13 2v22" stroke-dasharray="2 2"/><path d="m3 6 7 7-7 7zM23 6l-7 7 7 7z"/>',
  flipV:'<path d="M2 13h22" stroke-dasharray="2 2"/><path d="m6 3 7 7 7-7zM6 23l7-7 7 7z"/>',
  rotate:'<path d="M20 8a9 9 0 1 0 2 9M20 2v6h-6"/><rect x="8" y="10" width="8" height="8"/>',
  priority:c('<rect x="3" y="9" width="12" height="12"/><rect x="9" y="3" width="12" height="12" fill="currentColor" fill-opacity=".35"/>'),
  front:c('<path d="M12 20V9M6 14l6-6 6 6"/><path d="M5 3h14"/>'),
  forward:c('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  backward:c('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  back:c('<path d="M12 4v11M6 10l6 6 6-6"/><path d="M5 21h14"/>'),
  earlier:c('<path d="M19 12H5M11 5l-7 7 7 7"/>'),
  later:c('<path d="M5 12h14M13 5l7 7-7 7"/>'),
  // View.
  grid:c('<rect x="3" y="3" width="18" height="18"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke-dasharray="1.5 1.5"/>'),
  snap:c('<path d="M4 4h16M4 12h16M4 20h16M4 4v16M12 4v16M20 4v16"/><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>'),
  settings:'<path d="M3 6h20M3 13h20M3 20h20"/><rect x="7" y="3" width="4" height="6" fill="var(--panel)"/><rect x="16" y="10" width="4" height="6" fill="var(--panel)"/><rect x="8" y="17" width="4" height="6" fill="var(--panel)"/>',
  miniature:'<rect x="2" y="4" width="22" height="18"/><rect x="6" y="8" width="7" height="7"/><path d="M16 8h3M16 12h3M16 16h3"/>',
 });
 // `path` is an icon name above, or — for the project file icons — raw markup.
 function setIcon(button,path,label,{size=27,viewBox='0 0 26 26',rounded=true}={}){
  button.title=label;button.setAttribute('aria-label',label);
  button.innerHTML=`<svg viewBox="${viewBox}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" ${rounded?'stroke-linecap="round" stroke-linejoin="round"':''} aria-hidden="true">${icons[path]??path}</svg>`;
  return button;
 }
 function iconButton(id,label,path,options){
  const button=document.createElement('button');button.type='button';button.id=id;
  return setIcon(button,path,label,options);
 }
 function toolRail(id,label,side='left'){
  const rail=document.createElement('nav');rail.id=id;rail.className='studioToolRail'+(side==='right'?' studioRightRail':'');rail.setAttribute('aria-label',label);return rail;
 }
 // Every rail reads the same way: groups separated by a rule — panel
 // toggles, then tools — and edit actions (copy, paste, undo, redo) pinned
 // to the bottom. A right rail holds the selection's panels and transforms.
 function railLayout(rail,groups,actions=[]){
  const children=[];
  for(const group of groups.filter(g=>g.length)){if(children.length)children.push(document.createElement('hr'));children.push(...group);}
  const spacer=document.createElement('div');spacer.className='railSpacer';
  rail.replaceChildren(...children,spacer,...actions);
 }
 const projectIcons={newFile:'<path d="M5 2h11l5 5v17H5zM16 2v6h5M9 15h8M13 11v8"/>',openFile:'<path d="M3 7h8l2 3h9v3H7L3 23V7zM3 23h17l4-10H7"/>',saveFile:'<path d="M3 3h17l3 3v17H3zM7 3v7h11V3M7 23v-9h12v9M15 5v3"/>',saveAs:'<path d="M3 3h16l3 3v6M3 3v20h8M7 3v7h10V3M7 20v-6h6M14 20l7-7 3 3-7 7-4 1z"/>'};
 for(const [id,name,label] of [['newBtn','newFile','New project (Ctrl/Cmd+N)'],['nativeOpen','openFile','Open project… (Ctrl/Cmd+O)'],['nativeSave','saveFile','Save project (Ctrl/Cmd+S)'],['nativeSaveAs','saveAs','Save project as… (Ctrl/Cmd+Shift+S)']]){setIcon($(id),projectIcons[name],label,{size:30,viewBox:'0 0 26 26'});$(id).classList.add('projectIcon');}
 $('nativeOpen').before($('newBtn'));
 // The project's file actions sit at the end of the editor tabs, which frees
 // the row they used to fill below them.
 const projectActions=document.createElement('div');projectActions.className='navProject';
 projectActions.append($('newBtn'),$('nativeOpen'),$('nativeSave'),$('nativeSaveAs'));
 // The bank config every editor previews with is one global choice, so it
 // sits with the tabs rather than in each editor.
 $('workflowNav').append($('configPickerWrap'),projectActions);
 const panels=new Map();
 // asset: the dock shows a part of the open asset (its map, the tiles it
 // draws from, its properties) rather than the list of assets, so it steps
 // aside while the editor has nothing open (see emptyEditor).
 function bindPanel({panel,button,closeId=button.id+'Close',closeClass='panelClose',group,closeGroups=[],asset=false}){
  if(!panel.id)panel.id=button.id+'Panel';
  if(asset){panel.classList.add('studioAssetDock');button.classList.add('studioAssetDockToggle');}
  button.setAttribute('aria-controls',panel.id);
  const setOpen=(open,restoreFocus=false)=>{
   panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
   if(!open&&restoreFocus)button.focus();
  };
  const close=iconButton(closeId,'Close panel','close');
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
 // An editor with nothing open shows only its empty state and the list of
 // assets: the asset's own docks hide, keeping whether they were open for
 // when there is something to show, and their buttons are disabled.
 function emptyEditor(host,empty){
  host.classList.toggle('studioIsEmpty',empty);
  for(const b of host.querySelectorAll('.studioAssetDockToggle'))b.disabled=empty;
 }
 // Each editor's status line — sizes, counts, what is under the pointer —
 // shows in the one status bar, beside the app's messages.
 const viewStatuses=new Map();
 function viewStatus(view,element){viewStatuses.set(view,element);$('viewStatus').append(element);element.hidden=view!==currentView;}
 function selectView(view){
  document.body.classList.add('studioWorkspace');
  for(const [key,element] of viewStatuses)element.hidden=key!==view;
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
 //   duplicate(item,i), remove(item,i)
 //                                 optional; offered with Rename on the row's
 //                                 right-click menu, remove also on Delete
 // }
 function renderList(container,items,options){
  const {selected,choose,rename,render,content,maxLength=48,duplicate,remove}=options;
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
    if(remove&&(e.key==='Delete'||e.key==='Backspace')){e.preventDefault();remove(item,i);}
   };
   row.oncontextmenu=rename||duplicate||remove?(e=>{
    if(e.target.tagName==='INPUT')return;e.preventDefault();
    contextMenu(e.clientX,e.clientY,[
     rename&&{label:'Rename',hint:'F2',run:()=>startRename(container,i,item.name,rename,render,maxLength)},
     duplicate&&{label:'Duplicate',run:()=>duplicate(item,i)},
     remove&&{label:'Delete',hint:'Delete',run:()=>remove(item,i)},
    ].filter(Boolean));
   }):null;
  });
 }
 // Shortcut hints the way each platform writes them: ⌘C on a Mac, Ctrl+C
 // elsewhere. A spec says Mod+ for Ctrl/Cmd.
 const MAC=/Mac/.test(navigator.platform);
 const keyHint=spec=>MAC?spec.replace('Mod+','⌘').replace('Shift+','⇧').replace('Alt+','⌥'):spec.replace('Mod+','Ctrl+');
 // A small menu at (x, y): items are {label, hint, run, disabled}, and '-'
 // draws a separator. It closes on a choice, Escape, a click elsewhere or
 // scrolling, and is keyboard-navigable.
 let openMenu=null;
 function closeMenu(){openMenu?.remove();openMenu=null;}
 function contextMenu(x,y,items){
  closeMenu();const menu=document.createElement('div');menu.className='studioMenu';menu.setAttribute('role','menu');
  for(const item of items){
   if(item==='-'){menu.append(document.createElement('hr'));continue;}
   const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.disabled=!!item.disabled;
   b.append(Object.assign(document.createElement('span'),{textContent:item.label}),Object.assign(document.createElement('kbd'),{textContent:keyHint(item.hint??'')}));
   b.onclick=()=>{closeMenu();item.run();};menu.append(b);
  }
  menu.onkeydown=e=>{
   const buttons=[...menu.querySelectorAll('button:not(:disabled)')],at=buttons.indexOf(document.activeElement);
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();buttons[(at+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}
  };
  document.body.append(menu);openMenu=menu;
  menu.style.left=Math.min(x,innerWidth-menu.offsetWidth-6)+'px';menu.style.top=Math.min(y,innerHeight-menu.offsetHeight-6)+'px';
  menu.querySelector('button:not(:disabled)')?.focus();
 }
 document.addEventListener('pointerdown',e=>{if(openMenu&&!openMenu.contains(e.target))closeMenu();},true);
 window.addEventListener('blur',closeMenu);document.addEventListener('scroll',closeMenu,true);

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

 // Canvas navigation, the same in every zoomable editor: the wheel or a
 // two-finger swipe pans, and a pinch or Ctrl/Cmd+wheel zooms around the
 // pointer — a trackpad pinch arrives as a wheel event with ctrlKey set.
 // Space-drag, the middle button and the Pan tool stay with each editor.
 //
 // Whole-number steps above 100% keep every art pixel the same size on
 // screen; below it the steps halve, for art bigger than the window.
 const ZOOM_STEPS=[0.25,0.5,1,2,3,4,6,8,12,16,24,32];
 const zoomSteps=(min,max)=>ZOOM_STEPS.filter(z=>z>=min&&z<=max);
 function stepZoom(zoom,direction,min,max){
  const steps=zoomSteps(min,max);
  return direction>0?steps.find(z=>z>zoom)??steps.at(-1):steps.findLast(z=>z<zoom)??steps[0];
 }
 /** The largest step at which `width × height` art pixels fit the available space. */
 function fitZoom(availableWidth,availableHeight,width,height,min=ZOOM_STEPS[0],max=ZOOM_STEPS.at(-1)){
  const steps=zoomSteps(min,max);
  return steps.findLast(z=>width*z<=availableWidth&&height*z<=availableHeight)??steps[0];
 }
 // For a canvas inside a native scroll container: changes the zoom through
 // `apply`, then scrolls so the art under (clientX, clientY) — the view's
 // center when omitted — stays under it.
 function zoomScrolled(scroller,content,from,to,apply,clientX,clientY){
  const view=scroller.getBoundingClientRect();
  clientX??=view.left+scroller.clientWidth/2;clientY??=view.top+scroller.clientHeight/2;
  const before=content.getBoundingClientRect(),x=(clientX-before.left)/from,y=(clientY-before.top)/from;
  apply(to);
  const after=content.getBoundingClientRect();
  scroller.scrollLeft+=after.left+x*to-clientX;scroller.scrollTop+=after.top+y*to-clientY;
 }
 // A mouse notch zooms one step. A pinch follows the fingers: Chromium turns
 // each pinch update into a Ctrl+wheel event with deltaY = 100·ln(scale)
 // (components/input/touchpad_pinch_event_queue.cc), so the gesture's
 // running scale is recovered exactly and the canvas shows the step nearest
 // it. A step changes only once the fingers are clearly past the midpoint
 // between two steps, so the zoom holds still where the gesture stops.
 // wheelDelta cannot tell the two apart: Chromium gives every pinch event
 // a whole ±120 tick, the same as a mouse notch.
 //
 // Without `pan` the plain wheel is left to scroll the element natively,
 // momentum included; `pan(dx, dy)` is for canvases with their own camera.
 function canvasWheel(element,{get,steps,zoomTo,pan,busy}){
  let gesture=null,lastAt=-Infinity;
  const HYSTERESIS=0.12;// in ln(zoom) units, about 12%
  element.addEventListener('wheel',event=>{
   const unit=event.deltaMode===1?16:event.deltaMode===2?element.clientHeight:1;
   if(event.ctrlKey||event.metaKey){
    event.preventDefault();if(busy()||!event.deltaY)return;
    const delta=event.deltaY*unit,current=get();
    // A mouse notch is at least 40 px on macOS (kScrollbarPixelsPerCocoaTick)
    // and 100 elsewhere; one pinch update is a few units.
    if(event.deltaMode!==0||Math.abs(delta)>=30){
     gesture=null;
     const next=delta<0?steps.find(z=>z>current)??steps.at(-1):steps.findLast(z=>z<current)??steps[0];
     if(next!==current)zoomTo(next,event.clientX,event.clientY);
     return;
    }
    if(!gesture||event.timeStamp-lastAt>250)gesture={target:Math.log(current)};
    lastAt=event.timeStamp;
    gesture.target=Math.max(Math.log(steps[0]),Math.min(Math.log(steps.at(-1)),gesture.target-delta/100));
    const distance=z=>Math.abs(Math.log(z)-gesture.target);
    const nearest=steps.reduce((a,b)=>distance(b)<distance(a)?b:a);
    if(nearest!==current&&distance(nearest)<distance(current)-HYSTERESIS)zoomTo(nearest,event.clientX,event.clientY);
    return;
   }
   if(!pan)return;
   event.preventDefault();
   let dx=event.deltaX*unit,dy=event.deltaY*unit;
   if(event.shiftKey&&!dx){dx=dy;dy=0;}
   pan(dx,dy);
  },{passive:false});
 }
 const canvasCommands=new Map();
 // One editor's zoom: the Fit, 100%, −, level, + cluster every canvas editor
 // shows in the middle of its top bar, the wheel, and the View menu's zoom
 // commands. `ids` names the cluster's elements; missing ones are created.
 // `set(zoom, clientX, clientY)` applies a level, keeping that point — the
 // view's center when omitted — in place; `fit()` applies the fitting one.
 // Returns the cluster and a `sync()` for the editor's render.
 function canvasZoom({view,ids,min=ZOOM_STEPS[0],max=ZOOM_STEPS.at(-1),get,set,fit,wheel,pan,busy=()=>false}){
  const group=document.createElement('div');group.className='studioZoom';
  const make=(key,tag,text,label)=>{
   const el=$(ids[key])??Object.assign(document.createElement(tag),{id:ids[key]});
   if(tag==='button'){el.type='button';el.textContent=text;el.title=label;el.setAttribute('aria-label',label);}
   group.append(el);return el;
  };
  const fitButton=make('fit','button','Fit','Zoom to fit (Ctrl/Cmd+0)'),actual=make('actual','button','100%','Actual size (Ctrl/Cmd+Alt+0)');
  const out=make('zoomOut','button','−','Zoom out (Ctrl/Cmd+−)'),level=make('label','span'),into=make('zoomIn','button','+','Zoom in (Ctrl/Cmd+=)');
  const step=(direction,clientX,clientY)=>{const next=stepZoom(get(),direction,min,max);if(next!==get())set(next,clientX,clientY);};
  const actualSize=()=>{const next=Math.max(min,Math.min(max,1));if(next!==get())set(next);};
  fitButton.onclick=()=>fit();actual.onclick=actualSize;out.onclick=()=>step(-1);into.onclick=()=>step(1);
  canvasWheel(wheel,{get,steps:zoomSteps(min,max),zoomTo:set,pan,busy});
  canvasCommands.set(view,{zoomIn:()=>step(1),zoomOut:()=>step(-1),zoomFit:()=>fit(),zoomActual:actualSize});
  return {group,sync(){const zoom=get();level.textContent=Math.round(zoom*100)/100+'×';out.disabled=zoom<=min;into.disabled=zoom>=max;}};
 }
 /** Runs a View menu zoom command against the canvas `view` shows, if it has one. */
 function canvasCommand(view,command){canvasCommands.get(view)?.[command]?.();}

 // The palette dock the background, overlay and shape editors show — and,
 // with its own color-level picking, the tileset editor: one row per palette
 // bank, its label and eight colors, in a .bankSwatches grid. These editors
 // pick a whole bank, so a click anywhere on a row picks it. A cyan ring
 // (.chosenBank) marks the bank painting or the selection uses; a dot
 // (.usedBank) the banks the asset on screen already uses.
 const TRANSPARENT_ZERO='linear-gradient(135deg,white 43%,#e32636 44%,#e32636 56%,white 57%)';
 function bankDock(container,pick){
  if(container.children.length===16)return;
  container.classList.add('bankSwatches');
  container.replaceChildren(...Array.from({length:16},(_,bank)=>{
   const row=document.createElement('div');row.className='paletteGroup';row.dataset.palette=bank;row.tabIndex=0;row.setAttribute('role','button');
   const label=document.createElement('span');label.textContent=String(bank).padStart(2,'0');row.append(label);
   for(let ink=0;ink<8;ink++){const swatch=document.createElement('i');swatch.dataset.palette=bank;swatch.dataset.ink=ink;row.append(swatch);}
   const choose=()=>{if(!row.classList.contains('disabled'))pick(bank);};
   row.onclick=choose;row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose();}};
   return row;
  }));
 }
 // color(bank, ink) → CSS color; transparentZero draws color 0 as the
 // transparent swatch, for layers where it shows what is behind.
 function syncBankDock(container,{color,transparentZero=false,chosen=null,used=null,title,disabled=false}){
  container.querySelectorAll('.paletteGroup').forEach(row=>{
   const bank=Number(row.dataset.palette);
   row.querySelectorAll('[data-ink]').forEach((swatch,ink)=>{swatch.style.background=ink===0&&transparentZero?TRANSPARENT_ZERO:color(bank,ink);});
   row.classList.toggle('chosenBank',bank===chosen);row.classList.toggle('usedBank',!!used?.has(bank));
   row.classList.toggle('disabled',disabled);row.setAttribute('aria-disabled',String(disabled));
   row.title=title(bank);row.setAttribute('aria-label',row.title);
  });
 }

 // The app's clipboard: one item tagged with its kind, so a paste only lands
 // where that kind of thing fits — cells in the background and overlay
 // editors, sprites in shapes, frames in animations, palettes and colors in
 // the palette editor. Copies go in and out by value.
 let clip=null;
 const clipboard=Object.freeze({
  set(kind,data){clip={kind,data:structuredClone(data)};document.dispatchEvent(new Event('studioclipboard'));},
  get(kind){return clip?.kind===kind?structuredClone(clip.data):null;},
  has(kind){return clip?.kind===kind;},
 });

 // Edit ▸ Cut, Copy and Paste, clicked in the menu, reach the page as the
 // browser's own clipboard events. Outside a text field they run the current
 // editor's command — the same one its keyboard shortcut runs; the shortcuts
 // themselves are handled first, so a key press never runs both.
 const editCommands=new Map();
 function editActions(view,commands){editCommands.set(view,commands);}
 for(const type of ['cut','copy','paste'])document.addEventListener(type,event=>{
  const target=event.target;if(/INPUT|TEXTAREA|SELECT/.test(target?.tagName)||target?.isContentEditable)return;
  const run=editCommands.get(currentView)?.[type];if(!run)return;
  event.preventDefault();run();
 });

 // The keyboard shortcut sheet: the keys that work everywhere, then the
 // current editor's. Opened with ?, Ctrl/Cmd+/, Help ▸ Keyboard Shortcuts or
 // any editor's ? button.
 const SHORTCUTS={
  everywhere:[['Ctrl/Cmd+N, O, S, Shift+S','New, open, save, save as'],['Ctrl/Cmd+Z','Undo'],['Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y','Redo'],['Ctrl/Cmd+C, X, V','Copy, cut, paste'],['Scroll or two-finger swipe','Pan the canvas (Shift: sideways)'],['Pinch or Ctrl/Cmd+scroll','Zoom around the pointer'],['Ctrl/Cmd+= / −','Zoom in / out'],['Ctrl/Cmd+0 · Ctrl/Cmd+Alt+0','Zoom to fit · actual size'],['Ctrl/Cmd+1 … 6','Palettes, Tilesets, Shapes, Animations, Backgrounds, Overlays'],['Space-drag or middle-drag','Pan with any tool'],['F2 or double-click','Rename a library item; right-click for more'],['? or Ctrl/Cmd+/','This list']],
  tiles:[['S · B · E · G','Select · pencil · eraser · fill'],['L · R · O · I · H','Line · rectangle · ellipse · pick color · pan'],['Shift while drawing','Square or circle'],['Right-click','Erase with a painting tool; otherwise the edit menu'],['Shift+H · Shift+V','Flip the selection'],['Ctrl/Cmd+A','Select all'],['Arrows','Move the selection'],['Delete','Clear the selection'],['Ctrl/Cmd+Shift+V','Paste with the source palettes'],['Escape','Drop the selection or paste']],
  backgrounds:[['S · B · E · G','Select · pencil · eraser · fill'],['R · I · H','Rectangle · pick tile · pan'],['Right-click','Erase with a painting tool; otherwise the edit menu'],['Shift+H · Shift+V','Flip the selection, or the next stamp'],['Ctrl/Cmd+A','Select all'],['Drag inside the selection · arrows','Move it'],['Delete','Clear the selection'],['Escape','Drop the selection or paste']],
  shapes:[['V · S · H','Select and move · box select · pan'],['Shift-click','Add or remove a sprite'],['Right-click','The edit menu'],['Shift+H · Shift+V','Flip the selected sprites'],['Ctrl/Cmd+A','Select all sprites'],['Ctrl/Cmd+D','Duplicate'],['Arrows','Nudge one pixel'],['Delete','Remove'],['Escape','Back to Select and move']],
  animations:[['Space','Play or pause'],['← · →','Previous · next frame'],['Alt+← · → on a frame','Move it earlier · later'],['Ctrl/Cmd+D','Duplicate the frame'],['Delete','Remove the frame'],['Right-click a frame','The frame menu']],
  palettes:[['Ctrl/Cmd+C · V','Copy · paste the palette, or the focused color'],['Right-click a color','Copy, paste or edit it']],
 };
 SHORTCUTS.overlays=SHORTCUTS.backgrounds;
 const shortcutSheet=document.createElement('dialog');shortcutSheet.id='shortcutHelp';document.body.append(shortcutSheet);
 function showShortcuts(){
  if(shortcutSheet.open)return;
  const names={tiles:'Tilesets',palettes:'Palettes',overlays:'Overlays',backgrounds:'Backgrounds',shapes:'Shapes',animations:'Animations'};
  const table=(title,rows)=>`<h3>${title}</h3><dl>${rows.map(([keys,what])=>`<dt>${keys}</dt><dd>${what}</dd>`).join('')}</dl>`;
  shortcutSheet.innerHTML=`<h2>Keyboard shortcuts</h2>${table('Everywhere',SHORTCUTS.everywhere)}${table(names[currentView],SHORTCUTS[currentView]??[])}<form method="dialog"><button>Close</button></form>`;
  shortcutSheet.showModal();
 }
 function helpButton(){const b=document.createElement('button');b.type='button';b.className='studioHelp';b.textContent='?';b.title='Keyboard shortcuts (?)';b.setAttribute('aria-label','Keyboard shortcuts');b.onclick=showShortcuts;return b;}
 window.addEventListener('keydown',e=>{
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
  if((e.key==='?'&&!e.ctrlKey&&!e.metaKey)||((e.ctrlKey||e.metaKey)&&e.key==='/')){e.preventDefault();e.stopImmediatePropagation();showShortcuts();}
 },true);

 window.StudioShell=Object.freeze({icons,clipboard,editActions,viewStatus,contextMenu,showShortcuts,helpButton,bankDock,syncBankDock,TRANSPARENT_ZERO,iconButton,setIcon,toolRail,railLayout,bindPanel,emptyEditor,selectView,renderList,startRename,fitZoom,zoomScrolled,canvasZoom,canvasCommand});
})();
