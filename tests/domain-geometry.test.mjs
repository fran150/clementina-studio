// The shared geometry every editor draws with: clamps, drag rectangles,
// straight lines and flood fills, tested without a page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clamp, floodFill, lineBetween, rectBetween } from '../apps/desktop/domain/geometry.js';

test('clamp keeps a value within its bounds', () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(12, 0, 10), 10);
});

test('rectBetween gives the same rectangle from either corner', () => {
  const r = { x: 2, y: 1, width: 4, height: 3 };
  assert.deepEqual(rectBetween(2, 1, 5, 3), r);
  assert.deepEqual(rectBetween(5, 3, 2, 1), r);
  assert.deepEqual(rectBetween(4, 4, 4, 4), { x: 4, y: 4, width: 1, height: 1 });
});

test('lineBetween covers every step of the longer axis', () => {
  assert.deepEqual(lineBetween([0, 0], [3, 1]), [
    [0, 0],
    [1, 0],
    [2, 1],
    [3, 1],
  ]);
  assert.deepEqual(lineBetween([2, 2], [2, 2]), [[2, 2]]);
});

test('floodFill stays within the matching, 4-connected region', () => {
  // A 4 × 3 grid with a wall of 1s down column 1.
  const grid = [0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0];
  const at = (x, y) => grid[y * 4 + x];
  const left = floodFill(4, 3, [0, 0], at);
  assert.deepEqual(left.map(String).sort(), ['0,0', '0,1', '0,2']);
  assert.equal(floodFill(4, 3, [2, 1], at).length, 6);
  assert.deepEqual(floodFill(4, 3, [4, 0], at), []);
});
