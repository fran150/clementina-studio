// One undo history for the whole project — the project is the document, as
// in any editor — shared by every workspace, so Ctrl/Cmd+Z, the rails' Undo
// buttons and Edit ▸ Undo all mean the same thing. An entry snapshots only
// the parts of the project its edit touches, taken just before the edit, and
// is labeled with where the edit happened for the status message.
(() => {
 const parts={
  palettes:{get:()=>({paletteLibrary,paletteConfigs,activeConfigId}),set:v=>{paletteLibrary=v.paletteLibrary;paletteConfigs=v.paletteConfigs;activeConfigId=v.activeConfigId;}},
  tilesets:{get:()=>tilesets,set:v=>{tilesets=v;}},
  shapes:{get:()=>shapes,set:v=>{shapes=v;}},
  animations:{get:()=>animations,set:v=>{animations=v;}},
  backgrounds:{get:()=>backgrounds,set:v=>{backgrounds=v;}},
  overlays:{get:()=>overlays,set:v=>{overlays=v;}},
 };
 const LIMIT=100;
 let undo=[],redo=[];
 const capture=names=>JSON.stringify(Object.fromEntries(names.map(name=>[name,parts[name].get()])));
 // Every Undo and Redo button says which step it would take.
 const BUTTONS={undo:['bankUndo','palUndo','scUndo','anUndo','bgUndo','ovUndo'],redo:['bankRedo','palRedo','scRedo','anRedo','bgRedo','ovRedo']};
 function changed(){
  for(const [kind,ids] of Object.entries(BUTTONS)){
   const entry=(kind==='undo'?undo:redo).at(-1),keys=kind==='undo'?'Ctrl/Cmd+Z':'Ctrl/Cmd+Shift+Z';
   const title=entry?`${kind==='undo'?'Undo':'Redo'} ${entry.label} (${keys})`:`Nothing to ${kind} (${keys})`;
   for(const id of ids){const b=document.getElementById(id);if(b){b.title=title;b.setAttribute('aria-label',title);b.disabled=!entry;}}
  }
  document.dispatchEvent(new Event('studiohistorychange'));
 }
 function step(from,to,verb){
  const entry=from.pop();if(!entry)return;
  to.push({...entry,state:capture(entry.parts)});
  for(const [name,value] of Object.entries(JSON.parse(entry.state)))parts[name].set(value);
  // Editors clamp their indices and drop transient state, then everything
  // redraws: an edit in one asset shows up wherever it is used.
  document.dispatchEvent(new Event('studiohistory'));
  markDirty();redrawAll();renderAnimations();
  setStatus(`${verb}: ${entry.label}.`);changed();
 }
 window.ProjectHistory=Object.freeze({
  /** Records the named parts of the project before an edit changes them. */
  checkpoint(names,label){undo.push({parts:names,label,state:capture(names)});if(undo.length>LIMIT)undo.shift();redo=[];changed();},
  undo:()=>step(undo,redo,'Undone'),
  redo:()=>step(redo,undo,'Redone'),
  canUndo:()=>undo.length>0,
  canRedo:()=>redo.length>0,
  /** How many steps Undo can take back. */
  depth:()=>undo.length,
  /** A new or opened project starts with an empty history. */
  clear(){undo=[];redo=[];changed();},
 });

 // Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes in every
 // workspace; text fields keep their own undo.
 window.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName)||document.querySelector('dialog[open]'))return;
  const key=event.key.toLowerCase();if(key!=='z'&&key!=='y')return;
  event.preventDefault();event.stopImmediatePropagation();
  if(key==='y'||event.shiftKey)window.ProjectHistory.redo();else window.ProjectHistory.undo();
 },true);
})();
