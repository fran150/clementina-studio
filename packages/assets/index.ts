import type {ShapeSprite, AnimationFrame as SDKAnimationFrame, PaletteAsset, PaletteConfigAsset} from '@clementina/assets';
import type {StudioProjectV2, StudioTileset, StudioShape, StudioBackground, StudioOverlay, StudioOverlayPlaceholder, ProjectAssetsBuild} from '@clementina/project';
export {fromStudioProjectV2, toStudioProjectV2} from '@clementina/project';
import {createConfig} from './palettes.js';
import type {Instrument, Sound, Song} from './audio.js';
export * from './audio.js';
export const BANK_BYTES = 6144, TILES_PER_BANK = 256, PROJECT_VERSION = 2;
export const MAX_BACKGROUND_DIMENSION = 1024, MAX_BACKGROUND_CELLS = 200000;
export const OVERLAY_COLUMNS = 40, OVERLAY_ROWS = 25, OVERLAY_CELLS = 1000;
/**
 * Studio's project model, in the hardware's vocabulary — see docs/model.md.
 * A tileset is one CHR bank's worth of graphics; a palette bank is one of the
 * sixteen entries of palette RAM; a config names a palette for each bank.
 * Tiles carry no color, so a sprite part chooses its palette bank where it is
 * placed, exactly as the OAM attribute byte does.
 */
// Portable fields and Studio v2 validation come from the SDK. Session-only
// data stays in the Studio project model.
export type ProjectPalette = Omit<PaletteAsset, 'format' | 'version'>;
export type PaletteBankConfig = Omit<PaletteConfigAsset, 'format' | 'version'>;
export type Tileset = StudioTileset;
export type Background = StudioBackground;
export type BackgroundCell = StudioBackground['cells'][number];
export type Overlay = StudioOverlay;
export type OverlayCell = StudioOverlay['cells'][number];
export type OverlayPlaceholder = StudioOverlayPlaceholder;
export type Sprite = ShapeSprite;
export type Shape = StudioShape;
export type AnimationFrame = SDKAnimationFrame;
export type Animation = StudioProjectV2['animations'][number];
/** The SDK Studio v2 model plus Studio Builder session settings. */
export type StudioProject = StudioProjectV2 & {instruments?: Instrument[]; sounds?: Sound[]; songs?: Song[]; builder?: ProjectAssetsBuild};

// The SDK owns Studio v2 compatibility validation. Keep these names for callers
// that already use Studio's asset package.
export {
 validateStudioProject as validateProject,
 validateStudioPaletteLibrary as validatePaletteLibrary,
 validateStudioPaletteConfigs as validatePaletteConfigs,
 validateStudioTilesets as validateTilesets,
 validateStudioBackgrounds as validateBackgrounds,
 validateStudioOverlays as validateOverlays,
 validateStudioShapes as validateShapes,
 validateStudioAnimations as validateAnimations,
} from '@clementina/project';
import {validateStudioProject as validateProject} from '@clementina/project';

export function encodeProject(p:StudioProject):string {
 validateProject(p);
 return JSON.stringify({format:'clementina-studio',version:PROJECT_VERSION,
  paletteLibrary:p.paletteLibrary,paletteConfigs:p.paletteConfigs,activeConfigId:p.activeConfigId,
  tilesets:p.tilesets,backgrounds:p.backgrounds,overlays:p.overlays,shapes:p.shapes,animations:p.animations,
  instruments:p.instruments??[],sounds:p.sounds??[],songs:p.songs??[],...(p.builder?{builder:p.builder}:{})})+'\n';
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
 return {paletteLibrary,paletteConfigs,activeConfigId:config.id,tilesets:[],backgrounds:[],overlays:[],shapes:[],animations:[],instruments:[],sounds:[],songs:[]};
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
export function spriteAttr(sprite:Sprite):number{
 return (sprite.paletteBank&15)|(sprite.flipX?32:0)|(sprite.flipY?64:0);
}
/** OAM byte 4: X high bits 0-1, Y high bit 2, disable 3. */
export function spriteExt(sprite:Sprite):number{
 return ((sprite.x>>8)&3)|(((sprite.y>>8)&1)<<2);
}
/** Background and overlay cells: palette 0-3, flip X 4, flip Y 5, priority 6, CHR_ALT 7. */
export function cellAttr(cell:{paletteBank:number;flipX:boolean;flipY:boolean;priority?:boolean;chrAlt?:boolean}):number{
 return (cell.paletteBank&15)|(cell.flipX?16:0)|(cell.flipY?32:0)|(cell.priority?64:0)|(cell.chrAlt?128:0);
}
