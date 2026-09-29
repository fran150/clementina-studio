// The project being edited and the editors' shared selection, with the model
// helpers every editor draws and edits through. Nothing here touches the page.
import { newId } from './domain/assets.js';
import { CLEMENTINA_16_565, PAL_BANKS } from './domain/colors.js';
import { freshName } from './domain/names.js';
import {
  configBankPalette,
  freshSpacedName,
  newConfig,
  newPalette,
  paletteWithColors,
  BLACK_PALETTE,
} from './domain/palettes.js';
import { newTileset } from './domain/tilesets.js';

// The data model's own operations live in domain/; these re-exports keep the
// names the editors import from here. See docs/model.md.
export { PAL_BANKS, PAL_COLORS } from './domain/colors.js';
export { GH, TILES, PLANE, TILESET_BYTES, tilePixel, setTilePixel } from './domain/tilesets.js';
export {
  to565,
  css565,
  css565ToInput,
  inputTo565,
  BACKDROP_BLUE_565,
  RAINBOW_565,
  CLEMENTINA_16_565,
} from './domain/colors.js';
export { BLACK_PALETTE } from './domain/palettes.js';

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

// ===== Palettes and bank configs =====
// Nothing binds a palette to a bank except a config, so every color question
// goes through the active one. A bank holding nothing reads as black.
export function libraryPalette(id) {
  return paletteLibrary.find((p) => p.id === id);
}
export function activeConfig() {
  return paletteConfigs.find((c) => c.id === activeConfigId) ?? paletteConfigs[0];
}
/** The palette showing in a bank right now, or undefined when the bank is empty. */
export function bankPalette(bank) {
  return configBankPalette(paletteLibrary, activeConfig(), bank);
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
  return freshSpacedName(paletteLibrary, 'Palette');
}
export function createPalette(colors, name) {
  const palette = newPalette(newId(), name ?? uniquePaletteName(), colors);
  paletteLibrary.push(palette);
  return palette;
}
/** Reuses a palette with the same colors so configs keep sharing it. */
export function internPalette(colors, name) {
  return paletteWithColors(paletteLibrary, colors) ?? createPalette(colors, name);
}
export function uniqueConfigName() {
  return freshSpacedName(paletteConfigs, 'Config');
}
/** A new config fills its banks from the library in order so drawing can start at once. */
export function createConfig(name, banks) {
  const config = newConfig(newId(), name ?? uniqueConfigName(), paletteLibrary, banks);
  paletteConfigs.push(config);
  return config;
}

/** Clementina's sixteen startup colors (domain/colors.js), eight to a palette, in banks 0 and 1. */
export function loadDefaultPalettes() {
  paletteLibrary = [];
  paletteConfigs = [];
  createPalette(CLEMENTINA_16_565.slice(0, 8), 'Bank 0');
  createPalette(CLEMENTINA_16_565.slice(8, 16), 'Bank 1');
  activeConfigId = createConfig('Default').id;
}

// ===== Tilesets =====
export function uniqueTilesetName() {
  return freshName(tilesets, 'Tileset');
}
export function createTileset(name) {
  const tileset = newTileset(newId(), name ?? uniqueTilesetName());
  tilesets.push(tileset);
  return tileset;
}
export function tilesetById(id) {
  return tilesets.find((t) => t.id === id);
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
