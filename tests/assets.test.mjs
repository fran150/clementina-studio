import test from 'node:test';
import assert from 'node:assert/strict';
import {spriteAttr,spriteExt,cellAttr,validateTilesets,validateBackgrounds,validateOverlays,BANK_BYTES,TILES_PER_BANK} from '../dist/packages/assets/index.js';

const tileset=(name,bpp=3)=>({id:name,name,bpp,chr:Array(BANK_BYTES).fill(0),tilePaletteBanks:Array(TILES_PER_BANK).fill(0),compositions:[]});
const bgCell=()=>({tile:0,paletteBank:0,flipX:false,flipY:false,priority:false,chrAlt:false});
const background=(name,tilesetId='Art')=>({id:name,name,width:2,height:1,tilesetId,altTilesetId:tilesetId,cells:[bgCell(),bgCell()]});
const placeholder=(name='Score',col=0,row=0,width=2,height=1)=>({id:name,name,col,row,width,height});
const overlay=(name,tilesetId='Art',placeholders=[placeholder()])=>({id:name,name,tilesetId,altTilesetId:tilesetId,cells:Array.from({length:1000},bgCell),placeholders});


test('a tileset is 1bpp or 3bpp and its tiles name banks 0-15',()=>{
 validateTilesets([tileset('Mono',1)]);
 for(const mutate of [
  t=>t.bpp=2,
  t=>t.tilePaletteBanks[0]=16,
  t=>t.tilePaletteBanks.pop(),
  t=>t.chr.pop(),
  t=>t.name='not a file name',
 ]){const t=tileset('Art');mutate(t);assert.throws(()=>validateTilesets([t]));}
 assert.throws(()=>validateTilesets([tileset('Same'),tileset('same')]),/unique/);
});

test('a background is width × height cells drawing from two tilesets in the project',()=>{
 const art=tileset('Art');
 validateBackgrounds([background('Level1')],[art]);
 for(const mutate of [
  b=>b.tilesetId='missing',
  b=>b.altTilesetId='missing',
  b=>b.cells.pop(),
  b=>b.width=0,
  b=>b.height=1025,
  b=>b.cells[0].tile=256,
  b=>b.cells[0].paletteBank=16,
  b=>delete b.cells[0].flipX,
  b=>b.name='not a file name',
 ]){const b=background('Level2');mutate(b);assert.throws(()=>validateBackgrounds([b],[art]));}
 assert.throws(()=>validateBackgrounds([background('Same'),background('same')],[art]),/unique/);
 assert.throws(()=>validateBackgrounds(Array.from({length:256},(_,i)=>background('Level_'+i)),[art]),/255/);
});

test('an overlay is the fixed 1000-cell (40 x 25) layer, drawing from two tilesets, with geometry-only placeholders',()=>{
 const art=tileset('Art');
 validateOverlays([overlay('Hud1')],[art]);
 for(const mutate of [
  o=>o.tilesetId='missing',
  o=>o.altTilesetId='missing',
  o=>o.cells.pop(),
  o=>o.cells[0].tile=256,
  o=>o.cells[0].paletteBank=16,
  o=>delete o.cells[0].flipX,
  o=>o.name='not a file name',
  o=>o.placeholders[0].width=41,
  o=>o.placeholders[0].col=39,
  o=>o.placeholders.push(placeholder('Score')),
  o=>o.placeholders.push(placeholder('Lives',0,0,2,1)),
 ]){const o=overlay('Hud2');mutate(o);assert.throws(()=>validateOverlays([o],[art]));}
 assert.throws(()=>validateOverlays([overlay('Same'),overlay('same')],[art]),/unique/);
 assert.throws(()=>validateOverlays(Array.from({length:256},(_,i)=>overlay('Hud_'+i)),[art]),/255/);
});

test('a background cell reuses the background/overlay attribute layout',()=>{
 const cell={paletteBank:5,flipX:true,flipY:false,priority:true,chrAlt:true};
 assert.equal(cellAttr(cell),0xd5);
});

// Background and sprite attribute bytes carry the same fields at different bit
// positions, which is exactly the transposition worth pinning down.
test('sprite attr packs palette 0-3, priority 4, flip X 5, flip Y 6',()=>{
 assert.equal(spriteAttr({paletteBank:0,flipX:false,flipY:false}),0);
 assert.equal(spriteAttr({paletteBank:15,flipX:false,flipY:false}),0x0f);
 assert.equal(spriteAttr({paletteBank:0,flipX:true,flipY:false}),0x20);
 assert.equal(spriteAttr({paletteBank:0,flipX:false,flipY:true}),0x40);
 assert.equal(spriteAttr({paletteBank:5,flipX:true,flipY:true}),0x65);
});

test('sprite ext carries the X high bits, the Y high bit and disable',()=>{
 assert.equal(spriteExt({x:0,y:0}),0);
 assert.equal(spriteExt({x:511,y:0}),0x01);
 assert.equal(spriteExt({x:-512,y:0}),0x02,'-512 is 0x200, high bits 10');
 assert.equal(spriteExt({x:0,y:-256}),0x04);
 assert.equal(spriteExt({x:0,y:255}),0x00);
});

test('background cells use a different layout: flip X 4, flip Y 5, priority 6, CHR_ALT 7',()=>{
 assert.equal(cellAttr({paletteBank:15,flipX:false,flipY:false}),0x0f);
 assert.equal(cellAttr({paletteBank:0,flipX:true,flipY:false}),0x10);
 assert.equal(cellAttr({paletteBank:0,flipX:false,flipY:true}),0x20);
 assert.equal(cellAttr({paletteBank:0,flipX:false,flipY:false,priority:true}),0x40);
 assert.equal(cellAttr({paletteBank:0,flipX:false,flipY:false,chrAlt:true}),0x80);
 assert.notEqual(cellAttr({paletteBank:0,flipX:true,flipY:false}),spriteAttr({paletteBank:0,flipX:true,flipY:false}));
});


