import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  listMemContainers,
  parseInactiveFile,
  readContainerMem,
  collectContainerMem,
} from '../src/collectors/cgroupMem.js';

const here = dirname(fileURLToPath(import.meta.url));
const MEM = join(here, 'fixtures', 'cgroup-mem');

const ID_HOG = 'cafe0000cafe0000cafe0000cafe0000cafe0000cafe0000cafe0000cafe0000';
const ID_OK = '1111000011110000111100001111000011110000111100001111000011110000';

test('listMemContainers finds only libpod-* dirs', async () => {
  const ids = (await listMemContainers(MEM)).map((c) => c.id).sort();
  assert.deepEqual(ids, [ID_HOG, ID_OK].sort());
  assert.ok(!ids.includes('not-a-container'));
});

test('listMemContainers returns [] when the parent cgroup is missing', async () => {
  assert.deepEqual(await listMemContainers(join(MEM, 'nope')), []);
});

test('parseInactiveFile reads total_inactive_file; 0 when absent', () => {
  assert.equal(parseInactiveFile('total_rss 5\ntotal_inactive_file 1234\n'), 1234);
  assert.equal(parseInactiveFile('total_rss 5\n'), 0);
  // must not match the (non-total) inactive_file line
  assert.equal(parseInactiveFile('inactive_file 999\ntotal_inactive_file 7\n'), 7);
});

test('readContainerMem computes working set = usage - total_inactive_file', async () => {
  const hog = await readContainerMem(join(MEM, `libpod-${ID_HOG}`));
  assert.equal(hog.usage, 160000000000);
  assert.equal(hog.workingSet, 160000000000 - 5000000000);

  const ok = await readContainerMem(join(MEM, `libpod-${ID_OK}`));
  assert.equal(ok.workingSet, 9000000000 - 1000000000);
});

test('readContainerMem returns null on ENOENT (vanished container)', async () => {
  assert.equal(await readContainerMem(join(MEM, 'libpod-ghost')), null);
});

test('collectContainerMem returns a Map keyed by id', async () => {
  const map = await collectContainerMem(MEM);
  assert.equal(map.size, 2);
  assert.equal(map.get(ID_HOG).workingSet, 155000000000);
  assert.equal(map.get(ID_OK).workingSet, 8000000000);
});
