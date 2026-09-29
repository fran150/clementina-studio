// Instruments: the properties panel (waveform, pulse width, volume and
// envelope, heard as they change) and the instrument library's new,
// duplicate, delete, choose and rename.
import { StudioAudio } from '../audio-shared.js';
import { canAdd, clampIndex, copyAsset, newId } from '../domain/assets.js';
import { SYMBOL_NAME, canRename, freshName } from '../domain/names.js';
import { $ } from '../dom.js';
import { instruments, songs } from '../state.js';
import { markDirty, setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { checkpoint, edit, instrument, mu } from './model.js';
import { selected } from './notes.js';
import { hear, replay } from './playback.js';

/** Changes one of the instrument's settings as a slider moves. */
function tweak(label, key, value, first) {
  const i = instrument();
  if (!i) return;
  if (first) checkpoint(label, ['instruments']);
  i[key] = value;
  markDirty();
  renderInstrumentProps();
}
// Hearing an instrument as it changes: once a slider is let go, or a pick made.
function sample() {
  const i = instrument();
  if (i) hear(60, i.id);
}

/** Fills the waveform choices and wires the instrument's settings. */
export function instrumentProps() {
  $('muWave').replaceChildren(
    ...['Sine', 'Pulse', 'Saw', 'Triangle', 'Noise'].map((name, i) => new Option(name, String(i))),
  );
  $('muWave').onchange = () => {
    const i = instrument();
    if (!i) return;
    edit('Change the waveform', () => (i.wave = Number($('muWave').value)), ['instruments']);
    sample();
  };
  StudioAudio.bindRange($('muPulse'), (value, first) =>
    tweak('Change the pulse width', 'pulse', value, first),
  );
  StudioAudio.bindRange($('muVolume'), (value, first) =>
    tweak('Change the volume', 'volume', value, first),
  );
  StudioAudio.bindEnvelope('muEnv_', (key, value, first) =>
    tweak('Change the envelope', key, value, first),
  );
  for (const id of [
    'muPulse',
    'muVolume',
    'muEnv_attack',
    'muEnv_decay',
    'muEnv_sustain',
    'muEnv_release',
  ])
    $(id).addEventListener('change', () => {
      mu.render();
      replay();
      if (!StudioAudio.playing()) sample();
    });
}
/** Shows the instrument's settings and envelope. */
export function renderInstrumentProps() {
  const i = instrument();
  $('muInstrumentName').textContent = i
    ? `${i.name} — used by ${songs.reduce((n, s) => n + s.voices.reduce((m, v) => m + v.notes.filter((x) => x.instrumentId === i.id).length, 0), 0)} notes`
    : 'No instruments yet.';
  for (const id of [
    'muWave',
    'muPulse',
    'muVolume',
    'muEnv_attack',
    'muEnv_decay',
    'muEnv_sustain',
    'muEnv_release',
  ])
    $(id).disabled = !i;
  if (!i) return;
  if (document.activeElement !== $('muWave')) $('muWave').value = i.wave;
  for (const key of ['pulse', 'volume']) {
    const input = $(key === 'pulse' ? 'muPulse' : 'muVolume');
    if (document.activeElement !== input) input.value = i[key];
  }
  $('muPulseOut').textContent = i.wave === 1 ? `${Math.round(i.pulse / 2.56)}%` : 'pulse only';
  $('muPulse').disabled = i.wave !== 1;
  $('muVolumeOut').textContent = i.volume;
  StudioAudio.syncEnvelope('muEnv_', i);
  StudioAudio.drawEnvelope($('muEnvelope'), i, 250);
}

/** Adds the instrument library's buttons and wires them. */
export function instrumentLibrary() {
  for (const [id, label, icon] of [
    ['muInstrumentNew', 'New instrument', 'newItem'],
    ['muInstrumentDuplicate', 'Duplicate instrument', 'duplicate'],
    ['muInstrumentDelete', 'Delete instrument', 'delete'],
  ])
    $('muInstrumentActions').append(StudioShell.iconButton(id, label, icon));
  $('muInstrumentNew').onclick = () => {
    if (!canAdd(instruments)) {
      setStatus('A project holds at most 255 instruments.');
      return;
    }
    edit(
      'New instrument',
      () => {
        instruments.push({
          id: newId(),
          name: freshName(instruments, 'Instrument'),
          wave: 1,
          pulse: 128,
          attack: 0,
          decay: 6,
          sustain: 10,
          release: 5,
          volume: 200,
        });
        mu.instrumentIndex = instruments.length - 1;
      },
      ['instruments'],
    );
  };
  $('muInstrumentDuplicate').onclick = () => {
    const i = instrument();
    if (!i || !canAdd(instruments)) return;
    edit(
      'Duplicate ' + i.name,
      () => {
        instruments.push(copyAsset(i, freshName(instruments, i.name.replace(/_\d+$/, ''))));
        mu.instrumentIndex = instruments.length - 1;
      },
      ['instruments'],
    );
  };
  // Notes playing a deleted instrument move to the next one, as a deleted
  // palette's banks move to another; the last one cannot go while notes use it.
  $('muInstrumentDelete').onclick = () => {
    const i = instrument();
    if (!i) return;
    const users = songs
      .flatMap((s) => s.voices.flatMap((v) => v.notes))
      .filter((n) => n.instrumentId === i.id);
    if (users.length && instruments.length < 2) {
      setStatus(`${i.name} is the only instrument, and ${users.length} notes play it.`);
      return;
    }
    const heir = instruments[mu.instrumentIndex + 1] ?? instruments[mu.instrumentIndex - 1];
    edit(
      'Delete ' + i.name,
      () => {
        for (const s of songs)
          for (const v of s.voices)
            for (const n of v.notes) if (n.instrumentId === i.id) n.instrumentId = heir.id;
        instruments.splice(mu.instrumentIndex, 1);
        mu.instrumentIndex = clampIndex(instruments, mu.instrumentIndex);
      },
      ['instruments', 'songs'],
    );
    setStatus(
      `Deleted ${i.name}${users.length ? `; its ${users.length} notes play ${heir.name} now` : ''}. Ctrl/Cmd+Z brings it back.`,
    );
  };
}
/**
 * Opens instrument `k`; with notes selected, they play it from now on.
 */
export function chooseInstrument(k) {
  mu.instrumentIndex = k;
  const list = selected(),
    id = instruments[k].id;
  if (list.length && list.some((n) => n.instrumentId !== id))
    edit(`Play ${instruments[k].name}`, () => {
      for (const n of list) n.instrumentId = id;
    });
  else mu.render();
  if (!StudioAudio.playing()) sample();
}
/** Renames instrument `k`; false (with a hint) when the name is taken or not a symbol. */
export function renameInstrument(k, name) {
  if (!canRename(instruments, k, name, SYMBOL_NAME)) {
    setStatus('Use a unique name: letters, digits, underscores; start with a letter.');
    return false;
  }
  edit('Rename an instrument', () => (instruments[k].name = name), ['instruments']);
  return true;
}
