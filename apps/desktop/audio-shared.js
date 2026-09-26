// What the sound and music editors share: playback through MIA's engine —
// packages/assets/audio.ts, loaded by editor.html as window.MiaAudio — and the
// envelope and pan fields both edit. See docs/audio.md.
(() => {
 const RATE=24000,CHUNK=2400,AHEAD=.3;
 let context=null,job=null;
 // The context runs at the chip's own sample rate, so the engine's samples
 // play as they are and are resampled once, for the output device, rather
 // than per chunk.
 function audioContext(){
  if(!context)context=new AudioContext({sampleRate:RATE,latencyHint:'interactive'});
  if(context.state==='suspended')context.resume();
  return context;
 }
 // A stream (MiaAudio's soundStream, songStream or noteStream) renders a
 // chunk at a time, a little ahead of what is heard. `origin` is where in the
 // song or sound the stream starts, for position().
 function play(stream,{onEnd,origin=0}={}){
  stop();
  const c=audioContext(),j={stream,start:c.currentTime+.06,scheduled:0,sources:new Set(),onEnd,origin,timer:0};
  const pump=()=>{
   if(job!==j)return;
   while(!j.stream.finished&&j.start+j.scheduled/RATE<c.currentTime+AHEAD){
    const left=new Float32Array(CHUNK),right=new Float32Array(CHUNK),n=j.stream.render(left,right,CHUNK);
    if(!n)break;
    const buffer=c.createBuffer(2,n,RATE);buffer.copyToChannel(left.subarray(0,n),0);buffer.copyToChannel(right.subarray(0,n),1);
    const source=c.createBufferSource();source.buffer=buffer;source.connect(c.destination);source.start(j.start+j.scheduled/RATE);
    j.sources.add(source);source.onended=()=>j.sources.delete(source);
    j.scheduled+=n;
   }
   if(j.stream.finished&&c.currentTime>=j.start+j.scheduled/RATE)finish(j);
  };
  job=j;pump();j.timer=setInterval(pump,40);
 }
 function finish(j){if(job!==j)return;clearInterval(j.timer);for(const s of j.sources)try{s.stop();}catch{}job=null;j.onEnd?.();}
 function stop(){if(job)finish(job);}
 /** How far the playing stream has been heard, in samples from its origin; null when nothing plays. */
 function position(){return job&&context?job.origin+Math.max(0,Math.min(job.scheduled,(context.currentTime-job.start)*RATE)):null;}

 const formatMs=ms=>ms<1000?Math.round(ms)+' ms':(Math.round(ms/100)/10)+' s';
 const panText=p=>p===0?'center':p<0?`left ${-p}`:`right ${p}`;
 // Rows for an envelope's four nibbles — attack, decay and release are rates,
 // sustain a level — with what each means in time. `prefix` names the inputs.
 function envelopeRows(prefix){
  return [['attack','Attack','How fast the note rises to full'],['decay','Decay','How fast it falls to the sustain level'],['sustain','Sustain','The level it holds while the gate is on, 0–15'],['release','Release','How fast it fades once the gate goes off']]
   .map(([key,label,title])=>`<label class="audioField" title="${title}"><span>${label}</span><input id="${prefix}${key}" type="range" min="0" max="15" aria-label="${label}, 0 to 15"><output id="${prefix}${key}Out"></output></label>`).join('');
 }
 function syncEnvelope(prefix,e){
  const A=window.MiaAudio;
  for(const key of ['attack','decay','sustain','release']){const input=$(prefix+key);if(document.activeElement!==input)input.value=e[key];}
  $(prefix+'attackOut').textContent=A?formatMs(A.ATTACK_MS[e.attack]):e.attack;
  $(prefix+'decayOut').textContent=A?formatMs(A.DECAY_RELEASE_MS[e.decay]):e.decay;
  $(prefix+'sustainOut').textContent=e.sustain+'/15';
  $(prefix+'releaseOut').textContent=A?formatMs(A.DECAY_RELEASE_MS[e.release]):e.release;
 }
 /** Calls change(key, value, first) as a slider moves; `first` starts each drag, for its one undo step. */
 function bindEnvelope(prefix,change){for(const key of ['attack','decay','sustain','release'])bindRange($(prefix+key),(value,first)=>change(key,value,first));}
 // A range edits live while dragged and makes one undo step: change(value,
 // first) is told which input starts a drag, and takes the checkpoint then.
 function bindRange(input,change){let dragging=false;input.oninput=()=>{change(Number(input.value),!dragging);dragging=true;};input.onchange=()=>{dragging=false;};}

 // The envelope as the engine runs it: gate on for `holdMs`, then off, the
 // level sampled every millisecond until it is silent. Drawn from the
 // firmware's own rate tables, so long and short settings show true to time.
 const curves=new Map();
 function envelopeCurve(e,holdMs){
  const A=window.MiaAudio;if(!A)return [];
  const key=[e.attack,e.decay,e.sustain,e.release,Math.round(holdMs)].join();
  if(curves.has(key))return curves.get(key);
  if(curves.size>64)curves.clear();
  const engine=new A.MiaEngine(),{REG}=A,points=[];
  engine.write(0,REG.ATTACK_DECAY,e.attack<<4|e.decay);engine.write(0,REG.SUSTAIN_RELEASE,e.sustain<<4|e.release);engine.write(0,REG.CONTROL,3);
  const cap=40000;
  for(let ms=0;ms<cap;ms++){
   if(ms===Math.round(holdMs))engine.write(0,REG.CONTROL,0);
   engine.render(24);points.push(engine.level(0));
   if(ms>holdMs&&engine.level(0)===0)break;
  }
  curves.set(key,points);return points;
 }
 function drawEnvelope(canvas,e,holdMs){
  const points=envelopeCurve(e,holdMs),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,scale=w/(canvas.clientWidth||w);
  ctx.fillStyle='#101113';ctx.fillRect(0,0,w,h);
  if(!points.length)return;
  const x=i=>2+i/(points.length-1||1)*(w-4),y=v=>h-3-v/256*(h-6);
  ctx.fillStyle='#ffb00022';ctx.strokeStyle='#ffb000';ctx.lineWidth=1.5*scale;
  ctx.beginPath();ctx.moveTo(x(0),y(0));points.forEach((v,i)=>ctx.lineTo(x(i),y(v)));ctx.lineTo(x(points.length-1),y(0));ctx.closePath();ctx.fill();
  ctx.beginPath();points.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.stroke();
  const off=x(Math.min(points.length-1,Math.round(holdMs)));ctx.strokeStyle='#8a8268';ctx.lineWidth=scale;ctx.setLineDash([3*scale,3*scale]);ctx.beginPath();ctx.moveTo(off,0);ctx.lineTo(off,h);ctx.stroke();ctx.setLineDash([]);
  // Labels on a backing, so a curve running along an edge doesn't cross them.
  ctx.font=`${10*scale}px monospace`;
  const label=(text,x,y,align)=>{const tw=ctx.measureText(text).width,left=align==='right'?x-tw:x;ctx.fillStyle='#101113cc';ctx.fillRect(left-2*scale,y-9*scale,tw+4*scale,12*scale);ctx.fillStyle='#8a8268';ctx.textAlign=align;ctx.fillText(text,x,y);};
  label(formatMs(points.length),w-4*scale,13*scale,'right');label('gate off',Math.min(off+4*scale,w-50*scale),h-5*scale,'left');ctx.textAlign='left';
 }

 // The dock fields both editors use, labeled on the left, the value on the right.
 const style=document.createElement('style');style.textContent=`
 .audioField{display:grid;grid-template-columns:62px minmax(0,1fr) 64px;align-items:center;gap:8px;font-size:11px;color:var(--text-dim);margin:5px 0}
 .audioField input[type=range]{width:100%;accent-color:var(--ink);margin:0}
 .audioField output{color:var(--text);text-align:right;font-size:11px}
 .audioField select,.audioField input[type=number]{grid-column:2/4;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:3px;padding:4px 5px;font:inherit;font-size:11px}
 .audioField input[type=number]{grid-column:2;width:100%;min-width:0;box-sizing:border-box}
 .audioField output{white-space:nowrap}
 .audioDock h3{font-size:10px;color:var(--text-dim);margin:14px 0 6px;text-transform:uppercase;letter-spacing:.04em;flex-shrink:0}
 .audioDock h2+h3{margin-top:4px}
 .audioDock canvas.envelope{width:100%;height:64px;border:1px solid var(--line);border-radius:3px;margin:4px 0 2px;flex-shrink:0}
 .audioDock .audioReadout{font-size:11px;color:var(--text);line-height:1.6;margin:4px 0}
 .audioTransport{display:flex;align-items:center;gap:6px;padding:6px 12px;background:var(--panel);border-top:1px solid var(--line)}
 .audioTransport button{padding:4px;display:flex;align-items:center;justify-content:center}
 .audioTransport svg{width:22px;height:22px}
 .audioTransport span{font-size:11px;white-space:nowrap;color:var(--text-dim);margin-left:6px}
 .audioStage{position:relative;flex:1;min-height:0;overflow:hidden}
 .audioStage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;outline:none}
 `;document.head.append(style);

 window.StudioAudio=Object.freeze({play,stop,position,playing:()=>!!job,formatMs,panText,envelopeRows,syncEnvelope,bindEnvelope,bindRange,drawEnvelope,
  /** The color each of MIA's four voices draws in, everywhere. */
  voiceColors:['#ffb000','#7bd88f','#ff6fae','#a48bff']});
})();
