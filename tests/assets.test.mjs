import test from 'node:test';
import assert from 'node:assert/strict';
import {runtimePackage,tilesetPackage,spriteAttr,spriteExt,cellAttr,emptyProject,validateTilesets,BANK_BYTES,TILES_PER_BANK} from '../dist/packages/assets/index.js';

const tileset=(name,bpp=3)=>({id:name,name,bpp,chr:Array(BANK_BYTES).fill(0),tilePaletteBanks:Array(TILES_PER_BANK).fill(0),compositions:[]});

test('a tileset exports one full CHR bank under its own name',()=>{
 const t=tileset('Heroes');t.chr[4096]=255;
 const files=tilesetPackage([t]);
 assert.equal(files['Heroes.CHR'].length,BANK_BYTES);
 assert.equal(files['Heroes.CHR'][4096],255);
});

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

test('the runtime package names every tileset and config, and says banks are an example',()=>{
 const p=emptyProject();
 p.tilesets=[tileset('Heroes'),tileset('Ground',1)];
 const files=runtimePackage(p);
 assert.ok(files['Heroes.CHR']&&files['Ground.CHR']&&files['Default.PAL']);
 const loader=new TextDecoder().decode(files['LOADER.bas.txt']);
 assert.match(loader,/CHRLOAD 0,0,6144,"Heroes.CHR"/);
 assert.match(loader,/CHRMODE 1,1/,'the 1bpp tileset sets the CHRMODE flag');
 assert.match(loader,/CHRMODE 0,0/);
 assert.match(loader,/PALLOAD 0,0,0,"Default.PAL"/);
 assert.match(new TextDecoder().decode(files['README.txt']),/bank numbers are an example/);
});

test('bad projects fail before any binary is generated',()=>{
 const p=emptyProject();p.tilesets=[tileset('Art')];p.tilesets[0].chr[0]=256;
 assert.throws(()=>runtimePackage(p));
});
