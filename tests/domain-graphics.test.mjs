// The renderer's domain modules for colors, palettes and tilesets: pure
// operations, tested without a page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLEMENTINA_16_565,
  RAINBOW_565,
  css565,
  css565ToInput,
  inputTo565,
  rgbOf565,
  to565,
} from '../apps/desktop/domain/colors.js';
import {
  BLACK_PALETTE,
  configBankPalette,
  freshSpacedName,
  newConfig,
  newPalette,
  paletteUsage,
  paletteWithColors,
  repointBanks,
} from '../apps/desktop/domain/palettes.js';
import {
  TILESET_BYTES,
  applyPixels,
  areaPixel,
  areaTile,
  capturePixels,
  clearPixels,
  floodPixels,
  freshObjectName,
  inArea,
  newTileset,
  patternAt,
  setAreaPixel,
  setTilePixel,
  shapePixels,
  strokePixels,
  tilePixel,
  transformPixels,
} from '../apps/desktop/domain/tilesets.js';

test('RGB565 converts to and from CSS and color inputs', () => {
  assert.equal(to565(255, 255, 255), 0xffff);
  assert.equal(to565(255, 0, 0), 0xf800);
  assert.deepEqual(rgbOf565(0x07e0), [0, 255, 0]);
  assert.equal(css565(0xf800), 'rgb(255,0,0)');
  assert.equal(css565ToInput(0x001f), '#0000ff');
  assert.equal(inputTo565('#ffffff'), 0xffff);
  for (const v of [...CLEMENTINA_16_565, ...RAINBOW_565])
    assert.equal(inputTo565(css565ToInput(v)), v, 'a color survives a round trip');
});

test('palettes, configs and their banks', () => {
  const library = [
    newPalette('a', 'Palette 1', RAINBOW_565),
    newPalette('b', 'Hud', BLACK_PALETTE),
  ];
  assert.equal(freshSpacedName(library, 'Palette'), 'Palette 2');
  assert.notEqual(library[0].colors, RAINBOW_565, 'a palette keeps its own copy');
  assert.equal(paletteWithColors(library, BLACK_PALETTE)?.id, 'b');
  assert.equal(paletteWithColors(library, CLEMENTINA_16_565.slice(0, 8)), undefined);
  const filled = newConfig('c1', 'Default', library);
  assert.deepEqual(filled.banks.slice(0, 3), ['a', 'b', null]);
  assert.equal(filled.banks.length, 16);
  const given = newConfig('c2', 'Other', library, ['b', 'b']);
  assert.deepEqual(given.banks, ['b', 'b']);
  assert.equal(configBankPalette(library, filled, 1)?.name, 'Hud');
  assert.equal(configBankPalette(library, filled, 2), undefined);
  assert.equal(configBankPalette(library, undefined, 0), undefined);
  assert.deepEqual(
    paletteUsage([filled, given], 'b').map((u) => [u.config.id, u.banks]),
    [
      ['c1', [1]],
      ['c2', [0, 1]],
    ],
  );
  assert.equal(repointBanks([filled, given], 'b', 'a'), 3);
  assert.deepEqual(given.banks, ['a', 'a']);
  assert.equal(repointBanks([filled], 'a', null), 2);
  assert.deepEqual(filled.banks.slice(0, 2), [null, null]);
});

test('tile pixels read and write each plane', () => {
  const t = newTileset('id', 'Tiles');
  assert.equal(t.chr.length, TILESET_BYTES);
  setTilePixel(t, 3, 2, 1, 5);
  assert.equal(tilePixel(t, 3, 2, 1), 5);
  assert.equal(tilePixel(t, 3, 3, 1), 0);
  setTilePixel(t, 3, 2, 1, 2);
  assert.equal(tilePixel(t, 3, 2, 1), 2, 'writing clears the planes the value lacks');
  const mono = { ...newTileset('m', 'Mono'), bpp: 1 };
  setTilePixel(mono, 0, 0, 0, 7, 2);
  assert.equal(tilePixel(mono, 0, 0, 0, 2), 1, 'a 1bpp page holds one bit');
  assert.equal(tilePixel(mono, 0, 0, 0, 0), 0, 'other pages are untouched');
});

test('drawing areas map pixels to tiles', () => {
  const area = { x: 2, y: 1, width: 2, height: 2 };
  assert.equal(areaTile(area, 0, 0), 18);
  assert.equal(areaTile(area, 9, 0), 19);
  assert.equal(areaTile(area, 0, 8), 34);
  assert.ok(inArea(area, 15, 15));
  assert.ok(!inArea(area, 16, 0));
  const t = newTileset('id', 'Tiles');
  setAreaPixel(t, area, 9, 8, 4);
  assert.equal(tilePixel(t, 35, 1, 0), 4);
  assert.equal(areaPixel(t, area, 9, 8), 4);
});

test('pixel blocks capture, apply, clear and transform', () => {
  const area = { x: 0, y: 0, width: 1, height: 1 };
  const t = newTileset('id', 'Tiles');
  t.tilePaletteBanks[0] = 3;
  setAreaPixel(t, area, 0, 0, 1);
  setAreaPixel(t, area, 1, 0, 2);
  const block = capturePixels(t, area, { x: 0, y: 0, width: 2, height: 1 });
  assert.deepEqual(block, { width: 2, height: 1, data: [1, 2], banks: [3, 3] });
  assert.deepEqual(transformPixels(block, 'horizontal').data, [2, 1]);
  const turned = transformPixels(block, 'rotate');
  assert.deepEqual([turned.width, turned.height, turned.data], [1, 2, [1, 2]]);
  assert.deepEqual(transformPixels(turned, 'vertical').data, [2, 1]);

  const target = newTileset('t', 'Target');
  setAreaPixel(target, area, 7, 0, 6);
  applyPixels(
    target,
    area,
    { width: 2, height: 1, data: [0, 5], banks: [9, 9] },
    [6, 0],
    false,
    true,
  );
  assert.deepEqual([areaPixel(target, area, 6, 0), areaPixel(target, area, 7, 0)], [0, 5]);
  assert.equal(target.tilePaletteBanks[0], 9, 'the source bank comes along');
  applyPixels(
    target,
    area,
    { width: 2, height: 1, data: [0, 1], banks: [2, 2] },
    [7, 0],
    true,
    false,
  );
  assert.equal(areaPixel(target, area, 7, 0), 0, 'an opaque paste writes color 0 too');
  assert.equal(target.tilePaletteBanks[0], 9, 'without source the bank stays');
  clearPixels(t, area, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(areaPixel(t, area, 0, 0), 0);
  assert.equal(areaPixel(t, area, 1, 0), 2);
});

test('flood fill stays inside one color', () => {
  const area = { x: 0, y: 0, width: 1, height: 1 };
  const t = newTileset('id', 'Tiles');
  for (let y = 0; y < 8; y++) setAreaPixel(t, area, 3, y, 1);
  assert.equal(floodPixels(t, area, [0, 0]).length, 24);
  assert.equal(floodPixels(t, area, [3, 4]).length, 8);
  assert.equal(floodPixels(t, area, [5, 0]).length, 32);
  assert.deepEqual(floodPixels(t, area, [9, 0]), []);
});

test('strokes, shapes and patterns', () => {
  assert.deepEqual(strokePixels([0, 0], [2, 1]), [
    [0, 0],
    [1, 1],
    [2, 1],
  ]);
  const key = (points) => points.map(([x, y]) => `${x},${y}`).sort();
  assert.deepEqual(
    key(shapePixels('line', [0, 0], [3, 0], false)),
    key([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]),
  );
  const outline = shapePixels('rectangle', [0, 0], [3, 2], false);
  assert.equal(outline.length, 10);
  assert.equal(shapePixels('rectangle', [0, 0], [3, 2], true).length, 12);
  const ellipse = shapePixels('ellipse', [0, 0], [6, 4], false);
  assert.ok(ellipse.some(([x, y]) => x === 6 && y === 2));
  assert.ok(!ellipse.some(([x, y]) => x === 3 && y === 2), 'an outline leaves the middle empty');
  assert.ok(shapePixels('ellipse', [0, 0], [6, 4], true).some(([x, y]) => x === 3 && y === 2));
  assert.ok(patternAt('solid', 1, 0));
  assert.ok(patternAt('checker', 1, 1) && !patternAt('checker', 1, 0));
  assert.ok(patternAt('stripes', 1, 2) && !patternAt('stripes', 1, 1));
});

test('objects get fresh names, case sensitive', () => {
  const t = newTileset('id', 'Tiles');
  assert.equal(freshObjectName(t), 'Object_1');
  t.compositions.push({ name: 'Object_1' }, { name: 'object_2' });
  assert.equal(freshObjectName(t), 'Object_2');
});
