import test from 'node:test';
import assert from 'node:assert/strict';
import {convertTilesetImage,rgb565} from '../dist/packages/assets/image-import.js';
import {importTilesetFile} from '../dist/packages/assets/index.js';
const tileset=()=>({name:'Art',bpp:3,plane:0,chr:Array(6144).fill(0),palettes:Array(128).fill(0),tilePaletteBanks:Array(256).fill(0),compositions:[]});
const image=(w,h,fn)=>({width:w,height:h,data:Uint8ClampedArray.from(Array.from({length:w*h},(_,i)=>fn(i%w,Math.floor(i/w))).flat())});
const options=(w,h,extra={})=>({crop:{x:0,y:0,width:w,height:h},width:w,height:h,tileX:0,tileY:0,paletteMode:'create',...extra});
const pixel=(b,t,x,y)=>[0,1,2].reduce((v,p)=>v|(((b.chr[p*2048+t*8+y]>>x)&1)<<p),0);
test('image import preserves transparency, pads edge tiles and keeps previews pure',()=>{
 const b=tileset();b.chr[0]=255;const before=structuredClone(b),img=image(9,8,(x,y)=>[255,0,0,x===0&&y===0?0:255]);
 const result=convertTilesetImage(b,img,options(9,8));assert.deepEqual(b,before);assert.equal(result.tilesWide,2);assert.deepEqual(result.overwrittenTiles,[0]);
 assert.equal(pixel(result.tileset,0,0,0),0);assert.notEqual(pixel(result.tileset,0,1,0),0);assert.notEqual(pixel(result.tileset,1,0,0),0);assert.equal(pixel(result.tileset,1,1,0),0);
 assert.equal(result.transparentPixels,1);assert.equal(result.remappedPixels,0);assert.equal(result.createdPalettes.length,1);assert.equal(result.tileset.palettes[result.tileset.tilePaletteBanks[0]*8+1],0xf800);
});
test('crop and nearest-neighbor resize choose source pixels deterministically',()=>{
 const img=image(4,2,(x)=>x%2?[0,255,0,255]:[255,0,0,255]);const result=convertTilesetImage(tileset(),img,options(4,2,{crop:{x:1,y:0,width:2,height:2},width:4,height:4})),b=result.tileset,p=b.tilePaletteBanks[0];
 assert.equal(b.palettes[p*8+pixel(b,0,0,0)],0x07e0);assert.equal(pixel(b,0,0,0),pixel(b,0,1,0));assert.equal(b.palettes[p*8+pixel(b,0,2,0)],0xf800);
 assert.throws(()=>convertTilesetImage(tileset(),img,options(4,2,{tileX:16})),/beyond/);
 assert.throws(()=>convertTilesetImage(tileset(),img,options(4,2,{width:129})),/128/);
 assert.throws(()=>convertTilesetImage(tileset(),img,options(4,2,{crop:{x:3,y:0,width:2,height:1}})),/Crop/);
});
test('matching selects a palette per tile and never edits palette colors',()=>{
 const b=tileset();b.palettes[3*8+4]=0xf800;b.palettes[5*8+2]=0x07e0;const result=convertTilesetImage(b,image(16,8,x=>x<8?[255,0,0,255]:[0,255,0,255]),options(16,8,{paletteMode:'match'}));
 assert.deepEqual(result.tileset.palettes,b.palettes);assert.equal(result.tileset.tilePaletteBanks[0],3);assert.equal(result.tileset.tilePaletteBanks[1],5);assert.equal(pixel(result.tileset,0,0,0),4);assert.equal(pixel(result.tileset,1,0,0),2);
});
test('created palettes protect other tiles and sprite references; exhausted slots fall back without recoloring',()=>{
 const b=tileset(),img=image(8,8,()=>[40,80,120,255]);const result=convertTilesetImage(b,img,options(8,8,{protectedPalettes:[1]}));assert.deepEqual(result.createdPalettes,[2]);assert.deepEqual(result.tileset.palettes.slice(0,16),b.palettes.slice(0,16));
 const exhausted=convertTilesetImage(b,img,options(8,8,{protectedPalettes:Array.from({length:16},(_,i)=>i)}));assert.equal(exhausted.limitedTiles,1);assert.equal(exhausted.remappedPixels,64);assert.deepEqual(exhausted.tileset.palettes,b.palettes);
});
test('over-color tiles quantize and share their generated palette',()=>{
 const img=image(16,8,(x,y)=>[(x%8)*32,y*32,(x%8)*16,255]);const result=convertTilesetImage(tileset(),img,options(16,8));assert.ok(result.remappedPixels>0);assert.equal(result.createdPalettes.length,1);assert.equal(result.tileset.tilePaletteBanks[0],result.tileset.tilePaletteBanks[1]);
 const values=new Set(Array.from({length:64},(_,i)=>pixel(result.tileset,0,i%8,Math.floor(i/8))));assert.ok(values.size<=7);assert.ok(!values.has(0));
});
test('1bpp imports use one visible color and preserve non-selected planes',()=>{
 const b=tileset();b.bpp=1;b.plane=2;b.chr[0]=173;const result=convertTilesetImage(b,image(8,8,x=>[255,255,255,x===0?0:255]),options(8,8));assert.equal(result.tileset.chr[0],173);assert.equal(result.tileset.chr[4096],254);assert.equal(result.tileset.palettes[result.tileset.tilePaletteBanks[0]*8+1],rgb565(255,255,255));
});
test('raw BIN/CHR tileset import accepts exact payload sizes and distinguishes PRG headers',()=>{
 const mono=importTilesetFile(Uint8Array.from({length:2048},()=>129),'.BIN');assert.equal(mono.bpp,1);assert.equal(mono.chr[0],129);assert.equal(mono.chr[2048],0);
 assert.equal(importTilesetFile(new Uint8Array(6144),'chr').bpp,3);assert.throws(()=>importTilesetFile(new Uint8Array(2049),'chr'),/exactly/);assert.throws(()=>importTilesetFile(new Uint8Array(2048),'png'),/Choose/);
 const prg=new Uint8Array(2050);prg.set([0,96,255]);assert.equal(importTilesetFile(prg,'prg').chr[0],255);
});
