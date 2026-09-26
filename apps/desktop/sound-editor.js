// Sound effect authoring. A sound is one voice's registers frame by frame at
// 60 Hz — pitch, volume, pulse width, waveform and gate — under one envelope
// and pan: what a game's driver writes to a voice it takes from the music
// (VTAKE) for a few frames before giving it back (VGIVE). Each frame is a
// column across five lanes, drawn like pixels. See docs/audio.md.
(() => {
 const host=document.createElement('section');host.id='soundEditor';host.className='studioEditor';host.hidden=true;
 host.innerHTML=`<aside class="sfLibrary studioDock studioDockLeft"><h2>Sounds</h2><div id="sfActions" class="assetToolbar"></div><div id="sfList" role="listbox" aria-label="Sounds"></div><p>Double-click a sound to rename it.</p></aside>
 <main class="studioMain"><div id="sfEmpty" class="studioEmpty" role="status"><p>No sounds yet. A sound effect is one voice's registers, frame by frame at 60 Hz.</p><div class="studioEmptyActions"><button id="sfEmptyNew">New sound</button></div></div>
  <div id="sfWork">
   <div class="sfTop"><div class="studioBarStart"><strong id="sfTitle"></strong></div><div class="studioBarEnd"></div></div>
   <div id="sfStage" class="studioStage audioStage"><canvas id="sfCanvas" tabindex="0" aria-label="Sound frames: pitch, volume, pulse width, waveform and gate"></canvas></div>
   <div id="sfTransport" class="audioTransport"><button id="sfPlay" aria-pressed="false"></button><span id="sfPosition"></span></div>
   <div id="sfStatus"></div>
  </div>
 </main>
 <aside class="sfProps studioDock studioDockRight audioDock"><h2>Sound</h2>
  <h3>Envelope</h3>${StudioAudio.envelopeRows('sfEnv_')}<canvas id="sfEnvelope" class="envelope" width="472" height="128" aria-label="The envelope while the gate is on, then its release"></canvas>
  <h3>Voice</h3>
  <label class="audioField"><span>Pan</span><input id="sfPan" type="range" min="-64" max="63" aria-label="Pan, -64 left to 63 right"><output id="sfPanOut"></output></label>
  <label class="audioField"><span>Frames</span><input id="sfLength" type="number" min="1" max="600" aria-label="Length in 60 Hz frames"><output id="sfLengthOut"></output></label>
  <h3>Generate</h3><div id="sfPresets"></div><p>Each click makes a new take on the idea and plays it, replacing this sound's frames and envelope. Undo brings the last one back.</p>
  <h3>Frame</h3><div id="sfFrameInfo" class="audioReadout"></div>
 </aside>`;
 $('spritePanel').after(host);
 const style=document.createElement('style');style.textContent=`
 #sfWork{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
 .sfTop{display:flex;align-items:center;gap:14px;padding:8px 18px;background:var(--panel)}
 #sfTitle{color:var(--ink);font-size:13px}
 #sfStatus{padding:6px 18px;font-size:10px;color:var(--text-dim)}
 #sfList{border:1px solid var(--line);background:var(--bg);flex:1;min-height:120px;overflow:auto}
 #sfPresets{display:grid;grid-template-columns:1fr 1fr;gap:5px}
 #sfPresets button{padding:5px 6px}
 #sfSnapToggle{display:inline-flex;align-items:center;justify-content:center;padding:4px}#sfSnapToggle svg{width:20px;height:20px}#sfSnapToggle.on{background:var(--ink);color:#111}
 `;document.head.append(style);

 const A=()=>window.MiaAudio;
 const FRAME_W=12,LABEL_W=86,RULER_H=22,GAP=10,PITCH_LOW=0,PITCH_HIGH=96;
 // The lanes, top to bottom: which frame field each draws, and its color.
 const LANES=[{key:'freq',label:'Pitch',color:'#ffb000'},{key:'volume',label:'Volume',color:'#7bd88f',height:72},{key:'pulse',label:'Pulse width',color:'#6fb7ff',height:60},{key:'wave',label:'Wave',color:'#ff6fae',height:75},{key:'gate',label:'Gate',color:'#a48bff',height:22}];
 const WAVE_SHORT=['Sine','Pulse','Saw','Tri','Noise'];
 let soundIndex=0,tool='pencil',zoom=1,scrollX=0,fittedId=null,zoomControls=null,snap=true;
 // selection: frames [from, to), belonging to the Select tool.
 let selection=null,drag=null,hover=null,space=false,playhead=null;
 const sound=()=>sounds[soundIndex],frames=()=>sound()?.frames??[];
 const canvas=$('sfCanvas');
 function checkpoint(label){ProjectHistory.checkpoint(['sounds'],label);}
 // An edit's label names it in the history: edit('Reverse the frames', fn).
 function edit(label,fn){checkpoint(label);fn();markDirty();render();}

 // ---- Geometry ----
 const frameW=()=>FRAME_W*zoom;
 function lanes(){
  const h=canvas.clientHeight||400,fixed=LANES.slice(1).reduce((n,l)=>n+l.height,0);
  let top=RULER_H+8;
  return LANES.map((lane,i)=>{const height=i?lane.height:Math.max(110,h-top-fixed-GAP*LANES.length-4),out={...lane,top,height};top+=height+GAP;return out;});
 }
 const frameX=f=>LABEL_W+f*frameW()-scrollX;
 function frameAt(clientX,clamp=true){const r=canvas.getBoundingClientRect(),f=Math.floor((clientX-r.left-LABEL_W+scrollX)/frameW());return clamp?Math.max(0,Math.min(frames().length-1,f)):f;}
 function laneAt(clientY){const r=canvas.getBoundingClientRect(),y=clientY-r.top;return lanes().find(l=>y>=l.top-GAP/2&&y<l.top+l.height+GAP/2)??null;}
 const semitoneFreq=s=>A().hzToFrequency(440*2**((s-57)/12));
 // A lane's position, 0 at the top and 1 at the bottom, for a pointer.
 function laneT(lane,clientY){const r=canvas.getBoundingClientRect();return Math.max(0,Math.min(1,(clientY-r.top-lane.top)/lane.height));}
 function valueAt(lane,clientY){
  const t=laneT(lane,clientY);
  switch(lane.key){
   case 'freq':{const s=PITCH_HIGH-t*(PITCH_HIGH-PITCH_LOW);return semitoneFreq(snap?Math.round(s):s);}
   case 'wave':return Math.min(4,Math.floor(t*5));
   case 'gate':return true;
   default:return Math.round(255*(1-t));
  }
 }
 // What right-click and the eraser write: the register's 0, the way a
 // painting tool's right button paints color 0 elsewhere.
 const ZERO={freq:0,volume:0,pulse:0,wave:0,gate:false};
 // Interpolates along a lane: pitch in semitones, so a line is an even sweep.
 function between(key,a,b,t){
  if(key==='gate')return a;
  if(key==='freq'){if(!a||!b)return t<.5?a:b;const s=A().frequencyNote(a)+(A().frequencyNote(b)-A().frequencyNote(a))*t;return semitoneFreq(snap?Math.round(s):s);}
  return Math.round(a+(b-a)*t);
 }

 // ---- Drawing ----
 function draw(){
  if(host.hidden||!sound())return;
  const dpr=devicePixelRatio||1,w=canvas.clientWidth,h=canvas.clientHeight;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const list=frames(),fw=frameW(),ls=lanes(),first=Math.max(0,Math.floor(scrollX/fw)),last=Math.min(list.length-1,Math.ceil((scrollX+w-LABEL_W)/fw));
  ctx.save();ctx.beginPath();ctx.rect(LABEL_W,0,w-LABEL_W,h);ctx.clip();
  // Lane backgrounds, and the art's edge where the sound ends.
  const end=frameX(list.length);
  for(const lane of ls){ctx.fillStyle='#17181c';ctx.fillRect(frameX(0),lane.top,end-frameX(0),lane.height);}
  // Pitch: a line at every C, fainter ones at every semitone when there is room.
  const pitch=ls[0],semitoneY=s=>pitch.top+(PITCH_HIGH-s)/(PITCH_HIGH-PITCH_LOW)*pitch.height;
  for(let s=PITCH_LOW;s<=PITCH_HIGH;s++){if(s%12&&pitch.height/(PITCH_HIGH-PITCH_LOW)<5)continue;ctx.fillStyle=s%12?'#1d1f24':'#2c2f37';ctx.fillRect(frameX(0),Math.round(semitoneY(s)),end-frameX(0),1);}
  // Frame lines every frame when they are far enough apart, stronger each second.
  for(let f=first;f<=last+1;f++){if(f%60&&(fw<6||f%(fw<10?10:1)))continue;ctx.fillStyle=f%60?'#23252b':'#3a3f4a';ctx.fillRect(Math.round(frameX(f)),RULER_H,1,h-RULER_H);}
  if(selection){ctx.fillStyle='#36c9d620';ctx.fillRect(frameX(selection.from),RULER_H,(selection.to-selection.from)*fw,h-RULER_H);}
  if(hover!==null&&hover<list.length){ctx.fillStyle='#ffffff0c';ctx.fillRect(frameX(hover),RULER_H,fw,h-RULER_H);}
  for(let f=first;f<=last;f++){
   // Whole pixels, so every bar is crisp at a fractional zoom.
   const fr=list[f],left=Math.round(frameX(f)),x=left+(fw>=6?1:0),bar=Math.max(1,Math.round(frameX(f+1))-left-(fw>=6?2:0));
   for(const lane of ls){
    const bottom=lane.top+lane.height;
    ctx.globalAlpha=lane.key==='pulse'&&fr.wave!==1?.3:1;
    if(lane.key==='freq'){if(!fr.freq)continue;const y=Math.max(lane.top,Math.min(bottom,semitoneY(A().frequencyNote(fr.freq))));ctx.fillStyle=lane.color+'40';ctx.fillRect(x,y,bar,bottom-y);ctx.fillStyle=lane.color;ctx.fillRect(x,y-1,bar,3);}
    else if(lane.key==='wave'){const row=lane.height/5;ctx.fillStyle=lane.color;ctx.fillRect(x,lane.top+fr.wave*row+1,bar,row-2);}
    else if(lane.key==='gate'){if(fr.gate){ctx.fillStyle=lane.color;ctx.fillRect(x,lane.top+3,bar,lane.height-6);}}
    else{const y=bottom-fr[lane.key]/255*lane.height;ctx.fillStyle=lane.color+'40';ctx.fillRect(x,y,bar,bottom-y);ctx.fillStyle=lane.color;ctx.fillRect(x,y-1,bar,2);}
   }
   ctx.globalAlpha=1;
  }
  if(drag?.kind==='line'){ctx.strokeStyle='#fff';ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(drag.x0,drag.y0);ctx.lineTo(drag.x1,drag.y1);ctx.stroke();ctx.setLineDash([]);}
  if(selection){ctx.strokeStyle='#36c9d6';ctx.setLineDash([4,3]);ctx.strokeRect(frameX(selection.from)+.5,RULER_H+.5,(selection.to-selection.from)*fw-1,h-RULER_H-1);ctx.setLineDash([]);}
  if(playhead!==null){const x=Math.round(frameX(playhead));ctx.fillStyle='#ffb000';ctx.fillRect(x,RULER_H,2,h-RULER_H);}
  // The ruler: frame numbers, and seconds at every 60 frames.
  ctx.fillStyle='#1e1a14';ctx.fillRect(LABEL_W,0,w-LABEL_W,RULER_H);ctx.fillStyle='#8a8268';ctx.font='10px monospace';
  const every=fw>=24?5:fw>=10?10:30;
  for(let f=Math.floor(first/every)*every;f<=last+1;f+=every){const x=frameX(f);ctx.fillRect(x,RULER_H-5,1,5);ctx.fillText(f%60?String(f):`${f/60} s`,x+3,RULER_H-8);}
  ctx.restore();
  // The label column stays put while the frames scroll.
  ctx.fillStyle='#1e1a14';ctx.fillRect(0,0,LABEL_W,h);ctx.fillStyle='#3a3022';ctx.fillRect(LABEL_W-1,0,1,h);
  // Each lane's name on the left, its scale on the right against the frames.
  for(const lane of ls){
   ctx.textAlign='left';ctx.font='11px monospace';ctx.fillStyle=lane.color;ctx.fillText(lane.label==='Pulse width'?'Pulse':lane.label,8,lane.top+12);
   ctx.textAlign='right';ctx.font='9px monospace';ctx.fillStyle='#8a8268';const right=LABEL_W-6;
   if(lane.key==='freq')for(let s=PITCH_LOW;s<=PITCH_HIGH;s+=12){const y=semitoneY(s);if(y>lane.top+22&&y<lane.top+lane.height-2)ctx.fillText('C'+s/12,right,y+3);}
   if(lane.key==='wave')WAVE_SHORT.forEach((name,i)=>ctx.fillText(name,right,lane.top+(i+.5)*lane.height/5+3));
   if(lane.key==='volume'||lane.key==='pulse'){ctx.fillText('255',right,lane.top+22);ctx.fillText('0',right,lane.top+lane.height-2);}
  }
  ctx.textAlign='left';
 }

 function frameText(f){
  const fr=frames()[f];if(!fr)return '';
  const hz=fr.freq/16,note=fr.freq?A()?.noteName(A().frequencyNote(fr.freq))??'':'—';
  return `Frame ${f+1} of ${frames().length} · ${(f/60).toFixed(2)} s<br>${fr.freq?`${hz.toFixed(1)} Hz, near ${note}`:'0 Hz — silent'}<br>Volume ${fr.volume} · pulse width ${fr.pulse} (${Math.round(fr.pulse/2.56)}%)<br>${A()?.WAVES[fr.wave]??fr.wave} · gate ${fr.gate?'on':'off'}`;
 }
 function sync(){
  const s=sound();
  $('sfPosition').textContent=s?(playhead!==null?`Frame ${Math.min(s.frames.length,Math.floor(playhead)+1)} / ${s.frames.length}`:`${s.frames.length} frames · ${(s.frames.length/60).toFixed(2)} s`):'';
  $('sfFrameInfo').innerHTML=s?frameText(hover??selection?.from??0):'';
 }

 // ---- Editing ----
 const inRange=()=>selection??{from:0,to:frames().length};
 function setFrames(label,fn){const s=sound();if(!s)return;edit(label,()=>fn(s));}
 function transpose(semitones){
  const {from,to}=inRange();
  setFrames(semitones>0?'Transpose up':'Transpose down',s=>{for(let f=from;f<to;f++){const fr=s.frames[f];if(fr.freq)fr.freq=Math.max(1,Math.min(A().MAX_FREQ,Math.round(fr.freq*2**(semitones/12))));}});
 }
 function reverse(){const {from,to}=inRange();setFrames('Reverse the frames',s=>{s.frames.splice(from,to-from,...s.frames.slice(from,to).reverse());});}
 function invert(){
  const {from,to}=inRange(),notes=frames().slice(from,to).filter(f=>f.freq).map(f=>A().frequencyNote(f.freq));if(!notes.length)return;
  const axis=Math.min(...notes)+Math.max(...notes);
  setFrames('Invert the pitch',s=>{for(let f=from;f<to;f++){const fr=s.frames[f];if(fr.freq)fr.freq=semitoneFreq(axis-A().frequencyNote(fr.freq));}});
 }
 function removeFrames(){
  if(!selection)return false;
  if(selection.to-selection.from>=frames().length){setStatus('A sound keeps at least one frame.');return false;}
  const {from,to}=selection;setFrames('Delete frames',s=>{s.frames.splice(from,to-from);selection=null;});return true;
 }
 function insertFrames(list,at,label){
  if(!sound()||!list?.length)return false;
  if(frames().length+list.length>A().MAX_SOUND_FRAMES){setStatus(`A sound holds at most ${A().MAX_SOUND_FRAMES} frames.`);return false;}
  setFrames(label,s=>{s.frames.splice(at,0,...structuredClone(list));selection={from:at,to:at+list.length};});return true;
 }
 function copyFrames(){if(!selection)return false;StudioShell.clipboard.set('soundFrames',frames().slice(selection.from,selection.to));return true;}
 function cutFrames(){return copyFrames()&&removeFrames();}
 const pasteFrames=()=>insertFrames(StudioShell.clipboard.get('soundFrames'),selection?.to??frames().length,'Paste frames');
 const duplicateFrames=()=>!!selection&&insertFrames(frames().slice(selection.from,selection.to),selection.to,'Duplicate frames');
 StudioShell.editActions('sounds',{copy:copyFrames,cut:cutFrames,paste:pasteFrames});
 function setLength(n){
  const s=sound();if(!s||!Number.isInteger(n)||n<1||n>A().MAX_SOUND_FRAMES||n===s.frames.length){render();return;}
  // Growing repeats the last frame; shrinking cuts from the end.
  setFrames('Change the length',x=>{while(x.frames.length<n)x.frames.push({...x.frames.at(-1)});x.frames.length=n;if(selection&&selection.to>n)selection=null;});
 }

 // ---- Pointer ----
 const painting=()=>['pencil','line','eraser'].includes(tool);
 function paint(lane,f,value){const fr=frames()[f];if(fr)fr[lane.key]=value;}
 function strokeTo(clientX,clientY){
  const f=frameAt(clientX,false),value=drag.erase?ZERO[drag.lane.key]:valueAt(drag.lane,clientY);
  const from=drag.last??{f,value},steps=Math.abs(f-from.f);
  for(let i=0;i<=steps;i++){const at=from.f+Math.sign(f-from.f)*i;if(at>=0&&at<frames().length)paint(drag.lane,at,steps?between(drag.lane.key,from.value,value,i/steps):value);}
  drag.last={f,value};draw();sync();
 }
 canvas.onpointerdown=e=>{
  if(!sound())return;e.preventDefault();canvas.focus();
  if(space||e.button===1||(tool==='pan'&&e.button===0)){drag={kind:'pan',x:e.clientX,scroll:scrollX};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';return;}
  if(e.button===2&&!painting())return;
  const lane=laneAt(e.clientY),f=frameAt(e.clientX);
  if(tool==='select'){
   const anchor=e.shiftKey&&selection?(f<selection.from?selection.to-1:selection.from):f;
   drag={kind:'select',anchor};selection={from:Math.min(anchor,f),to:Math.max(anchor,f)+1};canvas.setPointerCapture(e.pointerId);render();return;
  }
  if(!lane)return;
  // A painting tool's stroke drops the selection, as in the grid editors.
  selection=null;
  const erase=e.button===2||tool==='eraser';
  checkpoint(erase?`Clear the ${lane.label.toLowerCase()}`:`Draw the ${lane.label.toLowerCase()}`);markDirty();
  if(tool==='line'&&!erase){const r=canvas.getBoundingClientRect();drag={kind:'line',lane,f,value:valueAt(lane,e.clientY),x0:e.clientX-r.left,y0:e.clientY-r.top,x1:e.clientX-r.left,y1:e.clientY-r.top};canvas.setPointerCapture(e.pointerId);draw();return;}
  drag={kind:'paint',lane,erase,last:null};canvas.setPointerCapture(e.pointerId);strokeTo(e.clientX,e.clientY);
 };
 canvas.onpointermove=e=>{
  if(!sound())return;
  const f=frameAt(e.clientX,false);hover=f>=0&&f<frames().length?f:null;
  if(!drag){canvas.style.cursor=tool==='pan'||space?'grab':tool==='select'?'col-resize':'crosshair';draw();sync();return;}
  if(drag.kind==='pan'){scrollX=clampScroll(drag.scroll-(e.clientX-drag.x));draw();return;}
  if(drag.kind==='select'){const at=frameAt(e.clientX);selection={from:Math.min(drag.anchor,at),to:Math.max(drag.anchor,at)+1};draw();sync();return;}
  if(drag.kind==='line'){const r=canvas.getBoundingClientRect();drag.x1=e.clientX-r.left;drag.y1=e.clientY-r.top;draw();return;}
  strokeTo(e.clientX,e.clientY);
 };
 function endDrag(e){
  const d=drag;drag=null;canvas.style.cursor='';if(!d)return;
  if(d.kind==='line'){
   const f=frameAt(e.clientX),value=valueAt(d.lane,e.clientY),span=Math.abs(f-d.f);
   for(let i=0;i<=span;i++)paint(d.lane,Math.min(d.f,f)+i,span?between(d.lane.key,f<d.f?value:d.value,f<d.f?d.value:value,i/span):value);
  }
  if(d.kind==='paint'||d.kind==='line')markDirty();
  render();
 }
 canvas.onpointerup=endDrag;canvas.onpointercancel=()=>{drag=null;render();};
 canvas.onpointerleave=()=>{hover=null;draw();sync();};
 canvas.oncontextmenu=e=>{e.preventDefault();if(!sound()||painting())return;const sel=!!selection,paste=StudioShell.clipboard.has('soundFrames');
  StudioShell.contextMenu(e.clientX,e.clientY,[{label:'Cut',hint:'Mod+X',disabled:!sel,run:cutFrames},{label:'Copy',hint:'Mod+C',disabled:!sel,run:copyFrames},{label:'Paste',hint:'Mod+V',disabled:!paste,run:pasteFrames},{label:'Duplicate',hint:'Mod+D',disabled:!sel,run:duplicateFrames},{label:'Delete',hint:'Delete',disabled:!sel,run:removeFrames},'-',
   {label:'Reverse',hint:'Shift+H',run:reverse},{label:'Invert pitch',hint:'Shift+V',run:invert},{label:'Transpose up',hint:'↑',run:()=>transpose(1)},{label:'Transpose down',hint:'↓',run:()=>transpose(-1)},'-',
   {label:'Select all',hint:'Mod+A',run:selectAll},{label:'Deselect',hint:'Esc',disabled:!sel,run:()=>{selection=null;render();}}]);};
 function selectAll(){if(!sound())return;setTool('select');selection={from:0,to:frames().length};render();}

 // ---- Camera ----
 function clampScroll(x){const max=Math.max(0,frames().length*frameW()-(canvas.clientWidth-LABEL_W)+40);return Math.max(0,Math.min(max,x));}
 // Frames are a time axis, not pixel art, so they fit the width exactly.
 const fitLevel=()=>Math.max(.5,Math.min(4,(canvas.clientWidth-LABEL_W-32)/(frames().length*FRAME_W)));
 zoomControls=StudioShell.canvasZoom({view:'sounds',ids:{fit:'sfFit',actual:'sfActualSize',zoomOut:'sfZoomOut',label:'sfZoomLabel',zoomIn:'sfZoomIn'},min:.5,max:4,
  get:()=>zoom,
  set:(next,x)=>{const r=canvas.getBoundingClientRect(),px=x===undefined?(canvas.clientWidth+LABEL_W)/2:x-r.left,frame=(px-LABEL_W+scrollX)/frameW();zoom=next;scrollX=clampScroll(frame*frameW()-(px-LABEL_W));render();},
  fit:()=>{if(!sound())return;zoom=fitLevel();scrollX=0;render();},
  wheel:canvas,pan:(dx,dy)=>{scrollX=clampScroll(scrollX+dx+dy);draw();},busy:()=>!!drag});
 host.querySelector('.sfTop .studioBarStart').after(zoomControls.group);
 const snapToggle=StudioShell.iconButton('sfSnapToggle','Snap pitch to semitones','snap');
 snapToggle.onclick=()=>{snap=!snap;render();};
 host.querySelector('.sfTop .studioBarEnd').append(snapToggle,StudioShell.helpButton());

 // ---- Playback ----
 function play(){
  if(StudioAudio.playing()){StudioAudio.stop();return;}
  if(!sound()||!A())return;
  StudioAudio.play(A().soundStream(sound()),{onEnd:()=>{playhead=null;render();}});
  render();tick();
 }
 function tick(){
  if(!StudioAudio.playing()||host.hidden){playhead=null;draw();return;}
  playhead=StudioAudio.position()/A().FRAME_SAMPLES;draw();sync();requestAnimationFrame(tick);
 }
 $('sfPlay').onclick=play;

 // ---- Library ----
 for(const [id,label,icon] of [['sfNew','New sound','newItem'],['sfDuplicate','Duplicate sound','duplicate'],['sfDelete','Delete sound','delete']])$('sfActions').append(StudioShell.iconButton(id,label,icon));
 function freshName(){let n=1;while(sounds.some(s=>s.name.toLowerCase()==='sound_'+n))n++;return 'Sound_'+n;}
 $('sfNew').onclick=()=>{
  if(!A()||sounds.length>=255){setStatus('A project holds at most 255 sounds.');return;}
  edit('New sound',()=>{sounds.push(A().newSound(crypto.randomUUID(),freshName()));soundIndex=sounds.length-1;selection=null;});
  setStatus('Created '+sound().name+'.');
 };
 $('sfEmptyNew').onclick=()=>$('sfNew').click();
 $('sfDuplicate').onclick=()=>{if(!sound()||sounds.length>=255)return;edit('Duplicate '+sound().name,()=>{const copy=structuredClone(sound());copy.id=crypto.randomUUID();copy.name=freshName();sounds.push(copy);soundIndex=sounds.length-1;});};
 $('sfDelete').onclick=()=>{if(!sound())return;StudioAudio.stop();setStatus(`Deleted ${sound().name}. Ctrl/Cmd+Z brings it back.`);edit('Delete '+sound().name,()=>{sounds.splice(soundIndex,1);soundIndex=Math.max(0,soundIndex-1);selection=null;});};
 function chooseSound(i){if(i!==soundIndex)StudioAudio.stop();soundIndex=i;selection=null;render();}
 function renameSound(i,name){
  if(!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(name)||sounds.some((s,j)=>j!==i&&s.name.toLowerCase()===name.toLowerCase())){setStatus('Use a unique name: letters, digits, underscores; start with a letter.');return false;}
  edit('Rename a sound',()=>sounds[i].name=name);return true;
 }

 // ---- Properties ----
 StudioAudio.bindEnvelope('sfEnv_',(key,value,first)=>{const s=sound();if(!s)return;if(first)checkpoint('Change the envelope');s[key]=value;markDirty();syncProps();});
 StudioAudio.bindRange($('sfPan'),(value,first)=>{const s=sound();if(!s)return;if(first)checkpoint('Change the pan');s.pan=value;markDirty();syncProps();});
 $('sfLength').onchange=()=>setLength(Number($('sfLength').value));
 function generate(preset){
  if(!sound()||!A())return;
  const seed=(Date.now()^Math.floor(Math.random()*0x7fffffff))>>>0;
  edit(`Generate ${A().SOUND_PRESET_NAMES[preset].toLowerCase()}`,()=>{Object.assign(sound(),A().generateSound(preset,seed));selection=null;});
  zoom=fitLevel();scrollX=0;render();play();
 }
 function buildPresets(){
  if(!A()||$('sfPresets').children.length)return;
  $('sfPresets').replaceChildren(...A().SOUND_PRESETS.map(p=>Object.assign(document.createElement('button'),{type:'button',id:'sfPreset_'+p,textContent:A().SOUND_PRESET_NAMES[p],title:`A new ${A().SOUND_PRESET_NAMES[p].toLowerCase()} sound`,onclick:()=>generate(p)})));
 }
 function syncProps(){
  const s=sound();if(!s)return;
  StudioAudio.syncEnvelope('sfEnv_',s);
  if(document.activeElement!==$('sfPan'))$('sfPan').value=s.pan;$('sfPanOut').textContent=StudioAudio.panText(s.pan);
  if(document.activeElement!==$('sfLength'))$('sfLength').value=s.frames.length;$('sfLengthOut').textContent=(s.frames.length/60).toFixed(2)+' s';
  // The envelope as it plays: held while the first run of gated frames lasts.
  const gated=s.frames.findIndex(f=>!f.gate),held=(gated<0?s.frames.length:gated)*1000/60;
  StudioAudio.drawEnvelope($('sfEnvelope'),s,held);
  const release=A()?StudioAudio.formatMs(A().DECAY_RELEASE_MS[s.release]):'';
  $('sfStatus').textContent=`${s.name} · ${s.frames.length} frames · ${(s.frames.length/60).toFixed(2)} s, then a ${release} release · one voice, written at 60 Hz`;
 }

 function setTool(name){if(name!=='select'&&name!=='pan')selection=null;tool=name;render();}
 function render(){
  host.hidden=currentView!=='sounds';
  if(host.hidden){hover=null;return;}
  soundIndex=Math.max(0,Math.min(soundIndex,sounds.length-1));
  const s=sound();
  $('sfEmpty').hidden=!!s;StudioShell.emptyEditor(host,!s);$('sfWork').hidden=!s;
  StudioShell.renderList($('sfList'),sounds,{selected:(x,i)=>i===soundIndex,choose:(x,i)=>chooseSound(i),rename:renameSound,render,maxLength:32,duplicate:(x,i)=>{chooseSound(i);$('sfDuplicate').click();},remove:(x,i)=>{chooseSound(i);$('sfDelete').click();}});
  $('sfDuplicate').disabled=$('sfDelete').disabled=!s;$('sfNew').disabled=sounds.length>=255;
  $('sfUndo').disabled=!ProjectHistory.canUndo();$('sfRedo').disabled=!ProjectHistory.canRedo();
  if(!s){$('sfStatus').textContent='';return;}
  if(selection&&(selection.to>s.frames.length||selection.from>=selection.to))selection=null;
  buildPresets();
  $('sfTitle').textContent=s.name;
  for(const [id,name] of [['sfSelectTool','select'],['sfPencilTool','pencil'],['sfLineTool','line'],['sfEraserTool','eraser'],['sfPanTool','pan']])$(id).classList.toggle('on',tool===name);
  snapToggle.classList.toggle('on',snap);snapToggle.setAttribute('aria-pressed',String(snap));
  const playing=StudioAudio.playing();StudioShell.setIcon($('sfPlay'),playing?'stop':'play',playing?'Stop (Space)':'Play (Space)');$('sfPlay').setAttribute('aria-pressed',String(playing));
  $('sfCopy').disabled=$('sfDeleteFrames').disabled=$('sfDuplicateFrames').disabled=!selection;$('sfPaste').disabled=!StudioShell.clipboard.has('soundFrames');
  syncProps();
  // A sound opens fitted to the window; coming back to one keeps its zoom.
  if(s.id!==fittedId&&canvas.clientWidth){fittedId=s.id;zoom=fitLevel();scrollX=0;}
  scrollX=clampScroll(scrollX);zoomControls.sync();
  draw();sync();
 }

 // ---- Rails ----
 const library=host.querySelector('.sfLibrary'),props=host.querySelector('.sfProps');
 const libraryToggle=StudioShell.iconButton('sfLibraryToggle','Sounds','sound');StudioShell.bindPanel({panel:library,button:libraryToggle,group:'sfLeft',closeGroups:['sfLeft']});
 const toolButton=(id,label,icon,name)=>Object.assign(StudioShell.iconButton(id,label,icon),{onclick:()=>setTool(name)});
 const action=(id,label,icon,fn)=>Object.assign(StudioShell.iconButton(id,label,icon),{onclick:fn});
 const rail=StudioShell.toolRail('sfRail','Sound tools');host.prepend(rail);
 StudioShell.railLayout(rail,[[libraryToggle],[
  toolButton('sfSelectTool','Select frames (S) — drag across frames, then copy, move, reverse or transpose them','select','select'),
  toolButton('sfPencilTool','Pencil (B) — draw values in a lane; right-drag writes 0','pencil','pencil'),
  toolButton('sfLineTool','Line (L) — drag a straight ramp in a lane: an even pitch sweep, a volume fade','line','line'),
  toolButton('sfEraserTool','Eraser (E) — write 0: silence, no gate','eraser','eraser'),
  toolButton('sfPanTool','Pan (H) — drag to scroll; Space or the middle button pan with any other tool active','pan','pan')]],
 [action('sfCopy','Copy frames (Ctrl/Cmd+C)','copy',copyFrames),action('sfPaste','Paste frames after the selection (Ctrl/Cmd+V)','paste',pasteFrames),
  action('sfUndo','Undo (Ctrl/Cmd+Z)','undo',ProjectHistory.undo),action('sfRedo','Redo (Ctrl/Cmd+Shift+Z)','redo',ProjectHistory.redo)]);
 const propsToggle=StudioShell.iconButton('sfPropsToggle','Sound — envelope, pan, length and presets','properties');
 StudioShell.bindPanel({panel:props,button:propsToggle,group:'sfRight',closeGroups:['sfRight'],asset:true});
 const sideRail=StudioShell.toolRail('sfSideRail','Frames','right');host.append(sideRail);
 StudioShell.railLayout(sideRail,[[propsToggle],
  [action('sfReverse','Reverse (Shift+H) — the selected frames, or the whole sound','flipH',reverse),action('sfInvert','Invert pitch (Shift+V) — the selected frames, or the whole sound','flipV',invert)],
  [action('sfTransposeUp','Transpose up a semitone (↑; Shift: an octave)','transposeUp',()=>transpose(1)),action('sfTransposeDown','Transpose down a semitone (↓; Shift: an octave)','transposeDown',()=>transpose(-1))],
  [action('sfDuplicateFrames','Duplicate the selected frames (Ctrl/Cmd+D)','duplicate',duplicateFrames),action('sfDeleteFrames','Delete the selected frames (Delete)','delete',removeFrames)]]);
 library.hidden=true;libraryToggle.setAttribute('aria-expanded','false');
 document.addEventListener('studioclipboard',()=>{if(!host.hidden)$('sfPaste').disabled=!StudioShell.clipboard.has('soundFrames');});
 document.addEventListener('studiohistory',()=>{soundIndex=Math.max(0,Math.min(soundIndex,sounds.length-1));selection=null;});

 // ---- Keys ----
 window.addEventListener('keydown',e=>{
  if(currentView!=='sounds'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
  const key=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey,handled=()=>{e.preventDefault();e.stopImmediatePropagation();};
  // Keys a focused button or list row already answers are left to it.
  if(e.target.closest?.('button,[role="option"]')&&(e.code==='Space'||e.key==='Enter'))return;
  if(e.code==='Space'){handled();if(!e.repeat&&!drag)space=true;return;}
  if(!sound())return;
  if(mod&&key==='a'){handled();selectAll();return;}
  if(mod&&['c','x','v','d'].includes(key)){const done={c:copyFrames,x:cutFrames,v:pasteFrames,d:duplicateFrames}[key]();if(done||key==='d')handled();return;}
  if(mod||e.altKey)return;
  if(e.target.closest?.('[role="option"]'))return;
  if(key==='escape'){selection=null;drag=null;render();return;}
  if(key==='delete'||key==='backspace'){if(removeFrames())handled();return;}
  if(key==='arrowup'||key==='arrowdown'){handled();transpose((key==='arrowup'?1:-1)*(e.shiftKey?12:1));return;}
  if(e.shiftKey&&(key==='h'||key==='v')){handled();(key==='h'?reverse:invert)();return;}
  const name={s:'select',b:'pencil',l:'line',e:'eraser',h:'pan'}[key];
  if(name&&!e.shiftKey){handled();setTool(name);}
 },true);
 // Space plays and stops — on its own, a tap; held, it pans, the way it
 // pans every other canvas.
 let spacePanned=false;
 window.addEventListener('keyup',e=>{if(e.code!=='Space'||currentView!=='sounds'||!space)return;space=false;if(!spacePanned&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))play();spacePanned=false;});
 canvas.addEventListener('pointerdown',()=>{if(space)spacePanned=true;},true);
 window.addEventListener('blur',()=>{space=false;drag=null;});

 new ResizeObserver(()=>{if(!host.hidden)render();}).observe($('sfStage'));
 document.addEventListener('miaaudioready',()=>render());
 StudioShell.viewStatus('sounds',$('sfStatus'));
 // Where a frame's column crosses a lane, `t` of the way down it: for driving
 // the lanes with real pointer input in tests/desktop-audio.cjs.
 host.pointAt=(frame,key,t=.5)=>{const lane=lanes().find(l=>l.key===key),r=canvas.getBoundingClientRect();return {x:r.left+frameX(frame+.5),y:r.top+lane.top+t*lane.height};};
 window.renderSounds=render;
 const oldRedraw=redrawAll;redrawAll=function(){oldRedraw();render();};
 const oldShow=showView;showView=function(v){if(v!=='sounds'&&currentView==='sounds')StudioAudio.stop();oldShow(v);render();};
 const oldNew=newProject;newProject=function(...args){StudioAudio.stop();selection=null;oldNew(...args);};
 const oldRestore=restoreStudioProject;restoreStudioProject=function(...args){StudioAudio.stop();selection=null;oldRestore(...args);};
 render();
})();
