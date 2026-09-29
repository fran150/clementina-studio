// The renderer's domain modules for shapes and animations: pure operations,
// tested without a page.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canvasSize,
  flipSprites,
  newShape,
  resizedOrigin,
  spriteAt,
  spriteBounds,
  spritesForOrigin,
  spritesForTiles,
  spritesStepped,
  spritesToEnd,
  translateSprites,
  validSprites,
} from '../apps/desktop/domain/shapes.js';
import {
  animationTilesetId,
  clampOffset,
  frameAtTick,
  frameSprites,
  framesOnTileset,
  freshAnimationId,
  moveItem,
  newAnimation,
  toggleFrameFlip,
  usableShapes,
} from '../apps/desktop/domain/animations.js';

const sprite = (x, y, tile = 0) => ({ tile, x, y, paletteBank: 0, flipX: false, flipY: false });

test('a new shape is a 4 × 4-tile canvas, capped at the screen in pixels', () => {
  const shape = newShape('s', 'shape_1', 't');
  assert.deepEqual(canvasSize(shape), { width: 32, height: 32 });
  assert.deepEqual(canvasSize({ canvasPixelWidth: 400, canvasHeight: 30 }), {
    width: 320,
    height: 200,
  });
});

test('sprites must fit OAM coordinates, and bounds cover them', () => {
  assert.ok(validSprites([sprite(-512, -256), sprite(511, 255)]));
  assert.ok(!validSprites([sprite(512, 0)]));
  assert.ok(!validSprites([sprite(0, 0.5)]));
  assert.deepEqual(spriteBounds([sprite(0, 0), sprite(8, 16)]), {
    x: 0,
    y: 0,
    width: 16,
    height: 24,
  });
  assert.deepEqual(spriteBounds([]), { x: 0, y: 0, width: 0, height: 0 });
});

test('hits find the topmost sprite, relative to the origin', () => {
  const shape = { ...newShape('s', 'a', 't'), originX: 4, sprites: [sprite(0, 0), sprite(4, 0)] };
  assert.equal(spriteAt(shape, { x: 9, y: 1 }), 1);
  assert.equal(spriteAt(shape, { x: 5, y: 1 }), 0);
  assert.equal(spriteAt(shape, { x: 20, y: 1 }), -1);
});

test('a resize keeps the origin on its anchor, and sprites keep their place', () => {
  const shape = { ...newShape('s', 'a', 't'), originX: 8, originY: 16, sprites: [sprite(0, 0)] };
  assert.deepEqual(resizedOrigin({ ...shape, originAnchor: 'center' }, 40, 20), { x: 20, y: 10 });
  assert.deepEqual(resizedOrigin({ ...shape, originAnchor: 'bottom-center' }, 40, 20), {
    x: 20,
    y: 20,
  });
  assert.deepEqual(resizedOrigin({ ...shape, originAnchor: 'custom' }, 64, 64), { x: 16, y: 32 });
  assert.deepEqual(resizedOrigin(shape, 64, 64), { x: 0, y: 0 });
  assert.deepEqual(
    spritesForOrigin(shape, 0, 0).map((p) => [p.x, p.y]),
    [[8, 16]],
  );
});

test('placed tiles become one sprite each, in their authored banks', () => {
  const banks = Array.from({ length: 256 }, (_, i) => i % 4);
  const add = spritesForTiles({ x: 1, y: 2, width: 2, height: 1 }, 8, 0, banks);
  assert.deepEqual(
    add.map((p) => [p.tile, p.x, p.y, p.paletteBank]),
    [
      [33, 8, 0, 1],
      [34, 16, 0, 2],
    ],
  );
});

test('nudges and flips move only the selection, flipping it as one picture', () => {
  const list = [sprite(0, 0), sprite(8, 0), sprite(40, 40)];
  assert.deepEqual(
    translateSprites(list, new Set([2]), 1, -1).map((p) => [p.x, p.y]),
    [
      [0, 0],
      [8, 0],
      [41, 39],
    ],
  );
  flipSprites(list, new Set([0, 1]), 'x');
  assert.deepEqual(
    list.map((p) => [p.x, p.flipX]),
    [
      [8, true],
      [0, true],
      [40, false],
    ],
  );
});

test('reordering keeps a selection together', () => {
  const list = ['a', 'b', 'c', 'd'];
  const front = spritesToEnd(list, new Set([0, 2]), true);
  assert.deepEqual(front.sprites, ['b', 'd', 'a', 'c']);
  assert.deepEqual([...front.selected], [2, 3]);
  const up = spritesStepped(list, new Set([0, 1]), 1);
  assert.deepEqual(up.sprites, ['c', 'a', 'b', 'd']);
  assert.deepEqual([...up.selected].sort(), [1, 2]);
  assert.equal(spritesStepped(list, new Set([3]), 1), null);
});

test('animations are pinned to their first frame’s tileset', () => {
  const shapes = [
    { id: 'a', tilesetId: 't1' },
    { id: 'b', tilesetId: 't2' },
    { id: 'c', tilesetId: 't1' },
  ];
  const anim = newAnimation('animation:x', 'x', 'a');
  assert.equal(anim.frames[0].ticks, 6);
  assert.equal(animationTilesetId(anim, shapes), 't1');
  assert.deepEqual(
    usableShapes(anim, shapes).map((s) => s.id),
    ['a', 'c'],
  );
  assert.equal(usableShapes(undefined, shapes).length, 3);
  assert.ok(framesOnTileset([{ shapeId: 'c' }], shapes, 't1'));
  assert.ok(!framesOnTileset([{ shapeId: 'b' }], shapes, 't1'));
  assert.equal(freshAnimationId([{ id: 'animation:x' }], 'x'), 'animation:x-2');
});

test('frames mirror about the origin, then move by their offset', () => {
  const shapes = [{ id: 'a', sprites: [sprite(0, 4)] }];
  const frame = { shapeId: 'a', flipX: true, dx: 10 };
  assert.deepEqual(
    frameSprites(frame, shapes).map((p) => [p.x, p.y, p.flipX, p.flipY]),
    [[2, 4, true, false]],
  );
  toggleFrameFlip(frame, 'x');
  assert.ok(!('flipX' in frame));
  toggleFrameFlip(frame, 'y');
  assert.equal(frame.flipY, true);
  assert.equal(clampOffset(600), 511);
  assert.equal(clampOffset(-600), -512);
});

test('playback loops through frames by their ticks', () => {
  const frames = [{ ticks: 2 }, { ticks: 3 }];
  assert.deepEqual(
    [0, 1, 2, 4, 5, 7].map((t) => frameAtTick(frames, t)),
    [0, 0, 1, 1, 0, 1],
  );
  const list = [1, 2, 3];
  moveItem(list, 0, 2);
  assert.deepEqual(list, [2, 3, 1]);
});
