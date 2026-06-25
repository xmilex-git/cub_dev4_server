import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { DEFAULT_CONFIG, deepMerge, buildConfig, validateConfig, loadConfig, applyEnvOverrides } from '../src/config.js';

const here = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(here, '..', 'config.example.json');

test('deepMerge merges nested objects, replaces scalars', () => {
  const merged = deepMerge(
    { a: 1, nested: { x: 1, y: 2 }, arr: [1, 2] },
    { a: 9, nested: { y: 20, z: 30 }, arr: [3] },
  );
  assert.deepEqual(merged, { a: 9, nested: { x: 1, y: 20, z: 30 }, arr: [3] });
});

test('buildConfig returns calibrated defaults', () => {
  const c = buildConfig();
  assert.equal(c.fastTickSec, 5);
  assert.equal(c.slowTickSec, 30);
  assert.equal(c.pidmax.warnPct, 0.8);
  assert.equal(c.pidmax.critPct, 0.9);
  assert.equal(c.cooldownSec, 300);
  assert.equal(c.logRetentionHours, 48);
  // 12 GiB / 5 GiB backstops
  assert.equal(c.memory.memAvailWarnBytes, 12 * 1024 ** 3);
  assert.equal(c.memory.memAvailCritBytes, 5 * 1024 ** 3);
});

test('buildConfig deep-merges overrides', () => {
  const c = buildConfig({ fastTickSec: 2, pidmax: { warnPct: 0.7 } });
  assert.equal(c.fastTickSec, 2);
  assert.equal(c.pidmax.warnPct, 0.7);
  assert.equal(c.pidmax.critPct, 0.9); // untouched default kept
});

test('validateConfig rejects crit < warn (pidmax)', () => {
  assert.throws(() => buildConfig({ pidmax: { warnPct: 0.9, critPct: 0.8 } }), /critPct must be >= /);
});

test('validateConfig rejects warn < crit (memAvailable backstops)', () => {
  assert.throws(
    () => buildConfig({ memory: { memAvailWarnBytes: 1, memAvailCritBytes: 100 } }),
    /memAvailWarnBytes must be >= /,
  );
});

test('validateConfig rejects non-positive tick', () => {
  assert.throws(() => buildConfig({ fastTickSec: 0 }), /fastTickSec/);
});

test('validateConfig accepts an empty webhook url string', () => {
  const c = buildConfig({ discord: { webhookUrl: '' } });
  assert.equal(c.discord.webhookUrl, '');
});

test('DEFAULT_CONFIG is frozen (immutable defaults)', () => {
  assert.ok(Object.isFrozen(DEFAULT_CONFIG));
});

test('loadConfig reads config.example.json and strips _comment', async () => {
  // Pass an explicit empty env so the test is independent of the runner's env.
  const c = await loadConfig(EXAMPLE, {});
  assert.equal(c.fastTickSec, 5);
  assert.equal(c.discord.webhookUrl, 'https://discord.com/api/webhooks/REPLACE_ME');
  // _comment documentation must not survive into the runtime config
  assert.equal(c._comment, undefined);
});

test('loadConfig throws a clear error on invalid JSON', async () => {
  await assert.rejects(loadConfig(join(here, 'fixtures', 'proc', 'meminfo'), {}), /not valid JSON/);
});

test('config.example.json validates against the schema', async () => {
  const c = await loadConfig(EXAMPLE, {});
  assert.doesNotThrow(() => validateConfig(c));
});

test('applyEnvOverrides injects DISCORD_WEBHOOK_URL over config value', () => {
  const c = buildConfig({ discord: { webhookUrl: 'from-file' } });
  applyEnvOverrides(c, { DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/ENV/SECRET' });
  assert.equal(c.discord.webhookUrl, 'https://discord.com/api/webhooks/ENV/SECRET');
});

test('applyEnvOverrides ignores empty/whitespace env value (keeps file value)', () => {
  const c1 = buildConfig({ discord: { webhookUrl: 'from-file' } });
  applyEnvOverrides(c1, { DISCORD_WEBHOOK_URL: '   ' });
  assert.equal(c1.discord.webhookUrl, 'from-file');
  const c2 = buildConfig({ discord: { webhookUrl: 'from-file' } });
  applyEnvOverrides(c2, {});
  assert.equal(c2.discord.webhookUrl, 'from-file');
});

test('loadConfig env injection lets an empty-file webhook validate via env', async () => {
  // config.example.json has a placeholder; env should win and be trimmed.
  const c = await loadConfig(EXAMPLE, { DISCORD_WEBHOOK_URL: ' https://discord.com/api/webhooks/ENV/X ' });
  assert.equal(c.discord.webhookUrl, 'https://discord.com/api/webhooks/ENV/X');
});

// --- added: notifier / teams / rule gates / per-container memory ----------

test('buildConfig defaults: notifier/gates/teams/memCgroupRoot', () => {
  const c = buildConfig();
  assert.equal(c.notifier, 'discord');
  assert.equal(c.sendResolve, true);
  assert.equal(c.pidmax.alertWarn, true);
  assert.equal(c.pidmax.alertRate, true);
  assert.equal(c.memory.alertHost, true);
  assert.equal(c.memory.alertContainer, false);
  assert.equal(c.memory.containerLimitWarnPct, 0.75);
  assert.equal(c.memory.containerNoLimitHostPct, 0.5);
  assert.equal(c.teams.webhookUrl, '');
  assert.equal(c.teams.retries, 3);
  assert.equal(c.paths.memCgroupRoot, '/sys/fs/cgroup/memory/libpod_parent');
});

test('validateConfig rejects an unknown notifier', () => {
  assert.throws(() => buildConfig({ notifier: 'slack' }), /notifier must be/);
});

test('validateConfig rejects non-boolean gates and sendResolve', () => {
  assert.throws(() => buildConfig({ sendResolve: 'no' }), /sendResolve must be a boolean/);
  assert.throws(() => buildConfig({ pidmax: { alertWarn: 1 } }), /pidmax.alertWarn must be a boolean/);
  assert.throws(() => buildConfig({ memory: { alertContainer: 'yes' } }), /memory.alertContainer must be a boolean/);
});

test('validateConfig rejects containerLimitWarnPct outside [0,1]', () => {
  assert.throws(() => buildConfig({ memory: { containerLimitWarnPct: 1.5 } }), /containerLimitWarnPct/);
});

test('validateConfig rejects containerNoLimitHostPct outside [0,1]', () => {
  assert.throws(() => buildConfig({ memory: { containerNoLimitHostPct: -0.1 } }), /containerNoLimitHostPct/);
});

test('validateConfig accepts notifier=teams with empty teams webhook (env-injected)', () => {
  const c = buildConfig({ notifier: 'teams' });
  assert.equal(c.notifier, 'teams');
  assert.equal(c.teams.webhookUrl, '');
});

test('applyEnvOverrides injects TEAMS_WEBHOOK_URL (trimmed); independent of discord', () => {
  const c = buildConfig();
  applyEnvOverrides(c, { TEAMS_WEBHOOK_URL: '  https://env.example/teams?sig=x  ' });
  assert.equal(c.teams.webhookUrl, 'https://env.example/teams?sig=x');
  assert.equal(c.discord.webhookUrl, ''); // discord untouched
});

test('the Teams policy overlay validates (notifier=teams, lanes off, container on)', () => {
  const c = buildConfig({
    notifier: 'teams',
    sendResolve: false,
    pidmax: { alertWarn: false, alertRate: false },
    memory: { alertHost: false, alertContainer: true, containerLimitWarnPct: 0.75, containerNoLimitHostPct: 0.5 },
    teams: { webhookUrl: 'https://t/x' },
  });
  assert.equal(c.notifier, 'teams');
  assert.equal(c.sendResolve, false);
  assert.equal(c.pidmax.alertWarn, false);
  assert.equal(c.memory.alertContainer, true);
  assert.equal(c.pidmax.critPct, 0.9); // untouched -> still the >=90% protection
});
