export const BANK_BYTES = 6144;
export interface SpritePart { bankId?:string; spriteId?:number; tile:number; x:number; y:number; palette:number; flipX:boolean; flipY:boolean }
export interface SpriteFrame { ticks:number; parts:SpritePart[] }
export interface SpriteAnimation { bankIds?:string[]; canvasPixelWidth?:number; canvasPixelHeight?:number; originAnchor?:string; canvasWidth?:number; canvasHeight?:number; originX?:number; originY?:number; name:string; bank:number; plane:number; frames:SpriteFrame[] }
export interface BankAsset { id?:string; previewBackground?:string; name:string; mode:number; plane:number; chr:number[]; palettes:number[]; cellPalettes:number[]; compositions:{name:string;x:number;y:number;width:number;height:number}[] }
export interface TileProject { bankAssets?:BankAsset[]; sprites?:SpriteAnimation[]; animations?:SpriteAnimation[]; chr: number[]; palettes: number[]; modes: number[]; planes: number[] }
function integers(a: unknown, length: number, max: number): a is number[] {
 return Array.isArray(a) && a.length === length && a.every(v => Number.isInteger(v) && v >= 0 && v <= max);
}
export function validateProject(p: TileProject): void {
 if (!p || !integers(p.chr, 49152, 255) || !integers(p.palettes,128,65535) ||
 !integers(p.modes,8,3) || !p.modes.every(n=>n===1||n===3) || !integers(p.planes,8,2)) throw new Error('Invalid tile project');
 validateBankAssets(p.bankAssets);
 validateAnimations(p.animations ?? []);
 validateAnimations(p.sprites ?? []);
 if(p.sprites?.some(s=>s.frames.length!==1))throw Error("Static sprites must have exactly one frame");
}
export function encodeMtb(p: TileProject): Uint8Array {
 validateProject(p);
 const out = new Uint8Array(32+49152+256);
 out.set([77,84,66,50,2,8,1]); out.set(p.modes,8); out.set(p.planes,16); out.set(p.chr,32);
 const view = new DataView(out.buffer);
 p.palettes.forEach((v,i)=>view.setUint16(32+49152+i*2,v,true)); return out;
}
export function runtimePackage(p: TileProject): Record<string,Uint8Array> {
 validateProject(p);
 const files: Record<string,Uint8Array> = animationPackage(p.animations ?? []);
 const staticFiles=animationPackage(p.sprites??[]);
 files['SPRITES.BIN']=staticFiles['ANIMATIONS.BIN'];
 files['sprites.inc']=new TextEncoder().encode(new TextDecoder().decode(staticFiles['assets.inc']).replaceAll('ANIM_', 'SPRITE_').replaceAll('ANIMATION_COUNT','SPRITE_COUNT').replaceAll('ANIMATIONS.BIN','SPRITES.BIN'));
 if(p.bankAssets) return {...files,...bankAssetPackage(p.bankAssets)};
 const lines = ['10 REM CLEMENTINA STUDIO RUNTIME ASSETS'];
 let line=20;
 for(let bank=0;bank<8;bank++) {
  files[`BANK${bank}.CHR`]=Uint8Array.from(p.chr.slice(bank*BANK_BYTES,(bank+1)*BANK_BYTES));
  lines.push(`${line} CHRLOAD ${bank},0,6144,"BANK${bank}.CHR"`); line+=10;
  lines.push(`${line} CHRMODE ${bank},${p.modes[bank]===1?1:0}`); line+=10;
 }
 for(let bank=0;bank<16;bank++) {
  const bytes=new Uint8Array(16), view=new DataView(bytes.buffer);
  for(let i=0;i<8;i++) view.setUint16(i*2,p.palettes[bank*8+i],true);
  files[`PAL${bank}.BIN`]=bytes;
  lines.push(`${line} PALLOAD ${bank},0,16,"PAL${bank}.BIN"`); line+=10;
 }
 lines.push(`${line} REM SELECT LAYER BANKS AND CHRPLANES FOR YOUR GAME`);
 files['LOADER.bas.txt']=new TextEncoder().encode(lines.join('\n')+'\n');
 files['README.txt']=new TextEncoder().encode('Runtime assets, not firmware defaults. Run the loader with this folder as the current SD directory. LOADER.bas.txt is plain BASIC source: enter it into BASIC and SAVE it, or use a compatible tokenizer before LOAD. This package loads all eight CHR banks and all palettes, including console banks. Layer bank/plane selection and launching GAME.PRG remain game-specific.\n');
 return files;
}

function range(n:unknown,min:number,max:number):boolean {return Number.isInteger(n) && Number(n)>=min && Number(n)<=max;}
export function validateAnimations(animations:SpriteAnimation[]):void {
 if(!Array.isArray(animations)||animations.length>255)throw Error('At most 255 animations are supported');
 const names=new Set<string>();
 for(const a of animations){
  if(!a||typeof a.name!=='string'||!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(a.name)||names.has(a.name.toUpperCase()))throw Error('Animation names must be unique assembly identifiers (1–32 characters)');
  names.add(a.name.toUpperCase());
  if(!range(a.bank,0,7)||!range(a.plane,0,2)||!Array.isArray(a.frames)||a.frames.length<1||a.frames.length>255)throw Error('Invalid animation bank, plane, or frame count');
  for(const k of ['canvasWidth','canvasHeight'] as const)if(a[k]!==undefined&&!range(a[k],1,128))throw Error('Invalid sprite canvas size');
  for(const k of ['originX','originY'] as const)if(a[k]!==undefined&&!range(a[k],-32768,32767))throw Error('Invalid sprite origin');
  if(a.bankIds!==undefined&&(!Array.isArray(a.bankIds)||a.bankIds.length>8||a.bankIds.some(id=>typeof id!=='string'||!id)||new Set(a.bankIds).size!==a.bankIds.length))throw Error('Group source banks must be up to eight unique asset IDs');
  if(a.canvasPixelWidth!==undefined&&!range(a.canvasPixelWidth,1,320)||a.canvasPixelHeight!==undefined&&!range(a.canvasPixelHeight,1,200))throw Error('Invalid sprite canvas pixel dimensions');
  if(a.originAnchor!==undefined&&!['top-left','center','bottom-center','custom'].includes(a.originAnchor))throw Error('Invalid sprite origin anchor');
  for(const f of a.frames){
   if(!f||!range(f.ticks,1,255)||!Array.isArray(f.parts)||f.parts.length>64)throw Error('Frames require 1–255 ticks and at most 64 parts');
   const ids=f.parts.map((p,i)=>p.spriteId??i);if(new Set(ids).size!==ids.length||ids.some(id=>!range(id,0,255)))throw Error('Sprite IDs must be unique within a group');
   for(const part of f.parts)if(!part||!range(part.tile,0,255)||!range(part.x,part.bankId?-32768:-128,part.bankId?32767:127)||!range(part.y,part.bankId?-32768:-128,part.bankId?32767:127)||(part.bankId!==undefined&&(typeof part.bankId!=='string'||!part.bankId.length))||!range(part.palette,0,15)||typeof part.flipX!=='boolean'||typeof part.flipY!=='boolean')throw Error('Invalid sprite part');
  }
 }
}
export function encodeProject(p:TileProject):string {
 validateProject(p);return JSON.stringify({format:'clementina-studio',version:1,...p,animations:p.animations??[],sprites:p.sprites??[]})+'\n';
}
export function decodeProject(text:string):TileProject {
 const p=JSON.parse(text);
 if(p?.format!=='clementina-studio'||p.version!==1)throw Error('Unsupported Studio project version');
 validateProject(p);return p;
}
export function animationPackage(animations:SpriteAnimation[]):Record<string,Uint8Array>{
 validateAnimations(animations);
 if(animations.some(a=>a.frames.some(f=>f.parts.some(p=>p.bankId))))throw Error('Logical sprite assets require the future memory-placement build step. Save the Studio project to preserve them.');
 const bytes:number[]=[67,83,65,49,animations.length];
 const symbols=['; Clementina sprite animations v1. Offsets relative to ANIMATIONS.BIN.',`ANIMATION_COUNT = ${animations.length}`];
 for(let id=0;id<animations.length;id++){
  const a=animations[id],name=a.name.toUpperCase();
  symbols.push(`ANIM_${name}_ID = ${id}`,`ANIM_${name}_OFFSET = ${bytes.length}`);
  bytes.push(a.bank,a.plane,a.frames.length);
  for(const f of a.frames){bytes.push(f.ticks,f.parts.length);for(const part of f.parts)bytes.push(part.tile,part.x&255,part.y&255,part.palette,(part.flipX?4:0)|(part.flipY?8:0));}
 }
 if(bytes.length>65535)throw Error('Animation data exceeds 65535 bytes');
 return {'ANIMATIONS.BIN':Uint8Array.from(bytes),'assets.inc':new TextEncoder().encode(symbols.join('\n')+'\n')};
}

export function validateBankAssets(assets:BankAsset[]|undefined):void {
 if(assets===undefined)return;
 if(!Array.isArray(assets))throw Error('Invalid bank library');
 const names=new Set<string>(),ids=new Set<string>();
 for(const a of assets){
  if(!a||typeof a.name!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(a.name)||names.has(a.name.toLowerCase()))throw Error('Bank names must be unique file names: letters, digits, underscores, hyphens');
  names.add(a.name.toLowerCase());
  if(a.id!==undefined){if(typeof a.id!=='string'||!a.id.length||ids.has(a.id))throw Error('Invalid bank asset identity');ids.add(a.id);}
  if(a.previewBackground!==undefined&&!/^#[0-9a-f]{6}$/i.test(a.previewBackground))throw Error('Invalid preview background');
  if(!integers(a.chr,6144,255)||!integers(a.palettes,128,65535)||!integers(a.cellPalettes,256,15)||![1,3].includes(a.mode)||!range(a.plane,0,2)||!Array.isArray(a.compositions))throw Error('Invalid bank data');
  const cn=new Set<string>();
  for(const c of a.compositions){if(!c||typeof c.name!=='string'||!c.name.trim()||cn.has(c.name)||!range(c.x,0,15)||!range(c.y,0,15)||!range(c.width,1,16-c.x)||!range(c.height,1,16-c.y))throw Error('Invalid composition');cn.add(c.name);}
 }
}
export function bankAssetPackage(assets:BankAsset[]):Record<string,Uint8Array>{
 validateBankAssets(assets);const files:Record<string,Uint8Array>={};
 for(const a of assets){
  files[a.name+'.CHR']=Uint8Array.from(a.chr);
  const palette=new Uint8Array(256),dv=new DataView(palette.buffer);a.palettes.forEach((v,i)=>dv.setUint16(i*2,v,true));files[a.name+'.PAL']=palette;
  files[a.name+'.ATTR']=Uint8Array.from(a.cellPalettes);
  files[a.name+'.json']=new TextEncoder().encode(JSON.stringify({name:a.name,mode:a.mode,plane:a.plane,layout:{columns:16,rows:16},cellPalettes:a.cellPalettes,compositions:a.compositions},null,2));
  files[a.name+'.loader.bas.txt']=new TextEncoder().encode(`10 REM EXAMPLE: LOAD ${a.name} INTO CHR SLOT 3\n20 CHRLOAD 3,0,6144,"${a.name}.CHR"\n30 CHRMODE 3,${a.mode===1?1:0}\n40 MIALOAD "${a.name}.PAL",256,256\n50 REM SELECT LAYER BANK AND PLANE IN YOUR GAME\n`);
 }
 files['BANKS-README.txt']=new TextEncoder().encode('Named CHR assets have no fixed memory slot. Each example loader independently uses slot 3 and replaces all 16 runtime palettes; adapt destinations to your game. Do not run all loaders to preload the library. ATTR files contain 256 palette indexes in 16-column authoring order, not a complete 40-column background map or OAM. Composition JSON preserves rectangles. BASIC files are source, not tokenized. The legacy sprite/animation exports still use their existing slot references.\n');return files;
}

/** A PRG wraps CHR data in a CPU load header; its address is not a CHR slot. */
export function importBankPrg(bytes:Uint8Array):{chr:number[];mode:number;address:number;bank?:number}{
 if(bytes.length<2)throw Error('PRG is missing its load address');
 const address=bytes[0]|bytes[1]<<8;
 if(address>=0xc000)throw Error('Unsupported PRG load address');
 const header=address>=0x8000?3:2;
 if(header===3&&(bytes.length<3||bytes[2]<1||bytes[2]>31))throw Error('Invalid PRG bank header');
 const payload=bytes.subarray(header);
 if(payload.length!==2048&&payload.length!==6144)throw Error('Expected 2048 bytes of 1bpp tiles or 6144 bytes of 3bpp tiles after the PRG header');
 const chr=Array(6144).fill(0);chr.splice(0,payload.length,...payload);
 return {chr,mode:payload.length===2048?1:3,address,...(header===3?{bank:bytes[2]}:{})};
}

/** PRG carries an address header; raw BIN/CHR contains exactly one bank payload. */
export function importBankFile(bytes:Uint8Array,extension:string):{chr:number[];mode:number}{
 const ext=extension.toLowerCase().replace(/^\./,'');if(ext==='prg')return importBankPrg(bytes);
 if(!['bin','chr'].includes(ext))throw Error('Choose a PRG, BIN or CHR bank file.');
 if(bytes.length!==2048&&bytes.length!==6144)throw Error('Raw banks must contain exactly 2048 (1bpp) or 6144 (3bpp) bytes.');
 const chr=Array(6144).fill(0);chr.splice(0,bytes.length,...bytes);return {chr,mode:bytes.length===2048?1:3};
}
