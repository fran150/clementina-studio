// Loads the studio and boots it. Each module attaches itself to the page as it
// loads, so the order here is the order they set up the page and register
// their listeners: the shared frame first, then each editor in the order the
// workspace lists them.
import * as dom from './dom.js';
import * as state from './state.js';
import * as status from './status.js';
import * as lifecycle from './lifecycle.js';
import * as shell from './studio-shell.js';
import * as cellGrid from './cell-grid.js';
import * as history from './history.js';
import * as core from './studio-core.js';
import * as imageImport from './image-import-ui.js';
import * as tilesets from './bank-editor.js';
import * as overlays from './overlay-editor.js';
import * as backgrounds from './background-editor.js';
import * as palettes from './palette-library.js';
import * as animations from './animation-editor.js';
import * as shapes from './sprite-composer.js';
import * as audio from './audio-shared.js';
import * as sounds from './sound-editor.js';
import * as music from './music-editor.js';
import * as builder from './builder-editor.js';

// The UI tests and the developer console reach the modules' exports through
// one object, the way they reached the scripts' globals before. Reading a name
// gives its current value; assigning one goes through its module's setter.
const internals = {};
for (const exports of [
  dom,
  state,
  status,
  lifecycle,
  shell,
  cellGrid,
  history,
  core,
  imageImport,
  tilesets,
  overlays,
  backgrounds,
  palettes,
  animations,
  shapes,
  audio,
  sounds,
  music,
  builder,
])
  for (const name of Object.keys(exports)) {
    const setter = exports['set' + name[0].toUpperCase() + name.slice(1)];
    Object.defineProperty(internals, name, {
      enumerable: true,
      get: () => exports[name],
      set: (value) => {
        if (typeof setter !== 'function') throw new TypeError(`${name} cannot be assigned`);
        setter(value);
      },
    });
  }
Object.defineProperty(window, '__studio', { value: internals });

core.bootStudio();
