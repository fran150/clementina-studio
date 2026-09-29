// Pointer input on the piano roll: the ruler moves the cursor, the keyboard
// auditions, the pencil adds, sizes, moves and resizes notes, Select boxes
// them, the eraser (or right button) removes them, Pan (or Space, or the
// middle button) scrolls, and right-click opens the menus.
import { StudioAudio } from '../audio-shared.js';
import { clamp } from '../domain/geometry.js';
import { NOTES, clampPitch, noteSpan as span, settle } from '../domain/songs.js';
import { markDirty, setStatus } from '../status.js';
import { StudioShell } from '../studio-shell.js';
import { clampScroll, canvas, noteAt, pitchAt, point, stepAt, stepW, stepX } from './geometry.js';
import { KEYS_W, ROW_H, RULER_H, checkpoint, edit, instrument, mu, notes, song } from './model.js';
import {
  copyNotes,
  cutNotes,
  duplicateNotes,
  followSelection,
  invertNotes,
  pasteNotes,
  place,
  removeNotes,
  reverseNotes,
  selectAll,
  shift,
  toggleLegato,
} from './notes.js';
import { hear, play, replay } from './playback.js';
import { draw, syncPosition } from './view.js';

/** Whether the active tool adds or removes notes. */
const painting = () => mu.tool === 'pencil' || mu.tool === 'eraser';
/** Erases the note at a canvas point, as part of the eraser's drag. */
function erase(x, y) {
  const n = noteAt(x, y);
  if (!n) return;
  if (!mu.drag.changed) {
    checkpoint('Erase notes');
    mu.drag.changed = true;
  }
  const v = song().voices[mu.voice];
  v.notes = v.notes.filter((m) => m !== n);
  mu.selection.delete(n);
  markDirty();
  draw();
}
// What a move or resize would leave on the voice, drawn but not yet applied.
function preview(change) {
  const s = song(),
    v = s.voices[mu.voice],
    moved = v.notes.filter((n) => mu.drag.selected.has(n)).map(change);
  mu.drag.moved = moved;
  mu.drag.preview = settle(
    v.notes.filter((n) => !mu.drag.selected.has(n)),
    moved,
    s.length,
  );
  mu.drag.selected = new Set([...mu.drag.selected]);
  draw();
}
function endDrag() {
  const d = mu.drag;
  mu.drag = null;
  canvas.style.cursor = '';
  if (!d) return;
  if (d.kind === 'keys') {
    mu.hover = null;
    draw();
    return;
  }
  if (d.kind === 'create') {
    mu.lastLength = d.note.length;
    followSelection();
    mu.render();
    replay();
    return;
  }
  if (d.kind === 'erase') {
    mu.render();
    if (d.changed) replay();
    return;
  }
  if ((d.kind === 'move' || d.kind === 'resize') && d.moved && (d.dStep || d.dPitch || d.dLength)) {
    if (d.kind === 'resize') mu.lastLength = d.length;
    mu.selection = new Set(notes().filter((n) => d.selected.has(n)));
    place(d.kind === 'resize' ? 'Resize a note' : 'Move notes', d.moved);
    return;
  }
  mu.render();
}
/** Moves the cursor to the step nearest canvas x, playing from there if playing. */
function moveCursor(x) {
  const s = song();
  mu.cursor = clamp(Math.round(stepAt(x)), 0, s.length - 1);
  if (StudioAudio.playing() && !mu.audition) play(mu.cursor);
  else {
    draw();
    syncPosition();
  }
}

/** Wires the pointer on the piano roll. */
export function canvasPointer() {
  canvas.onpointerdown = (e) => {
    const s = song();
    if (!s) return;
    e.preventDefault();
    canvas.focus();
    const at = point(e);
    canvas.setPointerCapture(e.pointerId);
    if (mu.space || e.button === 1 || (mu.tool === 'pan' && e.button === 0)) {
      mu.drag = { kind: 'pan', x: e.clientX, y: e.clientY, sx: mu.scrollX, sy: mu.scrollY };
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (at.y < RULER_H) {
      if (e.button === 0) {
        mu.drag = { kind: 'cursor' };
        moveCursor(at.x);
      }
      return;
    }
    if (at.x < KEYS_W) {
      if (e.button === 0) {
        mu.hover = { pitch: clampPitch(pitchAt(at.y)), keys: true };
        hear(mu.hover.pitch);
        mu.drag = { kind: 'keys' };
        draw();
      }
      return;
    }
    if (e.button === 2 && !painting()) return;
    if (e.button === 2 || mu.tool === 'eraser') {
      mu.drag = { kind: 'erase', changed: false };
      erase(at.x, at.y);
      return;
    }
    const hit = noteAt(at.x, at.y),
      step = Math.floor(stepAt(at.x)),
      pitch = clampPitch(pitchAt(at.y));
    if (mu.tool === 'select' && !hit) {
      if (!e.shiftKey) mu.selection = new Set();
      mu.drag = { kind: 'marquee', a: at, b: at, initial: new Set(mu.selection) };
      draw();
      return;
    }
    if (hit) {
      if (e.shiftKey && mu.tool === 'select') {
        mu.selection.has(hit) ? mu.selection.delete(hit) : mu.selection.add(hit);
        mu.render();
        return;
      }
      if (!mu.selection.has(hit)) mu.selection = new Set([hit]);
      followSelection();
      hear(hit.pitch, hit.instrumentId);
      const edge =
        mu.tool === 'pencil' &&
        stepX(hit.step + hit.length) - at.x < Math.min(8, (stepW() * hit.length) / 3);
      mu.drag = {
        kind: edge ? 'resize' : 'move',
        a: at,
        note: hit,
        selected: new Set(mu.selection),
        dStep: 0,
        dPitch: 0,
        dLength: 0,
      };
      mu.render();
      return;
    }
    if (mu.tool !== 'pencil' || step < 0 || step >= s.length) return;
    if (!instrument()) {
      setStatus('Add an instrument to draw with.');
      return;
    }
    // A new note, sized by dragging it out.
    const note = {
      step,
      length: Math.min(mu.lastLength, s.length - step),
      pitch,
      instrumentId: instrument().id,
    };
    mu.drag = { kind: 'create', note, a: at, sized: false };
    mu.selection = new Set([note]);
    checkpoint('Add a note');
    const v = s.voices[mu.voice];
    v.notes = settle(v.notes, [note], s.length);
    markDirty();
    hear(pitch);
    mu.render();
  };
  canvas.onpointermove = (e) => {
    const s = song();
    if (!s) return;
    const at = point(e),
      note = at.x >= KEYS_W && at.y >= RULER_H ? noteAt(at.x, at.y) : null;
    mu.hover = {
      step: Math.floor(stepAt(at.x)),
      pitch: clampPitch(pitchAt(at.y)),
      note,
      keys: at.x < KEYS_W,
    };
    if (!mu.drag) {
      canvas.style.cursor =
        at.y < RULER_H
          ? 'pointer'
          : at.x < KEYS_W
            ? 'pointer'
            : mu.space || mu.tool === 'pan'
              ? 'grab'
              : note &&
                  mu.tool === 'pencil' &&
                  stepX(note.step + note.length) - at.x < Math.min(8, (stepW() * note.length) / 3)
                ? 'ew-resize'
                : note
                  ? 'move'
                  : mu.tool === 'select'
                    ? 'default'
                    : 'crosshair';
      draw();
      return;
    }
    switch (mu.drag.kind) {
      case 'pan':
        mu.scrollX = mu.drag.sx - (e.clientX - mu.drag.x);
        mu.scrollY = mu.drag.sy - (e.clientY - mu.drag.y);
        clampScroll();
        draw();
        return;
      case 'cursor':
        moveCursor(at.x);
        return;
      case 'keys': {
        const p = clampPitch(pitchAt(at.y));
        if (p !== mu.hover.pitch) {
          mu.hover = { pitch: p, keys: true };
          hear(p);
        }
        draw();
        return;
      }
      case 'erase':
        erase(at.x, at.y);
        return;
      case 'marquee': {
        mu.drag.b = at;
        const s0 = Math.min(stepAt(mu.drag.a.x), stepAt(at.x)),
          s1 = Math.max(stepAt(mu.drag.a.x), stepAt(at.x)),
          p0 = pitchAt(Math.max(mu.drag.a.y, at.y)),
          p1 = pitchAt(Math.min(mu.drag.a.y, at.y));
        mu.selection = new Set(mu.drag.initial);
        for (const n of notes())
          if (n.step < s1 && n.step + n.length > s0 && n.pitch >= p0 && n.pitch <= p1)
            mu.selection.add(n);
        draw();
        return;
      }
      // The note keeps its length until the pointer really moves.
      case 'create': {
        if (!mu.drag.sized && Math.abs(at.x - mu.drag.a.x) < 5) return;
        mu.drag.sized = true;
        const len = Math.max(
          1,
          Math.min(s.length - mu.drag.note.step, Math.floor(stepAt(at.x)) - mu.drag.note.step + 1),
        );
        if (len !== mu.drag.note.length) {
          mu.drag.note.length = len;
          const v = s.voices[mu.voice];
          v.notes = settle(
            v.notes.filter((n) => n !== mu.drag.note),
            [mu.drag.note],
            s.length,
          );
          draw();
        }
        return;
      }
      case 'resize': {
        const len = Math.max(
            1,
            Math.min(s.length - mu.drag.note.step, Math.round(stepAt(at.x)) - mu.drag.note.step),
          ),
          dLength = len - mu.drag.note.length;
        if (dLength === mu.drag.dLength) return;
        mu.drag.dLength = dLength;
        mu.drag.length = len;
        preview((n) => (n === mu.drag.note ? { ...n, length: len } : { ...n }));
        return;
      }
      case 'move': {
        const list = notes().filter((n) => mu.drag.selected.has(n)),
          b = span(list);
        const dStep = Math.max(
            -b.from,
            Math.min(s.length - b.to, Math.round((at.x - mu.drag.a.x) / stepW())),
          ),
          dPitch = Math.max(
            -b.low,
            Math.min(NOTES - 1 - b.high, -Math.round((at.y - mu.drag.a.y) / ROW_H)),
          );
        if (dStep === mu.drag.dStep && dPitch === mu.drag.dPitch) return;
        if (dPitch !== mu.drag.dPitch) hear(mu.drag.note.pitch + dPitch, mu.drag.note.instrumentId);
        mu.drag.dStep = dStep;
        mu.drag.dPitch = dPitch;
        preview((n) => ({ ...n, step: n.step + dStep, pitch: n.pitch + dPitch }));
        return;
      }
    }
  };
  canvas.onpointerup = endDrag;
  canvas.onpointercancel = () => {
    mu.drag = null;
    mu.render();
  };
  canvas.onpointerleave = () => {
    if (!mu.drag) {
      mu.hover = null;
      draw();
    }
  };
  canvas.oncontextmenu = (e) => {
    e.preventDefault();
    const s = song();
    if (!s) return;
    const at = point(e);
    if (at.y < RULER_H) {
      const step = clamp(Math.round(stepAt(at.x)), 0, s.length - 1);
      StudioShell.contextMenu(e.clientX, e.clientY, [
        {
          label: 'Play from here',
          run: () => {
            mu.cursor = step;
            play(step);
          },
        },
        {
          label: 'Loop from here',
          run: () =>
            edit('Set the loop', () => {
              s.loopStart = step;
            }),
        },
        {
          label: 'Play once, no loop',
          disabled: s.loopStart === undefined,
          run: () =>
            edit('Remove the loop', () => {
              delete s.loopStart;
            }),
        },
      ]);
      return;
    }
    if (painting() || at.x < KEYS_W) return;
    const hit = noteAt(at.x, at.y);
    if (hit && !mu.selection.has(hit)) {
      mu.selection = new Set([hit]);
      mu.render();
    }
    const sel = mu.selection.size > 0;
    StudioShell.editMenu(e, {
      selected: sel,
      kind: 'notes',
      cut: cutNotes,
      copy: copyNotes,
      paste: pasteNotes,
      pasteLabel: 'Paste at the cursor',
      duplicate: duplicateNotes,
      remove: removeNotes,
      transform: [
        { label: 'Transpose up', hint: '↑', disabled: !sel, run: () => shift(0, 1) },
        { label: 'Transpose down', hint: '↓', disabled: !sel, run: () => shift(0, -1) },
        { label: 'Reverse', hint: 'Shift+H', disabled: !sel, run: reverseNotes },
        { label: 'Invert', hint: 'Shift+V', disabled: !sel, run: invertNotes },
        { label: 'Legato', hint: 'L', disabled: !sel, run: toggleLegato },
      ],
      selectAll,
      deselect: () => {
        mu.selection = new Set();
        mu.render();
      },
    });
  };
}
