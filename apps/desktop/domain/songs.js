// Songs: voices of notes on a step grid. A note is {step, length, pitch,
// instrumentId, legato?}: it starts at `step`, lasts `length` steps and
// sounds `pitch` semitones above C0. A voice plays one note at a time, so
// notes never overlap within a voice. Nothing here touches the page.

/** Pitches run from C0 (0) to B7 (NOTES - 1). */
export const NOTES = 96;

/** A pitch kept within the playable range. */
export function clampPitch(p) {
  return Math.max(0, Math.min(NOTES - 1, p));
}

/** The note in `notes` sounding `pitch` at (fractional) `step`, or null. */
export function noteAt(notes, step, pitch) {
  return notes.find((n) => n.pitch === pitch && step >= n.step && step < n.step + n.length) ?? null;
}

/** The steps and pitches a list of notes covers: {from, to, low, high}. */
export function noteSpan(list) {
  return {
    from: Math.min(...list.map((n) => n.step)),
    to: Math.max(...list.map((n) => n.step + n.length)),
    low: Math.min(...list.map((n) => n.pitch)),
    high: Math.max(...list.map((n) => n.pitch)),
  };
}

/**
 * A voice's notes once `placed` land among `others` in a song `length` steps
 * long. Placed notes cut what they land on: a note they start inside keeps
 * its head, one they cover goes, one whose start they cover keeps its tail.
 * Placed notes past the end go and the rest are cut to fit (changing them in
 * place, so a caller can find them again); the result is sorted by step.
 */
export function settle(others, placed, length) {
  const kept = [];
  for (const n of others) {
    let a = n.step,
      b = n.step + n.length;
    for (const p of placed) {
      const pa = p.step,
        pb = p.step + p.length;
      if (pb <= a || pa >= b) continue;
      if (a < pa) b = pa;
      else if (b > pb) a = pb;
      else {
        a = b;
        break;
      }
    }
    if (b > a)
      kept.push(a === n.step && b === n.step + n.length ? n : { ...n, step: a, length: b - a });
  }
  const clipped = placed
    .filter((p) => p.step < length)
    .map((p) => {
      p.length = Math.min(p.length, length - p.step);
      return p;
    });
  return [...kept, ...clipped].sort((x, y) => x.step - y.step);
}

/**
 * Why notes can't move by `steps` and `semitones` in a song `length` steps
 * long ('pitch' or 'song'), or null when they can.
 */
export function shiftBlocked(list, steps, semitones, length) {
  const b = noteSpan(list);
  if (
    b.from + steps < 0 ||
    b.to + steps > length ||
    b.low + semitones < 0 ||
    b.high + semitones >= NOTES
  )
    return semitones ? 'pitch' : 'song';
  return null;
}

/** Copies of the notes moved by `steps` and `semitones`. */
export function shiftedNotes(list, steps, semitones) {
  return list.map((n) => ({ ...n, step: n.step + steps, pitch: n.pitch + semitones }));
}

/** Copies of the notes played backwards within their span. */
export function reversedNotes(list) {
  const b = noteSpan(list);
  return list.map((n) => ({ ...n, step: b.from + b.to - (n.step + n.length) }));
}

/** Copies of the notes turned upside down within their pitch span. */
export function invertedNotes(list) {
  const b = noteSpan(list);
  return list.map((n) => ({ ...n, pitch: b.low + b.high - n.pitch }));
}

/**
 * Sets or clears legato (sliding into a note instead of restarting it) on
 * every note, in place; an unset note stores no flag.
 */
export function setLegato(list, on) {
  for (const n of list) {
    if (on) n.legato = true;
    else delete n.legato;
  }
}

/** Copies of the notes with steps counted from the first one's start, for the clipboard. */
export function relativeNotes(list) {
  const b = noteSpan(list);
  return list.map((n) => ({ ...n, step: n.step - b.from }));
}

/**
 * Copies of relative notes placed from step `at`. A note whose instrument
 * `hasInstrument` rejects plays `fallback` instead.
 */
export function notesAt(list, at, hasInstrument, fallback) {
  return list.map((n) => ({
    ...n,
    step: n.step + at,
    instrumentId: hasInstrument(n.instrumentId) ? n.instrumentId : fallback,
  }));
}
