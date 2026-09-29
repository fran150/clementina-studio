// The sound's properties panel: its envelope, pan and length, the envelope
// preview and status line, and the presets that generate a new sound.
import { StudioAudio } from '../audio-shared.js';
import { $ } from '../dom.js';
import { markDirty } from '../status.js';
import { play } from './controls.js';
import { setLength } from './editing.js';
import { fitLevel } from './geometry.js';
import { A, checkpoint, edit, sf, sound } from './model.js';

/** Wires the envelope, pan and length controls. */
export function soundProps() {
  StudioAudio.bindEnvelope('sfEnv_', (key, value, first) => {
    const s = sound();
    if (!s) return;
    if (first) checkpoint('Change the envelope');
    s[key] = value;
    markDirty();
    syncProps();
  });
  StudioAudio.bindRange($('sfPan'), (value, first) => {
    const s = sound();
    if (!s) return;
    if (first) checkpoint('Change the pan');
    s.pan = value;
    markDirty();
    syncProps();
  });
  $('sfLength').onchange = () => setLength(Number($('sfLength').value));
}
/** Replaces the sound with a fresh random one from `preset`, fits it and plays it. */
function generate(preset) {
  if (!sound() || !A()) return;
  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  edit(`Generate ${A().SOUND_PRESET_NAMES[preset].toLowerCase()}`, () => {
    Object.assign(sound(), A().generateSound(preset, seed));
    sf.selection = null;
  });
  sf.zoom = fitLevel();
  sf.scrollX = 0;
  sf.render();
  play();
}
/** Builds the preset buttons, once the audio module has loaded. */
export function buildPresets() {
  if (!A() || $('sfPresets').children.length) return;
  $('sfPresets').replaceChildren(
    ...A().SOUND_PRESETS.map((p) =>
      Object.assign(document.createElement('button'), {
        type: 'button',
        id: 'sfPreset_' + p,
        textContent: A().SOUND_PRESET_NAMES[p],
        title: `A new ${A().SOUND_PRESET_NAMES[p].toLowerCase()} sound`,
        onclick: () => generate(p),
      }),
    ),
  );
}
/** Shows the sound's properties, envelope and status. */
export function syncProps() {
  const s = sound();
  if (!s) return;
  StudioAudio.syncEnvelope('sfEnv_', s);
  if (document.activeElement !== $('sfPan')) $('sfPan').value = s.pan;
  $('sfPanOut').textContent = StudioAudio.panText(s.pan);
  if (document.activeElement !== $('sfLength')) $('sfLength').value = s.frames.length;
  $('sfLengthOut').textContent = (s.frames.length / 60).toFixed(2) + ' s';
  // The envelope as it plays: held while the first run of gated frames lasts.
  const gated = s.frames.findIndex((f) => !f.gate),
    held = ((gated < 0 ? s.frames.length : gated) * 1000) / 60;
  StudioAudio.drawEnvelope($('sfEnvelope'), s, held);
  const release = A() ? StudioAudio.formatMs(A().DECAY_RELEASE_MS[s.release]) : '';
  $('sfStatus').textContent =
    `${s.name} · ${s.frames.length} frames · ${(s.frames.length / 60).toFixed(2)} s, then a ${release} release · one voice, written at 60 Hz`;
}
