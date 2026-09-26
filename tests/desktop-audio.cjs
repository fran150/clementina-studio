// The Sounds and Music editors, driven with real mouse and keyboard input in
// the Electron renderer: drawing lanes and notes, selection, the clipboard,
// transforms, undo, presets, the envelope, song settings, instruments, one
// note per voice, legato, playback, and docked layouts at two window widths.
// Run with `npm run test:desktop:audio`.
const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');const path=require('node:path');const fs=require('node:fs');
app.whenReady().then(async()=>{
 ipcMain.handle('project:new',()=>{});ipcMain.on('menu:history',()=>{});
 const window=new BrowserWindow({show:false,width:1440,height:1000,webPreferences:{preload:path.resolve(__dirname,'../dist/apps/desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
 const run=source=>window.webContents.executeJavaScript(`(()=>{${source}})()`);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const key=async(keyCode,modifiers=[])=>{window.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});window.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await wait(50);};
 const mouse=async(type,p,button='left')=>{window.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),button,clickCount:1});await wait(30);};
 const drag=async(points,button='left')=>{await mouse('mouseDown',points[0],button);for(const p of points.slice(1))await mouse('mouseMove',p,button);await mouse('mouseUp',points.at(-1),button);await wait(40);};
 const click=async(p,button='left')=>drag([p],button);
 const soundAt=(frame,lane,t)=>run(`return $('soundEditor').pointAt(${frame},'${lane}',${t});`);
 const noteAt=(step,pitch)=>run(`return $('musicEditor').pointAt(${step},${pitch});`);
 const menuOn=async(p)=>run(`document.querySelector('.studioMenu')?.remove();const el=document.elementFromPoint(${p.x},${p.y});el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:${p.x},clientY:${p.y}}));const m=document.querySelector('.studioMenu');const labels=m?[...m.querySelectorAll('button span')].map(s=>s.textContent):null;m?.remove();return labels;`);
 const depth=()=>run(`return ProjectHistory.depth();`);
 try{
  await window.loadFile(path.resolve(__dirname,'../apps/desktop/editor.html'));
  window.webContents.focus();
  assert.equal(await run(`return !!window.MiaAudio&&typeof MiaAudio.compileSong;`),'function','the engine module must load');

  // ================= Sounds =================
  await run(`showView('sounds');`);
  assert.deepEqual(await run(`return {empty:!$('sfEmpty').hidden,work:$('sfWork').hidden};`),{empty:true,work:true});
  await run(`$('sfEmptyNew').click();`);
  assert.deepEqual(await run(`return {sounds:sounds.length,frames:sounds[0].frames.length,name:sounds[0].name,dock:!document.querySelector('.sfProps').hidden};`),{sounds:1,frames:16,name:'Sound_1',dock:true});

  // The pencil draws a lane; one stroke is one undo step.
  let before=await depth();
  await drag([await soundAt(1,'volume',0),await soundAt(3,'volume',0),await soundAt(5,'volume',0)]);
  assert.deepEqual(await run(`return sounds[0].frames.slice(0,7).map(f=>f.volume);`),[200,255,255,255,255,255,200],'a pencil stroke must set every frame it crosses');
  assert.equal(await depth(),before+1,'a stroke must be one undo step');
  assert.match(await run(`return $('sfUndo').title;`),/^Undo Draw the volume/);
  await key('Z',['control']);
  assert.ok(await run(`return sounds[0].frames.every(f=>f.volume===200);`),'undo must take the stroke back');
  // Pitch is drawn on a log scale and snaps to semitones.
  await drag([await soundAt(0,'freq',.25),await soundAt(0,'freq',.25)]);
  const drawnPitch=await run(`const n=MiaAudio.frequencyNote(sounds[0].frames[0].freq);return Math.abs(n-Math.round(n))<.01;`);
  assert.equal(drawnPitch,true,'a drawn pitch must land on a semitone while Snap is on');
  // Right-drag with a painting tool writes 0.
  await drag([await soundAt(4,'gate',.5),await soundAt(8,'gate',.5)],'right');
  assert.deepEqual(await run(`return sounds[0].frames.map(f=>f.gate);`),[...Array(4).fill(true),...Array(5).fill(false),...Array(3).fill(true),...Array(4).fill(false)]);
  // The line tool ramps.
  await key('L');
  await drag([await soundAt(0,'volume',1),await soundAt(8,'volume',.5),await soundAt(15,'volume',0)]);
  const ramp=await run(`return sounds[0].frames.map(f=>f.volume);`);
  assert.equal(ramp[0],0);assert.equal(ramp[15],255);assert.ok(ramp.every((v,i)=>!i||v>=ramp[i-1]),'a line must ramp evenly');

  // Select, copy, paste, delete, transpose and reverse frames.
  await key('S');
  await drag([await soundAt(2,'freq',.5),await soundAt(4,'freq',.5)]);
  assert.equal(await run(`return $('sfCopy').disabled;`),false);
  const freqs=await run(`return sounds[0].frames.map(f=>f.freq);`);
  await key('Up');
  assert.deepEqual(await run(`return sounds[0].frames.slice(2,5).map(f=>f.freq);`),freqs.slice(2,5).map(f=>Math.round(f*2**(1/12))),'↑ must transpose the selected frames a semitone');
  assert.equal(await run(`return sounds[0].frames[0].freq;`),freqs[0],'frames outside the selection must stay');
  await key('C',['control']);await key('V',['control']);
  assert.equal(await run(`return sounds[0].frames.length;`),19,'paste must insert the copied frames');
  assert.deepEqual(await run(`return $('soundEditor')&&sounds[0].frames.length;`),19);
  await key('Delete');
  assert.equal(await run(`return sounds[0].frames.length;`),16,'Delete must remove the pasted, selected frames');
  const volumes=await run(`return sounds[0].frames.map(f=>f.volume);`);
  await key('H',['shift']);
  assert.deepEqual(await run(`return sounds[0].frames.map(f=>f.volume);`),volumes.slice().reverse(),'Shift+H with no selection must reverse the whole sound');
  assert.deepEqual(await menuOn(await soundAt(3,'volume',.5)),['Cut','Copy','Paste','Duplicate','Delete','Reverse','Invert pitch','Transpose up','Transpose down','Select all','Deselect']);
  await key('B');
  assert.equal(await menuOn(await soundAt(3,'volume',.5)),null,'right-click with a painting tool must not open a menu');

  // Envelope, pan and length in the dock.
  before=await depth();
  await run(`const a=$('sfEnv_attack');a.value='9';a.dispatchEvent(new Event('input'));a.value='10';a.dispatchEvent(new Event('input'));a.dispatchEvent(new Event('change'));`);
  assert.deepEqual(await run(`return {attack:sounds[0].attack,out:$('sfEnv_attackOut').textContent};`),{attack:10,out:'500 ms'});
  assert.equal(await depth(),before+1,'one slider drag must be one undo step');
  await run(`const l=$('sfLength');l.value='20';l.dispatchEvent(new Event('change'));`);
  assert.equal(await run(`return sounds[0].frames.length;`),20);

  // A preset replaces the sound and plays it.
  await run(`$('sfPreset_coin').click();`);
  assert.deepEqual(await run(`MiaAudio.validateSounds(sounds);return {playing:StudioAudio.playing(),icon:$('sfPlay').getAttribute('aria-label'),undo:$('sfUndo').title};`),{playing:true,icon:'Stop (Space)',undo:'Undo Generate coin (Ctrl/Cmd+Z)'});
  await wait(250);
  assert.ok(await run(`return $('sfPosition').textContent.startsWith('Frame');`),'the transport must show the playing frame');
  await run(`$('sfPlay').click();`);
  assert.equal(await run(`return StudioAudio.playing();`),false,'Play must stop what plays');
  await run(`$('sfPreset_explosion').click();$('sfPlay').click();`);

  // ================= Music =================
  await run(`showView('music');`);
  assert.equal(await run(`return StudioAudio.playing();`),false,'leaving an editor must stop its sound');
  assert.deepEqual(await run(`return {empty:!$('muEmpty').hidden,instruments:instruments.length};`),{empty:true,instruments:0});
  await run(`$('muEmptyNew').click();`);
  assert.deepEqual(await run(`return {songs:songs.length,instruments:instruments.map(i=>i.name),undo:$('muUndo').title};`),{songs:1,instruments:['Lead','Bass','Keys','Drum'],undo:'Undo New song (Ctrl/Cmd+Z)'});

  // The pencil adds a note of the last length; dragging sizes it.
  await click(await noteAt(0.5,60));
  const lead=await run(`return instruments[0].id;`);
  assert.deepEqual(await run(`return songs[0].voices[0].notes;`),[{step:0,length:4,pitch:60,instrumentId:lead}]);
  await drag([await noteAt(8.5,64),await noteAt(9.5,64),await noteAt(10.5,64)]);
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>[n.step,n.length,n.pitch]);`),[[0,4,60],[8,3,64]],'dragging a new note must size it');
  // Dragging a note moves it; dragging its end resizes it.
  await drag([await noteAt(1,60),await noteAt(3,62),await noteAt(3,62)]);
  assert.deepEqual(await run(`return songs[0].voices[0].notes[0];`),{step:2,length:4,pitch:62,instrumentId:lead},'dragging a note must move it in time and pitch');
  assert.match(await run(`return $('muUndo').title;`),/^Undo Move notes/);
  await drag([await noteAt(10.85,64),await noteAt(12.9,64),await noteAt(13,64)]);
  assert.equal(await run(`return songs[0].voices[0].notes[1].length;`),5,'dragging a note\'s end must resize it');
  // One note at a time: a note drawn over another cuts it.
  await click(await noteAt(4.5,70));
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>[n.step,n.length,n.pitch]);`),[[2,2,62],[4,5,70],[9,4,64]],'a voice plays one note at a time');
  await key('Z',['control']);
  // Another voice, from the number keys.
  await key('2');
  await click(await noteAt(0.5,36));
  assert.deepEqual(await run(`return {v0:songs[0].voices[0].notes.length,v1:songs[0].voices[1].notes.map(n=>n.pitch),strip:[...document.querySelectorAll('.muVoice')].map(v=>v.getAttribute('aria-checked'))};`),{v0:2,v1:[36],strip:['false','true','false','false']});
  // Right-click with the pencil erases; the eraser does too.
  await click(await noteAt(1,36),'right');
  assert.equal(await run(`return songs[0].voices[1].notes.length;`),0,'right-click with the pencil must erase');
  await key('1');

  // Select, transpose, copy and paste at the cursor, legato, reverse.
  await key('S');
  await drag([await noteAt(0.2,75),await noteAt(15,55)]);
  assert.equal(await run(`return $('muCopy').disabled;`),false,'a box must select the notes it touches');
  await key('Up');
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>n.pitch);`),[63,65]);
  await key('Up',['shift']);
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>n.pitch);`),[75,77],'Shift+↑ must move an octave');
  await key('Right');
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>n.step);`),[3,9]);
  await key('L');
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>!!n.legato);`),[true,true]);
  assert.equal(await run(`return $('muLegato').classList.contains('on');`),true);
  await key('C',['control']);
  await click(await run(`const r=$('muCanvas').getBoundingClientRect(),p=$('musicEditor').pointAt(32,60);return {x:p.x,y:r.top+10};`));
  await key('V',['control']);
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>[n.step,n.pitch]);`),[[3,75],[9,77],[32,75],[38,77]],'paste must land at the cursor');
  await key('H',['shift']);
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>[n.step,n.pitch]);`),[[3,75],[9,77],[32,77],[39,75]],'Shift+H must reverse the selected notes in time');
  const menu=await menuOn(await noteAt(33,77));
  assert.deepEqual(menu,['Cut','Copy','Paste at the cursor','Duplicate','Delete','Transpose up','Transpose down','Reverse','Invert','Legato','Select all','Deselect']);
  await key('Delete');
  assert.equal(await run(`return songs[0].voices[0].notes.length;`),2);

  // An instrument click gives the selected notes that instrument.
  await key('A',['control']);
  await run(`$('muInstrumentLibraryToggle').click();$('muInstrumentList').children[2].click();`);
  assert.deepEqual(await run(`return songs[0].voices[0].notes.map(n=>instruments.find(i=>i.id===n.instrumentId).name);`),['Keys','Keys']);
  // The instrument's settings, as one undo step each.
  await run(`$('muInstrumentPropsToggle').click();const w=$('muWave');w.value='4';w.dispatchEvent(new Event('change'));`);
  assert.deepEqual(await run(`return {wave:instruments[2].wave,undo:$('muUndo').title,pulse:$('muPulse').disabled};`),{wave:4,undo:'Undo Change the waveform (Ctrl/Cmd+Z)',pulse:true});
  await key('Z',['control']);
  assert.equal(await run(`return instruments[2].wave;`),2);
  // Deleting an instrument hands its notes to the next one.
  await run(`$('muInstrumentList').children[2].click();$('muInstrumentDelete').click();`);
  assert.deepEqual(await run(`return {names:instruments.map(i=>i.name),notes:songs[0].voices[0].notes.map(n=>instruments.find(i=>i.id===n.instrumentId)?.name)};`),{names:['Lead','Bass','Drum'],notes:['Drum','Drum']});
  await key('Z',['control']);

  // Song settings.
  await run(`$('muSongPropsToggle').click();const b=$('muBpm');b.value='150';b.dispatchEvent(new Event('change'));`);
  assert.equal(await run(`return songs[0].bpm;`),150);
  await run(`const s=$('muStepsPerBeat');s.value='8';s.dispatchEvent(new Event('change'));`);
  assert.deepEqual(await run(`return {length:songs[0].length,notes:songs[0].voices[0].notes.map(n=>[n.step,n.length])};`),{length:128,notes:[[6,8],[18,10]]},'a finer step must keep every note where it was in time');
  await run(`const s=$('muBars');s.value='2';s.dispatchEvent(new Event('change'));`);
  assert.equal(await run(`return songs[0].length;`),64);
  assert.match(await run(`return $('muBytes').textContent;`),/Voice 0 · \d+ bytes, 2 notes.*Voice 1 · free/s);

  // Play and pause: pausing leaves the cursor where it stopped.
  await run(`$('muRewind').click();$('muPlay').click();`);
  assert.deepEqual(await run(`return {playing:StudioAudio.playing(),label:$('muPlay').getAttribute('aria-label')};`),{playing:true,label:'Pause (Space)'});
  await wait(600);
  await run(`$('muPlay').click();`);
  assert.equal(await run(`return StudioAudio.playing();`),false);
  assert.match(await run(`return $('muPosition').textContent;`),/^Bar 1 · beat [2-4]/,'pausing must leave the cursor where the song was');
  // Space, tapped, plays and pauses; held, it pans, as on every canvas.
  await run(`$('muCanvas').focus();`);
  await key('Space');
  assert.equal(await run(`return StudioAudio.playing();`),true,'a Space tap must play');
  await key('Space');
  assert.equal(await run(`return StudioAudio.playing();`),false,'a second tap must pause');
  const scrolled=await run(`const p=$('musicEditor').pointAt(0,60);return p;`);
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'Space'});await wait(30);
  await drag([scrolled,{x:scrolled.x,y:scrolled.y+120}]);
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'Space'});await wait(50);
  assert.deepEqual(await run(`return {playing:StudioAudio.playing(),moved:$('musicEditor').pointAt(0,60).y!==${scrolled.y}};`),{playing:false,moved:true},'Space-drag must pan, not play');

  // Docked panels sit beside the roll at both window widths.
  for(const width of [1440,1024]){
   window.setSize(width,900);await wait(200);
   // Eight tabs, the config picker and the file actions fit one row.
   assert.deepEqual(await run(`const n=$('workflowNav');return {fits:n.scrollWidth<=n.clientWidth,height:n.getBoundingClientRect().height};`),{fits:true,height:44},`the tab bar at ${width}`);
   for(const [view,toggle,canvas] of [['music','muLibraryToggle','muCanvas'],['sounds','sfLibraryToggle','sfCanvas']]){
    await run(`showView('${view}');if($('${toggle}').getAttribute('aria-expanded')!=='true')$('${toggle}').click();`);await wait(120);
    const bounds=await run(`const main=document.querySelector('#${view==='music'?'musicEditor':'soundEditor'} main').getBoundingClientRect(),left=$($('${toggle}').getAttribute('aria-controls')).getBoundingClientRect(),c=$('${canvas}').getBoundingClientRect();return {clear:left.right<=main.left+1,inside:c.left>=main.left-1&&c.right<=main.right+1,wide:c.width>300};`);
    assert.deepEqual(bounds,{clear:true,inside:true,wide:true},`${view} at ${width}`);
    if(process.env.STUDIO_CAPTURE_DIR)fs.writeFileSync(path.join(process.env.STUDIO_CAPTURE_DIR,`${view}-${width}.png`),(await window.webContents.capturePage()).toPNG());
   }
  }

  // The project keeps it all, and it validates.
  const project=await run(`return studioProject();`);
  const {validateProject,encodeProject,decodeProject}=await import('../dist/packages/assets/index.js');
  validateProject(project);
  assert.deepEqual(decodeProject(encodeProject(project)),project);
  await run(`restoreStudioProject(${JSON.stringify(project)},'Audio.cstudio');`);
  assert.deepEqual(await run(`return {sounds:sounds.length,songs:songs.length,instruments:instruments.length};`),{sounds:1,songs:1,instruments:4});
  assert.deepEqual(errors,[]);console.log('desktop audio: ok');app.exit(0);
 }catch(e){console.error(e,errors);app.exit(1);}
});
