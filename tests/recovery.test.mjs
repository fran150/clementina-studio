import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RecoveryStore} from '../dist/apps/desktop/recovery.js';
import {emptyProject} from '../dist/packages/assets/index.js';
const tileset=()=>({id:'art',name:'Art',bpp:3,chr:Array(6144).fill(0),tilePaletteBanks:Array(256).fill(0),compositions:[]});
test('recovery snapshots survive restart, replace atomically, validate and clean up independently',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-recovery-'));
 try{
  const p=emptyProject();p.tilesets=[tileset()];
  const old=new RecoveryStore(dir,'old');await old.save(p);p.tilesets[0].chr[15]=5;await old.save(p);
  const next=new RecoveryStore(dir,'new');assert.deepEqual(await next.candidates(),['old.cstudio']);assert.equal((await next.read('old.cstudio')).tilesets[0].chr[15],5);
  assert.ok(!(await readdir(dir)).some(n=>n.endsWith('.tmp')));
  await next.save(p);await next.clear();assert.deepEqual(await next.candidates(),['old.cstudio']);
  await writeFile(path.join(dir,'bad.cstudio'),'broken');await assert.rejects(next.read('bad.cstudio'));
  await next.remove('old.cstudio');assert.deepEqual(await next.candidates(),['bad.cstudio']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
