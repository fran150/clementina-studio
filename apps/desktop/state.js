// The project being edited and the editors' shared selection, with the model
// helpers every editor draws and edits through. Nothing here touches the page.

// A tileset is one CHR bank's worth of graphics: 3 planes * 2048 B, each plane
// 256 tiles * 8 rows. 3bpp color index = p0|p1<<1|p2<<2; a 1bpp tileset holds
// three independent mono pages, one per plane. Bit 0 is leftmost.
// Palette RAM is 16 banks of 8 RGB565 colors, shared by every layer. A config
// names the palette in each bank; the active one is a preview choice only.
// See docs/model.md.
export const GH = 8,
  TILES = 256,
  PLANE = TILES * GH,
  TILESET_BYTES = 3 * PLANE; // 2048, 6144
export const PAL_BANKS = 16,
  PAL_COLORS = 8;

// ===== state =====
export let paletteLibrary = [],
  paletteConfigs = [],
  activeConfigId = null,
  tilesets = [],
  backgrounds = [],
  overlays = [];
export let builderSettings = { folder: 'ASSETS', checks: true, slots: [], include: [] };
export let currentView = 'tiles',
  shapes = [],
  animations = [];
// Audio: instruments are what songs' notes play; see docs/audio.md.
export let instruments = [],
  sounds = [],
  songs = [];
export let shapeIndex = 0,
  animationIndex = 0,
  frameIndex = 0,
  playing = false,
  playFrame = 0,
  playStart = 0;

// Another module can read these but not assign them, so each has a setter.
export const setPaletteLibrary = (v) => (paletteLibrary = v);
export const setActiveConfigId = (v) => (activeConfigId = v);
export const setInstruments = (v) => (instruments = v);
export const setCurrentView = (v) => (currentView = v);
export const setShapeIndex = (v) => (shapeIndex = v);
export const setAnimationIndex = (v) => (animationIndex = v);
export const setFrameIndex = (v) => (frameIndex = v);
export const setPlaying = (v) => (playing = v);
export const setPlayFrame = (v) => (playFrame = v);
export const setPlayStart = (v) => (playStart = v);
export const setPaletteConfigs = (v) => (paletteConfigs = v);
export const setTilesets = (v) => (tilesets = v);
export const setBackgrounds = (v) => (backgrounds = v);
export const setOverlays = (v) => (overlays = v);
export const setBuilderSettings = (v) => (builderSettings = v);
export const setShapes = (v) => (shapes = v);
export const setAnimations = (v) => (animations = v);
export const setSounds = (v) => (sounds = v);
export const setSongs = (v) => (songs = v);

// ===== RGB565 helpers =====
export const to565 = (r, g, b) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
export function css565(v) {
  const r = (v >> 11) & 31,
    g = (v >> 5) & 63,
    b = v & 31;
  return `rgb(${Math.round((r * 255) / 31)},${Math.round((g * 255) / 63)},${Math.round((b * 255) / 31)})`;
}
export function css565ToInput(v) {
  const r = Math.round((((v >> 11) & 31) * 255) / 31),
    g = Math.round((((v >> 5) & 63) * 255) / 63),
    b = Math.round(((v & 31) * 255) / 31);
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function inputTo565(h) {
  return to565(
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  );
}

// ===== Palettes and bank configs =====
// Nothing binds a palette to a bank except a config, so every color question
// goes through the active one. A bank holding nothing reads as black.
export const BLACK_PALETTE = Object.freeze(Array(PAL_COLORS).fill(0));
export function libraryPalette(id) {
  return paletteLibrary.find((p) => p.id === id);
}
export function activeConfig() {
  return paletteConfigs.find((c) => c.id === activeConfigId) ?? paletteConfigs[0];
}
/** The palette showing in a bank right now, or undefined when the bank is empty. */
export function bankPalette(bank) {
  return libraryPalette(activeConfig()?.banks?.[bank]);
}
export function bankColors(bank) {
  return bankPalette(bank)?.colors ?? BLACK_PALETTE;
}
export function bankColor(bank, ink) {
  return bankColors(bank)[ink];
}
export function setBankColor(bank, ink, value) {
  const p = bankPalette(bank);
  if (p) p.colors[ink] = value;
}
/** The active config flattened to the 128 words palette RAM holds. */
export function resolveActiveConfig() {
  const out = [];
  for (let b = 0; b < PAL_BANKS; b++) out.push(...bankColors(b));
  return out;
}

export function uniquePaletteName() {
  const taken = new Set(paletteLibrary.map((p) => p.name.toLowerCase()));
  let n = 1;
  while (taken.has(`palette ${n}`)) n++;
  return `Palette ${n}`;
}
export function createPalette(colors, name) {
  const palette = {
    id: crypto.randomUUID(),
    name: name ?? uniquePaletteName(),
    colors: [...colors],
  };
  paletteLibrary.push(palette);
  return palette;
}
/** Reuses a palette with the same colors so configs keep sharing it. */
export function internPalette(colors, name) {
  return (
    paletteLibrary.find((p) => p.colors.every((v, i) => v === colors[i])) ??
    createPalette(colors, name)
  );
}
export function uniqueConfigName() {
  const taken = new Set(paletteConfigs.map((c) => c.name.toLowerCase()));
  let n = 1;
  while (taken.has(`config ${n}`)) n++;
  return `Config ${n}`;
}
/** A new config fills its banks from the library in order so drawing can start at once. */
export function createConfig(name, banks) {
  const config = {
    id: crypto.randomUUID(),
    name: name ?? uniqueConfigName(),
    banks: banks
      ? [...banks]
      : Array.from({ length: PAL_BANKS }, (_, i) => paletteLibrary[i]?.id ?? null),
  };
  paletteConfigs.push(config);
  return config;
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
/** The sixteen colors above, eight to a palette, in palette banks 0 and 1. */
export function loadDefaultPalettes() {
  paletteLibrary = [];
  paletteConfigs = [];
  createPalette(CLEMENTINA_16_565.slice(0, 8), 'Bank 0');
  createPalette(CLEMENTINA_16_565.slice(8, 16), 'Bank 1');
  activeConfigId = createConfig('Default').id;
}

// ===== Tilesets =====
export function uniqueTilesetName() {
  const taken = new Set(tilesets.map((t) => t.name.toLowerCase()));
  let n = 1;
  while (taken.has('tileset_' + n)) n++;
  return 'Tileset_' + n;
}
export function createTileset(name) {
  const tileset = {
    id: crypto.randomUUID(),
    name: name ?? uniqueTilesetName(),
    bpp: 3,
    chr: Array(TILESET_BYTES).fill(0),
    tilePaletteBanks: Array(TILES).fill(0),
    compositions: [],
  };
  tilesets.push(tileset);
  return tileset;
}
export function tilesetById(id) {
  return tilesets.find((t) => t.id === id);
}
/**
 * One pixel of a tile. A 1bpp tileset reads a single plane; `plane` is the page
 * being viewed, which belongs to the editor rather than the tileset.
 */
export function tilePixel(tileset, tile, x, y, plane = 0) {
  const bit = (p) => (tileset.chr[p * PLANE + tile * GH + y] >> x) & 1;
  return tileset.bpp === 1 ? bit(plane) : bit(0) | (bit(1) << 1) | (bit(2) << 2);
}
export function setTilePixel(tileset, tile, x, y, value, plane = 0) {
  for (const p of tileset.bpp === 1 ? [plane] : [0, 1, 2]) {
    const i = p * PLANE + tile * GH + y,
      bit = tileset.bpp === 1 ? (value ? 1 : 0) : (value >> p) & 1;
    if (bit) tileset.chr[i] |= 1 << x;
    else tileset.chr[i] &= ~(1 << x);
  }
}

// ===== the project as a whole =====
const emptyBuilderSettings = () => ({ folder: 'ASSETS', checks: true, slots: [], include: [] });
/** Empties the project for File > New; the default palettes come separately. */
export function clearProject() {
  tilesets = [];
  backgrounds = [];
  overlays = [];
  animations = [];
  shapes = [];
  shapeIndex = 0;
  animationIndex = 0;
  frameIndex = 0;
  instruments = [];
  sounds = [];
  songs = [];
  builderSettings = emptyBuilderSettings();
  playing = false;
}
/** A copy of the project as saved to disk. */
export function studioProject() {
  return {
    paletteLibrary: structuredClone(paletteLibrary),
    paletteConfigs: structuredClone(paletteConfigs),
    activeConfigId,
    tilesets: structuredClone(tilesets),
    backgrounds: structuredClone(backgrounds),
    overlays: structuredClone(overlays),
    shapes: structuredClone(shapes),
    animations: structuredClone(animations),
    builder: structuredClone(builderSettings),
    instruments: structuredClone(instruments),
    sounds: structuredClone(sounds),
    songs: structuredClone(songs),
  };
}
/** Replaces the project with a copy of one read from disk or recovery. */
export function loadProject(p) {
  builderSettings = structuredClone(p.builder ?? emptyBuilderSettings());
  paletteLibrary = structuredClone(p.paletteLibrary ?? []);
  paletteConfigs = structuredClone(p.paletteConfigs ?? []);
  activeConfigId = p.activeConfigId ?? paletteConfigs[0]?.id ?? null;
  tilesets = structuredClone(p.tilesets ?? []);
  backgrounds = structuredClone(p.backgrounds ?? []);
  overlays = structuredClone(p.overlays ?? []);
  animations = structuredClone(p.animations ?? []);
  shapes = structuredClone(p.shapes ?? []);
  instruments = structuredClone(p.instruments ?? []);
  sounds = structuredClone(p.sounds ?? []);
  songs = structuredClone(p.songs ?? []);
  shapeIndex = 0;
  animationIndex = 0;
  frameIndex = 0;
  playing = false;
}

/**
 * The parts of the project undo history snapshots, each read and replaced as a
 * whole. An edit names the parts it changes.
 */
export const projectParts = {
  builder: {
    get: () => builderSettings,
    set: (v) => {
      builderSettings = v;
    },
  },
  palettes: {
    get: () => ({ paletteLibrary, paletteConfigs, activeConfigId }),
    set: (v) => {
      paletteLibrary = v.paletteLibrary;
      paletteConfigs = v.paletteConfigs;
      activeConfigId = v.activeConfigId;
    },
  },
  tilesets: {
    get: () => tilesets,
    set: (v) => {
      tilesets = v;
    },
  },
  shapes: {
    get: () => shapes,
    set: (v) => {
      shapes = v;
    },
  },
  animations: {
    get: () => animations,
    set: (v) => {
      animations = v;
    },
  },
  backgrounds: {
    get: () => backgrounds,
    set: (v) => {
      backgrounds = v;
    },
  },
  overlays: {
    get: () => overlays,
    set: (v) => {
      overlays = v;
    },
  },
  instruments: {
    get: () => instruments,
    set: (v) => {
      instruments = v;
    },
  },
  sounds: {
    get: () => sounds,
    set: (v) => {
      sounds = v;
    },
  },
  songs: {
    get: () => songs,
    set: (v) => {
      songs = v;
    },
  },
};
