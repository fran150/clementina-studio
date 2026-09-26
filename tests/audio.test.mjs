import test from 'node:test';
import assert from 'node:assert/strict';
import * as audio from '../dist/packages/assets/audio.js';
import {emptyProject, encodeProject, decodeProject, validateProject} from '../dist/packages/assets/index.js';
import {scenarios, runEngine, hash} from './firmware/audio-scenarios.mjs';
const {MiaEngine, OP, REG, compileSong, soundWrites, generateSound, SOUND_PRESETS, noteFrequency, noteName, stepSample, songSample, soundStream, songStream, noteStream, validateSongs, validateSounds, validateInstruments, defaultInstruments, newSong, newSound} = audio;

// What clementina-mia's src/mia/audio/audio.c played for each scenario in
// tests/firmware/audio-scenarios.mjs. `npm run test:firmware` compiles the
// firmware on the desktop and compares every sample; rerun it and update
// these when the firmware's audio changes.
const FIRMWARE = {voices: '033b7770', song: '98844dbc', once: 'ed714c9f', sounds: '16d5ff11', take: '9378acf5'};

test('the engine plays every scenario sample for sample as the firmware does', () => {
 const list = scenarios(audio);
 assert.deepEqual(Object.keys(list), Object.keys(FIRMWARE));
 for (const [name, scenario] of Object.entries(list)) assert.equal(hash(runEngine(audio, scenario)), FIRMWARE[name], name);
});

test('notes are equal-tempered 12.4 frequency values', () => {
 // docs/audio-programmer-guide.md's table.
 assert.deepEqual([48, 52, 55, 57, 60].map(noteFrequency), [0x105A, 0x149A, 0x1880, 0x1B80, 0x20B4]);
 assert.ok(noteFrequency(95) <= 0xFFFF);
 assert.deepEqual([0, 57, 61, 95].map(noteName), ['C0', 'A4', 'C#5', 'B7']);
});

test('the sequencer holds an event for its duration field plus one sample', () => {
 // The same timing clementina-6502's audio_sequencer_test.go asserts.
 const engine = new MiaEngine();
 engine.loadTrack(0, Uint8Array.from([OP.NOTE, 0x80, 0x1B, 2, 0, 0, OP.NOTE, 0x5A, 0x10, 0, 0, 0, OP.END]));
 engine.start(1);
 const indexes = [];
 for (let i = 0; i < 6; i++) { engine.render(1); indexes.push(engine.noteIndex(0)); }
 assert.deepEqual(indexes, [1, 1, 1, 2, 2, 2]);
 assert.equal(engine.isRunning(0), false);
});

const instruments = [
 {id: 'a', name: 'A', wave: 1, pulse: 100, attack: 0, decay: 5, sustain: 9, release: 4, volume: 200},
 {id: 'b', name: 'B', wave: 3, pulse: 128, attack: 1, decay: 2, sustain: 12, release: 3, volume: 255},
];
const song = (voices, extra = {}) => ({id: 's', name: 'S', bpm: 120, stepsPerBeat: 4, beatsPerBar: 4, length: 4, voices: [...voices, ...Array(4 - voices.length).fill(0).map(() => ({pan: 0, notes: []}))], ...extra});

test('a song compiles to the sequencer bytecode', () => {
 // 120 BPM in sixteenths: a step is 3000 samples, so a note's duration field is 2999 — less one where it gives a sample to restart the envelope.
 const {voices, samples, loopSample} = compileSong(song([{pan: -8, notes: [{step: 0, length: 1, pitch: 57, instrumentId: 'a'}, {step: 1, length: 1, pitch: 60, instrumentId: 'a'}]}]), instruments);
 assert.equal(samples, 12000); assert.equal(loopSample, null);
 assert.deepEqual([...voices[0].bytes], [
  OP.SET_PAN, 0xF8,
  OP.REST, 0, 0, 0, OP.SET_WAVE, 1, OP.SET_ADSR, 0x05, 0x94, OP.SET_PULSE, 100, OP.SET_VOL, 200, OP.NOTE, 0x80, 0x1B, 0xB6, 0x0B, 0,
  OP.REST, 0, 0, 0, OP.NOTE, 0xB4, 0x20, 0xB6, 0x0B, 0,
  OP.REST, 0x6F, 0x17, 0,
  OP.END]);
 assert.deepEqual(voices.slice(1), [null, null, null], 'a voice without notes stays free for sound effects');
});

/** Samples each pass of a track takes: [first pass to the end, the loop body]. */
function passes(bytes) {
 let at = 0, total = 0, marks = new Map();
 for (;;) {
  marks.set(at, total);
  const op = bytes[at];
  if (op === OP.END) return [total, null];
  if (op === OP.JUMP) { const offset = (bytes[at + 1] | bytes[at + 2] << 8 | bytes[at + 3] << 16) << 8 >> 8, target = at + 4 + offset; return [total, total - marks.get(target)]; }
  if (op === OP.NOTE) total += (bytes[at + 3] | bytes[at + 4] << 8 | bytes[at + 5] << 16) + 1;
  if (op === OP.REST) total += (bytes[at + 1] | bytes[at + 2] << 8 | bytes[at + 3] << 16) + 1;
  at += [1, 6, 4, 2, 3, 2, 2, 2, 4][op];
 }
}

test('every voice keeps the same clock, through the loop', () => {
 // 150 BPM in triplets: steps are 2133⅓ samples, so the rounding must fall on boundaries, not durations.
 const s = {...song([
  {pan: 0, notes: [{step: 0, length: 5, pitch: 40, instrumentId: 'a'}, {step: 5, length: 7, pitch: 47, instrumentId: 'b', legato: true}]},
  {pan: 0, notes: [1, 3, 4, 8, 10].map(step => ({step, length: 1, pitch: 60 + step, instrumentId: step % 2 ? 'a' : 'b'}))},
  {pan: 0, notes: [{step: 2, length: 20, pitch: 30, instrumentId: 'b'}]},
 ]), bpm: 150, stepsPerBeat: 3, length: 24, loopStart: 7};
 const compiled = compileSong(s, instruments);
 const end = stepSample(s, 24), loop = stepSample(s, 7);
 for (const voice of compiled.voices.filter(Boolean)) assert.deepEqual(passes(voice.bytes), [end, end - loop]);
 // The note held across the loop start is split there, and the body starts at the split.
 const held = compiled.voices[2];
 assert.equal(held.bytes[held.loop], OP.SET_WAVE, 'the loop body puts its instrument back on the voice');
 assert.equal(held.notes, 1);
});

test('a legato note slides under one envelope; any other note restarts it', () => {
 const bytes = compileSong(song([{pan: 0, notes: [{step: 0, length: 1, pitch: 50, instrumentId: 'a'}, {step: 1, length: 1, pitch: 52, instrumentId: 'a', legato: true}, {step: 2, length: 1, pitch: 54, instrumentId: 'a'}]}]), instruments).voices[0].bytes;
 const ops = []; for (let at = 0; bytes[at] !== OP.END; at += [1, 6, 4, 2, 3, 2, 2, 2, 4][bytes[at]]) ops.push(bytes[at]);
 const events = ops.filter(op => op === OP.NOTE || op === OP.REST);
 assert.deepEqual(events, [OP.REST, OP.NOTE, OP.NOTE, OP.REST, OP.NOTE, OP.REST]);
});

test('events longer than a 24-bit duration are split', () => {
 const s = {...song([{pan: 0, notes: [{step: 0, length: 1000, pitch: 50, instrumentId: 'a'}]}]), bpm: 20, stepsPerBeat: 1, length: 4096};
 const voice = compileSong(s, instruments).voices[0];
 assert.deepEqual(passes(voice.bytes), [stepSample(s, 4096), null]);
 assert.ok(voice.bytes.filter(b => b === OP.REST).length > 1);
});

test('song positions follow the loop', () => {
 const s = {bpm: 120, stepsPerBeat: 4, length: 8, loopStart: 4};
 assert.equal(songSample(s, 5000), 5000);
 assert.equal(songSample(s, 24000 + 100), 12000 + 100);
 assert.equal(songSample({...s, loopStart: undefined}, 30000), 24000);
});

test('a sound writes its whole record on the first frame, then only what changes', () => {
 const sound = {...newSound('x', 'X'), frames: [
  {freq: 7040, volume: 200, pulse: 128, wave: 1, gate: true},
  {freq: 7040, volume: 200, pulse: 128, wave: 1, gate: true},
  {freq: 8000, volume: 150, pulse: 128, wave: 4, gate: false},
 ]};
 const writes = soundWrites(sound);
 assert.deepEqual(writes[0].map(([field]) => field), [REG.FREQ_L, REG.FREQ_H, REG.PULSE_WIDTH, REG.ATTACK_DECAY, REG.SUSTAIN_RELEASE, REG.WAVEFORM, REG.PAN, REG.VOLUME, REG.CONTROL]);
 assert.deepEqual(writes[0].at(-1), [REG.CONTROL, 3]);
 assert.deepEqual(writes[1], []);
 assert.deepEqual(writes[2], [[REG.FREQ_L, 0x40], [REG.FREQ_H, 0x1F], [REG.WAVEFORM, 4], [REG.VOLUME, 150], [REG.CONTROL, 0]]);
 assert.deepEqual(writes[3], [], 'a sound that already released needs no release');
});

test('streams play to the end of their release', () => {
 const render = stream => { const l = new Float32Array(4800), r = new Float32Array(4800); let total = 0, heard = 0; for (let n; (n = stream.render(l, r, 4800)); total += n) heard += l.subarray(0, n).filter(Boolean).length; return {total, heard}; };
 const sound = {...newSound('x', 'X'), ...generateSound('coin', 4)};
 const played = render(soundStream(sound));
 assert.ok(played.total >= sound.frames.length * 400 && played.heard > 0);
 assert.ok(render(noteStream(instruments[0], 57, 2400)).total > 2400);
 const s = song([{pan: 0, notes: [{step: 0, length: 2, pitch: 50, instrumentId: 'a'}]}]);
 assert.ok(render(songStream(s, instruments)).total >= 12000);
});

test('playing a song from partway sounds exactly as it would there', () => {
 const s = {...song([{pan: 20, notes: [0, 2, 3].map(step => ({step, length: 1, pitch: 50 + step, instrumentId: 'b'}))}, {pan: -20, notes: [{step: 1, length: 3, pitch: 70, instrumentId: 'a'}]}]), loopStart: 0};
 const take = (stream, n) => { const l = new Float32Array(n), r = new Float32Array(n); stream.render(l, r, n); return [...l, ...r]; };
 const whole = songStream(s, instruments), l = new Float32Array(20000), r = new Float32Array(20000); whole.render(l, r, 20000);
 assert.deepEqual(take(songStream(s, instruments, {from: 7000}), 13000), [...l.slice(7000), ...r.slice(7000)]);
 const muted = take(songStream(s, instruments, {mutes: [true, true]}), 5000);
 assert.ok(muted.every(v => v === 0), 'muted voices are not loaded');
});

test('generated sounds are valid, and a seed makes the same sound again', () => {
 for (const preset of SOUND_PRESETS) {
  const a = generateSound(preset, 7), b = generateSound(preset, 7), c = generateSound(preset, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c, preset);
  validateSounds([{id: preset, name: preset, ...a}]);
 }
});

test('songs, sounds and instruments are validated and saved with the project', () => {
 const kit = defaultInstruments((n => () => 'i' + n++)(0));
 validateInstruments(kit);
 const s = newSong('song', 'Theme');
 s.voices[0].notes.push({step: 0, length: 4, pitch: 60, instrumentId: kit[0].id}, {step: 4, length: 2, pitch: 62, instrumentId: kit[1].id, legato: true});
 const project = {...emptyProject(), instruments: kit, songs: [s], sounds: [{...newSound('snd', 'Coin'), ...generateSound('coin', 1)}]};
 assert.deepEqual(decodeProject(encodeProject(project)), project);
 const {instruments: _, sounds: __, songs: ___, ...older} = emptyProject();
 validateProject(older);
 const bad = (mutate, pattern) => { const copy = structuredClone(project); mutate(copy); assert.throws(() => validateProject(copy), pattern); };
 bad(p => p.songs[0].voices[0].notes[1].step = 3, /overlap/);
 bad(p => p.songs[0].voices[0].notes[0].instrumentId = 'gone', /instrument/);
 bad(p => p.songs[0].voices.pop(), /4 voices/);
 bad(p => p.songs[0].loopStart = 64, /loop/);
 bad(p => p.songs[0].stepsPerBeat = 5, /tempo/);
 bad(p => p.sounds[0].frames = [], /frames/);
 bad(p => p.sounds[0].frames[0].wave = 5, /frame/);
 bad(p => p.instruments[1].name = 'lead', /unique/);
 bad(p => p.instruments[0].sustain = 16, /instrument/);
 assert.throws(() => validateSongs([s], []), /instrument/);
});
