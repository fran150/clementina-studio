import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProject,decodeProject,validateShapes,validateAnimations,importTilesetPrg,emptyProject,BANK_BYTES,TILES_PER_BANK} from '../dist/packages/assets/index.js';

const tileset=(name='Graphics')=>({id:name+'-id',name,bpp:3,chr:Array(BANK_BYTES).fill(0),tilePaletteBanks:Array(TILES_PER_BANK).fill(0),compositions:[]});
const sprite=(over={})=>({tile:19,x:-8,y:16,paletteBank:3,flipX:true,flipY:false,...over});
const shape=(name='Hero_Stand',over={})=>({id:name+'-id',name,tilesetId:'Graphics-id',sprites:[sprite()],...over});
const project=()=>{const p=emptyProject();p.tilesets=[tileset()];p.shapes=[shape()];return p;};

test('a project round trips its tilesets, shapes and animations unchanged',()=>{
 const p=project();
 p.tilesets[0].chr[6]=123;p.tilesets[0].tilePaletteBanks[4]=9;
 p.animations=[{name:'Walk',frames:[{shapeId:'Hero_Stand-id',ticks:6},{shapeId:'Hero_Stand-id',ticks:12,dx:0,dy:-1}]}];
 assert.deepEqual(decodeProject(encodeProject(p)),p);
});

test('a shape is an ordered list of sprites with no separate id',()=>{
 const s=shape('Hero',{sprites:[sprite({tile:1}),sprite({tile:2}),sprite({tile:3})]});
 validateShapes([s],[tileset()]);
 // Order is the array's: a later sprite draws on top, so nothing else records it.
 assert.deepEqual(s.sprites.map(x=>x.tile),[1,2,3]);
 assert.ok(s.sprites.every(x=>!('spriteId' in x)));
});

test('a sprite names a palette bank, and X and Y stay inside OAM range',()=>{
 for(const mutate of [
  s=>s.sprites[0].x=-513,
  s=>s.sprites[0].x=512,
  s=>s.sprites[0].y=-257,
  s=>s.sprites[0].y=256,
  s=>s.sprites[0].paletteBank=16,
  s=>delete s.sprites[0].paletteBank,
  s=>s.sprites[0].tile=256,
  s=>s.sprites[0].flipX='yes',
  s=>s.name='bad name',
  s=>s.sprites=Array(65).fill(sprite()),
 ]){const s=shape();mutate(s);assert.throws(()=>validateShapes([s],[tileset()]));}
});

test('sprite X and Y reach the full OAM range',()=>{
 const p=project();
 p.shapes[0].sprites=[sprite({x:-512,y:255}),sprite({x:511,y:-256})];
 assert.deepEqual(decodeProject(encodeProject(p)).shapes,p.shapes);
});

test('shapes need unique names and unique identities',()=>{
 assert.throws(()=>validateShapes([shape('Hero'),shape('hero')],[tileset()]),/unique assembly/);
 assert.throws(()=>validateShapes([shape('Hero'),{...shape('Villain'),id:'Hero-id'}],[tileset()]),/identities/);
});

test('a shape draws from one tileset, which must be in the project',()=>{
 const p=project();
 assert.equal(decodeProject(encodeProject(p)).shapes[0].tilesetId,'Graphics-id');
 p.shapes[0].tilesetId='gone';
 assert.throws(()=>encodeProject(p),/one tileset/);
});

test('an animation is a sequence of shapes it does not own',()=>{
 const p=project();
 p.shapes.push(shape('Hero_Step'));
 p.animations=[{name:'Walk',frames:[
  {shapeId:'Hero_Stand-id',ticks:6},
  {shapeId:'Hero_Step-id',ticks:6},
  {shapeId:'Hero_Stand-id',ticks:6}]}];
 const restored=decodeProject(encodeProject(p));
 assert.deepEqual(restored.animations,p.animations);
 // Editing the shape reaches every frame naming it, because they reference it.
 assert.equal(restored.animations[0].frames[0].shapeId,restored.animations[0].frames[2].shapeId);
});

test('an animation frame names a shape the project holds, and runs 1-255 ticks',()=>{
 const shapes=[shape()];
 for(const mutate of [
  a=>a.frames[0].shapeId='gone',
  a=>delete a.frames[0].shapeId,
  a=>a.frames[0].ticks=0,
  a=>a.frames[0].ticks=256,
  a=>a.frames=[],
  a=>a.name='bad name',
 ]){
  const a={name:'Walk',frames:[{shapeId:'Hero_Stand-id',ticks:6}]};
  mutate(a);assert.throws(()=>validateAnimations([a],shapes));
 }
});

test('a frame may nudge its whole shape, within OAM range',()=>{
 const shapes=[shape()];
 validateAnimations([{name:'Bob',frames:[{shapeId:'Hero_Stand-id',ticks:6,dx:-512,dy:511}]}],shapes);
 assert.throws(()=>validateAnimations([{name:'Bob',frames:[{shapeId:'Hero_Stand-id',ticks:6,dx:512}]}],shapes));
});

test('every shape in one animation draws from the same tileset',()=>{
 const shapes=[shape('Hero'),shape('Enemy',{tilesetId:'Other-id'})];
 const tilesets=[tileset(),tileset('Other')];
 validateShapes(shapes,tilesets);
 validateAnimations([{name:'Solo',frames:[{shapeId:'Hero-id',ticks:6}]}],shapes);
 assert.throws(()=>validateAnimations([{name:'Mixed',frames:[
  {shapeId:'Hero-id',ticks:6},{shapeId:'Enemy-id',ticks:6}]}],shapes),/same tileset/);
});

test('PRG import strips unbanked and banked headers without changing pixels',()=>{
 const mono=new Uint8Array(2050);mono.set([0,96,129]);
 const m=importTilesetPrg(mono);assert.equal(m.bpp,1);assert.equal(m.chr[0],129);assert.equal(m.chr.length,BANK_BYTES);
 const color=new Uint8Array(6147);color.set([0,128,7,255]);
 const c=importTilesetPrg(color);assert.equal(c.bpp,3);assert.equal(c.bank,7);assert.equal(c.chr[0],255);
 assert.throws(()=>importTilesetPrg(new Uint8Array(4)));
 color[2]=0;assert.throws(()=>importTilesetPrg(color));
});
