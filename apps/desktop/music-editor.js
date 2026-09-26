// Music authoring. A song is four voices of notes on a step grid — MIA's four
// voices, each playing one note at a time — and plays as the background
// sequencer plays it: compiled to each voice's track (compileSong in
// packages/assets/audio.ts) and run on the same engine as the chip. A note
// plays an instrument, the registers the sequencer's SET_* opcodes put on a
// voice between notes. See docs/audio.md.
(() => {
 const host=document.createElement('section');host.id='musicEditor';host.className='studioEditor';host.hidden=true;
 host.innerHTML=`<aside class="muLibrary studioDock studioDockLeft"><h2>Songs</h2><div id="muActions" class="assetToolbar"></div><div id="muList" role="listbox" aria-label="Songs"></div><p>Double-click a song to rename it.</p></aside>
 <aside class="muInstrumentLibrary studioDock studioDockLeft"><h2>Instruments</h2><div id="muInstrumentActions" class="assetToolbar"></div><div id="muInstrumentList" role="listbox" aria-label="Instruments"></div><p>The pencil draws with the selected instrument. With notes selected, clicking an instrument gives it to them. Its settings are in the Instrument panel on the right.</p></aside>
 <main class="studioMain"><div id="muEmpty" class="studioEmpty" role="status"><p>No songs yet. A song plays up to four voices on MIA's background sequencer.</p><div class="studioEmptyActions"><button id="muEmptyNew">New song</button></div></div>
  <div id="muWork">
   <div class="muTop"><div class="studioBarStart"><strong id="muTitle"></strong></div><div class="studioBarEnd"></div></div>
   <div id="muVoices" role="radiogroup" aria-label="Voice the pencil draws on"></div>
   <div id="muStage" class="studioStage audioStage"><canvas id="muCanvas" tabindex="0" aria-label="Piano roll: pitch up, time across"></canvas></div>
   <div id="muTransport" class="audioTransport"><button id="muRewind"></button><button id="muPlay" aria-pressed="false"></button><span id="muPosition"></span></div>
   <div id="muStatus"></div>
  </div>
 </main>
 <aside class="muSongProps studioDock studioDockRight audioDock"><h2>Song</h2>
  <h3>Tempo</h3>
  <label class="audioField"><span>BPM</span><input id="muBpm" type="number" min="20" max="400" aria-label="Beats per minute"><output id="muBpmOut"></output></label>
  <label class="audioField"><span>Steps</span><select id="muStepsPerBeat" aria-label="Steps per beat"></select></label>
  <label class="audioField"><span>Beats</span><input id="muBeatsPerBar" type="number" min="1" max="16" aria-label="Beats per bar"><output>per bar</output></label>
  <h3>Length</h3>
  <label class="audioField"><span>Bars</span><input id="muBars" type="number" min="1" step="any" aria-label="Length in bars"><output id="muLengthOut"></output></label>
  <label class="audioField"><span>Loop</span><select id="muLoop" aria-label="Whether the song loops"><option value="loop">Loops back</option><option value="once">Plays once</option></select></label>
  <label class="audioField" id="muLoopFromRow"><span>From bar</span><input id="muLoopFrom" type="number" min="1" step="any" aria-label="Bar the loop returns to"><output id="muLoopOut"></output></label>
  <h3>Voices</h3><div id="muPans"></div>
  <h3>Sequencer</h3><div id="muBytes" class="audioReadout"></div>
  <p>Each voice with notes becomes one track in MIA RAM. Started together, they play on their own; the 6502 pays nothing per note. A voice without notes stays free for sound effects.</p>
 </aside>
 <aside class="muInstrumentProps studioDock studioDockRight audioDock"><h2>Instrument</h2><div id="muInstrumentName" class="audioReadout"></div>
  <label class="audioField"><span>Wave</span><select id="muWave" aria-label="Waveform"></select></label>
  <label class="audioField"><span>Pulse</span><input id="muPulse" type="range" min="0" max="255" aria-label="Pulse width, 0 to 255"><output id="muPulseOut"></output></label>
  <label class="audioField"><span>Volume</span><input id="muVolume" type="range" min="0" max="255" aria-label="Volume, 0 to 255"><output id="muVolumeOut"></output></label>
  <h3>Envelope</h3>${StudioAudio.envelopeRows('muEnv_')}<canvas id="muEnvelope" class="envelope" width="472" height="128" aria-label="The envelope of a quarter-second note"></canvas>
  <p>Click the keyboard at the left of the roll to hear the instrument at that pitch.</p>
 </aside>`;
 $('spritePanel').after(host);
 const style=document.createElement('style');style.textContent=`
 #muWork{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
 .muTop{display:flex;align-items:center;gap:14px;padding:8px 18px;background:var(--panel)}
 #muTitle{color:var(--ink);font-size:13px}
 #muStatus{padding:6px 18px;font-size:10px;color:var(--text-dim)}
 #muList,#muInstrumentList{border:1px solid var(--line);background:var(--bg);min-height:90px;max-height:45vh;overflow:auto}
 #muVoices{display:flex;gap:6px;padding:6px 12px;background:var(--panel);border-top:1px solid var(--line)}
 .muVoice{display:flex;align-items:stretch;border:1px solid var(--line);border-radius:4px;overflow:hidden}
 .muVoice button{border:0;border-radius:0;padding:4px 9px;display:flex;align-items:center;gap:7px;font-size:11px}
 .muVoice .muVoicePick{min-width:136px;justify-content:flex-start}
 .muVoice .muVoicePick i{width:10px;height:10px;border-radius:2px;flex:none}
 .muVoice .muVoicePick small{color:var(--text-dim);font-size:10px}
 .muVoice[aria-checked=true]{border-color:var(--ink)}.muVoice[aria-checked=true] .muVoicePick{background:#322a1d;color:var(--ink)}
 .muVoice .muMute{border-left:1px solid var(--line);padding:4px 6px}.muVoice .muMute svg{width:16px;height:16px}
 .muVoice .muMute.on{background:#4a1d1d;color:#ff8a8a}
 #muPans .audioField span i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px}
 #muBytes b{color:var(--ink);font-weight:normal}
 `;document.head.append(style);

 const A=()=>window.MiaAudio,COLORS=StudioAudio.voiceColors;
 const KEYS_W=54,RULER_H=24,ROW_H=12,STEP_W=16,NOTES=96,BLACK=[1,3,6,8,10];
 let songIndex=0,instrumentIndex=0,voice=0,tool='pencil',zoom=1,scrollX=0,scrollY=0,fittedId=null,zoomControls=null;
 // The selection is a set of notes on the voice being drawn on; the cursor is
 // the step play and paste start from.
 let selection=new Set(),drag=null,hover=null,space=false,cursor=0,playhead=null,lastLength=4,mutes=[false,false,false,false],audition=null;
 const song=()=>songs[songIndex],instrument=()=>instruments[instrumentIndex],notes=()=>song()?.voices[voice].notes??[];
 const instrumentById=id=>instruments.find(i=>i.id===id);
 const canvas=$('muCanvas');
 function checkpoint(label,parts=['songs']){ProjectHistory.checkpoint(parts,label);}
 function edit(label,fn,parts=['songs']){checkpoint(label,parts);fn();markDirty();render();replay();}

 // ---- Geometry ----
 const stepW=()=>STEP_W*zoom,stepsPerBar=s=>s.stepsPerBeat*s.beatsPerBar;
 const stepX=step=>KEYS_W+step*stepW()-scrollX,pitchY=p=>RULER_H+(NOTES-1-p)*ROW_H-scrollY;
 function point(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 const stepAt=x=>(x-KEYS_W+scrollX)/stepW(),pitchAt=y=>NOTES-1-Math.floor((y-RULER_H+scrollY)/ROW_H);
 const clampPitch=p=>Math.max(0,Math.min(NOTES-1,p));
 function noteAt(x,y){const s=stepAt(x),p=pitchAt(y);return notes().find(n=>n.pitch===p&&s>=n.step&&s<n.step+n.length)??null;}
 function clampScroll(){
  const s=song();if(!s)return;
  scrollX=Math.max(0,Math.min(scrollX,Math.max(0,s.length*stepW()-(canvas.clientWidth-KEYS_W)+60)));
  scrollY=Math.max(0,Math.min(scrollY,Math.max(0,NOTES*ROW_H-(canvas.clientHeight-RULER_H))));
 }

 // ---- Notes ----
 // A voice plays one note at a time, so notes placed on it cut whatever they
 // land on: a note they start inside keeps its head, one they cover goes,
 // one whose start they cover keeps its tail. Placed notes come back sorted.
 function settle(others,placed,length){
  const kept=[];
  for(const n of others){
   let a=n.step,b=n.step+n.length;
   for(const p of placed){const pa=p.step,pb=p.step+p.length;if(pb<=a||pa>=b)continue;if(a<pa)b=pa;else if(b>pb)a=pb;else{a=b;break;}}
   if(b>a)kept.push(a===n.step&&b===n.step+n.length?n:{...n,step:a,length:b-a});
  }
  const clipped=placed.filter(p=>p.step<length).map(p=>{p.length=Math.min(p.length,length-p.step);return p;});
  return [...kept,...clipped].sort((x,y)=>x.step-y.step);
 }
 // Replaces the selected notes with `moved` (new objects), settling the voice around them.
 function place(label,moved){
  const s=song(),v=s.voices[voice],others=v.notes.filter(n=>!selection.has(n));
  edit(label,()=>{v.notes=settle(others,moved,s.length);selection=new Set(moved.filter(n=>v.notes.includes(n)));});
 }
 const selected=()=>notes().filter(n=>selection.has(n));
 function span(list){return {from:Math.min(...list.map(n=>n.step)),to:Math.max(...list.map(n=>n.step+n.length)),low:Math.min(...list.map(n=>n.pitch)),high:Math.max(...list.map(n=>n.pitch))};}
 function shift(steps,semitones){
  const list=selected();if(!list.length)return false;const b=span(list),s=song();
  if(b.from+steps<0||b.to+steps>s.length||b.low+semitones<0||b.high+semitones>=NOTES){setStatus(semitones?'The notes would leave the pitch range, C0 to B7.':'The notes would leave the song.');return false;}
  place(semitones?(semitones>0?'Transpose up':'Transpose down'):'Move notes',list.map(n=>({...n,step:n.step+steps,pitch:n.pitch+semitones})));
  if(semitones)hear(list[0].pitch+semitones,list[0].instrumentId);
  return true;
 }
 function reverseNotes(){const list=selected();if(!list.length)return;const b=span(list);place('Reverse the notes',list.map(n=>({...n,step:b.from+b.to-(n.step+n.length)})));}
 function invertNotes(){const list=selected();if(!list.length)return;const b=span(list);place('Invert the notes',list.map(n=>({...n,pitch:b.low+b.high-n.pitch})));}
 function toggleLegato(){
  const list=selected();if(!list.length)return;const on=!list.every(n=>n.legato);
  edit(on?'Slide into the notes':'Restart the notes',()=>{for(const n of list){if(on)n.legato=true;else delete n.legato;}});
 }
 function removeNotes(){const list=selected();if(!list.length)return false;const v=song().voices[voice];edit(list.length>1?'Delete notes':'Delete a note',()=>{v.notes=v.notes.filter(n=>!selection.has(n));selection=new Set();});return true;}
 function copyNotes(){const list=selected();if(!list.length)return false;const b=span(list);StudioShell.clipboard.set('notes',list.map(n=>({...n,step:n.step-b.from})));return true;}
 function cutNotes(){return copyNotes()&&removeNotes();}
 function addNotes(list,at,label){
  const s=song();if(!s||!list?.length)return false;
  if(at>=s.length){setStatus('Move the cursor inside the song to paste there.');return false;}
  const fallback=instrument()?.id,added=list.map(n=>({...n,step:n.step+at,instrumentId:instrumentById(n.instrumentId)?n.instrumentId:fallback}));
  const v=s.voices[voice];
  edit(label,()=>{v.notes=settle(v.notes,added,s.length);selection=new Set(added.filter(n=>v.notes.includes(n)));});return true;
 }
 const pasteNotes=()=>addNotes(StudioShell.clipboard.get('notes'),cursor,'Paste notes');
 function duplicateNotes(){const list=selected();if(!list.length)return false;const b=span(list);return addNotes(list.map(n=>({...n,step:n.step-b.from})),b.to,'Duplicate notes');}
 StudioShell.editActions('music',{copy:copyNotes,cut:cutNotes,paste:pasteNotes});
 function selectAll(){if(!song())return;if(tool!=='select')tool='select';selection=new Set(notes());render();}
 // Selecting notes that share an instrument shows it, ready to edit.
 function followSelection(){const ids=new Set(selected().map(n=>n.instrumentId));if(ids.size===1){const i=instruments.findIndex(x=>ids.has(x.id));if(i>=0)instrumentIndex=i;}}

 // ---- Sound ----
 function hear(pitch,instrumentId){
  const i=instrumentById(instrumentId)??instrument();if(!i||!A()||StudioAudio.playing()&&!audition)return;
  // Set after play(): stopping the previous audition clears it.
  StudioAudio.play(A().noteStream(i,pitch,A().SAMPLE_RATE/4,song()?.voices[voice].pan??0),{onEnd:()=>{audition=null;}});audition=true;
 }
 function songPosition(){const s=song(),p=StudioAudio.position();return s&&p!==null&&!audition?A().sampleStep(s,A().songSample(s,p)):null;}
 function play(from=cursor){
  const s=song();if(!s||!A())return;
  const origin=A().stepSample(s,Math.min(from,s.length-1));
  audition=null;
  StudioAudio.play(A().songStream(s,instruments,{from:origin,mutes}),{origin,onEnd:()=>{playhead=null;render();}});
  render();tick();
 }
 function pause(){const at=songPosition();StudioAudio.stop();if(at!==null)cursor=Math.floor(at);playhead=null;render();}
 function toggle(){if(StudioAudio.playing()&&!audition)pause();else play();}
 // An edit while the song plays is heard at once: it plays on from where it was.
 function replay(){if(!StudioAudio.playing()||audition)return;const at=songPosition();if(at!==null)play(Math.floor(at));}
 function tick(){
  if(!StudioAudio.playing()||audition||host.hidden){playhead=null;draw();return;}
  playhead=songPosition();
  // The view follows the playhead once it runs off the right edge.
  if(playhead!==null&&!drag){const x=stepX(playhead);if(x>canvas.clientWidth-20||x<KEYS_W){scrollX=playhead*stepW()-(canvas.clientWidth-KEYS_W)/4;clampScroll();}}
  draw();syncPosition();requestAnimationFrame(tick);
 }
 $('muPlay').onclick=toggle;
 $('muRewind').onclick=()=>{const was=StudioAudio.playing()&&!audition;cursor=0;scrollX=0;if(was)play(0);else render();};

 // ---- Drawing ----
 function draw(){
  const s=song();if(host.hidden||!s)return;
  const dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const sw=stepW(),bar=stepsPerBar(s),end=stepX(s.length),top=Math.max(0,NOTES-1-Math.floor(scrollY/ROW_H)),bottom=Math.max(0,NOTES-1-Math.ceil((scrollY+h-RULER_H)/ROW_H));
  ctx.save();ctx.beginPath();ctx.rect(KEYS_W,RULER_H,w-KEYS_W,h-RULER_H);ctx.clip();
  for(let p=bottom;p<=top;p++){const y=pitchY(p);ctx.fillStyle=BLACK.includes(p%12)?'#131417':'#18191d';ctx.fillRect(stepX(0),y,end-stepX(0),ROW_H);if(p%12===0){ctx.fillStyle='#2c2f37';ctx.fillRect(stepX(0),y+ROW_H-1,end-stepX(0),1);}}
  if(hover&&!drag&&hover.pitch>=0&&hover.pitch<NOTES){ctx.fillStyle='#ffffff08';ctx.fillRect(stepX(0),pitchY(hover.pitch),end-stepX(0),ROW_H);}
  const first=Math.max(0,Math.floor(scrollX/sw)),last=Math.min(s.length,Math.ceil((scrollX+w)/sw));
  for(let k=first;k<=last;k++){const beat=k%s.stepsPerBeat===0,isBar=k%bar===0;if(!beat&&sw<8)continue;ctx.fillStyle=isBar?'#3a3f4a':beat?'#262930':'#1d1f24';ctx.fillRect(Math.round(stepX(k)),RULER_H,1,h-RULER_H);}
  // Other voices, dim, behind the one being drawn on.
  const lanes=[0,1,2,3].filter(v=>v!==voice).concat(voice),moving=drag?.preview,moved=new Set(drag?.moved??[]);
  for(const v of lanes){
   const list=v===voice&&moving?moving:s.voices[v].notes,active=v===voice,color=COLORS[v];
   let prev=null;
   for(const n of list){
    const x=Math.round(stepX(n.step)),nw=Math.round(stepX(n.step+n.length))-x,y=pitchY(n.pitch);
    if(x>w||x+nw<KEYS_W||y>h||y+ROW_H<RULER_H){prev=n;continue;}
    ctx.globalAlpha=active?(mutes[v]?.45:1):.28;
    ctx.fillStyle=color;ctx.fillRect(x+1,y+1,Math.max(2,nw-2),ROW_H-2);
    if(active){
     ctx.fillStyle='#0008';ctx.fillRect(x+1,y+ROW_H-3,Math.max(2,nw-2),2);
     // A legato note slides from the one before it: joined, not restarted.
     if(n.legato&&prev&&prev.step+prev.length===n.step){ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x-2,pitchY(prev.pitch)+ROW_H/2);ctx.lineTo(x+2,y+ROW_H/2);ctx.stroke();}
     if(selection.has(n)||moved.has(n)){ctx.strokeStyle='#36c9d6';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,Math.max(2,nw-2),ROW_H-2);}
     if(nw>34){ctx.fillStyle='#111';ctx.font='9px monospace';ctx.fillText(A()?.noteName(n.pitch)??'',x+4,y+ROW_H-3);}
    }
    prev=n;
   }
  }
  ctx.globalAlpha=1;
  // The pencil's next note, where it would go.
  if(hover&&!drag&&tool==='pencil'&&!hover.note&&hover.step<s.length){ctx.strokeStyle=COLORS[voice];ctx.setLineDash([3,3]);ctx.strokeRect(stepX(hover.step)+1.5,pitchY(hover.pitch)+1.5,Math.min(lastLength,s.length-hover.step)*sw-3,ROW_H-3);ctx.setLineDash([]);}
  if(drag?.kind==='marquee'){const a=drag.a,b=drag.b;ctx.strokeStyle='#36c9d6';ctx.setLineDash([4,4]);ctx.strokeRect(Math.min(a.x,b.x)+.5,Math.min(a.y,b.y)+.5,Math.abs(b.x-a.x),Math.abs(b.y-a.y));ctx.setLineDash([]);}
  // Past the end of the song, and the loop's return point.
  ctx.fillStyle='#0b0c0ecc';ctx.fillRect(end,RULER_H,Math.max(0,w-end),h-RULER_H);ctx.fillStyle='#8a8268';ctx.fillRect(Math.round(end),RULER_H,2,h-RULER_H);
  if(s.loopStart!==undefined){const x=Math.round(stepX(s.loopStart));ctx.strokeStyle='#ffb000aa';ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(x+.5,RULER_H);ctx.lineTo(x+.5,h);ctx.stroke();ctx.setLineDash([]);}
  const cursorX=Math.round(stepX(playhead??cursor));ctx.fillStyle=playhead!==null?'#ffb000':'#ffb00066';ctx.fillRect(cursorX,RULER_H,playhead!==null?2:1,h-RULER_H);
  ctx.restore();
  // The ruler: bars, the loop from its return point to the end, the cursor.
  ctx.fillStyle='#1e1a14';ctx.fillRect(0,0,w,RULER_H);
  ctx.save();ctx.beginPath();ctx.rect(KEYS_W,0,w-KEYS_W,RULER_H);ctx.clip();
  if(s.loopStart!==undefined){ctx.fillStyle='#ffb00033';ctx.fillRect(stepX(s.loopStart),RULER_H-6,(s.length-s.loopStart)*sw,6);ctx.fillStyle='#ffb000';ctx.beginPath();const x=stepX(s.loopStart);ctx.moveTo(x,RULER_H-12);ctx.lineTo(x+7,RULER_H-9);ctx.lineTo(x,RULER_H-6);ctx.fill();}
  ctx.font='10px monospace';const every=bar*sw<28?4:1;
  for(let b=0;b*bar<=s.length;b+=every){const x=stepX(b*bar);ctx.fillStyle='#3a3f4a';ctx.fillRect(x,RULER_H-8,1,8);ctx.fillStyle='#8a8268';ctx.fillText(String(b+1),x+3,11);}
  ctx.fillStyle='#ffb000';ctx.beginPath();ctx.moveTo(cursorX-5,RULER_H-7);ctx.lineTo(cursorX+5,RULER_H-7);ctx.lineTo(cursorX,RULER_H-1);ctx.fill();
  ctx.restore();ctx.fillStyle='#3a3022';ctx.fillRect(0,RULER_H-1,w,1);
  // The keyboard.
  ctx.save();ctx.beginPath();ctx.rect(0,RULER_H,KEYS_W,h-RULER_H);ctx.clip();
  for(let p=bottom;p<=top;p++){
   const y=pitchY(p),black=BLACK.includes(p%12),lit=audition&&hover?.keys&&hover.pitch===p;
   // A black key lies over the white ones beside it, as on a piano.
   ctx.fillStyle=black?'#c9c3ad':lit?'#ffb000':'#c9c3ad';ctx.fillRect(0,y,KEYS_W-1,ROW_H);
   if(black){ctx.fillStyle=lit?'#ffb000':'#1b1c20';ctx.fillRect(0,y,KEYS_W*.62,ROW_H);ctx.fillStyle='#8a8268';ctx.fillRect(KEYS_W*.62,y+ROW_H/2,KEYS_W*.38-1,1);}
   if([4,11].includes(p%12)){ctx.fillStyle='#8a8268';ctx.fillRect(0,y,KEYS_W-1,1);}
   if(p%12===0&&!lit){ctx.fillStyle='#8a8268';ctx.fillRect(0,y+ROW_H-1,KEYS_W-1,1);}
   if(p%12===0){ctx.fillStyle='#111';ctx.font='9px monospace';ctx.fillText('C'+p/12,KEYS_W-20,y+ROW_H-3);}
  }
  ctx.restore();ctx.fillStyle='#3a3022';ctx.fillRect(KEYS_W-1,RULER_H,1,h-RULER_H);
 }
 function syncPosition(){
  const s=song();if(!s)return;
  const at=playhead??cursor,bar=stepsPerBar(s),seconds=A()?A().stepSample(s,at)/A().SAMPLE_RATE:0;
  $('muPosition').textContent=`Bar ${Math.floor(at/bar)+1} · beat ${Math.floor(at%bar/s.stepsPerBeat)+1} · step ${Math.floor(at%s.stepsPerBeat)+1} · ${Math.floor(seconds/60)}:${(seconds%60).toFixed(2).padStart(5,'0')}`;
 }

 // ---- Pointer ----
 const painting=()=>tool==='pencil'||tool==='eraser';
 function erase(x,y){const n=noteAt(x,y);if(!n)return;if(!drag.changed){checkpoint('Erase notes');drag.changed=true;}const v=song().voices[voice];v.notes=v.notes.filter(m=>m!==n);selection.delete(n);markDirty();draw();}
 canvas.onpointerdown=e=>{
  const s=song();if(!s)return;e.preventDefault();canvas.focus();
  const at=point(e);canvas.setPointerCapture(e.pointerId);
  if(space||e.button===1||(tool==='pan'&&e.button===0)){drag={kind:'pan',x:e.clientX,y:e.clientY,sx:scrollX,sy:scrollY};canvas.style.cursor='grabbing';return;}
  if(at.y<RULER_H){if(e.button===0){drag={kind:'cursor'};moveCursor(at.x);}return;}
  if(at.x<KEYS_W){if(e.button===0){hover={pitch:clampPitch(pitchAt(at.y)),keys:true};hear(hover.pitch);drag={kind:'keys'};draw();}return;}
  if(e.button===2&&!painting())return;
  if(e.button===2||tool==='eraser'){drag={kind:'erase',changed:false};erase(at.x,at.y);return;}
  const hit=noteAt(at.x,at.y),step=Math.floor(stepAt(at.x)),pitch=clampPitch(pitchAt(at.y));
  if(tool==='select'&&!hit){if(!e.shiftKey)selection=new Set();drag={kind:'marquee',a:at,b:at,initial:new Set(selection)};draw();return;}
  if(hit){
   if(e.shiftKey&&tool==='select'){selection.has(hit)?selection.delete(hit):selection.add(hit);render();return;}
   if(!selection.has(hit))selection=new Set([hit]);followSelection();hear(hit.pitch,hit.instrumentId);
   const edge=tool==='pencil'&&stepX(hit.step+hit.length)-at.x<Math.min(8,stepW()*hit.length/3);
   drag={kind:edge?'resize':'move',a:at,note:hit,selected:new Set(selection),dStep:0,dPitch:0,dLength:0};render();return;
  }
  if(tool!=='pencil'||step<0||step>=s.length)return;
  if(!instrument()){setStatus('Add an instrument to draw with.');return;}
  // A new note, sized by dragging it out.
  const note={step,length:Math.min(lastLength,s.length-step),pitch,instrumentId:instrument().id};
  drag={kind:'create',note,a:at,sized:false};selection=new Set([note]);
  checkpoint('Add a note');const v=s.voices[voice];v.notes=settle(v.notes,[note],s.length);markDirty();hear(pitch);render();
 };
 canvas.onpointermove=e=>{
  const s=song();if(!s)return;
  const at=point(e),note=at.x>=KEYS_W&&at.y>=RULER_H?noteAt(at.x,at.y):null;
  hover={step:Math.floor(stepAt(at.x)),pitch:clampPitch(pitchAt(at.y)),note,keys:at.x<KEYS_W};
  if(!drag){canvas.style.cursor=at.y<RULER_H?'pointer':at.x<KEYS_W?'pointer':space||tool==='pan'?'grab':note&&tool==='pencil'&&stepX(note.step+note.length)-at.x<Math.min(8,stepW()*note.length/3)?'ew-resize':note?'move':tool==='select'?'default':'crosshair';draw();return;}
  switch(drag.kind){
   case 'pan':scrollX=drag.sx-(e.clientX-drag.x);scrollY=drag.sy-(e.clientY-drag.y);clampScroll();draw();return;
   case 'cursor':moveCursor(at.x);return;
   case 'keys':{const p=clampPitch(pitchAt(at.y));if(p!==hover.pitch){hover={pitch:p,keys:true};hear(p);}draw();return;}
   case 'erase':erase(at.x,at.y);return;
   case 'marquee':{
    drag.b=at;const s0=Math.min(stepAt(drag.a.x),stepAt(at.x)),s1=Math.max(stepAt(drag.a.x),stepAt(at.x)),p0=pitchAt(Math.max(drag.a.y,at.y)),p1=pitchAt(Math.min(drag.a.y,at.y));
    selection=new Set(drag.initial);for(const n of notes())if(n.step<s1&&n.step+n.length>s0&&n.pitch>=p0&&n.pitch<=p1)selection.add(n);draw();return;
   }
   // The note keeps its length until the pointer really moves.
   case 'create':{if(!drag.sized&&Math.abs(at.x-drag.a.x)<5)return;drag.sized=true;const len=Math.max(1,Math.min(s.length-drag.note.step,Math.floor(stepAt(at.x))-drag.note.step+1));if(len!==drag.note.length){drag.note.length=len;const v=s.voices[voice];v.notes=settle(v.notes.filter(n=>n!==drag.note),[drag.note],s.length);draw();}return;}
   case 'resize':{
    const len=Math.max(1,Math.min(s.length-drag.note.step,Math.round(stepAt(at.x))-drag.note.step)),dLength=len-drag.note.length;
    if(dLength===drag.dLength)return;drag.dLength=dLength;drag.length=len;preview(n=>n===drag.note?{...n,length:len}:{...n});return;
   }
   case 'move':{
    const list=notes().filter(n=>drag.selected.has(n)),b=span(list);
    const dStep=Math.max(-b.from,Math.min(s.length-b.to,Math.round((at.x-drag.a.x)/stepW()))),dPitch=Math.max(-b.low,Math.min(NOTES-1-b.high,-Math.round((at.y-drag.a.y)/ROW_H)));
    if(dStep===drag.dStep&&dPitch===drag.dPitch)return;
    if(dPitch!==drag.dPitch)hear(drag.note.pitch+dPitch,drag.note.instrumentId);
    drag.dStep=dStep;drag.dPitch=dPitch;preview(n=>({...n,step:n.step+dStep,pitch:n.pitch+dPitch}));return;
   }
  }
 };
 // What a move or resize would leave on the voice, drawn but not yet applied.
 function preview(change){const s=song(),v=s.voices[voice],moved=v.notes.filter(n=>drag.selected.has(n)).map(change);drag.moved=moved;drag.preview=settle(v.notes.filter(n=>!drag.selected.has(n)),moved,s.length);drag.selected=new Set([...drag.selected]);draw();}
 function endDrag(){
  const d=drag;drag=null;canvas.style.cursor='';if(!d)return;
  if(d.kind==='keys'){hover=null;draw();return;}
  if(d.kind==='create'){lastLength=d.note.length;followSelection();render();replay();return;}
  if(d.kind==='erase'){render();if(d.changed)replay();return;}
  if((d.kind==='move'||d.kind==='resize')&&d.moved&&(d.dStep||d.dPitch||d.dLength)){
   if(d.kind==='resize')lastLength=d.length;
   selection=new Set(notes().filter(n=>d.selected.has(n)));place(d.kind==='resize'?'Resize a note':'Move notes',d.moved);return;
  }
  render();
 }
 canvas.onpointerup=endDrag;canvas.onpointercancel=()=>{drag=null;render();};
 canvas.onpointerleave=()=>{if(!drag){hover=null;draw();}};
 function moveCursor(x){const s=song();cursor=Math.max(0,Math.min(s.length-1,Math.round(stepAt(x))));if(StudioAudio.playing()&&!audition)play(cursor);else{draw();syncPosition();}}
 canvas.oncontextmenu=e=>{
  e.preventDefault();const s=song();if(!s)return;const at=point(e);
  if(at.y<RULER_H){const step=Math.max(0,Math.min(s.length-1,Math.round(stepAt(at.x))));
   StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Play from here',run:()=>{cursor=step;play(step);}},{label:'Loop from here',run:()=>edit('Set the loop',()=>{s.loopStart=step;})},{label:'Play once, no loop',disabled:s.loopStart===undefined,run:()=>edit('Remove the loop',()=>{delete s.loopStart;})}]);return;}
  if(painting()||at.x<KEYS_W)return;
  const hit=noteAt(at.x,at.y);if(hit&&!selection.has(hit)){selection=new Set([hit]);render();}
  const sel=selection.size>0;
  StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Cut',hint:'Mod+X',disabled:!sel,run:cutNotes},{label:'Copy',hint:'Mod+C',disabled:!sel,run:copyNotes},{label:'Paste at the cursor',hint:'Mod+V',disabled:!StudioShell.clipboard.has('notes'),run:pasteNotes},{label:'Duplicate',hint:'Mod+D',disabled:!sel,run:duplicateNotes},{label:'Delete',hint:'Delete',disabled:!sel,run:removeNotes},'-',
   {label:'Transpose up',hint:'↑',disabled:!sel,run:()=>shift(0,1)},{label:'Transpose down',hint:'↓',disabled:!sel,run:()=>shift(0,-1)},{label:'Reverse',hint:'Shift+H',disabled:!sel,run:reverseNotes},{label:'Invert',hint:'Shift+V',disabled:!sel,run:invertNotes},{label:'Legato',hint:'L',disabled:!sel,run:toggleLegato},'-',
   {label:'Select all',hint:'Mod+A',run:selectAll},{label:'Deselect',hint:'Esc',disabled:!sel,run:()=>{selection=new Set();render();}}]);
 };

 // ---- Camera ----
 // Steps are a time axis, not pixel art, so a song fits the width exactly.
 const fitLevel=()=>Math.max(.25,Math.min(4,(canvas.clientWidth-KEYS_W-40)/((song()?.length??64)*STEP_W)));
 // Opening a song shows its notes, or middle C when it has none.
 function center(){const all=song().voices.flatMap(v=>v.notes);const mid=all.length?(Math.min(...all.map(n=>n.pitch))+Math.max(...all.map(n=>n.pitch)))/2:60;scrollY=(NOTES-1-mid)*ROW_H-(canvas.clientHeight-RULER_H)/2;clampScroll();}
 zoomControls=StudioShell.canvasZoom({view:'music',ids:{fit:'muFit',actual:'muActualSize',zoomOut:'muZoomOut',label:'muZoomLabel',zoomIn:'muZoomIn'},min:.25,max:4,
  get:()=>zoom,
  set:(next,x)=>{const r=canvas.getBoundingClientRect(),px=x===undefined?(canvas.clientWidth+KEYS_W)/2:x-r.left,step=stepAt(px);zoom=next;scrollX=step*stepW()-(px-KEYS_W);clampScroll();render();},
  fit:()=>{if(!song())return;zoom=fitLevel();scrollX=0;render();},
  wheel:canvas,pan:(dx,dy)=>{scrollX+=dx;scrollY+=dy;clampScroll();draw();},busy:()=>!!drag});
 host.querySelector('.muTop .studioBarStart').after(zoomControls.group);
 host.querySelector('.muTop .studioBarEnd').append(StudioShell.helpButton());

 // ---- Voices ----
 function renderVoices(){
  const s=song(),strip=$('muVoices');
  if(strip.children.length!==4)strip.replaceChildren(...[0,1,2,3].map(v=>{
   const box=document.createElement('div');box.className='muVoice';box.setAttribute('role','radio');
   const pick=document.createElement('button');pick.type='button';pick.className='muVoicePick';pick.onclick=()=>chooseVoice(v);
   const mute=StudioShell.iconButton('muMute'+v,`Mute voice ${v} while previewing`,'mute');mute.classList.add('muMute');mute.onclick=()=>{mutes[v]=!mutes[v];render();replay();};
   box.append(pick,mute);return box;
  }));
  [...strip.children].forEach((box,v)=>{
   const count=s?.voices[v].notes.length??0,pick=box.querySelector('.muVoicePick'),mute=box.querySelector('.muMute');
   box.setAttribute('aria-checked',String(v===voice));
   pick.innerHTML=`<i style="background:${COLORS[v]}"></i>Voice ${v} <small>${count?count+' note'+(count===1?'':'s'):'free'}</small>`;
   pick.title=`Draw on voice ${v} (${v+1})`;
   mute.classList.toggle('on',mutes[v]);mute.setAttribute('aria-pressed',String(mutes[v]));
  });
 }
 function chooseVoice(v){if(v===voice)return;voice=v;selection=new Set();render();}

 // ---- Song settings ----
 $('muStepsPerBeat').replaceChildren(...[1,2,3,4,6,8].map(n=>new Option({1:'1 per beat',2:'2 per beat — eighths',3:'3 per beat — triplets',4:'4 per beat — sixteenths',6:'6 per beat — sixteenth triplets',8:'8 per beat — 32nds'}[n],n)));
 function setting(label,fn){const s=song();if(!s)return;edit(label,()=>fn(s));}
 $('muBpm').onchange=()=>{const n=Number($('muBpm').value);if(!Number.isInteger(n)||n<20||n>400){render();return;}setting('Change the tempo',s=>s.bpm=n);};
 $('muBeatsPerBar').onchange=()=>{const n=Number($('muBeatsPerBar').value);if(!Number.isInteger(n)||n<1||n>16){render();return;}setting('Change the meter',s=>s.beatsPerBar=n);};
 // A new step size keeps every note where it was in time, which only works
 // if each one still starts and ends on a step.
 $('muStepsPerBeat').onchange=()=>{
  const s=song(),next=Number($('muStepsPerBeat').value),scale=next/s.stepsPerBeat,fits=x=>Number.isInteger(x*scale);
  if(![s.length,s.loopStart??0,...s.voices.flatMap(v=>v.notes.flatMap(n=>[n.step,n.length]))].every(fits)||s.length*scale>A().MAX_SONG_STEPS){setStatus('Some notes fall between the new steps. Move them onto the grid first.');render();return;}
  setting('Change the step size',x=>{x.stepsPerBeat=next;x.length*=scale;if(x.loopStart!==undefined)x.loopStart*=scale;for(const v of x.voices)for(const n of v.notes){n.step*=scale;n.length*=scale;}});
  cursor=Math.round(cursor*scale);lastLength=Math.max(1,Math.round(lastLength*scale));
 };
 $('muBars').onchange=()=>{
  const s=song(),n=Math.round(Number($('muBars').value)*stepsPerBar(s));
  if(!Number.isFinite(n)||n<1||n>A().MAX_SONG_STEPS){setStatus(`A song is 1 to ${A().MAX_SONG_STEPS} steps long.`);render();return;}
  // Shortening cuts notes at the new end.
  setting('Change the length',x=>{x.length=n;for(const v of x.voices)v.notes=v.notes.filter(m=>m.step<n).map(m=>({...m,length:Math.min(m.length,n-m.step)}));if(x.loopStart>=n)x.loopStart=0;});
  selection=new Set();cursor=Math.min(cursor,n-1);
 };
 $('muLoop').onchange=()=>setting($('muLoop').value==='loop'?'Loop the song':'Play the song once',s=>{if($('muLoop').value==='loop')s.loopStart=0;else delete s.loopStart;});
 $('muLoopFrom').onchange=()=>{const s=song(),n=Math.round((Number($('muLoopFrom').value)-1)*stepsPerBar(s));if(!Number.isFinite(n)||n<0||n>=s.length){render();return;}setting('Set the loop',x=>x.loopStart=n);};
 function renderSongProps(){
  const s=song(),A_=A();if(!s||!A_)return;
  const field=(id,value)=>{if(document.activeElement!==$(id))$(id).value=value;};
  field('muBpm',s.bpm);$('muBpmOut').textContent=`${(60/s.bpm).toFixed(3)} s`;
  field('muStepsPerBeat',s.stepsPerBeat);field('muBeatsPerBar',s.beatsPerBar);
  const bars=s.length/stepsPerBar(s);field('muBars',Math.round(bars*100)/100);
  const seconds=A_.stepSample(s,s.length)/A_.SAMPLE_RATE;$('muLengthOut').textContent=`${Math.floor(seconds/60)}:${(seconds%60).toFixed(1).padStart(4,'0')}`;
  field('muLoop',s.loopStart===undefined?'once':'loop');$('muLoopFromRow').hidden=s.loopStart===undefined;
  if(s.loopStart!==undefined){field('muLoopFrom',Math.round((s.loopStart/stepsPerBar(s)+1)*100)/100);$('muLoopOut').textContent=`step ${s.loopStart}`;}
  // One pan per voice: a SET_PAN at the start of its track.
  const pans=$('muPans');
  if(pans.children.length!==4){pans.replaceChildren(...[0,1,2,3].map(v=>{const row=document.createElement('label');row.className='audioField';row.innerHTML=`<span><i style="background:${COLORS[v]}"></i>V${v} pan</span><input type="range" min="-64" max="63" aria-label="Voice ${v} pan"><output></output>`;StudioAudio.bindRange(row.querySelector('input'),(value,first)=>{const x=song();if(!x)return;if(first)checkpoint('Change a pan');x.voices[v].pan=value;markDirty();renderSongProps();replay();});return row;}));}
  [...pans.children].forEach((row,v)=>{const input=row.querySelector('input');if(document.activeElement!==input)input.value=s.voices[v].pan;row.querySelector('output').textContent=StudioAudio.panText(s.voices[v].pan);});
  let compiled=null;try{compiled=A_.compileSong(s,instruments);}catch{}
  $('muBytes').innerHTML=compiled?compiled.voices.map((v,i)=>v?`Voice ${i} · <b>${v.bytes.length} bytes</b>, ${v.notes} notes`:`Voice ${i} · free`).join('<br>')+`<br>Total <b>${compiled.voices.reduce((n,v)=>n+(v?.bytes.length??0),0)} bytes</b>`:'';
  const used=s.voices.map((v,i)=>v.notes.length?i:null).filter(v=>v!==null);
  $('muStatus').textContent=`${s.name} · ${s.bpm} BPM · ${Math.round(bars*100)/100} bars, ${$('muLengthOut').textContent} · ${s.loopStart===undefined?'plays once':`loops from bar ${Math.round((s.loopStart/stepsPerBar(s)+1)*100)/100}`} · ${used.length?'voices '+used.join(', '):'no voices'} in use`;
 }

 // ---- Instruments ----
 $('muWave').replaceChildren(...['Sine','Pulse','Saw','Triangle','Noise'].map((name,i)=>new Option(name,i)));
 function tweak(label,key,value,first){const i=instrument();if(!i)return;if(first)checkpoint(label,['instruments']);i[key]=value;markDirty();renderInstrumentProps();}
 // Hearing an instrument as it changes: once a slider is let go, or a pick made.
 function sample(){const i=instrument();if(i)hear(60,i.id);}
 $('muWave').onchange=()=>{const i=instrument();if(!i)return;edit('Change the waveform',()=>i.wave=Number($('muWave').value),['instruments']);sample();};
 StudioAudio.bindRange($('muPulse'),(value,first)=>tweak('Change the pulse width','pulse',value,first));
 StudioAudio.bindRange($('muVolume'),(value,first)=>tweak('Change the volume','volume',value,first));
 StudioAudio.bindEnvelope('muEnv_',(key,value,first)=>tweak('Change the envelope',key,value,first));
 for(const id of ['muPulse','muVolume','muEnv_attack','muEnv_decay','muEnv_sustain','muEnv_release'])$(id).addEventListener('change',()=>{render();replay();if(!StudioAudio.playing())sample();});
 function renderInstrumentProps(){
  const i=instrument();$('muInstrumentName').textContent=i?`${i.name} — used by ${songs.reduce((n,s)=>n+s.voices.reduce((m,v)=>m+v.notes.filter(x=>x.instrumentId===i.id).length,0),0)} notes`:'No instruments yet.';
  for(const id of ['muWave','muPulse','muVolume','muEnv_attack','muEnv_decay','muEnv_sustain','muEnv_release'])$(id).disabled=!i;
  if(!i)return;
  if(document.activeElement!==$('muWave'))$('muWave').value=i.wave;
  for(const key of ['pulse','volume']){const input=$(key==='pulse'?'muPulse':'muVolume');if(document.activeElement!==input)input.value=i[key];}
  $('muPulseOut').textContent=i.wave===1?`${Math.round(i.pulse/2.56)}%`:'pulse only';$('muPulse').disabled=i.wave!==1;
  $('muVolumeOut').textContent=i.volume;
  StudioAudio.syncEnvelope('muEnv_',i);StudioAudio.drawEnvelope($('muEnvelope'),i,250);
 }
 for(const [id,label,icon] of [['muInstrumentNew','New instrument','newItem'],['muInstrumentDuplicate','Duplicate instrument','duplicate'],['muInstrumentDelete','Delete instrument','delete']])$('muInstrumentActions').append(StudioShell.iconButton(id,label,icon));
 function freshInstrumentName(base='Instrument'){let n=1;while(instruments.some(i=>i.name.toLowerCase()===`${base}_${n}`.toLowerCase()))n++;return `${base}_${n}`;}
 $('muInstrumentNew').onclick=()=>{
  if(instruments.length>=255){setStatus('A project holds at most 255 instruments.');return;}
  edit('New instrument',()=>{instruments.push({id:crypto.randomUUID(),name:freshInstrumentName(),wave:1,pulse:128,attack:0,decay:6,sustain:10,release:5,volume:200});instrumentIndex=instruments.length-1;},['instruments']);
 };
 $('muInstrumentDuplicate').onclick=()=>{const i=instrument();if(!i||instruments.length>=255)return;edit('Duplicate '+i.name,()=>{instruments.push({...structuredClone(i),id:crypto.randomUUID(),name:freshInstrumentName(i.name.replace(/_\d+$/,''))});instrumentIndex=instruments.length-1;},['instruments']);};
 // Notes playing a deleted instrument move to the next one, as a deleted
 // palette's banks move to another; the last one cannot go while notes use it.
 $('muInstrumentDelete').onclick=()=>{
  const i=instrument();if(!i)return;
  const users=songs.flatMap(s=>s.voices.flatMap(v=>v.notes)).filter(n=>n.instrumentId===i.id);
  if(users.length&&instruments.length<2){setStatus(`${i.name} is the only instrument, and ${users.length} notes play it.`);return;}
  const heir=instruments[instrumentIndex+1]??instruments[instrumentIndex-1];
  edit('Delete '+i.name,()=>{for(const s of songs)for(const v of s.voices)for(const n of v.notes)if(n.instrumentId===i.id)n.instrumentId=heir.id;instruments.splice(instrumentIndex,1);instrumentIndex=Math.max(0,Math.min(instrumentIndex,instruments.length-1));},['instruments','songs']);
  setStatus(`Deleted ${i.name}${users.length?`; its ${users.length} notes play ${heir.name} now`:''}. Ctrl/Cmd+Z brings it back.`);
 };
 function chooseInstrument(k){
  instrumentIndex=k;const list=selected(),id=instruments[k].id;
  if(list.length&&list.some(n=>n.instrumentId!==id))edit(`Play ${instruments[k].name}`,()=>{for(const n of list)n.instrumentId=id;});
  else render();
  if(!StudioAudio.playing())sample();
 }
 function renameInstrument(k,name){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)||instruments.some((x,j)=>j!==k&&x.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique name: letters, digits, underscores; start with a letter.');return false;}
  edit('Rename an instrument',()=>instruments[k].name=name,['instruments']);return true;
 }

 // ---- Songs ----
 for(const [id,label,icon] of [['muNew','New song','newItem'],['muDuplicate','Duplicate song','duplicate'],['muDelete','Delete song','delete']])$('muActions').append(StudioShell.iconButton(id,label,icon));
 function freshName(){let n=1;while(songs.some(s=>s.name.toLowerCase()==='song_'+n))n++;return 'Song_'+n;}
 $('muNew').onclick=()=>{
  if(!A()||songs.length>=255){setStatus('A project holds at most 255 songs.');return;}
  // A first song comes with instruments to draw with.
  const kit=!instruments.length;
  edit('New song',()=>{if(kit)instruments=A().defaultInstruments(()=>crypto.randomUUID());songs.push(A().newSong(crypto.randomUUID(),freshName()));songIndex=songs.length-1;selection=new Set();cursor=0;},kit?['songs','instruments']:['songs']);
  setStatus(`Created ${song().name}${kit?' and four starting instruments':''}.`);
 };
 $('muEmptyNew').onclick=()=>$('muNew').click();
 $('muDuplicate').onclick=()=>{const s=song();if(!s||songs.length>=255)return;edit('Duplicate '+s.name,()=>{songs.push({...structuredClone(s),id:crypto.randomUUID(),name:freshName()});songIndex=songs.length-1;selection=new Set();});};
 $('muDelete').onclick=()=>{const s=song();if(!s)return;StudioAudio.stop();setStatus(`Deleted ${s.name}. Ctrl/Cmd+Z brings it back.`);edit('Delete '+s.name,()=>{songs.splice(songIndex,1);songIndex=Math.max(0,songIndex-1);selection=new Set();});};
 function chooseSong(i){if(i!==songIndex){StudioAudio.stop();cursor=0;}songIndex=i;selection=new Set();render();}
 function renameSong(i,name){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)||songs.some((s,j)=>j!==i&&s.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique name: letters, digits, underscores; start with a letter.');return false;}
  edit('Rename a song',()=>songs[i].name=name);return true;
 }

 // Taking up a painting tool drops the selection, as in the grid editors;
 // the pencil then selects the note it draws or grabs.
 function setTool(name){if(name!=='select'&&name!=='pan')selection=new Set();tool=name;render();}
 function render(){
  host.hidden=currentView!=='music';
  if(host.hidden){hover=null;return;}
  songIndex=Math.max(0,Math.min(songIndex,songs.length-1));instrumentIndex=Math.max(0,Math.min(instrumentIndex,instruments.length-1));
  const s=song();
  $('muEmpty').hidden=!!s;StudioShell.emptyEditor(host,!s);$('muWork').hidden=!s;
  StudioShell.renderList($('muList'),songs,{selected:(x,i)=>i===songIndex,choose:(x,i)=>chooseSong(i),rename:renameSong,render,maxLength:32,duplicate:(x,i)=>{chooseSong(i);$('muDuplicate').click();},remove:(x,i)=>{chooseSong(i);$('muDelete').click();}});
  StudioShell.renderList($('muInstrumentList'),instruments,{selected:(x,i)=>i===instrumentIndex,choose:(x,i)=>chooseInstrument(i),rename:renameInstrument,render,maxLength:32,
   content:(row,x)=>{row.textContent=`${x.name} · ${['Sine','Pulse','Saw','Triangle','Noise'][x.wave]}`;},
   duplicate:(x,i)=>{instrumentIndex=i;$('muInstrumentDuplicate').click();},remove:(x,i)=>{instrumentIndex=i;$('muInstrumentDelete').click();}});
  $('muDuplicate').disabled=$('muDelete').disabled=!s;$('muNew').disabled=songs.length>=255;
  $('muInstrumentDuplicate').disabled=$('muInstrumentDelete').disabled=!instrument();
  $('muUndo').disabled=!ProjectHistory.canUndo();$('muRedo').disabled=!ProjectHistory.canRedo();
  renderInstrumentProps();
  if(!s){$('muStatus').textContent='';return;}
  selection=new Set(notes().filter(n=>selection.has(n)));
  cursor=Math.max(0,Math.min(cursor,s.length-1));
  $('muTitle').textContent=s.name;
  for(const [id,name] of [['muSelectTool','select'],['muPencilTool','pencil'],['muEraserTool','eraser'],['muPanTool','pan']])$(id).classList.toggle('on',tool===name);
  const playing=StudioAudio.playing()&&!audition;StudioShell.setIcon($('muPlay'),playing?'pause':'play',playing?'Pause (Space)':'Play from the cursor (Space)');$('muPlay').setAttribute('aria-pressed',String(playing));
  const sel=selection.size>0;
  for(const id of ['muCopy','muReverse','muInvert','muTransposeUp','muTransposeDown','muLegato','muDuplicateNotes','muDeleteNotes'])$(id).disabled=!sel;
  $('muLegato').classList.toggle('on',sel&&selected().every(n=>n.legato));
  $('muPaste').disabled=!StudioShell.clipboard.has('notes');
  renderVoices();renderSongProps();
  // A song opens fitted across and showing its notes; coming back keeps the view.
  if(s.id!==fittedId&&canvas.clientWidth){fittedId=s.id;zoom=fitLevel();scrollX=0;center();}
  clampScroll();zoomControls.sync();
  draw();syncPosition();
 }

 // ---- Rails ----
 const library=host.querySelector('.muLibrary'),instrumentLibrary=host.querySelector('.muInstrumentLibrary'),songProps=host.querySelector('.muSongProps'),instrumentProps=host.querySelector('.muInstrumentProps');
 const panelToggle=(panel,id,label,icon,group,asset=false)=>{const b=StudioShell.iconButton(id,label,icon);StudioShell.bindPanel({panel,button:b,group,closeGroups:[group],asset});return b;};
 const toolButton=(id,label,icon,name)=>Object.assign(StudioShell.iconButton(id,label,icon),{onclick:()=>setTool(name)});
 const action=(id,label,icon,fn)=>Object.assign(StudioShell.iconButton(id,label,icon),{onclick:fn});
 const rail=StudioShell.toolRail('muRail','Music tools');host.prepend(rail);
 StudioShell.railLayout(rail,[
  [panelToggle(library,'muLibraryToggle','Songs','music','muLeft'),panelToggle(instrumentLibrary,'muInstrumentLibraryToggle','Instruments','instrument','muLeft')],
  [toolButton('muSelectTool','Select (S) — click or box notes, then move, transpose, copy or delete them','select','select'),
   toolButton('muPencilTool','Pencil (B) — click to add a note, drag to size it; drag a note to move it, its end to resize it','pencil','pencil'),
   toolButton('muEraserTool','Eraser (E) — click or drag across notes to remove them','eraser','eraser'),
   toolButton('muPanTool','Pan (H) — drag to scroll; Space or the middle button pan with any other tool active','pan','pan')]],
 [action('muCopy','Copy notes (Ctrl/Cmd+C)','copy',copyNotes),action('muPaste','Paste notes at the cursor (Ctrl/Cmd+V)','paste',pasteNotes),
  action('muUndo','Undo (Ctrl/Cmd+Z)','undo',ProjectHistory.undo),action('muRedo','Redo (Ctrl/Cmd+Shift+Z)','redo',ProjectHistory.redo)]);
 const sideRail=StudioShell.toolRail('muSideRail','Notes','right');host.append(sideRail);
 StudioShell.railLayout(sideRail,[
  [panelToggle(songProps,'muSongPropsToggle','Song — tempo, length, loop, pans and sequencer size','properties','muRight',true),panelToggle(instrumentProps,'muInstrumentPropsToggle','Instrument — waveform, pulse width, volume and envelope','settings','muRight')],
  [action('muReverse','Reverse the notes in time (Shift+H)','flipH',reverseNotes),action('muInvert','Invert the notes\' pitch (Shift+V)','flipV',invertNotes)],
  [action('muTransposeUp','Transpose up a semitone (↑; Shift: an octave)','transposeUp',()=>shift(0,1)),action('muTransposeDown','Transpose down a semitone (↓; Shift: an octave)','transposeDown',()=>shift(0,-1)),
   action('muLegato','Legato (L) — slide into the notes from the one before, without restarting the envelope','legato',toggleLegato)],
  [action('muDuplicateNotes','Duplicate the notes after themselves (Ctrl/Cmd+D)','duplicate',duplicateNotes),action('muDeleteNotes','Delete the notes (Delete)','delete',removeNotes)]]);
 StudioShell.setIcon($('muRewind'),'previous','Back to the start');
 library.hidden=true;instrumentLibrary.hidden=true;instrumentProps.hidden=true;
 for(const id of ['muLibraryToggle','muInstrumentLibraryToggle','muInstrumentPropsToggle'])$(id).setAttribute('aria-expanded','false');
 document.addEventListener('studioclipboard',()=>{if(!host.hidden)$('muPaste').disabled=!StudioShell.clipboard.has('notes');});
 document.addEventListener('studiohistory',()=>{songIndex=Math.max(0,Math.min(songIndex,songs.length-1));instrumentIndex=Math.max(0,Math.min(instrumentIndex,instruments.length-1));selection=new Set();drag=null;if(currentView==='music')setTimeout(replay);});

 // ---- Keys ----
 window.addEventListener('keydown',e=>{
  if(currentView!=='music'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
  const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey,handled=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(e.target.closest?.('button,[role="option"]')&&(e.code==='Space'||e.key==='Enter'))return;
  if(e.code==='Space'){handled();if(!e.repeat&&!drag)space=true;return;}
  if(!song())return;
  if(mod&&key==='a'){handled();selectAll();return;}
  if(mod&&['c','x','v','d'].includes(key)){const done={c:copyNotes,x:cutNotes,v:pasteNotes,d:duplicateNotes}[key]();if(done||key==='d')handled();return;}
  if(mod||e.altKey)return;
  if(e.target.closest?.('[role="option"]'))return;
  if(key==='escape'){selection=new Set();drag=null;render();return;}
  if(key==='delete'||key==='backspace'){if(removeNotes())handled();return;}
  if(['arrowup','arrowdown','arrowleft','arrowright'].includes(key)&&selection.size){handled();if(key==='arrowup'||key==='arrowdown')shift(0,(key==='arrowup'?1:-1)*(e.shiftKey?12:1));else shift(key==='arrowleft'?-1:1,0);return;}
  if(e.shiftKey&&(key==='h'||key==='v')){handled();(key==='h'?reverseNotes:invertNotes)();return;}
  if(!e.shiftKey&&/^[1-4]$/.test(key)){handled();chooseVoice(Number(key)-1);return;}
  if(key==='l'&&!e.shiftKey){handled();toggleLegato();return;}
  const name={s:'select',b:'pencil',e:'eraser',h:'pan'}[key];
  if(name&&!e.shiftKey){handled();setTool(name);}
 },true);
 // Space plays and pauses when tapped, and pans while held, as elsewhere.
 let spacePanned=false;
 window.addEventListener('keyup',e=>{if(e.code!=='Space'||currentView!=='music'||!space)return;space=false;if(!spacePanned&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))toggle();spacePanned=false;});
 canvas.addEventListener('pointerdown',()=>{if(space)spacePanned=true;},true);
 window.addEventListener('blur',()=>{space=false;});

 new ResizeObserver(()=>{if(!host.hidden)render();}).observe($('muStage'));
 document.addEventListener('miaaudioready',()=>render());
 StudioShell.viewStatus('music',$('muStatus'));
 // Where a step and pitch are on screen, scrolling the pitch into view: for
 // driving the roll with real pointer input in tests/desktop-audio.cjs.
 host.pointAt=(step,pitch)=>{if(pitchY(pitch)<RULER_H||pitchY(pitch)+ROW_H>canvas.clientHeight){scrollY=(NOTES-1-pitch)*ROW_H-(canvas.clientHeight-RULER_H)/2;clampScroll();draw();}const r=canvas.getBoundingClientRect();return {x:r.left+stepX(step),y:r.top+pitchY(pitch)+ROW_H/2};};
 window.renderMusic=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){if(v!=='music'&&currentView==='music')StudioAudio.stop();oldShow(v);render();};
 const oldNew=newProject;newProject=function(...args){StudioAudio.stop();selection=new Set();cursor=0;voice=0;oldNew(...args);};
 const oldRestore=restoreStudioProject;restoreStudioProject=function(...args){StudioAudio.stop();selection=new Set();cursor=0;voice=0;oldRestore(...args);};
 render();
})();
