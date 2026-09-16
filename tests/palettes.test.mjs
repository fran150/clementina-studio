import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeProject,decodeProject,bankAssetPackage,validateProject} from '../dist/packages/assets/index.js';
import {migrateProjectPalettes,resolveBankPalettes,slotColors,internPalette,bindFlatPalettes,compactBankSlots,removeBankSlot} from '../dist/packages/assets/palettes.js';
const findPalette=(library,id)=>library.find(p=>p.id===id);

const flat=fn=>Array.from({length:128},(_,i)=>fn(Math.floor(i/8),i%8));
const legacyBank=(name,palettes)=>({name,mode:3,plane:0,chr:Array(6144).fill(0),palettes,cellPalettes:Array(256).fill(0),compositions:[]});
const legacyProject=banks=>({format:'clementina-studio',version:1,chr:Array(49152).fill(0),palettes:Array(128).fill(0),modes:Array(8).fill(3),planes:Array(8).fill(0),animations:[],sprites:[],bankAssets:banks});

test('legacy per-bank palettes migrate into one shared library, collapsing identical colors',()=>{
 const shared=flat((slot,i)=>slot*8+i);
 const p=legacyProject([legacyBank('Alpha',[...shared]),legacyBank('Beta',[...shared])]);
 migrateProjectPalettes(p);
 assert.equal(p.paletteLibrary.length,16);
 for(const bank of p.bankAssets)assert.equal(bank.palettes,undefined);
 assert.deepEqual(p.bankAssets[0].paletteSlots,p.bankAssets[1].paletteSlots);
 assert.deepEqual(resolveBankPalettes(p.bankAssets[0],p.paletteLibrary),shared);
 validateProject(p);
});

test('migration preserves colors exactly, including banks that differ in one slot',()=>{
 const base=flat((slot,i)=>slot*8+i),different=[...base];different[3*8+2]=0xf81f;
 const p=legacyProject([legacyBank('Alpha',[...base]),legacyBank('Beta',different)]);
 migrateProjectPalettes(p);
 assert.deepEqual(resolveBankPalettes(p.bankAssets[0],p.paletteLibrary),base);
 assert.deepEqual(resolveBankPalettes(p.bankAssets[1],p.paletteLibrary),different);
 assert.notEqual(p.bankAssets[0].paletteSlots[3],p.bankAssets[1].paletteSlots[3]);
 assert.deepEqual(p.bankAssets[0].paletteSlots.filter((_,s)=>s!==3),p.bankAssets[1].paletteSlots.filter((_,s)=>s!==3));
 assert.equal(p.paletteLibrary.length,17);
});

test('exported palette bytes are unchanged by migration',()=>{
 const colors=flat((slot,i)=>(slot*8+i)*257&0xffff);
 const p=legacyProject([legacyBank('Alpha',[...colors])]);
 migrateProjectPalettes(p);
 const bytes=bankAssetPackage(p.bankAssets,p.paletteLibrary)['Alpha.PAL'],view=new DataView(bytes.buffer);
 assert.equal(bytes.length,256);
 colors.forEach((word,i)=>assert.equal(view.getUint16(i*2,true),word));
});

test('editing a shared palette reaches every bank bound to it',()=>{
 const p=legacyProject([legacyBank('Alpha',Array(128).fill(0)),legacyBank('Beta',Array(128).fill(0))]);
 migrateProjectPalettes(p);
 p.paletteLibrary[0].colors[4]=0x07e0;
 for(const bank of p.bankAssets)assert.equal(slotColors(bank,p.paletteLibrary,0)[4],0x07e0);
});

test('slots of one bank stay independent while a second bank reuses the same palettes',()=>{
 const library=[],uniform=Array(128).fill(1);
 assert.equal(internPalette(library,Array(8).fill(1)),internPalette(library,Array(8).fill(1)));
 const alpha={},beta={};
 bindFlatPalettes(alpha,library,uniform);
 assert.equal(new Set(alpha.paletteSlots).size,16,'identical colors must not fuse two slots of one bank');
 assert.equal(library.length,16);
 bindFlatPalettes(beta,library,uniform);
 assert.deepEqual(beta.paletteSlots,alpha.paletteSlots);
 assert.equal(library.length,16);
});

test('projects round trip in the new shape and reject broken bindings',()=>{
 const p=legacyProject([legacyBank('Alpha',flat(slot=>slot))]);
 const restored=decodeProject(encodeProject(migrateProjectPalettes(p)));
 assert.deepEqual(restored.paletteLibrary,p.paletteLibrary);
 assert.deepEqual(restored.bankAssets[0].paletteSlots,p.bankAssets[0].paletteSlots);
 p.bankAssets[0].paletteSlots[0]='missing';assert.throws(()=>encodeProject(p),/palette slots/);
 p.bankAssets[0].paletteSlots.pop();assert.throws(()=>encodeProject(p),/palette slots/);
});

test('group parts stop meaning "slot in my own bank" and name the palette instead',()=>{
 const base=flat((slot,i)=>slot*8+i),other=[...base];other[3*8+2]=0xf81f;
 const p=legacyProject([{...legacyBank('Alpha',[...base]),id:'alpha'},{...legacyBank('Beta',other),id:'beta'}]);
 // Both parts said "palette 3" while showing different colors, which the hardware cannot do.
 p.sprites=[{name:'Hero',bank:0,plane:0,frames:[{ticks:6,parts:[
  {bankId:'alpha',tile:0,x:0,y:0,palette:3,flipX:false,flipY:false},
  {bankId:'beta',tile:1,x:8,y:0,palette:3,flipX:false,flipY:false}]}]}];
 migrateProjectPalettes(p);
 const [a,b]=p.sprites[0].frames[0].parts;
 assert.equal(a.palette,undefined);
 assert.notEqual(a.paletteId,b.paletteId,'parts that showed different colors must name different palettes');
 assert.deepEqual(findPalette(p.paletteLibrary,a.paletteId).colors,base.slice(24,32));
 assert.deepEqual(findPalette(p.paletteLibrary,b.paletteId).colors,other.slice(24,32));
 validateProject(p);
});

test('a bank binds only the palettes it uses, and compacting repoints its tiles',()=>{
 const p=legacyProject([legacyBank('Alpha',flat((slot,i)=>slot*8+i))]);
 migrateProjectPalettes(p);
 const bank=p.bankAssets[0],[a,b,c]=bank.paletteSlots;
 bank.cellPalettes[0]=0;bank.cellPalettes[1]=1;bank.cellPalettes[2]=2;
 // Two slots land on one palette, as a reassigning delete leaves them.
 bank.paletteSlots[1]=c;
 compactBankSlots(bank);
 assert.deepEqual(bank.paletteSlots.slice(0,2),[a,c]);
 assert.equal(new Set(bank.paletteSlots).size,bank.paletteSlots.length);
 assert.equal(bank.cellPalettes[1],1,'a tile on the duplicate slot follows the survivor');
 assert.equal(bank.cellPalettes[2],1,'the original slot for that palette is the survivor');
 validateProject(p);
});

test('removing a slot shifts the tiles above it and refuses while painted',()=>{
 const p=legacyProject([legacyBank('Alpha',flat((slot,i)=>slot*8+i))]);
 migrateProjectPalettes(p);
 const bank=p.bankAssets[0],third=bank.paletteSlots[2];
 bank.cellPalettes[0]=3;
 assert.throws(()=>removeBankSlot(bank,3),/painted/);
 removeBankSlot(bank,1);
 assert.equal(bank.paletteSlots.length,15);
 assert.equal(bank.paletteSlots[1],third,'slots above the removed one shift down');
 assert.equal(bank.cellPalettes[0],2,'tiles follow their palette');
 validateProject(p);
});

test('a bank may bind fewer than sixteen slots but never a slot its tiles lack',()=>{
 const p=legacyProject([legacyBank('Alpha',flat((slot,i)=>slot*8+i))]);
 migrateProjectPalettes(p);
 const bank=p.bankAssets[0];
 bank.paletteSlots=bank.paletteSlots.slice(0,2);
 validateProject(p);
 bank.cellPalettes[5]=2;
 assert.throws(()=>validateProject(p),/does not bind/);
 bank.cellPalettes[5]=1;
 bank.paletteSlots=[];
 assert.throws(()=>validateProject(p),/1 to 16/);
});

test('palette library rejects duplicate identities, duplicate names and wrong color counts',()=>{
 const p=legacyProject([]);migrateProjectPalettes(p);
 const valid={id:'a',name:'Grass',colors:Array(8).fill(0)};
 p.paletteLibrary=[valid,{...valid,name:'Other'}];assert.throws(()=>validateProject(p),/identities/);
 p.paletteLibrary=[valid,{...valid,id:'b'}];assert.throws(()=>validateProject(p),/names/);
 p.paletteLibrary=[{...valid,colors:Array(7).fill(0)}];assert.throws(()=>validateProject(p),/eight/);
});
