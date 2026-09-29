// Drawing the sound: the lanes with each frame's values as bars, the grid,
// selection, playhead and ruler, the fixed label column, and the position
// and frame readouts beside the canvas.
import { $ } from '../dom.js';
import { canvas, frameW, frameX, lanes } from './geometry.js';
import {
  A,
  LABEL_W,
  PITCH_HIGH,
  PITCH_LOW,
  RULER_H,
  WAVE_SHORT,
  frames,
  sf,
  sound,
} from './model.js';

const host = $('soundEditor');

/** Draws the canvas. */
export function draw() {
  if (host.hidden || !sound()) return;
  const dpr = devicePixelRatio || 1,
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const list = frames(),
    fw = frameW(),
    ls = lanes(),
    first = Math.max(0, Math.floor(sf.scrollX / fw)),
    last = Math.min(list.length - 1, Math.ceil((sf.scrollX + w - LABEL_W) / fw));
  ctx.save();
  ctx.beginPath();
  ctx.rect(LABEL_W, 0, w - LABEL_W, h);
  ctx.clip();
  // Lane backgrounds, and the art's edge where the sound ends.
  const end = frameX(list.length);
  for (const lane of ls) {
    ctx.fillStyle = '#17181c';
    ctx.fillRect(frameX(0), lane.top, end - frameX(0), lane.height);
  }
  // Pitch: a line at every C, fainter ones at every semitone when there is room.
  const pitch = ls[0],
    semitoneY = (s) => pitch.top + ((PITCH_HIGH - s) / (PITCH_HIGH - PITCH_LOW)) * pitch.height;
  for (let s = PITCH_LOW; s <= PITCH_HIGH; s++) {
    if (s % 12 && pitch.height / (PITCH_HIGH - PITCH_LOW) < 5) continue;
    ctx.fillStyle = s % 12 ? '#1d1f24' : '#2c2f37';
    ctx.fillRect(frameX(0), Math.round(semitoneY(s)), end - frameX(0), 1);
  }
  // Frame lines every frame when they are far enough apart, stronger each second.
  for (let f = first; f <= last + 1; f++) {
    if (f % 60 && (fw < 6 || f % (fw < 10 ? 10 : 1))) continue;
    ctx.fillStyle = f % 60 ? '#23252b' : '#3a3f4a';
    ctx.fillRect(Math.round(frameX(f)), RULER_H, 1, h - RULER_H);
  }
  if (sf.selection) {
    ctx.fillStyle = '#36c9d620';
    ctx.fillRect(
      frameX(sf.selection.from),
      RULER_H,
      (sf.selection.to - sf.selection.from) * fw,
      h - RULER_H,
    );
  }
  if (sf.hover !== null && sf.hover < list.length) {
    ctx.fillStyle = '#ffffff0c';
    ctx.fillRect(frameX(sf.hover), RULER_H, fw, h - RULER_H);
  }
  drawFrames(ctx, list, ls, first, last, semitoneY);
  if (sf.drag?.kind === 'line') {
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sf.drag.x0, sf.drag.y0);
    ctx.lineTo(sf.drag.x1, sf.drag.y1);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (sf.selection) {
    ctx.strokeStyle = '#36c9d6';
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(
      frameX(sf.selection.from) + 0.5,
      RULER_H + 0.5,
      (sf.selection.to - sf.selection.from) * fw - 1,
      h - RULER_H - 1,
    );
    ctx.setLineDash([]);
  }
  if (sf.playhead !== null) {
    const x = Math.round(frameX(sf.playhead));
    ctx.fillStyle = '#ffb000';
    ctx.fillRect(x, RULER_H, 2, h - RULER_H);
  }
  // The ruler: frame numbers, and seconds at every 60 frames.
  ctx.fillStyle = '#1e1a14';
  ctx.fillRect(LABEL_W, 0, w - LABEL_W, RULER_H);
  ctx.fillStyle = '#8a8268';
  ctx.font = '10px monospace';
  const every = fw >= 24 ? 5 : fw >= 10 ? 10 : 30;
  for (let f = Math.floor(first / every) * every; f <= last + 1; f += every) {
    const x = frameX(f);
    ctx.fillRect(x, RULER_H - 5, 1, 5);
    ctx.fillText(f % 60 ? String(f) : `${f / 60} s`, x + 3, RULER_H - 8);
  }
  ctx.restore();
  drawLabels(ctx, ls, h, semitoneY);
}

// Each frame's value in every lane, as a bar.
function drawFrames(ctx, list, ls, first, last, semitoneY) {
  const fw = frameW();
  for (let f = first; f <= last; f++) {
    // Whole pixels, so every bar is crisp at a fractional zoom.
    const fr = list[f],
      left = Math.round(frameX(f)),
      x = left + (fw >= 6 ? 1 : 0),
      bar = Math.max(1, Math.round(frameX(f + 1)) - left - (fw >= 6 ? 2 : 0));
    for (const lane of ls) {
      const bottom = lane.top + lane.height;
      ctx.globalAlpha = lane.key === 'pulse' && fr.wave !== 1 ? 0.3 : 1;
      if (lane.key === 'freq') {
        if (!fr.freq) continue;
        const y = Math.max(lane.top, Math.min(bottom, semitoneY(A().frequencyNote(fr.freq))));
        ctx.fillStyle = lane.color + '40';
        ctx.fillRect(x, y, bar, bottom - y);
        ctx.fillStyle = lane.color;
        ctx.fillRect(x, y - 1, bar, 3);
      } else if (lane.key === 'wave') {
        const row = lane.height / 5;
        ctx.fillStyle = lane.color;
        ctx.fillRect(x, lane.top + fr.wave * row + 1, bar, row - 2);
      } else if (lane.key === 'gate') {
        if (fr.gate) {
          ctx.fillStyle = lane.color;
          ctx.fillRect(x, lane.top + 3, bar, lane.height - 6);
        }
      } else {
        const y = bottom - (fr[lane.key] / 255) * lane.height;
        ctx.fillStyle = lane.color + '40';
        ctx.fillRect(x, y, bar, bottom - y);
        ctx.fillStyle = lane.color;
        ctx.fillRect(x, y - 1, bar, 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}
// The label column stays put while the frames scroll.
function drawLabels(ctx, ls, h, semitoneY) {
  ctx.fillStyle = '#1e1a14';
  ctx.fillRect(0, 0, LABEL_W, h);
  ctx.fillStyle = '#3a3022';
  ctx.fillRect(LABEL_W - 1, 0, 1, h);
  // Each lane's name on the left, its scale on the right against the frames.
  for (const lane of ls) {
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    ctx.fillStyle = lane.color;
    ctx.fillText(lane.label === 'Pulse width' ? 'Pulse' : lane.label, 8, lane.top + 12);
    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#8a8268';
    const right = LABEL_W - 6;
    if (lane.key === 'freq')
      for (let s = PITCH_LOW; s <= PITCH_HIGH; s += 12) {
        const y = semitoneY(s);
        if (y > lane.top + 22 && y < lane.top + lane.height - 2)
          ctx.fillText('C' + s / 12, right, y + 3);
      }
    if (lane.key === 'wave')
      WAVE_SHORT.forEach((name, i) =>
        ctx.fillText(name, right, lane.top + ((i + 0.5) * lane.height) / 5 + 3),
      );
    if (lane.key === 'volume' || lane.key === 'pulse') {
      ctx.fillText('255', right, lane.top + 22);
      ctx.fillText('0', right, lane.top + lane.height - 2);
    }
  }
  ctx.textAlign = 'left';
}

/** A frame's values in words, for the readout. */
function frameText(f) {
  const fr = frames()[f];
  if (!fr) return '';
  const hz = fr.freq / 16,
    note = fr.freq ? (A()?.noteName(A().frequencyNote(fr.freq)) ?? '') : '—';
  return `Frame ${f + 1} of ${frames().length} · ${(f / 60).toFixed(2)} s<br>${fr.freq ? `${hz.toFixed(1)} Hz, near ${note}` : '0 Hz — silent'}<br>Volume ${fr.volume} · pulse width ${fr.pulse} (${Math.round(fr.pulse / 2.56)}%)<br>${A()?.WAVES[fr.wave] ?? fr.wave} · gate ${fr.gate ? 'on' : 'off'}`;
}
/** Updates the position and the readout for the hovered or selected frame. */
export function sync() {
  const s = sound();
  $('sfPosition').textContent = s
    ? sf.playhead !== null
      ? `Frame ${Math.min(s.frames.length, Math.floor(sf.playhead) + 1)} / ${s.frames.length}`
      : `${s.frames.length} frames · ${(s.frames.length / 60).toFixed(2)} s`
    : '';
  $('sfFrameInfo').innerHTML = s ? frameText(sf.hover ?? sf.selection?.from ?? 0) : '';
}
