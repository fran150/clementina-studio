import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProject,decodeProject,validateGroups,importTilesetPrg,emptyProject,BANK_BYTES,TILES_PER_BANK} from '../dist/packages/assets/index.js';

const tileset=(name='Graphics')=>({id:name+'-id',name,bpp:3,chr:Array(BANK_BYTES).fill(0),tilePaletteBanks:Array(TILES_PER_BANK).fill(0),compositions:[]});
const groups=()=>[{name:'Hero_Walk',tilesetId:'Graphics-id',frames:[
 {ticks:6,parts:[{tile:19,x:-8,y:16,paletteBank:3,flipX:true,flipY:false}]},
 {ticks:12,parts:[]}]}];
const project=()=>{const p=emptyProject();p.tilesets=[tileset()];p.animations=groups();return p;};

test('a project round trips its tilesets and sprite groups unchanged',()=>{
 const p=project();p.tilesets[0].chr[6]=123;p.tilesets[0].tilePaletteBanks[4]=9;
 const restored=decodeProject(encodeProject(p));
 assert.deepEqual(restored,p);
});


test('a sprite part names a palette bank, and X and Y stay inside OAM range',()=>{
 for(const mutate of [
  g=>g[0].frames[0].ticks=0,
  g=>g[0].frames[0].parts[0].x=-513,
  g=>g[0].frames[0].parts[0].x=512,
  g=>g[0].frames[0].parts[0].y=-257,
  g=>g[0].frames[0].parts[0].paletteBank=16,
  g=>delete g[0].frames[0].parts[0].paletteBank,
  g=>g[0].frames[0].parts[0].tile=256,
  g=>g[0].name='bad name',
  g=>g.push({...g[0],name:'hero_walk'}),
 ]){const g=groups();mutate(g);assert.throws(()=>validateGroups(g,[tileset()]));}
});

test('a group draws from one tileset, which must be in the project',()=>{
 const p=project();
 assert.deepEqual(decodeProject(encodeProject(p)).animations[0].tilesetId,'Graphics-id');
 p.animations[0].tilesetId='gone';
 assert.throws(()=>encodeProject(p),/one tileset/);
});

test('sprite X and Y reach the full OAM range',()=>{
 const p=project();
 p.animations[0].frames[0].parts[0].x=-512;
 p.animations[0].frames[0].parts[0].y=255;
 assert.deepEqual(decodeProject(encodeProject(p)).animations,p.animations);
});

test('static sprites hold exactly one frame',()=>{
 const p=project();p.sprites=groups();p.sprites[0].frames=p.sprites[0].frames.slice(0,1);
 const restored=decodeProject(encodeProject(p));
 assert.deepEqual(restored.sprites,p.sprites);
 p.sprites[0].frames.push({ticks:6,parts:[]});
 assert.throws(()=>encodeProject(p),/exactly one frame/);
});

test('canvas bounds, anchor and unique local IDs are validated',()=>{
 const p=project();
 p.sprites=[{name:'Group',tilesetId:'Graphics-id',canvasPixelWidth:320,canvasPixelHeight:200,originAnchor:'bottom-center',originX:160,originY:200,
  frames:[{ticks:6,parts:[{spriteId:7,tile:1,x:0,y:0,paletteBank:0,flipX:false,flipY:false}]}]}];
 assert.deepEqual(decodeProject(encodeProject(p)).sprites,p.sprites);
 p.sprites[0].canvasPixelHeight=201;assert.throws(()=>encodeProject(p));p.sprites[0].canvasPixelHeight=200;
 p.sprites[0].frames[0].parts.push({...p.sprites[0].frames[0].parts[0]});
 assert.throws(()=>encodeProject(p),/unique/);
});

test('PRG import strips unbanked and banked headers without changing pixels',()=>{
 const mono=new Uint8Array(2050);mono.set([0,96,129]);
 const m=importTilesetPrg(mono);assert.equal(m.bpp,1);assert.equal(m.chr[0],129);assert.equal(m.chr.length,BANK_BYTES);
 const color=new Uint8Array(6147);color.set([0,128,7,255]);
 const c=importTilesetPrg(color);assert.equal(c.bpp,3);assert.equal(c.bank,7);assert.equal(c.chr[0],255);
 assert.throws(()=>importTilesetPrg(new Uint8Array(4)));
 color[2]=0;assert.throws(()=>importTilesetPrg(color));
});
