// Main-process Builder adapter. All validation, encoding and assembly belongs to the SDK.
import {mkdir, readFile, writeFile, readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {buildProject, planAssetBuild} from '@clementina/build';
import {assetPaths, checkProject, fromStudioProjectV2, toStudioProjectV2, type ClementinaProjectManifest, type PortableProject, type ProjectAssetsBuild} from '@clementina/project';
import {loadProject, saveProject} from '@clementina/project/node';
import {validateProject, type StudioProject} from '../../packages/assets/index.js';

export const defaultAssets = (): ProjectAssetsBuild => ({folder:'ASSETS',checks:true,slots:[],include:[]});
export function portableBuilderProject(studio:StudioProject, settings:ProjectAssetsBuild, name:string, existing?:PortableProject, builderAction=true) {
 const assets=fromStudioProjectV2(studio);
 const manifest:ClementinaProjectManifest=existing?structuredClone(existing.manifest):{
  format:'clementina-project',version:1,name:name||'Game',target:{machine:'clementina-6502'},
  program:{kind:'assembly',entry:'src/main.s'},assets:{palettes:[],paletteConfigs:[],tilesets:[],backgrounds:[],overlays:[],shapes:[],animations:[]},
  build:{outputDirectory:'build',assembly:{linkerConfig:'link.cfg',outputName:'game',loadAddress:0x1800,entrySymbol:'game_start'}},
 };
 for(const [kind,list] of Object.entries(assets)) {
  const key=kind as keyof typeof assets;
  if(existing&&(key==='instruments'||key==='sounds'||key==='songs')&&!list.length&&!Object.prototype.hasOwnProperty.call(existing.manifest.assets,key))continue;
  const paths=new Map((existing?.assets[key]??[]).map((asset,index)=>[asset.id,assetPaths(existing!.manifest,key)[index]]));
  manifest.assets[key]=(list as Array<{id:string}>).map(a=>paths.get(a.id)??`assets/${kind}/${encodeURIComponent(a.id)}.json`);
 }
 if(manifest.build&&(builderAction||manifest.build.assets||JSON.stringify(settings)!==JSON.stringify(defaultAssets())))manifest.build.assets=structuredClone(settings);
 return {manifest,assets};
}
export function inspectBuilder(studio:StudioProject, settings:ProjectAssetsBuild, name:string) {
 const project=portableBuilderProject(studio,settings,name);
 const checked=checkProject(project);
 const catalog=Object.entries({paletteConfig:'paletteConfigs',tileset:'tilesets',background:'backgrounds',overlay:'overlays',sprites:'tilesets',song:'songs',sound:'sounds'} as const).flatMap(([kind,key])=>project.assets[key].filter(a=>kind!=='sprites'||project.assets.shapes.some(s=>s.tilesetId===a.id)).map(a=>({kind,id:a.id,name:a.name})));
 const planned=checked.ok?planAssetBuild(project):checked;
 return {...planned,catalog};
}
export async function readBuilderFolder(root:string) {
 const files=await readdir(root);
 if(!files.length)return {settings:defaultAssets(),fresh:true};
 const opened=await readPortableStudioProject(root);
 if(!opened.portable.manifest.build?.assembly)throw Error('Choose an assembly project, or an empty folder for a new one.');
 return {settings:opened.project.builder??defaultAssets(),fresh:false,project:opened.project,name:opened.portable.manifest.name};
}
export async function readPortableStudioProject(root:string) {
 const loaded=await loadProject(root);
 if(!loaded.ok)throw Error(loaded.diagnostics.map(d=>`${d.source??''}${d.path}: ${d.message}`).join('\n'));
 const portable=loaded.value;
 const project:StudioProject={...toStudioProjectV2(portable.assets),builder:structuredClone(portable.manifest.build?.assets??defaultAssets())};
 validateProject(project);
 return {portable,project};
}
/** An asset the folder's clementina.yaml lists but the Studio project doesn't hold. */
export type RemovedAsset = {kind:string; id:string; name:string};
/** Whether a save may take these assets out of clementina.yaml. Their files stay in the folder. */
export type ConfirmRemoval = (removed:RemovedAsset[]) => boolean|Promise<boolean>;
/** Studio writes only the assets it holds, so a save drops every other asset the folder lists. */
export function assetsRemovedBySave(existing:PortableProject, project:PortableProject):RemovedAsset[] {
 return (Object.keys(existing.assets) as Array<keyof PortableProject['assets']>).flatMap(kind=>{
  const kept=new Set((project.assets[kind]??[]).map(a=>a.id));
  return (existing.assets[kind]??[]).filter(a=>!kept.has(a.id)).map(a=>({kind,id:a.id,name:a.name}));
 });
}
/** Writes an existing portable folder, preserving paths and program files. */
export async function writePortableStudioProject(root:string, studio:StudioProject, settings:ProjectAssetsBuild, name:string, confirmRemoval:ConfirmRemoval=()=>false) {
 return writeStudioProject(root,studio,settings,name,confirmRemoval,false);
}
/** Writes the folder, or returns undefined when a save would remove assets and confirmRemoval declines. */
export async function writeBuilderProject(root:string, studio:StudioProject, settings:ProjectAssetsBuild, name:string, confirmRemoval:ConfirmRemoval=()=>false) {
 return writeStudioProject(root,studio,settings,name,confirmRemoval,true);
}
async function writeStudioProject(root:string, studio:StudioProject, settings:ProjectAssetsBuild, name:string, confirmRemoval:ConfirmRemoval, allowNew:boolean) {
 let existing:PortableProject|undefined;
 try {
  await readFile(join(root,'clementina.yaml'));
  const loaded=await loadProject(root);
  if(!loaded.ok)throw Error(loaded.diagnostics.map(d=>d.message).join('\n'));
  existing=loaded.value;
 } catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(!existing&&!allowNew)throw Error('Open a portable project before saving it.');
 if(existing&&allowNew&&!existing.manifest.build?.assembly)throw Error('Builder needs a portable assembly project with build.assembly settings.');
 const project=portableBuilderProject(studio,settings,name,existing,allowNew);
 // Check before asking, so a save that can't happen never asks.
 const checked=checkProject(project);if(!checked.ok)throw Error(checked.diagnostics.map(d=>d.message).join('\n'));
 if(existing) {
  const removed=assetsRemovedBySave(existing,project);
  if(removed.length&&!await confirmRemoval(removed))return undefined;
 } else {
  if((await readdir(root)).length)throw Error('A new portable project needs an empty folder.');
  await mkdir(join(root,'src'),{recursive:true});
  await writeFile(join(root,'src/main.s'),'.setcpu "65C02"\n.include "assets.inc"\n.export game_start\n.segment "CODE"\ngame_start:\n ; Add Load, DrawScreen and the other runtime calls here.\n jmp game_start\n',{flag:'wx'});
  await writeFile(join(root,'link.cfg'),'MEMORY { ZP: start=$40, size=$B0, type=rw; RAM: start=$1800, size=$6800, type=rw, file=%O; }\nSEGMENTS { ZEROPAGE: load=ZP, type=zp; CODE: load=RAM, type=ro; RODATA: load=RAM, type=ro; DATA: load=RAM, type=rw; BSS: load=RAM, type=bss, define=yes; }\n',{flag:'wx'});
 }
 await saveProject(root,project);
 return project;
}
/** Saves, then builds. Returns undefined when the save was declined. */
export async function buildStudioProject(root:string, studio:StudioProject, settings:ProjectAssetsBuild, name:string, confirmRemoval?:ConfirmRemoval) {
 if(!await writeBuilderProject(root,studio,settings,name,confirmRemoval))return undefined;
 return buildProject(root);
}
