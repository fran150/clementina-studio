import {PALETTE_BANKS, PALETTE_COLORS, createConfig} from './palettes.js';
export const BANK_BYTES = 6144, TILES_PER_BANK = 256, PROJECT_VERSION = 2;
/**
 * Studio's project model, in the hardware's vocabulary — see docs/model.md.
 * A tileset is one CHR bank's worth of graphics; a palette bank is one of the
 * sixteen entries of palette RAM; a config names a palette for each bank.
 * Tiles carry no color, so a sprite part chooses its palette bank where it is
 * placed, exactly as the OAM attribute byte does.
 */
export interface ProjectPalette { id:string; name:string; colors:number[] }
/** A named palette RAM layout: the palette in each of the sixteen banks. */
export interface PaletteBankConfig { id:string; name:string; banks:(string|null)[] }
export interface Tileset {
 id?:string; name:string; bpp:number; chr:number[]; previewBackground?:string;
 /** Per tile, the palette bank it was drawn against. Authoring only, never exported. */
 tilePaletteBanks:number[];
 compositions:{name:string;x:number;y:number;width:number;height:number}[];
}
export interface SpritePart { spriteId?:number; tile:number; x:number; y:number; paletteBank:number; flipX:boolean; flipY:boolean }
export interface SpriteFrame { ticks:number; parts:SpritePart[] }
/** A character or object built from one tileset's tiles; sprites share one CHR bank. */
export interface SpriteGroup { tilesetId?:string; canvasPixelWidth?:number; canvasPixelHeight?:number; originAnchor?:string; canvasWidth?:number; canvasHeight?:number; originX?:number; originY?:number; name:string; frames:SpriteFrame[] }
export interface StudioProject { paletteLibrary:ProjectPalette[]; paletteConfigs:PaletteBankConfig[]; activeConfigId?:string; tilesets:Tileset[]; sprites:SpriteGroup[]; animations:SpriteGroup[] }

function integers(a: unknown, length: number, max: number): a is number[] {
 return Array.isArray(a) && a.length === length && a.every(v => Number.isInteger(v) && v >= 0 && v <= max);
}
function range(n:unknown,min:number,max:number):boolean {return Number.isInteger(n) && Number(n)>=min && Number(n)<=max;}

export function validateProject(p: StudioProject): void {
 if(!p||typeof p!=='object')throw Error('Invalid Studio project');
 validatePaletteLibrary(p.paletteLibrary);
 validatePaletteConfigs(p.paletteConfigs,p.paletteLibrary);
 if(p.activeConfigId!==undefined&&!p.paletteConfigs.some(c=>c.id===p.activeConfigId))throw Error('The active config is not in the project');
 validateTilesets(p.tilesets);
 validateGroups(p.animations??[],p.tilesets);
 validateGroups(p.sprites??[],p.tilesets);
 if(p.sprites?.some(s=>s.frames.length!==1))throw Error("Static sprites must have exactly one frame");
}

export function validatePaletteLibrary(library:ProjectPalette[]):void {
 if(!Array.isArray(library))throw Error('Invalid palette library');
 const ids=new Set<string>(),names=new Set<string>();
 for(const p of library){
  if(!p||typeof p.id!=='string'||!p.id.length||ids.has(p.id))throw Error('Palette identities must be unique');
  ids.add(p.id);
  if(typeof p.name!=='string'||!p.name.trim()||names.has(p.name.toLowerCase()))throw Error('Palette names must be unique and non-empty');
  names.add(p.name.toLowerCase());
  if(!integers(p.colors,PALETTE_COLORS,65535))throw Error('Palettes hold exactly eight RGB565 colors');
 }
}

export function validatePaletteConfigs(configs:PaletteBankConfig[],library:ProjectPalette[]=[]):void {
 if(!Array.isArray(configs))throw Error('Invalid palette bank configs');
 const paletteIds=new Set(library.map(p=>p.id));
 const ids=new Set<string>(),names=new Set<string>();
 for(const c of configs){
  if(!c||typeof c.id!=='string'||!c.id.length||ids.has(c.id))throw Error('Config identities must be unique');
  ids.add(c.id);
  if(typeof c.name!=='string'||!c.name.trim()||names.has(c.name.toLowerCase()))throw Error('Config names must be unique and non-empty');
  names.add(c.name.toLowerCase());
  // A bank may hold nothing, and two banks may hold the same palette: banks are
  // an authored layout, not a set.
  if(!Array.isArray(c.banks)||c.banks.length!==PALETTE_BANKS||c.banks.some(b=>b!==null&&!paletteIds.has(b)))
   throw Error('A config names a palette, or nothing, for each of the sixteen palette banks');
 }
}

export function validateTilesets(tilesets:Tileset[]):void {
 if(!Array.isArray(tilesets))throw Error('Invalid tileset library');
 const names=new Set<string>(),ids=new Set<string>();
 for(const t of tilesets){
  if(!t||typeof t.name!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(t.name)||names.has(t.name.toLowerCase()))throw Error('Tileset names must be unique file names: letters, digits, underscores, hyphens');
  names.add(t.name.toLowerCase());
  if(t.id!==undefined){if(typeof t.id!=='string'||!t.id.length||ids.has(t.id))throw Error('Invalid tileset identity');ids.add(t.id);}
  if(t.previewBackground!==undefined&&!/^#[0-9a-f]{6}$/i.test(t.previewBackground))throw Error('Invalid preview background');
  if(![1,3].includes(t.bpp))throw Error('A tileset is 1bpp or 3bpp');
  // tilePaletteBanks are absolute palette bank numbers, meaningful under
  // whichever config is loaded, so 0-15 is the whole constraint.
  if(!integers(t.chr,BANK_BYTES,255)||!integers(t.tilePaletteBanks,TILES_PER_BANK,PALETTE_BANKS-1)||!Array.isArray(t.compositions))throw Error('Invalid tileset data');
  const cn=new Set<string>();
  for(const c of t.compositions){if(!c||typeof c.name!=='string'||!c.name.trim()||cn.has(c.name)||!range(c.x,0,15)||!range(c.y,0,15)||!range(c.width,1,16-c.x)||!range(c.height,1,16-c.y))throw Error('Invalid composition');cn.add(c.name);}
 }
}

export function validateGroups(groups:SpriteGroup[],tilesets:Tileset[]=[]):void {
 if(!Array.isArray(groups)||groups.length>255)throw Error('At most 255 sprite groups are supported');
 const tilesetIds=new Set(tilesets.map(t=>t.id).filter(Boolean) as string[]);
 const names=new Set<string>();
 for(const g of groups){
  if(!g||typeof g.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(g.name)||names.has(g.name.toUpperCase()))throw Error('Sprite group names must be unique assembly identifiers (1–32 characters)');
  names.add(g.name.toUpperCase());
  // Sprites all read one CHR bank, so a group draws from exactly one tileset.
  if(g.tilesetId!==undefined&&!tilesetIds.has(g.tilesetId))throw Error('A sprite group draws from one tileset in the project');
  if(!Array.isArray(g.frames)||g.frames.length<1||g.frames.length>255)throw Error('Invalid frame count');
  for(const k of ['canvasWidth','canvasHeight'] as const)if(g[k]!==undefined&&!range(g[k],1,128))throw Error('Invalid sprite canvas size');
  for(const k of ['originX','originY'] as const)if(g[k]!==undefined&&!range(g[k],-32768,32767))throw Error('Invalid sprite origin');
  if(g.canvasPixelWidth!==undefined&&!range(g.canvasPixelWidth,1,320)||g.canvasPixelHeight!==undefined&&!range(g.canvasPixelHeight,1,200))throw Error('Invalid sprite canvas pixel dimensions');
  if(g.originAnchor!==undefined&&!['top-left','center','bottom-center','custom'].includes(g.originAnchor))throw Error('Invalid sprite origin anchor');
  for(const f of g.frames){
   if(!f||!range(f.ticks,1,255)||!Array.isArray(f.parts)||f.parts.length>64)throw Error('Frames require 1–255 ticks and at most 64 parts');
   const ids=f.parts.map((p,i)=>p.spriteId??i);if(new Set(ids).size!==ids.length||ids.some(id=>!range(id,0,255)))throw Error('Sprite IDs must be unique within a group');
   for(const part of f.parts){
    // X is 10-bit signed and Y 9-bit signed in OAM; the high bits live in ext.
    if(!part||!range(part.tile,0,TILES_PER_BANK-1)||!range(part.x,-512,511)||!range(part.y,-256,255)||typeof part.flipX!=='boolean'||typeof part.flipY!=='boolean')throw Error('Invalid sprite part');
    if(!range(part.paletteBank,0,PALETTE_BANKS-1))throw Error('A sprite part names a palette bank 0-15');
   }
  }
 }
}

export function encodeProject(p:StudioProject):string {
 validateProject(p);
 return JSON.stringify({format:'clementina-studio',version:PROJECT_VERSION,
  paletteLibrary:p.paletteLibrary,paletteConfigs:p.paletteConfigs,activeConfigId:p.activeConfigId,
  tilesets:p.tilesets,sprites:p.sprites,animations:p.animations})+'\n';
}
export function decodeProject(text:string):StudioProject {
 const p=JSON.parse(text);
 if(p?.format!=='clementina-studio')throw Error('Not a Studio project');
 // Version 1 stored palettes per bank and eight fixed CHR banks, a model with
 // no equivalent here. Studio is unreleased, so those files are rejected
 // rather than migrated; re-import the source graphics instead.
 if(p.version!==PROJECT_VERSION)throw Error(`Unsupported Studio project version ${p.version}; this Studio writes version ${PROJECT_VERSION}`);
 validateProject(p);
 // Return the model alone: format and version describe the file, not the project.
 const {format,version,...project}=p;return project;
}

/** A project with one rainbow-free empty config, enough to open an editor on. */
export function emptyProject():StudioProject {
 const paletteLibrary:ProjectPalette[]=[],paletteConfigs:PaletteBankConfig[]=[];
 const config=createConfig(paletteConfigs,paletteLibrary,'Default');
 return {paletteLibrary,paletteConfigs,activeConfigId:config.id,tilesets:[],sprites:[],animations:[]};
}

/** A PRG wraps CHR data in a CPU load header; its address is not a CHR bank. */
export function importTilesetPrg(bytes:Uint8Array):{chr:number[];bpp:number;address:number;bank?:number}{
 if(bytes.length<2)throw Error('PRG is missing its load address');
 const address=bytes[0]|bytes[1]<<8;
 if(address>=0xc000)throw Error('Unsupported PRG load address');
 const header=address>=0x8000?3:2;
 if(header===3&&(bytes.length<3||bytes[2]<1||bytes[2]>31))throw Error('Invalid PRG bank header');
 const payload=bytes.subarray(header);
 if(payload.length!==2048&&payload.length!==BANK_BYTES)throw Error('Expected 2048 bytes of 1bpp tiles or 6144 bytes of 3bpp tiles after the PRG header');
 const chr=Array(BANK_BYTES).fill(0);chr.splice(0,payload.length,...payload);
 return {chr,bpp:payload.length===2048?1:3,address,...(header===3?{bank:bytes[2]}:{})};
}

/** PRG carries an address header; raw BIN/CHR contains exactly one tileset payload. */
export function importTilesetFile(bytes:Uint8Array,extension:string):{chr:number[];bpp:number}{
 const ext=extension.toLowerCase().replace(/^\./,'');if(ext==='prg')return importTilesetPrg(bytes);
 if(!['bin','chr'].includes(ext))throw Error('Choose a PRG, BIN or CHR tileset file.');
 if(bytes.length!==2048&&bytes.length!==BANK_BYTES)throw Error('Raw tilesets must contain exactly 2048 (1bpp) or 6144 (3bpp) bytes.');
 const chr=Array(BANK_BYTES).fill(0);chr.splice(0,bytes.length,...bytes);return {chr,bpp:bytes.length===2048?1:3};
}

// ---------------------------------------------------------------------------
// Attribute encoding. Background cells and sprites carry the same fields at
// different bit positions, so each gets its own encoder. The build step that
// writes them to files comes later; these are hardware facts, kept here with
// their tests so they do not have to be re-derived.
// ---------------------------------------------------------------------------

/** OAM byte 3: palette 0-3, priority 4, flip X 5, flip Y 6 — not the background layout. */
export function spriteAttr(part:SpritePart):number{
 return (part.paletteBank&15)|(part.flipX?32:0)|(part.flipY?64:0);
}
/** OAM byte 4: X high bits 0-1, Y high bit 2, disable 3. */
export function spriteExt(part:SpritePart):number{
 return ((part.x>>8)&3)|(((part.y>>8)&1)<<2);
}
/** Background and overlay cells: palette 0-3, flip X 4, flip Y 5, priority 6, CHR_ALT 7. */
export function cellAttr(cell:{paletteBank:number;flipX:boolean;flipY:boolean;priority?:boolean;chrAlt?:boolean}):number{
 return (cell.paletteBank&15)|(cell.flipX?16:0)|(cell.flipY?32:0)|(cell.priority?64:0)|(cell.chrAlt?128:0);
}

