import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeMtb,runtimePackage} from '../dist/packages/assets/index.js';
const project=()=>({chr:Array(49152).fill(0),palettes:Array(128).fill(0),modes:Array(8).fill(3),planes:Array(8).fill(0)});
test('MTB2 preserves plane positions and little endian palette words',()=>{
 const p=project();p.chr[2048]=129;p.palettes[0]=0xf81f;
 const bytes=encodeMtb(p);assert.equal(bytes.length,49440);assert.equal(bytes[32+2048],129);
 assert.deepEqual(Array.from(bytes.slice(49184,49186)),[31,248]);
 assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'MTB2');
});
test('runtime package uses exact loader argument order and full CHR banks',()=>{
 const p=project();p.modes[2]=1;p.chr[2*6144+4096]=255;
 const files=runtimePackage(p);assert.equal(files['BANK2.CHR'][4096],255);
 assert.equal(files['PAL15.BIN'].length,16);
 const loader=new TextDecoder().decode(files['LOADER.bas.txt']);
 assert.match(loader,/CHRLOAD 2,0,6144,"BANK2.CHR"/);assert.match(loader,/CHRMODE 2,1/);
 assert.match(loader,/PALLOAD 15,0,16,"PAL15.BIN"/);
});
test('bad projects fail before binary generation',()=>{
 const p=project();p.chr[0]=256;assert.throws(()=>runtimePackage(p));
 p.chr[0]=0;p.modes[0]=2;assert.throws(()=>encodeMtb(p));
});
