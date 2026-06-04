import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildConfig } from '../src/config.js';
import { RateTracker } from '../src/rateTracker.js';
import { evaluate, evaluatePidmax, evaluateMemory } from '../src/rules.js';

const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;
const KIB = 1024;
const TS = 1_700_000_000_000;

function cfg(override = {}) {
  return buildConfig(override);
}

function findOne(findings, pred) {
  const matches = findings.filter(pred);
  assert.equal(matches.length, 1, `expected exactly one matching finding, got ${matches.length}`);
  return matches[0];
}

// --- pidmax boundaries (2048 cap: warn 1638, crit 1843) -------------------

test('pidmax: 1637/2048 is below warn -> no finding', () => {
  const rt = new RateTracker();
  const f = evaluatePidmax([{ id: 'c', current: 1637, max: 2048 }], cfg(), rt, TS);
  assert.equal(f.length, 0);
});

test('pidmax: 1638/2048 hits warn exactly', () => {
  const rt = new RateTracker();
  const f = evaluatePidmax([{ id: 'c', current: 1638, max: 2048 }], cfg(), rt, TS);
  const warn = findOne(f, (x) => x.kind === 'pidmax');
  assert.equal(warn.severity, 'warn');
  assert.equal(warn.detail.current, 1638);
});

test('pidmax: 1842/2048 is warn (just under crit)', () => {
  const rt = new RateTracker();
  const f = evaluatePidmax([{ id: 'c', current: 1842, max: 2048 }], cfg(), rt, TS);
  assert.equal(findOne(f, (x) => x.kind === 'pidmax').severity, 'warn');
});

test('pidmax: 1843/2048 hits crit exactly', () => {
  const rt = new RateTracker();
  const f = evaluatePidmax([{ id: 'c', current: 1843, max: 2048 }], cfg(), rt, TS);
  assert.equal(findOne(f, (x) => x.kind === 'pidmax').severity, 'crit');
});

test('pidmax: unlimited ("max" -> null) is EXEMPT, never alerts', () => {
  const rt = new RateTracker();
  const f = evaluatePidmax([{ id: 'c', current: 999999, max: null }], cfg(), rt, TS);
  assert.equal(f.length, 0);
});

// --- rate-of-approach -----------------------------------------------------

test('rate: half-full and projected within 3 ticks -> warn', () => {
  const rt = new RateTracker();
  // ratio 0.6 (1228/2048), delta 300/tick -> remaining 820 -> ~2.7 ticks (<=3)
  rt.record('c', 928, TS - 5000);
  rt.record('c', 1228, TS);
  const f = evaluatePidmax([{ id: 'c', current: 1228, max: 2048 }], cfg(), rt, TS);
  const rate = findOne(f, (x) => x.kind === 'rate');
  assert.equal(rate.severity, 'warn');
  assert.ok(rate.detail.ticksToMax <= 3);
});

test('rate: below minRatio (0.5) does not fire even if climbing fast', () => {
  const rt = new RateTracker();
  rt.record('c', 600, TS - 5000);
  rt.record('c', 900, TS); // ratio 0.44
  const f = evaluatePidmax([{ id: 'c', current: 900, max: 2048 }], cfg(), rt, TS);
  assert.equal(f.length, 0);
});

test('rate: slow climb (too many ticks away) does not fire', () => {
  const rt = new RateTracker();
  rt.record('c', 1098, TS - 5000);
  rt.record('c', 1108, TS); // ratio 0.54, delta 10 -> 94 ticks away
  const f = evaluatePidmax([{ id: 'c', current: 1108, max: 2048 }], cfg(), rt, TS);
  assert.equal(f.length, 0);
});

test('rate: does not double-fire when already over warn (pidmax wins)', () => {
  const rt = new RateTracker();
  rt.record('c', 1500, TS - 5000);
  rt.record('c', 1700, TS); // ratio 0.83 -> pidmax warn, not rate
  const f = evaluatePidmax([{ id: 'c', current: 1700, max: 2048 }], cfg(), rt, TS);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'pidmax');
});

// --- memory: MemAvailable backstops --------------------------------------

function host(memAvailBytes, psiSomeAvg10 = 0) {
  return {
    meminfo: { MemAvailable: memAvailBytes, MemTotal: 197307904 * KIB },
    pressure: { some: { avg10: psiSomeAvg10 }, full: { avg10: 0 } },
  };
}

test('mem: MemAvailable 11 GiB -> warn (<=12 GiB)', () => {
  const f = evaluateMemory(host(11 * GiB), null, cfg(), TS);
  const warn = findOne(f, (x) => x.detail.reason === 'memAvailable');
  assert.equal(warn.severity, 'warn');
});

test('mem: MemAvailable 4 GiB -> crit (<=5 GiB)', () => {
  const f = evaluateMemory(host(4 * GiB), null, cfg(), TS);
  const crit = findOne(f, (x) => x.detail.reason === 'memAvailable');
  assert.equal(crit.severity, 'crit');
});

test('mem: MemAvailable 128 GiB -> no avail finding', () => {
  const f = evaluateMemory(host(128 * GiB), null, cfg(), TS);
  assert.equal(f.filter((x) => x.detail.reason === 'memAvailable').length, 0);
});

// --- memory: PSI ----------------------------------------------------------

test('mem: PSI some avg10 15% -> warn (>=10)', () => {
  const f = evaluateMemory(host(128 * GiB, 15), null, cfg(), TS);
  const psi = findOne(f, (x) => x.detail.reason === 'psi');
  assert.equal(psi.severity, 'warn');
});

test('mem: PSI some avg10 35% -> crit (>=30)', () => {
  const f = evaluateMemory(host(128 * GiB, 35), null, cfg(), TS);
  const psi = findOne(f, (x) => x.detail.reason === 'psi');
  assert.equal(psi.severity, 'crit');
});

// --- memory: point-of-no-return ------------------------------------------

test('mem: MemAvailable at PONR -> single crit, dominates other mem rules', () => {
  // earlyoom effective kill ~400 MiB; PONR = +512 MiB buffer = ~912 MiB.
  const earlyoom = { effectiveMemKillBytes: 409600 * KIB }; // 400 MiB
  const ponrLine = 409600 * KIB + 512 * MiB; // ~912 MiB
  const f = evaluateMemory(host(ponrLine - 1, 50), earlyoom, cfg(), TS);
  // PONR returns early: exactly one finding, crit, reason point-of-no-return.
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'crit');
  assert.equal(f[0].detail.reason, 'point-of-no-return');
});

test('mem: above PONR but low avail -> normal crit, not PONR', () => {
  const earlyoom = { effectiveMemKillBytes: 409600 * KIB };
  const f = evaluateMemory(host(4 * GiB), earlyoom, cfg(), TS);
  assert.equal(f.some((x) => x.detail.reason === 'point-of-no-return'), false);
  assert.ok(f.some((x) => x.detail.reason === 'memAvailable' && x.severity === 'crit'));
});

test('mem: missing PSI (null pressure) still evaluates avail', () => {
  const h = { meminfo: { MemAvailable: 4 * GiB, MemTotal: 100 * GiB }, pressure: null };
  const f = evaluateMemory(h, null, cfg(), TS);
  assert.ok(f.some((x) => x.detail.reason === 'memAvailable'));
});

// --- top-level evaluate ---------------------------------------------------

test('evaluate combines container pidmax + host memory findings', () => {
  const rt = new RateTracker();
  const snapshot = {
    host: host(11 * GiB, 0),
    containers: [{ id: 'c1', current: 1900, max: 2048 }],
    earlyoom: null,
  };
  const f = evaluate(snapshot, cfg(), rt, TS);
  assert.ok(f.some((x) => x.kind === 'pidmax' && x.severity === 'crit'));
  assert.ok(f.some((x) => x.kind === 'mem' && x.severity === 'warn'));
});
