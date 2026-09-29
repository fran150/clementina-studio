// The song's properties panel: tempo, meter, step size, length, loop, each
// voice's pan, the compiled size per voice, and the status line.
import { StudioAudio } from '../audio-shared.js';
import { $ } from '../dom.js';
import { instruments } from '../state.js';
import { markDirty, setStatus } from '../status.js';
import { stepsPerBar } from './geometry.js';
import { A, COLORS, checkpoint, edit, mu, song } from './model.js';
import { replay } from './playback.js';

/** Runs `fn(song)` as one undoable edit labeled `label`. */
function setting(label, fn) {
  const s = song();
  if (!s) return;
  edit(label, () => fn(s));
}

/** Fills the step size choices and wires the song's settings. */
export function songProps() {
  $('muStepsPerBeat').replaceChildren(
    ...[1, 2, 3, 4, 6, 8].map(
      (n) =>
        new Option(
          {
            1: '1 per beat',
            2: '2 per beat — eighths',
            3: '3 per beat — triplets',
            4: '4 per beat — sixteenths',
            6: '6 per beat — sixteenth triplets',
            8: '8 per beat — 32nds',
          }[n],
          String(n),
        ),
    ),
  );
  $('muBpm').onchange = () => {
    const n = Number($('muBpm').value);
    if (!Number.isInteger(n) || n < 20 || n > 400) {
      mu.render();
      return;
    }
    setting('Change the tempo', (s) => (s.bpm = n));
  };
  $('muBeatsPerBar').onchange = () => {
    const n = Number($('muBeatsPerBar').value);
    if (!Number.isInteger(n) || n < 1 || n > 16) {
      mu.render();
      return;
    }
    setting('Change the meter', (s) => (s.beatsPerBar = n));
  };
  // A new step size keeps every note where it was in time, which only works
  // if each one still starts and ends on a step.
  $('muStepsPerBeat').onchange = () => {
    const s = song(),
      next = Number($('muStepsPerBeat').value),
      scale = next / s.stepsPerBeat,
      fits = (x) => Number.isInteger(x * scale);
    if (
      ![
        s.length,
        s.loopStart ?? 0,
        ...s.voices.flatMap((v) => v.notes.flatMap((n) => [n.step, n.length])),
      ].every(fits) ||
      s.length * scale > A().MAX_SONG_STEPS
    ) {
      setStatus('Some notes fall between the new steps. Move them onto the grid first.');
      mu.render();
      return;
    }
    setting('Change the step size', (x) => {
      x.stepsPerBeat = next;
      x.length *= scale;
      if (x.loopStart !== undefined) x.loopStart *= scale;
      for (const v of x.voices)
        for (const n of v.notes) {
          n.step *= scale;
          n.length *= scale;
        }
    });
    mu.cursor = Math.round(mu.cursor * scale);
    mu.lastLength = Math.max(1, Math.round(mu.lastLength * scale));
  };
  $('muBars').onchange = () => {
    const s = song(),
      n = Math.round(Number($('muBars').value) * stepsPerBar(s));
    if (!Number.isFinite(n) || n < 1 || n > A().MAX_SONG_STEPS) {
      setStatus(`A song is 1 to ${A().MAX_SONG_STEPS} steps long.`);
      mu.render();
      return;
    }
    // Shortening cuts notes at the new end.
    setting('Change the length', (x) => {
      x.length = n;
      for (const v of x.voices)
        v.notes = v.notes
          .filter((m) => m.step < n)
          .map((m) => ({ ...m, length: Math.min(m.length, n - m.step) }));
      if (x.loopStart >= n) x.loopStart = 0;
    });
    mu.selection = new Set();
    mu.cursor = Math.min(mu.cursor, n - 1);
  };
  $('muLoop').onchange = () =>
    setting($('muLoop').value === 'loop' ? 'Loop the song' : 'Play the song once', (s) => {
      if ($('muLoop').value === 'loop') s.loopStart = 0;
      else delete s.loopStart;
    });
  $('muLoopFrom').onchange = () => {
    const s = song(),
      n = Math.round((Number($('muLoopFrom').value) - 1) * stepsPerBar(s));
    if (!Number.isFinite(n) || n < 0 || n >= s.length) {
      mu.render();
      return;
    }
    setting('Set the loop', (x) => (x.loopStart = n));
  };
}
/** Shows the song's settings, pans, compiled size and status. */
export function renderSongProps() {
  const s = song(),
    A_ = A();
  if (!s || !A_) return;
  const field = (id, value) => {
    if (document.activeElement !== $(id)) $(id).value = value;
  };
  field('muBpm', s.bpm);
  $('muBpmOut').textContent = `${(60 / s.bpm).toFixed(3)} s`;
  field('muStepsPerBeat', s.stepsPerBeat);
  field('muBeatsPerBar', s.beatsPerBar);
  const bars = s.length / stepsPerBar(s);
  field('muBars', Math.round(bars * 100) / 100);
  const seconds = A_.stepSample(s, s.length) / A_.SAMPLE_RATE;
  $('muLengthOut').textContent =
    `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
  field('muLoop', s.loopStart === undefined ? 'once' : 'loop');
  $('muLoopFromRow').hidden = s.loopStart === undefined;
  if (s.loopStart !== undefined) {
    field('muLoopFrom', Math.round((s.loopStart / stepsPerBar(s) + 1) * 100) / 100);
    $('muLoopOut').textContent = `step ${s.loopStart}`;
  }
  // One pan per voice: a SET_PAN at the start of its track.
  const pans = $('muPans');
  if (pans.children.length !== 4) {
    pans.replaceChildren(
      ...[0, 1, 2, 3].map((v) => {
        const row = document.createElement('label');
        row.className = 'audioField';
        row.innerHTML = `<span><i style="background:${COLORS[v]}"></i>V${v} pan</span><input type="range" min="-64" max="63" aria-label="Voice ${v} pan"><output></output>`;
        StudioAudio.bindRange(row.querySelector('input'), (value, first) => {
          const x = song();
          if (!x) return;
          if (first) checkpoint('Change a pan');
          x.voices[v].pan = value;
          markDirty();
          renderSongProps();
          replay();
        });
        return row;
      }),
    );
  }
  [...pans.children].forEach((row, v) => {
    const input = row.querySelector('input');
    if (document.activeElement !== input) input.value = s.voices[v].pan;
    row.querySelector('output').textContent = StudioAudio.panText(s.voices[v].pan);
  });
  let compiled = null;
  try {
    compiled = A_.compileSong(s, instruments);
  } catch {}
  $('muBytes').innerHTML = compiled
    ? compiled.voices
        .map((v, i) =>
          v ? `Voice ${i} · <b>${v.bytes.length} bytes</b>, ${v.notes} notes` : `Voice ${i} · free`,
        )
        .join('<br>') +
      `<br>Total <b>${compiled.voices.reduce((n, v) => n + (v?.bytes.length ?? 0), 0)} bytes</b>`
    : '';
  const used = s.voices.map((v, i) => (v.notes.length ? i : null)).filter((v) => v !== null);
  $('muStatus').textContent =
    `${s.name} · ${s.bpm} BPM · ${Math.round(bars * 100) / 100} bars, ${$('muLengthOut').textContent} · ${s.loopStart === undefined ? 'plays once' : `loops from bar ${Math.round((s.loopStart / stepsPerBar(s) + 1) * 100) / 100}`} · ${used.length ? 'voices ' + used.join(', ') : 'no voices'} in use`;
}
