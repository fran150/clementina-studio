// Palette RAM is one global resource: 16 banks of 8 RGB565 colors, shared by
// background tiles, sprites and the overlay. A project holds any number of
// named palettes and any number of named bank configs; a config says which
// palette sits in each of the 16 banks. Nothing else binds a palette to a
// bank — a tile records the bank number it was drawn against, and what that
// number looks like depends on the config in force. See docs/model.md.
import type {PaletteBankConfig, ProjectPalette} from './index.js';
export const PALETTE_BANKS = 16, PALETTE_COLORS = 8;
const BLACK: number[] = Array(PALETTE_COLORS).fill(0);

/** Colors of one bank under a config; a bank holding nothing reads as black. */
export function bankColors(config:PaletteBankConfig|undefined,library:ProjectPalette[],bank:number):number[]{
 const palette=library.find(p=>p.id===config?.banks?.[bank]);
 return palette?palette.colors:BLACK;
}
/** Flattens a config to the 128 values palette RAM expects, padding empty banks. */
export function resolveConfig(config:PaletteBankConfig|undefined,library:ProjectPalette[]):number[]{
 const out:number[]=[];
 for(let bank=0;bank<PALETTE_BANKS;bank++)out.push(...bankColors(config,library,bank));
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
 return uniqueName(library.map(p=>p.name),'Palette');
}
export function uniqueConfigName(configs:PaletteBankConfig[]):string{
 return uniqueName(configs.map(c=>c.name),'Config');
}
function uniqueName(taken:string[],stem:string):string{
 const used=new Set(taken.map(n=>n.toLowerCase()));
 let n=1;while(used.has(`${stem.toLowerCase()} ${n}`))n++;
 return `${stem} ${n}`;
}
/**
 * A new config. Banks are filled from the library in order, so a fresh project
 * can paint immediately; a library shorter than 16 leaves the rest empty.
 */
export function createConfig(configs:PaletteBankConfig[],library:ProjectPalette[],name?:string,banks?:(string|null)[]):PaletteBankConfig{
 const config={id:crypto.randomUUID(),name:name??uniqueConfigName(configs),
  banks:banks?[...banks]:Array.from({length:PALETTE_BANKS},(_,i)=>library[i]?.id??null)};
 configs.push(config);return config;
}
/**
 * Builds a config from 128 flat RGB565 values, reusing library palettes whose
 * colors already match so edits stay shared instead of forking a private copy.
 * Two banks of one config may name the same palette: banks are an authored
 * layout, and a game is free to spend two of them on identical colors.
 */
export function configFromFlat(configs:PaletteBankConfig[],library:ProjectPalette[],flat:number[],name?:string):PaletteBankConfig{
 const banks=Array.from({length:PALETTE_BANKS},(_,bank)=>{
  const colors=flat.slice(bank*PALETTE_COLORS,(bank+1)*PALETTE_COLORS);
  return internPalette(library,colors).id;
 });
 return createConfig(configs,library,name,banks);
}
/** Clears a palette from every bank of every config, for a delete with no replacement. */
export function unbindPalette(configs:PaletteBankConfig[],id:string):number{
 let cleared=0;
 for(const config of configs)config.banks=config.banks.map(bank=>bank===id?(cleared++,null):bank);
 return cleared;
}
/** Repoints every bank naming one palette at another. Returns how many moved. */
export function repointPalette(configs:PaletteBankConfig[],fromId:string,toId:string):number{
 let moved=0;
 for(const config of configs)config.banks=config.banks.map(bank=>bank===fromId?(moved++,toId):bank);
 return moved;
}
/** Which configs place a palette, and in which banks — for the library's usage line. */
export function paletteUsage(configs:PaletteBankConfig[],id:string):{config:PaletteBankConfig;banks:number[]}[]{
 return configs.map(config=>({config,banks:config.banks.flatMap((bank,i)=>bank===id?[i]:[])}))
  .filter(entry=>entry.banks.length>0);
}
