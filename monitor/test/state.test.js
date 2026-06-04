import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { buildConfig } from '../src/config.js';
import { writeStateAtomic, buildState, scrubSecrets } from '../src/state.js';
import { makeTmpDir } from './helpers/tmp.js';

async function tmpDir(t) {
  return makeTmpDir('wd-state-', t);
}

test('scrubSecrets strips forbidden keys recursively', () => {
  const cleaned = scrubSecrets({
    ok: 1,
    discord: { webhookUrl: 'secret' },
    nested: { webhook: 'x', keep: 2, deeper: { token: 't', val: 3 } },
    list: [{ secret: 'no' }, { yes: 4 }],
  });
  assert.deepEqual(cleaned, {
    ok: 1,
    nested: { keep: 2, deeper: { val: 3 } },
    list: [{}, { yes: 4 }],
  });
});

test('writeStateAtomic writes valid JSON with 0644 and a heartbeat', async (t) => {
  const dir = await tmpDir(t);
  const file = join(dir, 'state.json');
  await writeStateAtomic(file, { ts: 123, foo: 'bar' });

  const parsed = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(parsed.foo, 'bar');
  assert.ok(typeof parsed.heartbeat === 'number');

  const info = await stat(file);
  assert.equal(info.mode & 0o777, 0o644);

  // no leftover temp files
  const entries = await readdir(dir);
  assert.deepEqual(entries, ['state.json']);
});

test('writeStateAtomic NEVER persists a webhook url even if passed in', async (t) => {
  const dir = await tmpDir(t);
  const file = join(dir, 'state.json');
  await writeStateAtomic(file, {
    ts: 1,
    discord: { webhookUrl: 'https://discord.com/api/webhooks/SECRET' },
    activeAlerts: [{ entity: 'host', msg: 'ok' }],
  });
  const raw = await readFile(file, 'utf8');
  assert.ok(!raw.includes('webhookUrl'));
  assert.ok(!raw.includes('SECRET'));
  assert.ok(!raw.includes('discord'));
});

test('buildState produces the widget contract with exemptions and ratios', () => {
  const config = buildConfig();
  const state = buildState({
    ts: 1000,
    host: { memAvailable: 5, memTotal: 10, psiSomeAvg10: 1.2 },
    containers: [
      { id: 'a', name: 'svc-a', current: 1024, max: 2048, severity: 'ok' },
      { id: 'b', name: 'svc-b', current: 7, max: null, severity: 'ok' },
    ],
    earlyoom: { effectiveMemKillBytes: 419430400 },
    activeAlerts: [],
    config,
  });

  assert.equal(state.schemaVersion, 1);
  assert.equal(state.fastTickSec, config.fastTickSec);
  assert.equal(state.host.memAvailable, 5);

  const a = state.containers.find((c) => c.id === 'a');
  assert.equal(a.ratio, 0.5);
  assert.equal(a.exempt, false);

  const b = state.containers.find((c) => c.id === 'b');
  assert.equal(b.ratio, null);
  assert.equal(b.exempt, true);

  // serialised state has no secret material
  assert.ok(!JSON.stringify(state).includes('webhook'));
});
