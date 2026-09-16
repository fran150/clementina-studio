import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProject,decodeProject,animationPackage,runtimePackage,bankAssetPackage,importBankPrg} from '../dist/packages/assets/index.js';
const animations=()=>[{name:'Hero_Walk',bank:2,plane:1,frames:[{ticks:6,parts:[{tile:19,x:-8,y:16,palette:3,flipX:true,flipY:false}]},{ticks:12,parts:[]}]}];
const project=()=>({chr:Array(49152).fill(0),palettes:Array(128).fill(0),modes:Array(8).fill(3),planes:Array(8).fill(0),animations:animations()});
test('Studio round trip preserves graphics and editable animation metadata',()=>{
 const p=project();p.chr[6144]=123;p.palettes[7]=65535;
 const restored=decodeProject(encodeProject(p));for(const key of Object.keys(p))assert.deepEqual(restored[key],p[key]);
 assert.throws(()=>decodeProject('{"format":"clementina-studio","version":2}'));
});
test('assembly stream decodes signed offsets, flips, frame timing and empty frames',()=>{
 const files=animationPackage(animations()),bytes=files['ANIMATIONS.BIN'];
 assert.deepEqual(Array.from(bytes),[67,83,65,49,1,2,1,2,6,1,19,248,16,3,4,12,0]);
 const signedX=new DataView(bytes.buffer).getInt8(11);assert.equal(signedX,-8);
 assert.match(new TextDecoder().decode(files['assets.inc']),/ANIM_HERO_WALK_OFFSET = 5/);
});
test('invalid metadata and ambiguous assembly symbols are rejected',()=>{
 for(const mutate of [a=>a[0].frames[0].ticks=0,a=>a[0].frames[0].parts[0].x=-129,a=>a[0].name='bad name',a=>a.push({...a[0],name:'hero_walk'}),a=>a[0].bank=8]){
 const a=animations();mutate(a);assert.throws(()=>animationPackage(a));
 }
});

test('static sprites persist separately and export separate assembly symbols',()=>{
 const p=project();p.sprites=animations();p.sprites[0].frames=p.sprites[0].frames.slice(0,1);
 const restored=decodeProject(encodeProject(p));assert.deepEqual(restored.sprites,p.sprites);
 const files=runtimePackage(restored);assert.equal(files['SPRITES.BIN'][7],1);
 assert.match(new TextDecoder().decode(files['sprites.inc']),/SPRITE_HERO_WALK_OFFSET = 5/);
 p.sprites[0].frames.push({ticks:6,parts:[]});assert.throws(()=>encodeProject(p));
});

test('named bank library can exceed eight and exports palette metadata separately',()=>{
 const banks=Array.from({length:12},(_,i)=>({name:'Asset_'+i,mode:3,plane:0,chr:Array(6144).fill(0),palettes:Array(128).fill(0xf81f),cellPalettes:Array(256).fill(i%16),compositions:[{name:'House',x:2,y:3,width:6,height:6}]}));
 const files=bankAssetPackage(banks);assert.equal(files['Asset_11.CHR'].length,6144);assert.equal(files['Asset_11.ATTR'][0],11);assert.deepEqual(Array.from(files['Asset_11.PAL'].slice(0,2)),[31,248]);
 const metadata=JSON.parse(new TextDecoder().decode(files['Asset_11.json']));assert.equal(metadata.compositions[0].width,6);
 const p=project();p.bankAssets=banks;assert.equal(decodeProject(encodeProject(p)).bankAssets.length,12);
 banks[0].compositions[0].width=16;assert.throws(()=>bankAssetPackage(banks));
});

test('PRG import strips unbanked and banked headers without changing pixels',()=>{
 const mono=new Uint8Array(2050);mono.set([0,96,129]);const m=importBankPrg(mono);assert.equal(m.mode,1);assert.equal(m.chr[0],129);assert.equal(m.chr.length,6144);
 const color=new Uint8Array(6147);color.set([0,128,7,255]);const c=importBankPrg(color);assert.equal(c.mode,3);assert.equal(c.bank,7);assert.equal(c.chr[0],255);
 assert.throws(()=>importBankPrg(new Uint8Array(4)));color[2]=0;assert.throws(()=>importBankPrg(color));
});

test('logical sprite banks and free-positioned origins round trip without hardware slot binding',()=>{
 const p=project();p.bankAssets=[{id:'graphics-id',name:'Graphics',mode:3,plane:0,chr:Array(6144).fill(0),palettes:Array(128).fill(0),cellPalettes:Array(256).fill(0),compositions:[]}];
 p.sprites=[{name:'Hero',bank:0,plane:0,canvasWidth:4,canvasHeight:6,originX:16,originY:48,frames:[{ticks:6,parts:[{bankId:'graphics-id',tile:2,x:-200,y:301,palette:1,flipX:true,flipY:false}]}]}];
 assert.deepEqual(decodeProject(encodeProject(p)).sprites,p.sprites);
 assert.throws(()=>animationPackage(p.sprites),/memory-placement/);
 p.sprites[0].frames[0].parts[0].x=32768;assert.throws(()=>encodeProject(p));
});

test('sprite group canvas bounds, anchor and unique local IDs are validated',()=>{
 const p=project();p.sprites=[{name:'Group',bank:0,plane:0,canvasPixelWidth:320,canvasPixelHeight:200,originAnchor:'bottom-center',originX:160,originY:200,frames:[{ticks:6,parts:[{spriteId:7,tile:1,x:0,y:0,palette:0,flipX:false,flipY:false}]}]}];
 assert.deepEqual(decodeProject(encodeProject(p)).sprites,p.sprites);
 p.sprites[0].canvasPixelHeight=201;assert.throws(()=>encodeProject(p));p.sprites[0].canvasPixelHeight=200;
 p.sprites[0].frames[0].parts.push({...p.sprites[0].frames[0].parts[0]});assert.throws(()=>encodeProject(p),/unique/);
});

test('sprite group source-bank lists persist and reject duplicates or more than eight',()=>{
 const p=project();p.sprites=[{name:'Sources',bank:0,plane:0,bankIds:['bank-a','bank-b'],frames:[{ticks:6,parts:[]}]}];
 assert.deepEqual(decodeProject(encodeProject(p)).sprites[0].bankIds,['bank-a','bank-b']);
 p.sprites[0].bankIds=['bank-a','bank-a'];assert.throws(()=>encodeProject(p),/source banks/);
 p.sprites[0].bankIds=Array.from({length:9},(_,i)=>'bank-'+i);assert.throws(()=>encodeProject(p),/source banks/);
});
