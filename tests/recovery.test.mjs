import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {RecoveryStore} from '../dist/apps/desktop/recovery.js';
test('recovery snapshots survive restart, replace atomically, validate and clean up independently',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'studio-recovery-'));
 try{
  const p={chr:Array(49152).fill(0),palettes:Array(128).fill(0),modes:Array(8).fill(3),planes:Array(8).fill(0),bankAssets:[],animations:[],sprites:[]};
  const old=new RecoveryStore(dir,'old');await old.save(p);p.chr[15]=5;await old.save(p);
  const next=new RecoveryStore(dir,'new');assert.deepEqual(await next.candidates(),['old.cstudio']);assert.equal((await next.read('old.cstudio')).chr[15],5);
  assert.ok(!(await readdir(dir)).some(n=>n.endsWith('.tmp')));
  await next.save(p);await next.clear();assert.deepEqual(await next.candidates(),['old.cstudio']);
  await writeFile(path.join(dir,'bad.cstudio'),'broken');await assert.rejects(next.read('bad.cstudio'));
  await next.remove('old.cstudio');assert.deepEqual(await next.candidates(),['bad.cstudio']);
 }finally{await rm(dir,{recursive:true,force:true});}
});
