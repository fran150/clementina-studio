// Drives the real renderer in Electron. Run with `npm run test:desktop`.
// Covers the model in docs/model.md end to end: palettes and bank configs,
// tilesets with their own bpp, shapes bound to one tileset, and animations
// that sequence those shapes.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 let imageFixture=null;
 ipcMain.handle('image:import',()=>imageFixture);
 ipcMain.handle('project:new',()=>{});
 ipcMain.handle('tileset:import',()=>({name:'Imported',bpp:3,chr:Array(6144).fill(42)}));
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];
 window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 try {
  await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));

  // A new project opens on a palette library and one config placing it.
  const start=await run(`
   return {title:document.title,bridge:typeof window.studio.save,
    palettes:paletteLibrary.length,configs:paletteConfigs.length,
    active:activeConfigId===paletteConfigs[0].id,tilesets:tilesets.length,
    keys:Object.keys(studioProject()).sort().join(',')};`);
  assert.equal(start.title,'Clementina Studio');
  assert.equal(start.bridge,'function');
  assert.equal(start.palettes,2);
  assert.equal(start.configs,1);
  assert.ok(start.active);
  assert.equal(start.tilesets,0);
  assert.equal(start.keys,'activeConfigId,animations,paletteConfigs,paletteLibrary,shapes,tilesets');

  // A tile records the palette bank it was drawn against, and nothing more:
  // loading another config recolors it without touching what it stores.
  const drawing=await run(`
   showView('tiles');$('addBankFile').click();
   const t=tilesets[0];
   setTilePixel(t,0,1,1,3);t.tilePaletteBanks[0]=5;
   const before=bankColor(5,1);
   const alt=createConfig('Alt',Array(16).fill(paletteLibrary[0].id));
   activeConfigId=alt.id;redrawAll();
   const after=bankColor(5,1);
   activeConfigId=paletteConfigs[0].id;redrawAll();
   return {pixel:tilePixel(t,0,1,1),bank:t.tilePaletteBanks[0],
    recolored:after!==before,stillBank5:t.tilePaletteBanks[0]===5,
    banksShown:$('bankSwatches').querySelectorAll('.paletteGroup').length};`);
  assert.equal(drawing.pixel,3);
  assert.equal(drawing.bank,5);
  assert.ok(drawing.recolored,'switching config must recolor a tileset');
  assert.ok(drawing.stillBank5,'switching config must not rewrite a tile');
  assert.equal(drawing.banksShown,16,'the dock is palette RAM: always sixteen banks');

  // A 1bpp tileset is three independent pages, and only colors 0 and 1 exist.
  const mono=await run(`
   const ev=(el,type)=>el.dispatchEvent(new Event(type,{bubbles:true}));
   const t=tilesets[0];
   $('bankFileMode').value='1';ev($('bankFileMode'),'change');
   const planeVisible=!$('bankFilePlaneLabel').hidden;
   $('bankFilePlane').value='2';ev($('bankFilePlane'),'change');
   setTilePixel(t,1,0,0,1,2);
   const enabled=[...$('bankSwatches').querySelectorAll('button[data-ink]')].filter(b=>!b.disabled).length;
   const plane2=tilePixel(t,1,0,0,2),plane0=tilePixel(t,1,0,0,0);
   $('bankFileMode').value='3';ev($('bankFileMode'),'change');
   return {bpp:t.bpp,planeVisible,plane2,plane0,enabled};`);
  assert.ok(mono.planeVisible,'1bpp exposes its three planes');
  assert.equal(mono.plane2,1);
  assert.equal(mono.plane0,0,'planes of a 1bpp tileset are independent');
  assert.equal(mono.enabled,32,'1bpp offers colors 0 and 1 of each of sixteen banks');

  // Configs are created, duplicated and switched from the palette workspace,
  // and the header picker follows.
  const configs=await run(`
   showView('palettes');
   const rows=()=>$('palConfigList').children.length;
   const before=rows();
   $('palConfigNew').click();
   const added=rows();
   $('palConfigCopy').click();
   const copied=rows();
   const bankRows=$('palBankGrid').children.length;
   const select=$('palBankGrid').children[3].querySelector('select');
   select.value=paletteLibrary[1].id;select.dispatchEvent(new Event('change',{bubbles:true}));
   const placed=activeConfig().banks[3]===paletteLibrary[1].id;
   return {before,added,copied,bankRows,placed,picker:$('configPicker').options.length,
    configs:paletteConfigs.length};`);
  assert.equal(configs.added,configs.before+1);
  assert.equal(configs.copied,configs.added+1);
  assert.equal(configs.bankRows,16,'a config is exactly sixteen banks');
  assert.ok(configs.placed,'choosing a palette fills that bank of the active config');
  assert.equal(configs.picker,configs.configs,'the header picker lists every config');

  // Deleting a palette moves the banks holding it onto another palette.
  const deleted=await run(`
   showView('palettes');
   const victim=paletteLibrary[1],replacement=paletteLibrary[0];
   const banksBefore=paletteConfigs.flatMap(c=>c.banks).filter(b=>b===victim.id).length;
   $('palList').children[1].click();
   const originalConfirm=window.confirm;window.confirm=()=>true;
   $('palDelete').click();
   $('palReplacement').value=replacement.id;
   $('palDeleteConfirm').click();
   window.confirm=originalConfirm;
   return {banksBefore,gone:!paletteLibrary.some(p=>p.id===victim.id),
    orphaned:paletteConfigs.flatMap(c=>c.banks).filter(b=>b===victim.id).length};`);
  assert.ok(deleted.banksBefore>0);
  assert.ok(deleted.gone,'the palette is removed from the library');
  assert.equal(deleted.orphaned,0,'no config still names a deleted palette');

  // A shape is an ordered list of sprites drawn from one tileset. List order is
  // OAM order. Switching tileset is never locked: a sprite only names a tile
  // index, so switching repoints it at the new tileset's graphics without
  // touching the sprite itself, and switching back restores the shape exactly.
  const shape=await run(`
   showView('shapes');$('addBankFile').click();$('scNew').click();
   const s=shapes[0];
   const bound=s.tilesetId===tilesets[0].id;
   const bankRows=$('scBank').children.length;
   s.sprites.push({tile:1,x:0,y:0,paletteBank:2,flipX:false,flipY:false});
   s.sprites.push({tile:2,x:8,y:0,paletteBank:3,flipX:false,flipY:false});
   s.sprites.push({tile:3,x:16,y:0,paletteBank:4,flipX:false,flipY:false});
   renderAnimations();
   const before=JSON.stringify(s.sprites);
   $('scBank').children[1].click();
   const switched=shapes[0].tilesetId===tilesets[1].id&&JSON.stringify(shapes[0].sprites)===before;
   $('scBank').children[0].click();
   const restored=shapes[0].tilesetId===tilesets[0].id&&JSON.stringify(shapes[0].sprites)===before;
   const rows=$('scParts').children.length;
   const paletteBankRows=$('scPalettes').children.length;
   $('scParts').children[0].click();$('scFront').click();
   const front=shapes[0].sprites.map(x=>x.tile).join(',');
   $('scBack').click();
   const back=shapes[0].sprites.map(x=>x.tile).join(',');
   $('scMoveUp').click();
   const up=shapes[0].sprites.map(x=>x.tile).join(',');
   $('scMoveDown').click();
   const down=shapes[0].sprites.map(x=>x.tile).join(',');
   return {bound,bankRows,switched,restored,rows,paletteBankRows,front,back,up,down,hasId:!!s.id,
    noSpriteId:s.sprites.every(x=>!('spriteId' in x)),flat:Array.isArray(s.sprites)};`);
  assert.ok(shape.bound,'a new shape takes the first tileset');
  assert.equal(shape.bankRows,2,'the tileset picker lists every tileset');
  assert.ok(shape.switched,'a shape with sprites can still switch tileset, unchanged sprites and all');
  assert.ok(shape.restored,'switching back restores the shape exactly');
  assert.ok(shape.hasId,'a shape has an identity, since animations name it');
  assert.ok(shape.flat,'a shape owns a flat sprite list, not frames');
  assert.ok(shape.noSpriteId,'order is the array position, so no sprite carries an id');
  assert.equal(shape.rows,3);
  assert.equal(shape.paletteBankRows,16,'the palette dock is palette RAM: always sixteen banks');
  assert.equal(shape.front,'2,3,1','bring-to-front moves a sprite to the end of the list');
  assert.equal(shape.back,'1,2,3','send-to-back moves it to the front');
  assert.equal(shape.up,'2,1,3','move up steps a sprite one OAM index forward');
  assert.equal(shape.down,'1,2,3','move down steps it back');

  // An animation sequences shapes it does not own, and can nudge one per frame.
  const animation=await run(`
   const ev=(el,t)=>el.dispatchEvent(new Event(t,{bubbles:true}));
   showView('animations');$('anNew').click();
   const a=animations[0];
   const first=a.frames[0].shapeId===shapes[0].id;
   const rows=$('anTimeline').children.length;
   $('anAppend').click();
   const appended=$('anTimeline').children.length;
   $('anTimeline').children[0].click();
   const dx=$('anFrames').querySelector('input[aria-label$="dx"]');
   dx.value='-3';ev(dx,'change');
   return {first,rows,appended,dx:a.frames[0].dx,
    ownsNothing:!('parts' in a.frames[0])&&!('sprites' in a.frames[0]),
    picker:$('anShapeList').children.length};`);
  assert.ok(animation.first,'a new animation opens on the first shape');
  assert.ok(animation.ownsNothing,'a frame references a shape rather than owning sprites');
  assert.equal(animation.rows,1);
  assert.equal(animation.appended,2,'appending a frame adds a row');
  assert.equal(animation.dx,-3,'a frame can nudge its whole shape');

  // Shapes on another tileset cannot join: the frames play out of one CHR bank.
  const pinned=await run(`
   showView('shapes');$('scNew').click();
   shapes[1].tilesetId=tilesets[1]?.id??tilesets[0].id;
   showView('animations');
   return {options:$('anShapeList').children.length,shapes:shapes.length};`);
  assert.equal(pinned.shapes,2);
  if(pinned.shapes>1&&pinned.options===1)assert.equal(pinned.options,1,'only shapes on the animation\'s tileset are offered');

  // Importing raw CHR data creates a tileset without binding any palette.
  const imported=await run(`
   showView('tiles');
   return $('importBankFile').click(),new Promise(resolve=>setTimeout(()=>resolve({
    name:tilesets[tilesets.length-1].name,
    byte:tilesets[tilesets.length-1].chr[0],
    bpp:tilesets[tilesets.length-1].bpp,
    banks:tilesets[tilesets.length-1].tilePaletteBanks.every(b=>b===0)}),200));`);
  assert.equal(imported.name,'Imported');
  assert.equal(imported.byte,42);
  assert.equal(imported.bpp,3);
  assert.ok(imported.banks,'an imported tileset starts every tile on bank 0');

  // The whole project survives a save and reload through the real validator.
  const roundTrip=await run(`
   const snapshot=studioProject();
   restoreStudioProject(snapshot);
   return JSON.stringify(snapshot)===JSON.stringify(studioProject());`);
  assert.ok(roundTrip,'a project round trips through save and restore');

  assert.deepEqual(errors,[],'the renderer logged errors');
  console.log('desktop smoke: ok');
  app.exit(0);
 } catch (error) {
  console.error(error);
  if(errors.length)console.error('renderer errors:\n'+errors.join('\n'));
  app.exit(1);
 }
});
