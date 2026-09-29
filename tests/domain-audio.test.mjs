// The renderer's domain modules for sounds and songs: pure operations,
// tested without a page. Sounds use the built MIA audio module, as the page
// does (npm test builds it first).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as audio from '../dist/packages/assets/audio.js';
import {
  ZERO,
  interpolate,
  invertFrames,
  inversionAxis,
  resizeFrames,
  reverseFrames,
  semitoneFreq,
  transposeFrames,
} from '../apps/desktop/domain/sounds.js';
import {
  NOTES,
  clampPitch,
  invertedNotes,
  noteAt,
  noteSpan,
  notesAt,
  relativeNotes,
  reversedNotes,
  setLegato,
  settle,
  shiftBlocked,
  shiftedNotes,
} from '../apps/desktop/domain/songs.js';

const A4 = semitoneFreq(audio, 57);
const frame = (freq, volume = 200) => ({ freq, volume, pulse: 128, wave: 0, gate: true });

test('pitch conversions round-trip through semitones', () => {
  assert.equal(A4, 440 * 16);
  assert.equal(Math.round(audio.frequencyNote(semitoneFreq(audio, 60))), 60);
  assert.deepEqual(ZERO, { freq: 0, volume: 0, pulse: 0, wave: 0, gate: false });
});

test('lines between frames sweep evenly', () => {
  const up = semitoneFreq(audio, 69);
  assert.equal(interpolate(audio, 'freq', A4, up, 0.5, true), semitoneFreq(audio, 63));
  assert.equal(interpolate(audio, 'freq', 0, up, 0.4, true), 0);
  assert.equal(interpolate(audio, 'freq', 0, up, 0.6, true), up);
  assert.equal(interpolate(audio, 'volume', 0, 255, 0.5, true), 128);
  assert.equal(interpolate(audio, 'gate', true, false, 0.9, true), true);
});

test('transpose, reverse and invert change only the range', () => {
  const frames = [frame(A4), frame(0), frame(semitoneFreq(audio, 60), 1), frame(A4)];
  transposeFrames(audio, frames, { from: 0, to: 3 }, 12);
  const c4 = semitoneFreq(audio, 60);
  assert.deepEqual(
    frames.map((f) => f.freq),
    [A4 * 2, 0, Math.round(c4 * 2), A4],
  );
  reverseFrames(frames, { from: 0, to: 3 });
  assert.equal(frames[0].volume, 1);
  assert.equal(inversionAxis(audio, [frame(0)], { from: 0, to: 1 }), null);
  const pair = [frame(semitoneFreq(audio, 57)), frame(semitoneFreq(audio, 60))];
  invertFrames(audio, pair, { from: 0, to: 2 }, inversionAxis(audio, pair, { from: 0, to: 2 }));
  assert.deepEqual(
    pair.map((f) => Math.round(audio.frequencyNote(f.freq))),
    [60, 57],
  );
});

test('a sound grows by repeating its last frame', () => {
  const frames = [frame(1), frame(2)];
  resizeFrames(frames, 4);
  assert.deepEqual(
    frames.map((f) => f.freq),
    [1, 2, 2, 2],
  );
  assert.notEqual(frames[2], frames[1]);
  resizeFrames(frames, 1);
  assert.equal(frames.length, 1);
});

const note = (step, length, pitch = 40) => ({ step, length, pitch, instrumentId: 'i' });

test('placed notes cut what they land on', () => {
  const others = [note(0, 8), note(10, 4), note(16, 4)];
  const placed = [note(4, 8), note(30, 4)];
  const out = settle(others, placed, 32);
  assert.deepEqual(
    out.map((n) => [n.step, n.length]),
    [
      [0, 4],
      [4, 8],
      [12, 2],
      [16, 4],
      [30, 2],
    ],
  );
  assert.equal(out[1], placed[0]);
});

test('notes shift only within the song and the pitch range', () => {
  const list = [note(2, 2, 0), note(6, 2, 10)];
  assert.equal(shiftBlocked(list, -2, 0, 16), null);
  assert.equal(shiftBlocked(list, -3, 0, 16), 'song');
  assert.equal(shiftBlocked(list, 0, -1, 16), 'pitch');
  assert.equal(shiftBlocked(list, 0, NOTES - 10, 16), 'pitch');
  assert.deepEqual(noteSpan(list), { from: 2, to: 8, low: 0, high: 10 });
  assert.deepEqual(
    shiftedNotes(list, 1, 2).map((n) => [n.step, n.pitch]),
    [
      [3, 2],
      [7, 12],
    ],
  );
  assert.equal(clampPitch(200), NOTES - 1);
});

test('reverse, invert and legato work within the selection', () => {
  const list = [note(0, 2, 5), note(4, 4, 9)];
  assert.deepEqual(
    reversedNotes(list).map((n) => n.step),
    [6, 0],
  );
  assert.deepEqual(
    invertedNotes(list).map((n) => n.pitch),
    [9, 5],
  );
  setLegato(list, true);
  assert.ok(list.every((n) => n.legato));
  setLegato(list, false);
  assert.ok(list.every((n) => !('legato' in n)));
  assert.equal(noteAt(list, 5.5, 9), list[1]);
  assert.equal(noteAt(list, 5.5, 5), null);
});

test('copied notes paste relative to the cursor, keeping known instruments', () => {
  const copied = relativeNotes([note(4, 2), { ...note(8, 2), instrumentId: 'gone' }]);
  assert.deepEqual(
    copied.map((n) => n.step),
    [0, 4],
  );
  const pasted = notesAt(copied, 10, (id) => id === 'i', 'fallback');
  assert.deepEqual(
    pasted.map((n) => [n.step, n.instrumentId]),
    [
      [10, 'i'],
      [14, 'fallback'],
    ],
  );
});
