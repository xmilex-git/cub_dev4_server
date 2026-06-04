import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseMeminfo,
  parsePressure,
  parseStat,
  readMeminfo,
  readPressure,
  readStat,
} from '../src/collectors/proc.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROC = join(here, 'fixtures', 'proc');
const KIB = 1024;

test('parseMeminfo normalises kB fields to bytes', () => {
  const m = parseMeminfo('MemTotal:       197307904 kB\nMemAvailable:   134217728 kB\nHugePages_Total:       0\n');
  assert.equal(m.MemTotal, 197307904 * KIB);
  assert.equal(m.MemAvailable, 134217728 * KIB);
  assert.equal(m.HugePages_Total, 0); // no unit -> raw
});

test('parseMeminfo ignores malformed lines', () => {
  const m = parseMeminfo('garbage line\nMemFree: 100 kB\n: : :\n');
  assert.equal(m.MemFree, 100 * KIB);
  assert.equal(Object.keys(m).length, 1);
});

test('readMeminfo reads from an injected procRoot', async () => {
  const m = await readMeminfo(PROC);
  assert.equal(m.MemTotal, 197307904 * KIB);
  assert.equal(m.MemAvailable, 134217728 * KIB);
  assert.equal(m.SwapTotal, 8388608 * KIB);
});

test('parsePressure extracts some/full avg fields', () => {
  const text = 'some avg10=0.42 avg60=0.18 avg300=0.05 total=12345678\nfull avg10=0.10 avg60=0.04 avg300=0.01 total=6789012\n';
  const p = parsePressure(text);
  assert.equal(p.some.avg10, 0.42);
  assert.equal(p.some.avg60, 0.18);
  assert.equal(p.some.total, 12345678);
  assert.equal(p.full.avg10, 0.1);
});

test('parsePressure handles cpu (no full line)', () => {
  const p = parsePressure('some avg10=1.23 avg60=0.50 avg300=0.20 total=99\n');
  assert.equal(p.some.avg10, 1.23);
  assert.equal(p.full, null);
});

test('readPressure returns null on ENOENT (PSI unavailable)', async () => {
  const p = await readPressure(PROC, 'doesnotexist');
  assert.equal(p, null);
});

test('readPressure reads memory pressure from fixture', async () => {
  const p = await readPressure(PROC, 'memory');
  assert.equal(p.some.avg10, 0.42);
});

test('parseStat sums the aggregate cpu line', () => {
  const cpu = parseStat('cpu  10 20 30 40 0 0 0 0 0 0\ncpu0 ...\n');
  assert.equal(cpu.user, 10);
  assert.equal(cpu.idle, 40);
  assert.equal(cpu.total, 100);
});

test('readStat reads from fixture', async () => {
  const cpu = await readStat(PROC);
  assert.equal(cpu.user, 123456);
  assert.ok(cpu.total > cpu.user);
});
