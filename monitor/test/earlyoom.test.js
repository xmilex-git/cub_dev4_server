import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  extractArgsLine,
  parseEarlyoomArgs,
  computeEffectiveMemKillBytes,
  loadEarlyoom,
} from '../src/collectors/earlyoom.js';

const here = dirname(fileURLToPath(import.meta.url));
const EARLYOOM_FILE = join(here, 'fixtures', 'earlyoom', 'earlyoom.defaults');

const KIB = 1024;

test('extractArgsLine pulls the quoted EARLYOOM_ARGS value', () => {
  const text = '# comment\nEARLYOOM_ARGS="-r 0 -m 5,5 -M 409600,409600"\n';
  assert.equal(extractArgsLine(text), '-r 0 -m 5,5 -M 409600,409600');
});

test('extractArgsLine handles unquoted and single-quoted', () => {
  assert.equal(extractArgsLine('EARLYOOM_ARGS=-m 5'), '-m 5');
  assert.equal(extractArgsLine("EARLYOOM_ARGS='-M 100'"), '-M 100');
});

test('parseEarlyoomArgs parses -m, -M, -r pairs', () => {
  const args = parseEarlyoomArgs('-r 0 -m 5,5 -M 409600,409600');
  assert.deepEqual(args.memPercent, { warn: 5, kill: 5 });
  assert.deepEqual(args.memKiB, { warn: 409600, kill: 409600 });
  assert.equal(args.reportInterval, 0);
});

test('parseEarlyoomArgs handles single value (warn === kill)', () => {
  const args = parseEarlyoomArgs('-M 100');
  assert.deepEqual(args.memKiB, { warn: 100, kill: 100 });
});

test('computeEffectiveMemKillBytes: last flag wins (-m then -M => -M, ~400 MiB)', () => {
  const totalMem = 197307904 * KIB; // ~188 GiB
  const args = parseEarlyoomArgs('-m 5,5 -M 409600,409600');
  // Matches the real host: earlyoom journal reports SIGKILL at 0.21% (~400 MiB),
  // i.e. the -M value, because -M is specified last and overrides -m.
  assert.equal(args.lastMemFlag, 'M');
  const eff = computeEffectiveMemKillBytes(args, totalMem);
  assert.equal(eff, 409600 * KIB);
  assert.ok(eff < (5 / 100) * totalMem);
});

test('computeEffectiveMemKillBytes: reverse order (-M then -m => -m wins)', () => {
  const totalMem = 197307904 * KIB;
  const args = parseEarlyoomArgs('-M 409600,409600 -m 5,5');
  assert.equal(args.lastMemFlag, 'm');
  const eff = computeEffectiveMemKillBytes(args, totalMem);
  assert.equal(eff, (5 / 100) * totalMem);
});

test('computeEffectiveMemKillBytes with only -M', () => {
  const args = parseEarlyoomArgs('-M 409600,409600');
  const eff = computeEffectiveMemKillBytes(args, NaN);
  assert.equal(eff, 409600 * KIB);
});

test('computeEffectiveMemKillBytes returns null when no mem flags', () => {
  assert.equal(computeEffectiveMemKillBytes(parseEarlyoomArgs('-r 0'), 1000), null);
});

test('loadEarlyoom reads + computes from fixture file', async () => {
  const totalMem = 197307904 * KIB;
  const out = await loadEarlyoom(EARLYOOM_FILE, totalMem);
  assert.ok(out);
  assert.deepEqual(out.args.memKiB, { warn: 409600, kill: 409600 });
  // -M is last in the fixture, so it wins: ~400 MiB (matches host journal 0.21%).
  assert.equal(out.effectiveMemKillBytes, 409600 * KIB);
});

test('loadEarlyoom returns null when the file is absent', async () => {
  const out = await loadEarlyoom(join(here, 'fixtures', 'earlyoom', 'nope'), 1000);
  assert.equal(out, null);
});
