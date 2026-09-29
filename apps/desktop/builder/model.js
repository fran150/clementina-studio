// What the builder's parts share: its working state, the asset kinds it
// lists, the memory slots, and undoable edits of the build settings.
import { ProjectHistory } from '../history.js';
import { builderSettings } from '../state.js';

/** The builder's working state; the settings themselves are builderSettings in state.js. */
export const bu = {
  /** The project's assets the SDK can build, and its last plan (or null). */
  catalog: [],
  plan: null,
  /** What the panels show: { asset: key } or { slot: name }, or null. */
  selection: null,
  /** The portable project folder builds go to, or null. */
  root: null,
  /** Whether a save, build or run is in progress. */
  busy: false,
  /** Counts plan requests, so a stale answer is dropped. */
  request: 0,
  /** The project as last sent for planning, and the pending plan timer. */
  lastInput: '',
  timer: null,
  /** Each runtime library module's code size, from the last build. */
  moduleSizes: {},
  /** Whether the emulator is running, and whether a screen frame is on its way. */
  running: false,
  framePending: false,
  /** Redraws the whole editor; builder-editor.js fills this in. */
  render: () => {},
};

/** The asset lists' headings, by kind. */
export const names = {
  paletteConfig: 'Palette configs',
  tileset: 'Tilesets',
  background: 'Backgrounds',
  overlay: 'Overlays',
  sprites: 'Sprite files',
  song: 'Songs',
  sound: 'Sounds',
};
/** The runtime module and routines each kind of asset is used with. */
export const references = {
  paletteConfig: { module: 'palette.s', calls: 'UsePalettes · UsePaletteBank' },
  tileset: { module: 'tileset.s', calls: 'UseTileset' },
  background: {
    module: 'bg_draw.s',
    calls:
      'DrawScreen · DrawRect · DrawRow · DrawColumn · GetCell · SetCell\nLoadRows · LoadColumns · LoadRect (bg_load.s)',
  },
  overlay: { module: 'overlay.s', calls: 'ShowOverlay · FillPlaceholder' },
  sprites: {
    module: 'sprite_draw.s',
    calls:
      'LoadSprites · LoadShape · LoadAnimation · LoadAnimationShapes · ForgetShape\nDrawShape · StartAnimation · TickAnimation · MoveAnimation · StopAnimation',
  },
  song: { module: 'song.s', calls: 'PlaySong · StopSong · SongPosition' },
  sound: { module: 'sound.s', calls: 'PlaySound · TickSound · StopSound' },
};
/** An asset's key, and its entry in the build settings if it is included. */
export const key = (a) => a.kind + ':' + a.id,
  entry = (a) => builderSettings.include.find((x) => key(x) === key(a));
/** A hex address as the memory map writes it: $1234, or $12345 above 64 KiB. */
export const hex = (n) =>
  '$' +
  n
    .toString(16)
    .toUpperCase()
    .padStart(n > 65535 ? 5 : 4, '0');
/** A new element with optional text and class. */
export const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
/** The hardware slots: from the plan, or the defaults before there is one. */
export const builtin = () =>
  bu.plan?.slots.filter((s) => s.builtin) ??
  [
    { name: 'palettes', mia: 256, size: 256 },
    ...Array.from({ length: 8 }, (_, i) => ({
      name: 'chr' + i,
      mia: 512 + i * 6144,
      size: 6144,
    })),
    { name: 'overlay', mia: 0x10080, size: 2000 },
  ].map((s) => ({ ...s, builtin: true, space: 'mia', location: s.mia }));
/** Every slot, the hardware ones first. */
export const slots = () => [
  ...builtin(),
  ...builderSettings.slots.map((s) => ({
    ...s,
    builtin: false,
    space: s.mia === undefined ? 'bank' : 'mia',
  })),
];
/** edit(label, fn) runs `fn` as one undoable edit of the build settings, then replans and redraws. */
export const { edit } = ProjectHistory.editor({
  parts: ['builder'],
  after: () => {
    bu.lastInput = '';
    bu.render();
  },
});
/** Fills `select` with every slot, `value` chosen; a choice calls change(name). */
export function chooseSlot(select, value, change) {
  select.replaceChildren(
    ...slots().map((s) => new Option(s.name, s.name, false, s.name === value)),
  );
  select.onchange = () => change(select.value);
}
/** Makes `slot` the default slot of asset `a`. */
export function assign(a, slot) {
  edit('Change default slot', () => {
    const e = entry(a);
    if (e) e.slot = slot;
    else builderSettings.include.push({ kind: a.kind, id: a.id, slot });
  });
}
