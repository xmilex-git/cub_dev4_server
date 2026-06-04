import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConfig } from '../src/config.js';
import { AlertManager, alertKey } from '../src/alert.js';

const TS = 1_700_000_000_000;

function makeFinding(over = {}) {
  return {
    entity: 'c1',
    name: 'svc',
    kind: 'pidmax',
    severity: 'warn',
    ratio: 0.85,
    detail: { current: 1740, max: 2048 },
    culprit: null,
    msg: 'pids high',
    ts: TS,
    ...over,
  };
}

/**
 * Build an AlertManager with a controllable clock and a fake fetch that records
 * payloads. dryRun=false so we exercise the real send path; the fake fetch
 * returns 204 (Discord success).
 */
function makeManager(overrideConfig = {}) {
  const config = buildConfig({
    cooldownSec: 300,
    resolveAfterClears: 2,
    discord: { webhookUrl: 'https://discord.com/api/webhooks/TEST', retries: 1, backoffMs: 1 },
    ...overrideConfig,
  });
  const posts = [];
  const stdout = [];
  const stderr = [];
  let clock = TS;
  const mgr = new AlertManager(config, {
    dryRun: false,
    now: () => clock,
    sleep: async () => {},
    stdout: (l) => stdout.push(l),
    stderr: (l) => stderr.push(l),
    fetchImpl: async (url, init) => {
      posts.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 204, headers: { get: () => null } };
    },
  });
  return {
    mgr,
    posts,
    stdout,
    stderr,
    advance: (ms) => { clock += ms; },
  };
}

test('alertKey is stable and secret-free; mem reason disambiguates', () => {
  assert.equal(alertKey(makeFinding()), 'c1:pidmax:pidmax');
  const psi = makeFinding({ entity: 'host', kind: 'mem', detail: { reason: 'psi' } });
  const avail = makeFinding({ entity: 'host', kind: 'mem', detail: { reason: 'memAvailable' } });
  assert.notEqual(alertKey(psi), alertKey(avail));
});

test('first finding sends; same finding within cooldown is suppressed', async () => {
  const { mgr, posts } = makeManager();
  let r = await mgr.dispatch([makeFinding()]);
  assert.equal(r.sent.length, 1);
  assert.equal(posts.length, 1);

  r = await mgr.dispatch([makeFinding()]);
  assert.equal(r.sent.length, 0);
  assert.equal(r.suppressed.length, 1);
  assert.equal(posts.length, 1);
});

test('after cooldown elapses, the same finding re-sends', async () => {
  const h = makeManager({ cooldownSec: 300 });
  await h.mgr.dispatch([makeFinding()]);
  assert.equal(h.posts.length, 1);

  h.advance(301 * 1000);
  const r = await h.mgr.dispatch([makeFinding()]);
  assert.equal(r.sent.length, 1);
  assert.equal(h.posts.length, 2);
});

test('escalation warn -> crit fires immediately (ignores cooldown)', async () => {
  const { mgr, posts } = makeManager();
  await mgr.dispatch([makeFinding({ severity: 'warn' })]);
  assert.equal(posts.length, 1);

  // immediately, within cooldown, escalate
  const r = await mgr.dispatch([makeFinding({ severity: 'crit' })]);
  assert.equal(r.sent.length, 1);
  assert.equal(posts.length, 2);
  assert.match(posts[1].body.embeds[0].title, /ESCALATED/);
});

test('de-escalation crit -> warn does NOT re-alert within cooldown', async () => {
  const { mgr, posts } = makeManager();
  await mgr.dispatch([makeFinding({ severity: 'crit' })]);
  const r = await mgr.dispatch([makeFinding({ severity: 'warn' })]);
  assert.equal(r.suppressed.length, 1);
  assert.equal(posts.length, 1);
});

test('resolve fires after resolveAfterClears consecutive clears', async () => {
  const { mgr, posts } = makeManager({ resolveAfterClears: 2 });
  await mgr.dispatch([makeFinding()]); // active
  assert.equal(posts.length, 1);

  let r = await mgr.dispatch([]); // clear #1 -> no resolve yet
  assert.equal(r.resolved.length, 0);
  assert.equal(posts.length, 1);

  r = await mgr.dispatch([]); // clear #2 -> resolve
  assert.equal(r.resolved.length, 1);
  assert.equal(posts.length, 2);
  assert.match(posts[1].body.embeds[0].title, /RESOLVED/);
});

test('reappearing condition cancels the resolve countdown', async () => {
  const { mgr, posts } = makeManager({ resolveAfterClears: 2 });
  await mgr.dispatch([makeFinding()]);
  await mgr.dispatch([]); // clear #1
  await mgr.dispatch([makeFinding()]); // reappear -> countdown reset (suppressed, in cooldown)
  const r = await mgr.dispatch([]); // clear #1 again, not #2
  assert.equal(r.resolved.length, 0);
});

test('embed includes culprit attribution when present', async () => {
  const { mgr, posts } = makeManager();
  await mgr.dispatch([makeFinding({ culprit: { pid: 4242, comm: 'java', threads: 512 } })]);
  const fields = posts[0].body.embeds[0].fields;
  const culprit = fields.find((f) => f.name === 'Top consumer');
  assert.ok(culprit);
  assert.match(culprit.value, /java/);
  assert.match(culprit.value, /4242/);
  assert.match(culprit.value, /512/);
});

test('webhook failure falls back to stderr (alert never lost)', async () => {
  const config = buildConfig({ discord: { webhookUrl: 'https://x', retries: 1, backoffMs: 1 } });
  const stderr = [];
  const mgr = new AlertManager(config, {
    dryRun: false,
    now: () => TS,
    sleep: async () => {},
    stderr: (l) => stderr.push(l),
    fetchImpl: async () => { throw new Error('network down'); },
  });
  await mgr.dispatch([makeFinding()]);
  assert.equal(stderr.length, 1);
  assert.match(stderr[0], /webhook-failed/);
  assert.match(stderr[0], /network down/);
});

test('dry-run never POSTs; prints instead', async () => {
  const config = buildConfig();
  const stdout = [];
  let posted = false;
  const mgr = new AlertManager(config, {
    dryRun: true,
    now: () => TS,
    stdout: (l) => stdout.push(l),
    fetchImpl: async () => { posted = true; return { ok: true, status: 204 }; },
  });
  await mgr.dispatch([makeFinding()]);
  assert.equal(posted, false);
  assert.equal(stdout.length, 1);
  assert.match(stdout[0], /dry-run alert/);
});

test('snapshot() exposes active alerts without any secret', async () => {
  const { mgr } = makeManager();
  await mgr.dispatch([makeFinding()]);
  const snap = mgr.snapshot();
  assert.equal(snap.length, 1);
  const serialised = JSON.stringify(snap);
  assert.ok(!serialised.includes('webhook'));
  assert.ok(!serialised.includes('discord.com'));
});
