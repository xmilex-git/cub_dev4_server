// test helper: create disk-backed scratch dirs under the repo's .claude/scratch
// (NOT /tmp or $TMPDIR, which are tmpfs on the dev machine and a no-go per the
// project's scratch-location rule). Each call returns a fresh unique directory.

import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
// monitor/test/helpers -> repo root .claude/scratch
const SCRATCH_BASE = join(here, '..', '..', '..', '.claude', 'scratch');

/**
 * Create a fresh scratch dir. Pass a node:test context `t` to auto-remove it
 * after the test so repeated runs do not accumulate directories.
 */
export async function makeTmpDir(prefix = 'wd-test-', t = null) {
  const dir = await mkdtemp(join(SCRATCH_BASE, prefix));
  if (t && typeof t.after === 'function') {
    t.after(() => removeDir(dir));
  }
  return dir;
}

export async function removeDir(dir) {
  await rm(dir, { recursive: true, force: true });
}
