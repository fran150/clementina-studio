// Generated sound effects: sfxr-style presets that make a sound from a seed.
import { Sound, SoundFrame, WAVE_NOISE, WAVE_PULSE, WAVE_SAW, hzToFrequency } from './model.js';

export const SOUND_PRESETS = [
  'blip',
  'coin',
  'jump',
  'laser',
  'explosion',
  'hit',
  'powerup',
  'random',
] as const;
export type SoundPreset = (typeof SOUND_PRESETS)[number];
export const SOUND_PRESET_NAMES: Record<SoundPreset, string> = {
  blip: 'Blip',
  coin: 'Coin',
  jump: 'Jump',
  laser: 'Laser',
  explosion: 'Explosion',
  hit: 'Hit',
  powerup: 'Power-up',
  random: 'Random',
};

/** A seeded generator, so the same preset and seed make the same sound. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/**
 * The kinds of sound a game asks for most, sfxr-style: each seed is a
 * different take on the same idea. Everything is written as frames — pitch
 * sweeps, arpeggios, volume and pulse-width moves — the way a driver would
 * write them.
 */
export function generateSound(preset: SoundPreset, seed: number): Omit<Sound, 'id' | 'name'> {
  const r = random(seed),
    pick = (lo: number, hi: number) => lo + r() * (hi - lo),
    int = (lo: number, hi: number) => Math.floor(pick(lo, hi + 1));
  const frames: SoundFrame[] = [];
  const add = (count: number, frame: (i: number, t: number) => Partial<SoundFrame>) => {
    for (let i = 0; i < count; i++) {
      const f = {
        freq: 440,
        volume: 200,
        pulse: 128,
        wave: WAVE_PULSE,
        gate: true,
        ...frame(i, count > 1 ? i / (count - 1) : 0),
      };
      frames.push({
        freq: hzToFrequency(f.freq),
        volume: Math.round(Math.max(0, Math.min(255, f.volume))),
        pulse: Math.round(Math.max(0, Math.min(255, f.pulse))),
        wave: f.wave,
        gate: f.gate,
      });
    }
  };
  // Frequencies here are in Hz; `add` converts them.
  const sweep = (from: number, to: number, t: number) => from * (to / from) ** t;
  switch (preset) {
    case 'blip': {
      const hz = pick(500, 1400),
        pw = int(48, 160),
        n = int(4, 8);
      add(n, (i, t) => ({ freq: hz, pulse: pw, volume: 230 - 110 * t }));
      return { attack: 0, decay: 3, sustain: 10, release: 2, pan: 0, frames };
    }
    case 'coin': {
      const hz = pick(700, 1200),
        jump = 2 ** (int(4, 7) / 12),
        a = int(3, 5),
        b = int(10, 16);
      add(a, () => ({ freq: hz, volume: 230 }));
      add(b, (i, t) => ({ freq: hz * jump, volume: 230 * (1 - t) ** 1.5, gate: i < b - 1 }));
      return { attack: 0, decay: 0, sustain: 15, release: 3, pan: 0, frames };
    }
    case 'jump': {
      const from = pick(160, 320),
        to = from * pick(1.8, 3.2),
        pw = int(48, 128),
        n = int(9, 15);
      add(n, (i, t) => ({
        freq: sweep(from, to, t),
        pulse: pw,
        volume: 230 - 90 * t,
        gate: i < n - 2,
      }));
      return { attack: 0, decay: 2, sustain: 12, release: 3, pan: 0, frames };
    }
    case 'laser': {
      const from = pick(1400, 3200),
        to = from / pick(4, 10),
        wave = r() < 0.6 ? WAVE_PULSE : WAVE_SAW,
        n = int(8, 15);
      add(n, (i, t) => ({
        freq: sweep(from, to, t ** 0.7),
        wave,
        pulse: 40 + 170 * t,
        volume: 255 - 150 * t,
      }));
      return { attack: 0, decay: 4, sustain: 9, release: 2, pan: 0, frames };
    }
    case 'explosion': {
      const from = pick(1200, 2600),
        to = pick(50, 140),
        n = int(30, 48);
      add(n, (i, t) => ({
        freq: sweep(from, to, t ** 0.6),
        wave: WAVE_NOISE,
        volume: 255 * (1 - t) ** 1.2,
        gate: i < n * 0.6,
      }));
      return { attack: 0, decay: 9, sustain: 7, release: 8, pan: 0, frames };
    }
    case 'hit': {
      const noise = pick(1500, 3200),
        tone = pick(140, 320),
        n = int(6, 10),
        pw = int(32, 96);
      add(2, () => ({ freq: noise, wave: WAVE_NOISE, volume: 255 }));
      add(n, (i, t) => ({
        freq: sweep(tone, tone / 2, t),
        wave: WAVE_PULSE,
        pulse: pw,
        volume: 220 * (1 - t),
      }));
      return { attack: 0, decay: 3, sustain: 7, release: 2, pan: 0, frames };
    }
    case 'powerup': {
      const base = pick(300, 520),
        step = int(2, 3),
        rounds = int(2, 4),
        chord = r() < 0.5 ? [0, 4, 7, 12] : [0, 5, 9, 12],
        pw = int(64, 128);
      for (let k = 0; k < rounds; k++)
        for (const interval of chord)
          add(step, () => ({
            freq: base * 2 ** ((interval + k * 2) / 12),
            pulse: pw,
            volume: 210,
          }));
      add(8, (i, t) => ({
        freq: base * 2 ** ((12 + rounds * 2 - 2) / 12),
        pulse: pw,
        volume: 210 * (1 - t),
        gate: i < 7,
      }));
      return { attack: 0, decay: 0, sustain: 15, release: 4, pan: 0, frames };
    }
    default: {
      const wave = int(0, 4),
        from = pick(80, 2400),
        to = from * 2 ** pick(-3, 2),
        n = int(6, 40),
        pw = int(16, 240),
        arp = r() < 0.3 ? 2 ** (int(3, 12) / 12) : 1,
        arpAt = int(2, 8);
      add(n, (i, t) => ({
        freq: sweep(from, to, t) * (i >= arpAt ? arp : 1),
        wave,
        pulse: pw + (240 - pw) * t * r(),
        volume: 240 * (1 - t * pick(0.3, 1)),
        gate: i < n - 1,
      }));
      return {
        attack: int(0, 2),
        decay: int(1, 8),
        sustain: int(4, 13),
        release: int(1, 6),
        pan: 0,
        frames,
      };
    }
  }
}
