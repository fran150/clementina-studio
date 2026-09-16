// Palette RAM is one global resource: 16 slots of 8 RGB565 colors, shared by
// background tiles, sprites and the overlay. A bank stores which library
// palette sits in each slot, never the colors themselves.
import type {BankAsset, ProjectPalette, TileProject} from './index.js';
export const PALETTE_SLOTS = 16, PALETTE_COLORS = 8;

/** Colors of one slot; a slot bound to nothing yet reads as black. */
export function slotColors(bank:BankAsset,library:ProjectPalette[],slot:number):number[]{
 const palette=library.find(p=>p.id===bank.paletteSlots?.[slot]);
 return palette?palette.colors:Array(PALETTE_COLORS).fill(0);
}
/** Flattens a bank's binding to the 128 values palette RAM expects, padding slots it does not bind. */
export function resolveBankPalettes(bank:BankAsset,library:ProjectPalette[]):number[]{
 const out:number[]=[];
 for(let slot=0;slot<PALETTE_SLOTS;slot++)out.push(...slotColors(bank,library,slot));
 return out;
}
export function createPalette(library:ProjectPalette[],colors:number[],name?:string):ProjectPalette{
 const palette={id:crypto.randomUUID(),name:name??uniquePaletteName(library),colors:[...colors]};
 library.push(palette);return palette;
}
/** Adds a palette, reusing an existing entry when the colors already exist. */
export function internPalette(library:ProjectPalette[],colors:number[],name?:string):ProjectPalette{
 return library.find(p=>p.colors.every((v,i)=>v===colors[i]))??createPalette(library,colors,name);
}
export function uniquePaletteName(library:ProjectPalette[]):string{
 const taken=new Set(library.map(p=>p.name.toLowerCase()));
 let n=1;while(taken.has('palette '+n))n++;
 return 'Palette '+n;
}
/**
 * Rebinds a bank from 128 flat values, reusing library palettes whose colors
 * already match so edits stay shared instead of forking a private copy. Two
 * slots of one bank never collapse onto a single palette even when their
 * colors match, because the editor treats each slot as independently editable.
 */
export function bindFlatPalettes(bank:BankAsset,library:ProjectPalette[],flat:number[],count=PALETTE_SLOTS):void{
 const taken=new Set<string>();
 bank.paletteSlots=Array.from({length:count},(_,slot)=>{
  const colors=flat.slice(slot*PALETTE_COLORS,(slot+1)*PALETTE_COLORS);
  const match=library.find(p=>!taken.has(p.id)&&p.colors.every((v,i)=>v===colors[i]));
  const palette=match??createPalette(library,colors);
  taken.add(palette.id);return palette.id;
 });
}
/**
 * Drops slots that repeat a palette already bound earlier and points the tiles
 * that used them at the survivor, so a bank never spends two of its sixteen
 * hardware slots on identical colors.
 */
export function compactBankSlots(bank:BankAsset):void{
 const keep:string[]=[],moved:number[]=[];
 for(const id of bank.paletteSlots??[]){
  const at=keep.indexOf(id);
  if(at>=0)moved.push(at);else{moved.push(keep.length);keep.push(id);}
 }
 bank.paletteSlots=keep;
 bank.cellPalettes=bank.cellPalettes.map(slot=>moved[slot]??0);
}
/** Unbinds one slot; tiles above it shift down to keep pointing at their palette. */
export function removeBankSlot(bank:BankAsset,slot:number):void{
 if(bank.cellPalettes.includes(slot))throw Error('That palette slot is still painted on tiles in this bank.');
 bank.paletteSlots=(bank.paletteSlots??[]).filter((_,i)=>i!==slot);
 bank.cellPalettes=bank.cellPalettes.map(v=>v>slot?v-1:v);
}
/**
 * Moves legacy per-bank palette colors into the shared library. Banks that
 * happened to hold identical colors collapse onto one entry, so editing a
 * color now reaches every bank that was showing it.
 */
export function migrateProjectPalettes(project:TileProject):TileProject{
 const library=project.paletteLibrary??[];
 for(const bank of project.bankAssets??[]){
  if(!bank.paletteSlots&&bank.palettes)bindFlatPalettes(bank,library,bank.palettes);
  delete bank.palettes;
 }
 if(project.bankAssets)project.paletteLibrary=library;
 // A group part used to carry its source bank's slot number, which meant
 // different colors per bank; it now names the palette itself.
 for(const group of [...project.sprites??[],...project.animations??[]])
  for(const frame of group.frames)for(const part of frame.parts){
   if(!part.bankId||part.paletteId)continue;
   const bank=project.bankAssets?.find(b=>b.id===part.bankId);
   part.paletteId=bank?.paletteSlots?.[part.palette??0]??library[0]?.id;
   delete part.palette;
  }
 return project;
}
