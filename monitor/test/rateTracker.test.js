import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RateTracker, projectTicksToMax } from '../src/rateTracker.js';

test('projectTicksToMax computes remaining/delta', () => {
  assert.equal(projectTicksToMax(1000, 2048, 100), (2048 - 1000) / 100);
});

test('projectTicksToMax returns Infinity for unlimited max', () => {
  assert.equal(projectTicksToMax(1000, null, 100), Infinity);
});

test('projectTicksToMax returns Infinity when not growing', () => {
  assert.equal(projectTicksToMax(1000, 2048, 0), Infinity);
});

test('projectTicksToMax returns 0 when already at/over max', () => {
  assert.equal(projectTicksToMax(2048, 2048, 50), 0);
  assert.equal(projectTicksToMax(2100, 2048, 50), 0);
});

test('RateTracker.deltaPerTick uses the last sample pair', () => {
  const rt = new RateTracker();
  rt.record('c1', 100, 1000);
  rt.record('c1', 250, 2000);
  assert.equal(rt.deltaPerTick('c1'), 150);
});

test('RateTracker.deltaPerTick is 0 with fewer than 2 samples', () => {
  const rt = new RateTracker();
  rt.record('c1', 100, 1000);
  assert.equal(rt.deltaPerTick('c1'), 0);
});

test('RateTracker.deltaPerTick never negative (count dropped)', () => {
  const rt = new RateTracker();
  rt.record('c1', 500, 1000);
  rt.record('c1', 200, 2000);
  assert.equal(rt.deltaPerTick('c1'), 0);
});

test('RateTracker honours its window size', () => {
  const rt = new RateTracker(2);
  rt.record('c1', 1, 1);
  rt.record('c1', 2, 2);
  rt.record('c1', 9, 3);
  // only last 2 kept: delta = 9 - 2 = 7
  assert.equal(rt.deltaPerTick('c1'), 7);
});

test('RateTracker.retainOnly drops stale ids', () => {
  const rt = new RateTracker();
  rt.record('a', 1, 1);
  rt.record('b', 1, 1);
  rt.retainOnly(['a']);
  assert.ok(rt.history.has('a'));
  assert.ok(!rt.history.has('b'));
});
