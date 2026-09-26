// Scenarios that exercise every part of MIA's audio engine, shared by the
// firmware cross-check (audio-crosscheck.mjs), which plays them on the real
// audio.c, and the model tests (tests/audio.test.mjs), which hold Studio's
// engine to the hashes the firmware produced.
//
// A scenario is a list of commands, the same ones audio-harness.c reads:
// ['w', voice, field, value], ['m', volume], ['track', voice, bytes],
// ['start'|'stop'|'take'|'give', mask] and ['run', samples].

export function scenarios(audio) {
 const {REG, FRAME_SAMPLES, compileSong, soundWrites, generateSound, SOUND_PRESETS, noteFrequency} = audio;
 const write = (voice, field, value) => ['w', voice, field, value];
 const freq = (voice, f) => [write(voice, REG.FREQ_L, f & 255), write(voice, REG.FREQ_H, f >> 8)];
 const list = {};

 // Every waveform on its own voice, panned apart, with its own envelope and
 // volume; a sweep, a retrigger, a master fade and releases along the way.
 const voices = [];
 const setups = [[0, 0x00, 0xA4, -64, 255], [1, 0x13, 0xC5, 20, 200], [2, 0x26, 0x88, 63, 180], [3, 0x02, 0x03, -10, 230]];
 setups.forEach(([wave, ad, sr, pan, volume], v) => {
  voices.push(...freq(v, noteFrequency(45 + v * 7)), write(v, REG.PULSE_WIDTH, 64 + v * 40), write(v, REG.ATTACK_DECAY, ad), write(v, REG.SUSTAIN_RELEASE, sr),
   write(v, REG.WAVEFORM, wave), write(v, REG.PAN, pan & 255), write(v, REG.VOLUME, volume), write(v, REG.CONTROL, 3));
 });
 voices.push(['run', 3000]);
 for (let i = 0; i < 20; i++) voices.push(...freq(1, noteFrequency(52) + i * 97), ['run', 150]);
 voices.push(write(3, REG.WAVEFORM, 4), ...freq(3, noteFrequency(70)), ['run', 2000]);
 voices.push(write(0, REG.CONTROL, 0), write(2, REG.CONTROL, 0), ['m', 9], ['run', 4000]);
 voices.push(write(0, REG.CONTROL, 3), write(0, REG.WAVEFORM, 3), ['m', 15], ['run', 3000], write(1, REG.CONTROL, 0), write(3, REG.CONTROL, 0), ['run', 6000]);
 list.voices = voices;

 // A four-voice song through the compiler: instrument changes, legato, a
 // note held across the loop point, gaps, and two passes of the loop.
 const instruments = [
  {id: 'lead', name: 'Lead', wave: 1, pulse: 90, attack: 0, decay: 5, sustain: 9, release: 4, volume: 210},
  {id: 'bass', name: 'Bass', wave: 3, pulse: 128, attack: 1, decay: 3, sustain: 12, release: 2, volume: 255},
  {id: 'saw', name: 'Saw', wave: 2, pulse: 128, attack: 2, decay: 6, sustain: 7, release: 6, volume: 160},
  {id: 'sine', name: 'Sine', wave: 0, pulse: 128, attack: 3, decay: 4, sustain: 11, release: 7, volume: 190},
  {id: 'drum', name: 'Drum', wave: 4, pulse: 128, attack: 0, decay: 2, sustain: 0, release: 3, volume: 230},
 ];
 const song = {id: 's', name: 'Song', bpm: 150, stepsPerBeat: 4, beatsPerBar: 4, length: 32, loopStart: 6, voices: [
  {pan: -30, notes: [{step: 0, length: 2, pitch: 60, instrumentId: 'lead'}, {step: 2, length: 2, pitch: 64, instrumentId: 'lead'}, {step: 4, length: 4, pitch: 67, instrumentId: 'lead', legato: true},
   {step: 10, length: 3, pitch: 72, instrumentId: 'saw'}, {step: 13, length: 3, pitch: 71, instrumentId: 'saw', legato: true}, {step: 20, length: 12, pitch: 69, instrumentId: 'lead'}]},
  {pan: 30, notes: [0, 8, 16, 24].map((step, i) => ({step, length: 6, pitch: 36 + i * 2, instrumentId: 'bass'}))},
  {pan: 0, notes: [{step: 3, length: 10, pitch: 55, instrumentId: 'sine'}, {step: 16, length: 16, pitch: 57, instrumentId: 'sine'}]},
  {pan: 10, notes: Array.from({length: 16}, (_, i) => ({step: i * 2, length: 1, pitch: i % 4 === 2 ? 70 : 40, instrumentId: 'drum'}))},
 ]};
 const compiled = compileSong(song, instruments);
 const tracks = compiled.voices.flatMap((v, i) => v ? [['track', i, [...v.bytes]]] : []);
 list.song = [...tracks, ['start', 15], ['run', compiled.samples + (compiled.samples - compiled.loopSample) + 3000]];

 // A song that ends: the last events, END, and the releases after it.
 const once = {...song, loopStart: undefined, length: 20, voices: song.voices.map(v => ({...v, notes: v.notes.filter(n => n.step + n.length <= 20)}))};
 const onceCompiled = compileSong(once, instruments);
 list.once = [...onceCompiled.voices.flatMap((v, i) => v ? [['track', i, [...v.bytes]]] : []), ['start', 15], ['run', onceCompiled.samples + 12000]];

 // Every generated sound, written frame by frame as a driver writes it.
 const sounds = [];
 SOUND_PRESETS.forEach((preset, i) => {
  const writes = soundWrites({id: preset, name: preset, ...generateSound(preset, i + 1)});
  writes.forEach(frame => sounds.push(...frame.map(([field, value]) => write(0, field, value)), ['run', FRAME_SAMPLES]));
  sounds.push(['run', 6000]);
 });
 list.sounds = sounds;

 // A sound effect taking voice 1 from the song and giving it back: the
 // sequencer's catch-up. Then a stop and a restart from where it stopped.
 const take = [...tracks, ['start', 15], ['run', 7000], ['take', 2]];
 soundWrites({id: 'x', name: 'x', ...generateSound('laser', 3)}).forEach(frame => take.push(...frame.map(([field, value]) => write(1, field, value)), ['run', FRAME_SAMPLES]));
 take.push(['give', 2], ['run', 9000], ['take', 4], ['give', 4], ['run', 3000], ['stop', 9], ['run', 4000], ['start', 9], ['run', 9000]);
 list.take = take;
 return list;
}

/** Plays a scenario on Studio's engine; returns [left, right] pairs as the chip's signed PWM levels. */
export function runEngine(audio, scenario) {
 const engine = new audio.MiaEngine(), out = [];
 for (const [command, ...args] of scenario) {
  if (command === 'w') engine.write(...args);
  else if (command === 'm') engine.setMaster(args[0]);
  else if (command === 'track') engine.loadTrack(args[0], Uint8Array.from(args[1]));
  else if (command === 'start') engine.start(args[0]);
  else if (command === 'stop') engine.stop(args[0]);
  else if (command === 'take') engine.take(args[0]);
  else if (command === 'give') engine.release(args[0]);
  else if (command === 'run') {
   const left = new Float32Array(args[0]), right = new Float32Array(args[0]);
   engine.render(args[0], left, right);
   for (let i = 0; i < args[0]; i++) out.push([Math.round(left[i] * 512), Math.round(right[i] * 512)]);
  }
 }
 return out;
}

export function scenarioText(scenario) {
 return scenario.map(([command, ...args]) => command === 'track' ? `track ${args[0]} ${args[1].map(b => b.toString(16).padStart(2, '0')).join('')}` : [command, ...args].join(' ')).join('\n') + '\n';
}

/** FNV-1a over the samples, so a test can hold a long render to a short fixture. */
export function hash(samples) {
 let h = 0x811c9dc5;
 for (const [l, r] of samples) for (const v of [l & 0xffff, r & 0xffff]) for (const byte of [v & 255, v >> 8]) { h ^= byte; h = Math.imul(h, 0x01000193) >>> 0; }
 return h.toString(16).padStart(8, '0');
}
