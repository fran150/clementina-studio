// Colors. The hardware stores every color as RGB565: 5 bits of red, 6 of
// green, 5 of blue in one 16-bit word. Palette RAM holds 16 banks of 8 such
// colors. Nothing here touches the page.

export const PAL_BANKS = 16,
  PAL_COLORS = 8;

/**
 * Packs 8-bit red, green and blue into an RGB565 word, rounding each channel
 * to the nearest level. Image import (packages/assets/image-import.ts rgb565)
 * rounds the same way, so a color picked by hand and the same color imported
 * from a picture give the same word.
 */
export const to565 = (r, g, b) =>
  (Math.round((r * 31) / 255) << 11) |
  (Math.round((g * 63) / 255) << 5) |
  Math.round((b * 31) / 255);

/** The 8-bit red, green and blue an RGB565 word stands for. */
export function rgbOf565(v) {
  return [
    Math.round((((v >> 11) & 31) * 255) / 31),
    Math.round((((v >> 5) & 63) * 255) / 63),
    Math.round(((v & 31) * 255) / 31),
  ];
}

/** An RGB565 word as a CSS color, rgb(r,g,b). */
export function css565(v) {
  const [r, g, b] = rgbOf565(v);
  return `rgb(${r},${g},${b})`;
}

/** An RGB565 word as a color input's value, #rrggbb. */
export function css565ToInput(v) {
  return (
    '#' +
    rgbOf565(v)
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** A color input's #rrggbb value as an RGB565 word. */
export function inputTo565(h) {
  return to565(
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  );
}

export const BACKDROP_BLUE_565 = 0x1a1f;
// A fresh palette starts as a rainbow so its colors are distinguishable while
// drawing; color 0 keeps the backdrop, being the key rather than an ink.
export const RAINBOW_565 = [
  BACKDROP_BLUE_565,
  to565(255, 0, 0),
  to565(255, 127, 0),
  to565(255, 255, 0),
  to565(0, 255, 0),
  to565(0, 255, 255),
  to565(0, 0, 255),
  to565(139, 0, 255),
];
// Clementina's 16 startup colors: the text ink each of palette RAM's sixteen
// banks holds by default at boot (clementina-text.palette.bin, loaded by
// video.c video_load_default_palette / video.go videoLoadDefaultPalette),
// in bank order 0-15 - white, red, orange, yellow, green, cyan, backdrop
// blue, violet, magenta, black, gray, light gray, dark red/brown, dark
// green, a brighter blue, bright white (docs/phase5-charset-keyboard.md
// SS2.4, the startup text-ink table).
export const CLEMENTINA_16_565 = [
  0xffff,
  0xf800,
  0xfc60,
  0xfec0,
  0x07e0,
  0x075f,
  BACKDROP_BLUE_565,
  0xa81f,
  0xfa7f,
  0x0000,
  0x8410,
  0xc618,
  0x7920,
  0x03e0,
  0x6aff,
  0xffff,
];
