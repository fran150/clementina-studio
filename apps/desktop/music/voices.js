// The voice strip: pick the voice to draw on, and mute voices while previewing.
import { $ } from '../dom.js';
import { StudioShell } from '../studio-shell.js';
import { COLORS, mu, mutes, song } from './model.js';
import { replay } from './playback.js';

/** Builds the strip once, then shows each voice's note count and mute. */
export function renderVoices() {
  const s = song(),
    strip = $('muVoices');
  if (strip.children.length !== 4)
    strip.replaceChildren(
      ...[0, 1, 2, 3].map((v) => {
        const box = document.createElement('div');
        box.className = 'muVoice';
        box.setAttribute('role', 'radio');
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'muVoicePick';
        pick.onclick = () => chooseVoice(v);
        const mute = StudioShell.iconButton(
          'muMute' + v,
          `Mute voice ${v} while previewing`,
          'mute',
        );
        mute.classList.add('muMute');
        mute.onclick = () => {
          mutes[v] = !mutes[v];
          mu.render();
          replay();
        };
        box.append(pick, mute);
        return box;
      }),
    );
  [...strip.children].forEach((box, v) => {
    const count = s?.voices[v].notes.length ?? 0,
      pick = box.querySelector('.muVoicePick'),
      mute = box.querySelector('.muMute');
    box.setAttribute('aria-checked', String(v === mu.voice));
    pick.innerHTML = `<i style="background:${COLORS[v]}"></i>Voice ${v} <small>${count ? count + ' note' + (count === 1 ? '' : 's') : 'free'}</small>`;
    pick.title = `Draw on voice ${v} (${v + 1})`;
    mute.classList.toggle('on', mutes[v]);
    mute.setAttribute('aria-pressed', String(mutes[v]));
  });
}
/** Draws on voice `v` from now on, dropping the selection. */
export function chooseVoice(v) {
  if (v === mu.voice) return;
  mu.voice = v;
  mu.selection = new Set();
  mu.render();
}
