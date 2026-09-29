// Playing music: auditioning a note, playing the song from the cursor with
// its mutes, pausing, following the playhead, and replaying after an edit.
import { StudioAudio } from '../audio-shared.js';
import { $ } from '../dom.js';
import { instruments } from '../state.js';
import { canvas, clampScroll, stepW, stepX } from './geometry.js';
import { A, KEYS_W, instrument, instrumentById, mu, mutes, song } from './model.js';
import { draw, syncPosition } from './view.js';

const host = $('musicEditor');

/** Plays one note at `pitch` on an instrument (the open one by default). */
export function hear(pitch, instrumentId) {
  const i = instrumentById(instrumentId) ?? instrument();
  if (!i || !A() || (StudioAudio.playing() && !mu.audition)) return;
  // Set after play(): stopping the previous audition clears it.
  StudioAudio.play(
    A().noteStream(i, pitch, A().SAMPLE_RATE / 4, song()?.voices[mu.voice].pan ?? 0),
    {
      onEnd: () => {
        mu.audition = null;
      },
    },
  );
  mu.audition = true;
}
/** The step the song is playing, or null. */
function songPosition() {
  const s = song(),
    p = StudioAudio.position();
  return s && p !== null && !mu.audition ? A().sampleStep(s, A().songSample(s, p)) : null;
}
/** Plays the song from step `from` (the cursor by default). */
export function play(from = mu.cursor) {
  const s = song();
  if (!s || !A()) return;
  const origin = A().stepSample(s, Math.min(from, s.length - 1));
  mu.audition = null;
  StudioAudio.play(A().songStream(s, instruments, { from: origin, mutes }), {
    origin,
    onEnd: () => {
      mu.playhead = null;
      mu.render();
    },
  });
  mu.render();
  tick();
}
/** Stops, leaving the cursor where the song got to. */
function pause() {
  const at = songPosition();
  StudioAudio.stop();
  if (at !== null) mu.cursor = Math.floor(at);
  mu.playhead = null;
  mu.render();
}
/** Plays or pauses. */
export function toggle() {
  if (StudioAudio.playing() && !mu.audition) pause();
  else play();
}
// An edit while the song plays is heard at once: it plays on from where it was.
export function replay() {
  if (!StudioAudio.playing() || mu.audition) return;
  const at = songPosition();
  if (at !== null) play(Math.floor(at));
}
/** Moves the playhead with the audio, and the view with it, until it stops. */
function tick() {
  if (!StudioAudio.playing() || mu.audition || host.hidden) {
    mu.playhead = null;
    draw();
    return;
  }
  mu.playhead = songPosition();
  // The view follows the playhead once it runs off the right edge.
  if (mu.playhead !== null && !mu.drag) {
    const x = stepX(mu.playhead);
    if (x > canvas.clientWidth - 20 || x < KEYS_W) {
      mu.scrollX = mu.playhead * stepW() - (canvas.clientWidth - KEYS_W) / 4;
      clampScroll();
    }
  }
  draw();
  syncPosition();
  requestAnimationFrame(tick);
}
/** Moves the cursor back to the start, playing from there if it was playing. */
export function rewind() {
  const was = StudioAudio.playing() && !mu.audition;
  mu.cursor = 0;
  mu.scrollX = 0;
  if (was) play(0);
  else mu.render();
}
