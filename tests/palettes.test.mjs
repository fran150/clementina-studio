import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProject,decodeProject,validateProject,emptyProject,projectFromFlat,configPackage,PROJECT_VERSION} from '../dist/packages/assets/index.js';
import {bankColors,resolveConfig,createPalette,createConfig,configFromFlat,internPalette,repointPalette,unbindPalette,paletteUsage,PALETTE_BANKS} from '../dist/packages/assets/palettes.js';

const flat=fn=>Array.from({length:128},(_,i)=>fn(Math.floor(i/8),i%8));
const palette=(id,colors)=>({id,name:'Palette '+id,colors});
const config=(id,banks)=>({id,name:'Config '+id,banks});

test('a config resolves to palette RAM in bank order, empty banks reading black',()=>{
 const library=[palette('a',Array(8).fill(0x1234)),palette('b',Array(8).fill(0x5678))];
 const c=config('c',['a',null,'b',...Array(13).fill(null)]);
 assert.deepEqual(bankColors(c,library,0),library[0].colors);
 assert.deepEqual(bankColors(c,library,1),Array(8).fill(0));
 assert.deepEqual(bankColors(c,library,2),library[1].colors);
 const ram=resolveConfig(c,library);
 assert.equal(ram.length,128);
 assert.equal(ram[0],0x1234);assert.equal(ram[8],0);assert.equal(ram[16],0x5678);
});

test('a flat palette RAM image becomes one config, sharing palettes with identical colors',()=>{
 const library=[],configs=[];
 const shared=flat((bank,i)=>bank===5?i:bank*8+i);   // bank 5 duplicates bank 0's colors
 const c=configFromFlat(configs,library,shared,'Overworld');
 assert.equal(c.name,'Overworld');
 assert.equal(library.length,15,'two banks with identical colors intern to one palette');
 assert.equal(c.banks[0],c.banks[5]);
 assert.deepEqual(resolveConfig(c,library),shared,'colors survive the round trip exactly');
});

test('two banks of one config may hold the same palette',()=>{
 const library=[palette('a',Array(8).fill(7))];
 const configs=[];const c=createConfig(configs,library,'Doubled',['a','a',...Array(14).fill(null)]);
 assert.equal(c.banks[0],c.banks[1]);
 validateProject({paletteLibrary:library,paletteConfigs:configs,tilesets:[],sprites:[],animations:[]});
});

test('a new config fills banks from the library in order and names itself uniquely',()=>{
 const library=Array.from({length:3},(_,i)=>createPalette([],Array(8).fill(i)));
 const configs=[];
 const first=createConfig(configs,library),second=createConfig(configs,library);
 assert.deepEqual(first.banks.slice(0,3),library.map(p=>p.id));
 assert.deepEqual(first.banks.slice(3),Array(13).fill(null));
 assert.notEqual(first.name,second.name);
});

test('deleting a palette either repoints every bank naming it or clears them',()=>{
 const library=[palette('a',Array(8).fill(1)),palette('b',Array(8).fill(2))];
 const configs=[config('x',['a','a',...Array(14).fill(null)]),config('y',['b',...Array(15).fill(null)])];
 assert.deepEqual(paletteUsage(configs,'a').map(u=>[u.config.id,u.banks]),[['x',[0,1]]]);
 assert.equal(repointPalette(configs,'a','b'),2);
 assert.deepEqual(configs[0].banks.slice(0,2),['b','b']);
 assert.equal(unbindPalette(configs,'b'),3);
 assert.deepEqual(configs[0].banks,Array(16).fill(null));
});

test('interning reuses a palette whose colors already exist',()=>{
 const library=[];
 const first=internPalette(library,Array(8).fill(9),'First');
 const again=internPalette(library,Array(8).fill(9),'Second');
 assert.equal(again,first);assert.equal(library.length,1);
});

test('a config names a palette, or nothing, for exactly sixteen banks',()=>{
 const base=()=>({paletteLibrary:[palette('a',Array(8).fill(0))],paletteConfigs:[config('c',['a',...Array(15).fill(null)])],tilesets:[],sprites:[],animations:[]});
 validateProject(base());
 for(const mutate of [
  p=>p.paletteConfigs[0].banks.pop(),
  p=>p.paletteConfigs[0].banks.push(null),
  p=>p.paletteConfigs[0].banks[0]='missing',
  p=>p.paletteConfigs.push(config('c',Array(16).fill(null))),          // duplicate id
  p=>p.paletteConfigs.push({id:'d',name:'Config c',banks:Array(16).fill(null)}), // duplicate name
 ]){const p=base();mutate(p);assert.throws(()=>validateProject(p));}
});

test('the active config must be one the project holds',()=>{
 const p=emptyProject();
 validateProject(p);
 assert.equal(p.paletteConfigs.length,1);
 assert.equal(p.activeConfigId,p.paletteConfigs[0].id);
 p.activeConfigId='gone';assert.throws(()=>validateProject(p),/active config/);
});

test('a project round trips and refuses versions it did not write',()=>{
 const p=emptyProject();
 createPalette(p.paletteLibrary,Array(8).fill(0xf81f),'Magenta');
 p.paletteConfigs[0].banks[4]=p.paletteLibrary[0].id;
 const restored=decodeProject(encodeProject(p));
 assert.deepEqual(restored,p);
 assert.equal(JSON.parse(encodeProject(p)).version,PROJECT_VERSION);
 assert.throws(()=>decodeProject('{"format":"clementina-studio","version":1}'),/version 1/);
 assert.throws(()=>decodeProject('{"format":"something-else","version":2}'),/Not a Studio project/);
});

test('legacy flat graphics import as eight tilesets and one config',()=>{
 const chr=Array(49152).fill(0);chr[2*6144+7]=123;
 const bpp=Array(8).fill(3);bpp[2]=1;
 const p=projectFromFlat(chr,bpp,flat((bank,i)=>bank*8+i),'Imported');
 validateProject(p);
 assert.equal(p.tilesets.length,8);
 assert.equal(p.tilesets[2].bpp,1);
 assert.equal(p.tilesets[2].chr[7],123);
 assert.equal(p.paletteConfigs.length,1);
 assert.equal(p.paletteConfigs[0].name,'Imported');
 assert.equal(p.activeConfigId,p.paletteConfigs[0].id);
});

test('each config exports one 256 byte little endian palette RAM image',()=>{
 const library=[palette('a',[0xf81f,...Array(7).fill(0)])];
 const files=configPackage([config('c',['a',...Array(15).fill(null)])],library);
 const bytes=files['Config_c.PAL'];
 assert.equal(bytes.length,PALETTE_BANKS*8*2);
 assert.deepEqual(Array.from(bytes.slice(0,2)),[31,248]);
 assert.deepEqual(Array.from(bytes.slice(16,18)),[0,0],'an empty bank exports as black');
});
