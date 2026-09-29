// The renderer's domain modules for names, asset lists and cell grids:
// pure operations, tested without a page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FILE_NAME,
  SYMBOL_NAME,
  canRename,
  freshName,
  nameTaken,
  uniqueName,
} from '../apps/desktop/domain/names.js';
import {
  MAX_ASSETS,
  canAdd,
  clampIndex,
  copyAsset,
  newId,
  removeAt,
} from '../apps/desktop/domain/assets.js';
import {
  blankCell,
  clear,
  cropsContent,
  floodPoints,
  groupBlock,
  isBlank,
  lift,
  linePoints,
  makeCells,
  mirror,
  place,
  regionBetween,
  regionContains,
  regionPoints,
  resizedCells,
  setCell,
} from '../apps/desktop/domain/cells.js';
import {
  clampDimension,
  clampScroll,
  newBackground,
  positiveMod,
  screenRanges,
  sizeFits,
  tableForCell,
  visibleTables,
  wrapRanges,
} from '../apps/desktop/domain/backgrounds.js';
import {
  COLUMNS,
  ROWS,
  firstFreeSpot,
  fitsOverlay,
  newOverlay,
  overlaps,
  overlapsAny,
} from '../apps/desktop/domain/overlays.js';

const named = (...names) => names.map((name) => ({ name }));
const cell = (tile, extra = {}) => ({ ...blankCell(), tile, ...extra });
const grid = (width, height, tiles) => ({
  width,
  height,
  cells: tiles.map((t) => cell(t)),
});
const tiles = (g) => g.cells.map((c) => c.tile);

test('names follow their pattern and are unique ignoring case', () => {
  assert.ok(FILE_NAME.test('Level-1'));
  assert.ok(!SYMBOL_NAME.test('Level-1'));
  assert.ok(!FILE_NAME.test('1st'));
  assert.ok(!SYMBOL_NAME.test('a'.repeat(33)));
  const items = named('Hero', 'Ghost');
  assert.ok(nameTaken(items, 'hero'));
  assert.ok(!nameTaken(items, 'hero', 0), 'an item may keep its own name');
  assert.ok(canRename(items, 0, 'HERO', SYMBOL_NAME));
  assert.ok(!canRename(items, 1, 'hero', SYMBOL_NAME));
  assert.ok(!canRename(items, 1, 'bad name', SYMBOL_NAME));
});

test('fresh and unique names skip the ones in use', () => {
  assert.equal(freshName([], 'Sound'), 'Sound_1');
  assert.equal(freshName(named('sound_1', 'Sound_2'), 'Sound'), 'Sound_3');
  assert.equal(freshName(named('Sound_2'), 'Sound'), 'Sound_1');
  assert.equal(uniqueName(named('Tiles'), 'Other'), 'Other');
  assert.equal(uniqueName(named('Tiles', 'tiles_2'), 'Tiles'), 'Tiles_3');
});

test('asset lists add, copy and remove', () => {
  assert.ok(canAdd([]));
  assert.ok(!canAdd(Array(MAX_ASSETS).fill({})));
  assert.match(newId(), /^[0-9a-f-]{36}$/);
  const original = { id: 'a', name: 'A', data: [1, 2] };
  const copy = copyAsset(original, 'B', 'b');
  assert.deepEqual(copy, { id: 'b', name: 'B', data: [1, 2] });
  copy.data.push(3);
  assert.deepEqual(original.data, [1, 2], 'a copy is deep');
  const list = [1, 2, 3];
  assert.equal(removeAt(list, 0), 0);
  assert.equal(removeAt(list, 1), 0);
  assert.deepEqual(list, [2]);
  assert.equal(clampIndex([], 4), 0);
  assert.equal(clampIndex([1, 2], 4), 1);
});

test('cells: blank, bounds and regions', () => {
  assert.ok(isBlank(blankCell()));
  assert.ok(!isBlank(cell(0, { priority: true })));
  assert.equal(makeCells(3, 2).length, 6);
  const g = grid(2, 2, [0, 0, 0, 0]);
  setCell(g, 1, 1, cell(9));
  setCell(g, 2, 0, cell(9));
  assert.deepEqual(tiles(g), [0, 0, 0, 9], 'a cell off the grid is dropped');
  const r = regionBetween({ col: 3, row: 1 }, { col: 1, row: 2 });
  assert.deepEqual(r, { x: 1, y: 1, width: 3, height: 2 });
  assert.ok(regionContains(r, { col: 3, row: 2 }));
  assert.ok(!regionContains(r, { col: 4, row: 2 }));
  assert.ok(!regionContains(null, { col: 0, row: 0 }));
  assert.equal(regionPoints(r).length, 6);
});

test('cells: lift, clear, place and mirror', () => {
  const g = grid(3, 2, [1, 2, 3, 4, 5, 6]);
  const block = lift(g, { x: 1, y: 0, width: 2, height: 2 });
  assert.deepEqual(tiles(block), [2, 3, 5, 6]);
  clear(g, { x: 0, y: 0, width: 1, height: 2 });
  assert.deepEqual(tiles(g), [0, 2, 3, 0, 5, 6]);
  place(g, block, 2, 1);
  assert.deepEqual(tiles(g), [0, 2, 3, 0, 5, 2], 'cells past the edge are dropped');
  const flipped = mirror(block, 'x');
  assert.deepEqual(tiles(flipped), [3, 2, 6, 5]);
  assert.ok(flipped.cells.every((c) => c.flipX && !c.flipY));
  assert.deepEqual(tiles(mirror(block, 'y')), [5, 6, 2, 3]);
  assert.ok(!block.cells[0].flipX, 'mirroring leaves the block alone');
});

test('cells: lines and flood fill', () => {
  assert.deepEqual(linePoints({ col: 0, row: 0 }, { col: 0, row: 0 }), [{ col: 0, row: 0 }]);
  assert.deepEqual(
    linePoints({ col: 0, row: 0 }, { col: 3, row: 1 }).map((p) => [p.col, p.row]),
    [
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 1],
    ],
  );
  // 1 1 0
  // 0 1 0
  // 1 0 0
  const g = grid(3, 3, [1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const key = (points) => points.map((p) => p.row * 3 + p.col).sort((a, b) => a - b);
  assert.deepEqual(key(floodPoints(g, 0, 0)), [0, 1, 4]);
  assert.deepEqual(key(floodPoints(g, 2, 2)), [2, 5, 7, 8]);
  assert.deepEqual(floodPoints(g, 5, 5), []);
});

test('cells: a picked group stamps each tile in its own bank, mirrored whole', () => {
  const banks = Array.from({ length: 256 }, (_, t) => t % 16);
  const stamp = { ...blankCell(), priority: true, chrAlt: true };
  const pick = { col: 2, row: 1, width: 2, height: 1 };
  const block = groupBlock(pick, stamp, banks);
  assert.deepEqual(tiles(block), [18, 19]);
  assert.deepEqual(
    block.cells.map((c) => c.paletteBank),
    [2, 3],
  );
  assert.ok(block.cells.every((c) => c.priority && c.chrAlt));
  assert.deepEqual(tiles(groupBlock(pick, { ...stamp, flipX: true }, banks)), [19, 18]);
  assert.deepEqual(
    groupBlock(pick, stamp, undefined).cells.map((c) => c.paletteBank),
    [0, 0],
    'without a tileset every tile takes bank 0',
  );
});

test('cells: resizing keeps the top-left and reports what it crops', () => {
  const g = grid(2, 2, [1, 0, 0, 0]);
  assert.ok(!cropsContent(g, 1, 1));
  assert.deepEqual(
    resizedCells(g, 3, 1).map((c) => c.tile),
    [1, 0, 0],
  );
  g.cells[3] = cell(0, { flipY: true });
  assert.ok(cropsContent(g, 2, 1));
  assert.ok(cropsContent(g, 1, 2));
  assert.ok(!cropsContent(g, 2, 2));
});

test('backgrounds: tables, wrapping and limits', () => {
  assert.equal(positiveMod(-1, 8), 7);
  assert.deepEqual(wrapRanges(10, 20, 100), [[10, 30]]);
  assert.deepEqual(wrapRanges(90, 20, 100), [
    [90, 100],
    [0, 10],
  ]);
  assert.equal(tableForCell(0, 1, 50, 50), 4);
  assert.equal(tableForCell(5, 0, 41, 26), 3);
  assert.equal(tableForCell(2, 0, 0, 30), 2);
  assert.deepEqual(visibleTables(0, 0, { x: 0, y: 0 }), [0]);
  assert.deepEqual(visibleTables(5, 0, { x: 160, y: 100 }), [0, 1, 2, 3]);
  assert.deepEqual(visibleTables(1, 1, { x: 320, y: 0 }), [5]);
  assert.deepEqual(visibleTables(1, 1, { x: 400, y: 0 }), [4, 5]);
  const ranges = screenRanges(1, { x: -8, y: 0 });
  assert.equal(ranges.localX, 632);
  assert.deepEqual(ranges.xRanges, [
    [632, 640],
    [0, 312],
  ]);
  assert.equal(clampScroll(70000), 65535);
  assert.equal(clampScroll(Number.NaN), 0);
  assert.equal(clampDimension(0), 1);
  assert.equal(clampDimension(5000), 1024);
  assert.ok(sizeFits(400, 500));
  assert.ok(!sizeFits(1000, 1000));
  const b = newBackground('id', 'Level', 'tiles');
  assert.deepEqual([b.width, b.height, b.cells.length, b.altTilesetId], [40, 25, 1000, 'tiles']);
});

test('overlays: placeholders fit and never overlap', () => {
  const o = newOverlay('id', 'Hud', 'tiles');
  assert.equal(o.cells.length, COLUMNS * ROWS);
  assert.deepEqual(o.placeholders, []);
  const a = { col: 0, row: 0, width: 4, height: 1 };
  assert.ok(overlaps(a, { col: 3, row: 0, width: 2, height: 2 }));
  assert.ok(!overlaps(a, { col: 4, row: 0, width: 2, height: 2 }));
  assert.ok(fitsOverlay({ col: 36, row: 24, width: 4, height: 1 }));
  assert.ok(!fitsOverlay({ col: 37, row: 24, width: 4, height: 1 }));
  assert.ok(!overlapsAny([a], a, 0), 'a placeholder does not overlap itself');
  assert.deepEqual(firstFreeSpot(4, 1, [a]), { col: 4, row: 0, width: 4, height: 1 });
  const full = [{ col: 0, row: 0, width: COLUMNS, height: ROWS }];
  assert.equal(firstFreeSpot(1, 1, full), null);
});
