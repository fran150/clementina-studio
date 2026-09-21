import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyProject,encodeProject,decodeProject,fromStudioProjectV2,toStudioProjectV2} from '../dist/packages/assets/index.js';
import {checkAssetSet} from '@clementina/assets';
test('Studio shares SDK portable conversion without altering session persistence',()=>{
 const studio=emptyProject();
 studio.tilesets.push({id:'tileset:test',name:'Test',bpp:3,chr:Array(6144).fill(0),tilePaletteBanks:Array(256).fill(0),compositions:[],previewBackground:'#123456'});
 const saved=encodeProject(studio);
 const portable=fromStudioProjectV2(studio);
 assert.equal(checkAssetSet(portable).ok,true);
 assert.equal('previewBackground' in portable.tilesets[0],false);
 assert.deepEqual(decodeProject(saved),studio);
 const restored=toStudioProjectV2(portable);
 assert.equal(restored.tilesets[0].id,studio.tilesets[0].id);
 assert.equal(studio.tilesets[0].previewBackground,'#123456');
});
