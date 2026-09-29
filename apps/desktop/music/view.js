// Drawing the piano roll: the pitch rows and step grid, every voice's notes
// (the one drawn on in front), the pencil's next note, the marquee, the song's
// end and loop, the cursor or playhead, the ruler and the keyboard.
import { NOTES } from '../domain/songs.js';
import { $ } from '../dom.js';
import { canvas, pitchY, stepW, stepX, stepsPerBar } from './geometry.js';
import { A, BLACK, COLORS, KEYS_W, ROW_H, RULER_H, mu, mutes, song } from './model.js';

const host = $('musicEditor');

/** Draws the canvas. */
export function draw() {
  const s = song();
  if (host.hidden || !s) return;
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
  const sw = stepW(),
    bar = stepsPerBar(s),
    end = stepX(s.length),
    top = Math.max(0, NOTES - 1 - Math.floor(mu.scrollY / ROW_H)),
    bottom = Math.max(0, NOTES - 1 - Math.ceil((mu.scrollY + h - RULER_H) / ROW_H));
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEYS_W, RULER_H, w - KEYS_W, h - RULER_H);
  ctx.clip();
  for (let p = bottom; p <= top; p++) {
    const y = pitchY(p);
    ctx.fillStyle = BLACK.includes(p % 12) ? '#131417' : '#18191d';
    ctx.fillRect(stepX(0), y, end - stepX(0), ROW_H);
    if (p % 12 === 0) {
      ctx.fillStyle = '#2c2f37';
      ctx.fillRect(stepX(0), y + ROW_H - 1, end - stepX(0), 1);
    }
  }
  if (mu.hover && !mu.drag && mu.hover.pitch >= 0 && mu.hover.pitch < NOTES) {
    ctx.fillStyle = '#ffffff08';
    ctx.fillRect(stepX(0), pitchY(mu.hover.pitch), end - stepX(0), ROW_H);
  }
  const first = Math.max(0, Math.floor(mu.scrollX / sw)),
    last = Math.min(s.length, Math.ceil((mu.scrollX + w) / sw));
  for (let k = first; k <= last; k++) {
    const beat = k % s.stepsPerBeat === 0,
      isBar = k % bar === 0;
    if (!beat && sw < 8) continue;
    ctx.fillStyle = isBar ? '#3a3f4a' : beat ? '#262930' : '#1d1f24';
    ctx.fillRect(Math.round(stepX(k)), RULER_H, 1, h - RULER_H);
  }
  drawNotes(ctx, s, w, h);
  // The pencil's next note, where it would go.
  if (mu.hover && !mu.drag && mu.tool === 'pencil' && !mu.hover.note && mu.hover.step < s.length) {
    ctx.strokeStyle = COLORS[mu.voice];
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(
      stepX(mu.hover.step) + 1.5,
      pitchY(mu.hover.pitch) + 1.5,
      Math.min(mu.lastLength, s.length - mu.hover.step) * sw - 3,
      ROW_H - 3,
    );
    ctx.setLineDash([]);
  }
  if (mu.drag?.kind === 'marquee') {
    const a = mu.drag.a,
      b = mu.drag.b;
    ctx.strokeStyle = '#36c9d6';
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(
      Math.min(a.x, b.x) + 0.5,
      Math.min(a.y, b.y) + 0.5,
      Math.abs(b.x - a.x),
      Math.abs(b.y - a.y),
    );
    ctx.setLineDash([]);
  }
  // Past the end of the song, and the loop's return point.
  ctx.fillStyle = '#0b0c0ecc';
  ctx.fillRect(end, RULER_H, Math.max(0, w - end), h - RULER_H);
  ctx.fillStyle = '#8a8268';
  ctx.fillRect(Math.round(end), RULER_H, 2, h - RULER_H);
  if (s.loopStart !== undefined) {
    const x = Math.round(stepX(s.loopStart));
    ctx.strokeStyle = '#ffb000aa';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(x + 0.5, RULER_H);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const cursorX = Math.round(stepX(mu.playhead ?? mu.cursor));
  ctx.fillStyle = mu.playhead !== null ? '#ffb000' : '#ffb00066';
  ctx.fillRect(cursorX, RULER_H, mu.playhead !== null ? 2 : 1, h - RULER_H);
  ctx.restore();
  drawRuler(ctx, s, w, cursorX);
  drawKeyboard(ctx, h, bottom, top);
}
// Other voices, dim, behind the one being drawn on.
function drawNotes(ctx, s, w, h) {
  const lanes = [0, 1, 2, 3].filter((v) => v !== mu.voice).concat(mu.voice),
    moving = mu.drag?.preview,
    moved = new Set(mu.drag?.moved ?? []);
  for (const v of lanes) {
    const list = v === mu.voice && moving ? moving : s.voices[v].notes,
      active = v === mu.voice,
      color = COLORS[v];
    let prev = null;
    for (const n of list) {
      const x = Math.round(stepX(n.step)),
        nw = Math.round(stepX(n.step + n.length)) - x,
        y = pitchY(n.pitch);
      if (x > w || x + nw < KEYS_W || y > h || y + ROW_H < RULER_H) {
        prev = n;
        continue;
      }
      ctx.globalAlpha = active ? (mutes[v] ? 0.45 : 1) : 0.28;
      ctx.fillStyle = color;
      ctx.fillRect(x + 1, y + 1, Math.max(2, nw - 2), ROW_H - 2);
      if (active) {
        ctx.fillStyle = '#0008';
        ctx.fillRect(x + 1, y + ROW_H - 3, Math.max(2, nw - 2), 2);
        // A legato note slides from the one before it: joined, not restarted.
        if (n.legato && prev && prev.step + prev.length === n.step) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 2, pitchY(prev.pitch) + ROW_H / 2);
          ctx.lineTo(x + 2, y + ROW_H / 2);
          ctx.stroke();
        }
        if (mu.selection.has(n) || moved.has(n)) {
          ctx.strokeStyle = '#36c9d6';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, Math.max(2, nw - 2), ROW_H - 2);
        }
        if (nw > 34) {
          ctx.fillStyle = '#111';
          ctx.font = '9px monospace';
          ctx.fillText(A()?.noteName(n.pitch) ?? '', x + 4, y + ROW_H - 3);
        }
      }
      prev = n;
    }
  }
  ctx.globalAlpha = 1;
}
// The ruler: bars, the loop from its return point to the end, the cursor.
function drawRuler(ctx, s, w, cursorX) {
  const sw = stepW(),
    bar = stepsPerBar(s);
  ctx.fillStyle = '#1e1a14';
  ctx.fillRect(0, 0, w, RULER_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(KEYS_W, 0, w - KEYS_W, RULER_H);
  ctx.clip();
  if (s.loopStart !== undefined) {
    ctx.fillStyle = '#ffb00033';
    ctx.fillRect(stepX(s.loopStart), RULER_H - 6, (s.length - s.loopStart) * sw, 6);
    ctx.fillStyle = '#ffb000';
    ctx.beginPath();
    const x = stepX(s.loopStart);
    ctx.moveTo(x, RULER_H - 12);
    ctx.lineTo(x + 7, RULER_H - 9);
    ctx.lineTo(x, RULER_H - 6);
    ctx.fill();
  }
  ctx.font = '10px monospace';
  const every = bar * sw < 28 ? 4 : 1;
  for (let b = 0; b * bar <= s.length; b += every) {
    const x = stepX(b * bar);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, RULER_H - 8, 1, 8);
    ctx.fillStyle = '#8a8268';
    ctx.fillText(String(b + 1), x + 3, 11);
  }
  ctx.fillStyle = '#ffb000';
  ctx.beginPath();
  ctx.moveTo(cursorX - 5, RULER_H - 7);
  ctx.lineTo(cursorX + 5, RULER_H - 7);
  ctx.lineTo(cursorX, RULER_H - 1);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#3a3022';
  ctx.fillRect(0, RULER_H - 1, w, 1);
}
// The keyboard.
function drawKeyboard(ctx, h, bottom, top) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, RULER_H, KEYS_W, h - RULER_H);
  ctx.clip();
  for (let p = bottom; p <= top; p++) {
    const y = pitchY(p),
      black = BLACK.includes(p % 12),
      lit = mu.audition && mu.hover?.keys && mu.hover.pitch === p;
    // A black key lies over the white ones beside it, as on a piano.
    ctx.fillStyle = black ? '#c9c3ad' : lit ? '#ffb000' : '#c9c3ad';
    ctx.fillRect(0, y, KEYS_W - 1, ROW_H);
    if (black) {
      ctx.fillStyle = lit ? '#ffb000' : '#1b1c20';
      ctx.fillRect(0, y, KEYS_W * 0.62, ROW_H);
      ctx.fillStyle = '#8a8268';
      ctx.fillRect(KEYS_W * 0.62, y + ROW_H / 2, KEYS_W * 0.38 - 1, 1);
    }
    if ([4, 11].includes(p % 12)) {
      ctx.fillStyle = '#8a8268';
      ctx.fillRect(0, y, KEYS_W - 1, 1);
    }
    if (p % 12 === 0 && !lit) {
      ctx.fillStyle = '#8a8268';
      ctx.fillRect(0, y + ROW_H - 1, KEYS_W - 1, 1);
    }
    if (p % 12 === 0) {
      ctx.fillStyle = '#111';
      ctx.font = '9px monospace';
      ctx.fillText('C' + p / 12, KEYS_W - 20, y + ROW_H - 3);
    }
  }
  ctx.restore();
  ctx.fillStyle = '#3a3022';
  ctx.fillRect(KEYS_W - 1, RULER_H, 1, h - RULER_H);
}
/** Shows where the cursor or playhead is: bar, beat, step and time. */
export function syncPosition() {
  const s = song();
  if (!s) return;
  const at = mu.playhead ?? mu.cursor,
    bar = stepsPerBar(s),
    seconds = A() ? A().stepSample(s, at) / A().SAMPLE_RATE : 0;
  $('muPosition').textContent =
    `Bar ${Math.floor(at / bar) + 1} · beat ${Math.floor((at % bar) / s.stepsPerBeat) + 1} · step ${Math.floor(at % s.stepsPerBeat) + 1} · ${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
}
