import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadProject,saveProject} from '@clementina/project/node';
import {emptyProject,encodeProject,decodeProject} from '../dist/packages/assets/index.js';
import {defaultAssets,inspectBuilder,writeBuilderProject,writePortableStudioProject,readPortableStudioProject,readBuilderFolder,buildStudioProject} from '../dist/apps/desktop/builder.js';

test('Builder settings survive Studio save and recovery snapshots',()=>{
 const p=emptyProject();p.builder=defaultAssets();p.builder.slots.push({name:'maps',mia:0x14000,size:4096});
 assert.deepEqual(decodeProject(encodeProject(p)).builder,p.builder);
});
const hasTools=['ca65','ld65','ar65'].every(t=>spawnSync(t,[t==='ar65'?'V':'--version'],{stdio:'ignore'}).status===0);
test('Builder plans through the SDK, writes a portable folder and preserves program source',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-builder-')),p=emptyProject(),settings=defaultAssets();
 settings.include.push({kind:'paletteConfig',id:p.paletteConfigs[0].id,slot:'palettes'});
 const plan=inspectBuilder(p,settings,'Test');assert.equal(plan.ok,true,JSON.stringify(plan.diagnostics));assert.equal(plan.catalog[0].kind,'paletteConfig');
 await writeBuilderProject(root,p,settings,'Test');assert.deepEqual((await readBuilderFolder(root)).settings,settings);
 const source='.setcpu "65C02"\n.export game_start\n.segment "CODE"\ngame_start: jmp game_start\n';
 await writeFile(join(root,'src/main.s'),source);
 await writeBuilderProject(root,p,settings,'Test');assert.equal(await readFile(join(root,'src/main.s'),'utf8'),source);
});
test('Builder builds the written folder with the real toolchain',{skip:!hasTools},async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-builder-build-')),p=emptyProject(),settings=defaultAssets();
 settings.include.push({kind:'paletteConfig',id:p.paletteConfigs[0].id,slot:'palettes'});
 const built=await buildStudioProject(root,p,settings,'Test');assert.equal(built.ok,true,JSON.stringify(built.diagnostics));assert.equal(built.value.sdRoot,'build/sd');
});
test('Builder refuses unrelated nonempty output folders and reports invalid settings',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-builder-refuse-'));await writeFile(join(root,'notes.txt'),'keep');
 await assert.rejects(writeBuilderProject(root,emptyProject(),defaultAssets(),'Test'),/empty folder/);
 assert.equal(await readFile(join(root,'notes.txt'),'utf8'),'keep');
 const settings=defaultAssets();settings.slots.push({name:'bad',mia:0,size:1});assert.equal(inspectBuilder(emptyProject(),settings,'Test').ok,false);
});
test('A save asks before taking assets the Studio project lacks out of clementina.yaml',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-builder-remove-')),mine=emptyProject(),other=emptyProject();
 const written=await writeBuilderProject(root,mine,defaultAssets(),'Test');
 const manifest=()=>readFile(join(root,'clementina.yaml'),'utf8'),before=await manifest();
 // Saving the same project again removes nothing, so nothing asks.
 assert.ok(await writeBuilderProject(root,mine,defaultAssets(),'Test',()=>assert.fail('asked')));
 // Another project's save names every asset it would remove, and declining writes nothing.
 let asked;
 assert.equal(await writeBuilderProject(root,other,defaultAssets(),'Test',removed=>{asked=removed;return false;}),undefined);
 assert.deepEqual(asked.map(a=>a.id).sort(),Object.values(written.assets).flat().map(a=>a.id).sort());
 assert.equal(await writeBuilderProject(root,other,defaultAssets(),'Test'),undefined,'declines unless asked');
 assert.equal(await buildStudioProject(root,other,defaultAssets(),'Test'),undefined,'a build saves first');
 assert.equal(await manifest(),before);
 // Confirming replaces the folder's assets with the Studio project's.
 assert.ok(await writeBuilderProject(root,other,defaultAssets(),'Test',async()=>true));
 const loaded=await loadProject(root);assert.equal(loaded.ok,true);
 assert.deepEqual(loaded.value.assets.paletteConfigs.map(c=>c.id),other.paletteConfigs.map(c=>c.id));
});

test('A portable BASIC project opens and saves through Studio without changing its paths or animation ID',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-portable-basic-'));
 await cp(new URL('../../clementina-sdk/examples/minimal-game/',import.meta.url),root,{recursive:true});
 const before=(await loadProject(root)).value;
 const source=await readFile(join(root,before.manifest.program.entry),'utf8');
 const opened=await readPortableStudioProject(root);
 assert.equal(opened.project.animations[0].id,before.assets.animations[0].id);
 opened.project.animations[0].name='Renamed';
 assert.ok(await writePortableStudioProject(root,opened.project,opened.project.builder,'Ignored'));
 const after=(await loadProject(root)).value;
 assert.deepEqual(after.manifest,before.manifest);
 assert.equal(after.assets.animations[0].id,before.assets.animations[0].id);
 assert.equal(after.assets.animations[0].name,'Renamed');
 assert.equal(await readFile(join(root,before.manifest.program.entry),'utf8'),source);
});

test('Builder retains custom portable asset paths after opening a folder',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-portable-paths-'));
 await writeBuilderProject(root,emptyProject(),defaultAssets(),'Test');
 const original=(await loadProject(root)).value;
 original.manifest.description='Keep this metadata';
 original.manifest.assets.paletteConfigs[0]='custom/config.json';
 await saveProject(root,original);
 const opened=await readBuilderFolder(root);
 assert.equal(opened.project.paletteConfigs[0].id,original.assets.paletteConfigs[0].id);
 assert.ok(await writeBuilderProject(root,opened.project,opened.settings,'Ignored',()=>assert.fail('asked')));
 const after=(await loadProject(root)).value;
 assert.equal(after.manifest.assets.paletteConfigs[0],'custom/config.json');
 assert.equal(after.manifest.description,'Keep this metadata');
});
