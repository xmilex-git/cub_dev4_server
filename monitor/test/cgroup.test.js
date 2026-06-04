import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  listContainers,
  readContainerPids,
  collectContainerPids,
} from '../src/collectors/cgroup.js';

const here = dirname(fileURLToPath(import.meta.url));
const CGROUP = join(here, 'fixtures', 'cgroup');

const ID_HEALTHY = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555ffff6666aaaa7777bbbb8888';
const ID_WARN = '1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
const ID_UNLIMITED = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

test('listContainers finds only libpod-* dirs', async () => {
  const list = await listContainers(CGROUP);
  const ids = list.map((c) => c.id).sort();
  assert.deepEqual(ids, [ID_WARN, ID_HEALTHY, ID_UNLIMITED].sort());
  // "not-a-container" dir is excluded
  assert.ok(!ids.includes('not-a-container'));
});

test('listContainers returns [] when the parent cgroup is missing', async () => {
  const list = await listContainers(join(CGROUP, 'nope'));
  assert.deepEqual(list, []);
});

test('readContainerPids parses integers', async () => {
  const pids = await readContainerPids(join(CGROUP, `libpod-${ID_HEALTHY}`));
  assert.deepEqual(pids, { current: 179, max: 2048 });
});

test('readContainerPids maps "max" to null (unlimited -> exempt)', async () => {
  const pids = await readContainerPids(join(CGROUP, `libpod-${ID_UNLIMITED}`));
  assert.deepEqual(pids, { current: 5, max: null });
});

test('readContainerPids returns null on ENOENT (vanished container)', async () => {
  const pids = await readContainerPids(join(CGROUP, 'libpod-ghost'));
  assert.equal(pids, null);
});

test('collectContainerPids skips vanished containers and reads the rest', async () => {
  const all = await collectContainerPids(CGROUP);
  assert.equal(all.length, 3);
  const warn = all.find((c) => c.id === ID_WARN);
  assert.deepEqual({ current: warn.current, max: warn.max }, { current: 1638, max: 2048 });
  const unlimited = all.find((c) => c.id === ID_UNLIMITED);
  assert.equal(unlimited.max, null);
});
