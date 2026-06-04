import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir, utimes } from 'node:fs/promises';
import { join } from 'node:path';

import { appendSample, pruneOld, dayStamp, metricsFileName } from '../src/logstore.js';
import { makeTmpDir } from './helpers/tmp.js';

const DAY_MS = 24 * 60 * 60 * 1000;

test('dayStamp / metricsFileName use UTC YYYYMMDD', () => {
  const ts = Date.UTC(2026, 5, 4, 13, 30, 0); // 2026-06-04
  assert.equal(dayStamp(ts), '20260604');
  assert.equal(metricsFileName(ts), 'metrics-20260604.jsonl');
});

test('appendSample creates the daily file and appends JSONL', async (t) => {
  const dir = await makeTmpDir('wd-log-', t);
  const ts = Date.UTC(2026, 5, 4, 1, 0, 0);
  assert.equal(await appendSample(dir, { ts, value: 1 }), true);
  assert.equal(await appendSample(dir, { ts, value: 2 }), true);

  const file = join(dir, 'metrics-20260604.jsonl');
  const lines = (await readFile(file, 'utf8')).trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]).value, 1);
  assert.equal(JSON.parse(lines[1]).value, 2);
});

test('appendSample degrades (returns false, warns) on write failure, never throws', async (t) => {
  const stderr = [];
  // A path whose parent is a file -> mkdir/append fails.
  const dir = await makeTmpDir('wd-log-', t);
  const fileAsDir = join(dir, 'iam-a-file');
  await writeFile(fileAsDir, 'x');
  const ok = await appendSample(join(fileAsDir, 'sub'), { ts: Date.now() }, (l) => stderr.push(l));
  assert.equal(ok, false);
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /append-failed/);
});

test('pruneOld deletes files older than retention, keeps recent ones', async (t) => {
  const dir = await makeTmpDir('wd-log-', t);
  await mkdir(dir, { recursive: true });
  const now = Date.UTC(2026, 5, 10, 12, 0, 0); // 2026-06-10 noon

  // old file: 2026-06-04 (6 days ago) -> beyond 48h
  const oldFile = join(dir, 'metrics-20260604.jsonl');
  await writeFile(oldFile, '{}\n');
  const oldTime = new Date(Date.UTC(2026, 5, 4, 12, 0, 0));
  await utimes(oldFile, oldTime, oldTime);

  // recent file: today
  const recentFile = join(dir, 'metrics-20260610.jsonl');
  await writeFile(recentFile, '{}\n');

  // a non-matching file should be left alone
  const otherFile = join(dir, 'README.txt');
  await writeFile(otherFile, 'keep me');

  const removed = await pruneOld(dir, 48, { now });
  assert.deepEqual(removed, ['metrics-20260604.jsonl']);

  const remaining = (await readdir(dir)).sort();
  assert.deepEqual(remaining, ['README.txt', 'metrics-20260610.jsonl'].sort());
});

test('pruneOld returns [] when the log dir does not exist', async (t) => {
  const removed = await pruneOld(join(await makeTmpDir('wd-log-', t), 'nope'), 48, { now: Date.now() });
  assert.deepEqual(removed, []);
});

test('pruneOld keeps a file whose whole day is still within retention', async (t) => {
  const dir = await makeTmpDir('wd-log-', t);
  const now = Date.UTC(2026, 5, 5, 1, 0, 0); // 2026-06-05 01:00
  const file = join(dir, `metrics-${dayStamp(now - DAY_MS)}.jsonl`); // yesterday
  await writeFile(file, '{}\n');
  const removed = await pruneOld(dir, 48, { now });
  assert.deepEqual(removed, []); // yesterday is within 48h
});
