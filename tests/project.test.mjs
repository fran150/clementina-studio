// Palette configs as the project validates them, and the project file format.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeProject,
  decodeProject,
  validateProject,
  emptyProject,
  PROJECT_VERSION,
} from '../dist/packages/assets/index.js';

const palette = (id, colors) => ({ id, name: 'Palette ' + id, colors });
const config = (id, banks) => ({ id, name: 'Config ' + id, banks });

test('two banks of one config may hold the same palette', () => {
  validateProject({
    paletteLibrary: [palette('a', Array(8).fill(7))],
    paletteConfigs: [config('c', ['a', 'a', ...Array(14).fill(null)])],
    tilesets: [],
    shapes: [],
    animations: [],
  });
});

test('a config names a palette, or nothing, for exactly sixteen banks', () => {
  const base = () => ({
    paletteLibrary: [palette('a', Array(8).fill(0))],
    paletteConfigs: [config('c', ['a', ...Array(15).fill(null)])],
    tilesets: [],
    shapes: [],
    animations: [],
  });
  validateProject(base());
  for (const mutate of [
    (p) => p.paletteConfigs[0].banks.pop(),
    (p) => p.paletteConfigs[0].banks.push(null),
    (p) => (p.paletteConfigs[0].banks[0] = 'missing'),
    (p) => p.paletteConfigs.push(config('c', Array(16).fill(null))), // duplicate id
    (p) => p.paletteConfigs.push({ id: 'd', name: 'Config c', banks: Array(16).fill(null) }), // duplicate name
  ]) {
    const p = base();
    mutate(p);
    assert.throws(() => validateProject(p));
  }
});

test('the active config must be one the project holds', () => {
  const p = emptyProject();
  validateProject(p);
  assert.equal(p.paletteConfigs.length, 1);
  assert.equal(p.activeConfigId, p.paletteConfigs[0].id);
  p.activeConfigId = 'gone';
  assert.throws(() => validateProject(p), /active config/);
});

test('a project round trips and refuses versions it did not write', () => {
  const p = emptyProject();
  p.paletteLibrary.push(palette('m', Array(8).fill(0xf81f)));
  p.paletteConfigs[0].banks[4] = 'm';
  const restored = decodeProject(encodeProject(p));
  assert.deepEqual(restored, p);
  assert.equal(JSON.parse(encodeProject(p)).version, PROJECT_VERSION);
  assert.throws(() => decodeProject('{"format":"clementina-studio","version":1}'), /version 1/);
  assert.throws(
    () => decodeProject('{"format":"something-else","version":2}'),
    /Not a Studio project/,
  );
});
