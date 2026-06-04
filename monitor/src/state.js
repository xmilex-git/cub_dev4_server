// state.js — the widget contract. Write an aggregate-only state.json atomically
// (temp file in the same directory, then rename) so the Cockpit widget never
// sees a torn read. The file is world-readable (0644) and must NEVER contain the
// Discord webhook URL or any other secret.

import { mkdir, rename, writeFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const STATE_MODE = 0o644;

// Keys that must never appear anywhere in the serialised state. A defensive
// scrub guards against a future caller accidentally threading the config in.
const FORBIDDEN_KEYS = new Set(['webhookUrl', 'webhook', 'discord', 'secret', 'token']);

/**
 * Recursively strip forbidden keys from a plain object/array. Returns a new
 * structure; primitives pass through. This is belt-and-suspenders: callers
 * should already pass secret-free data.
 */
export function scrubSecrets(value) {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      out[k] = scrubSecrets(v);
    }
    return out;
  }
  return value;
}

/**
 * Atomically write the state object as JSON. Ensures the parent dir exists,
 * scrubs secrets, writes a temp file in the SAME directory (so rename is atomic
 * on the same filesystem), sets 0644, then renames over the target.
 *
 * @param {string} stateFile
 * @param {object} obj  aggregate state; a heartbeat ts is added if absent
 */
export async function writeStateAtomic(stateFile, obj) {
  const dir = dirname(stateFile);
  await mkdir(dir, { recursive: true });

  const safe = scrubSecrets(obj);
  if (safe.heartbeat === undefined) safe.heartbeat = Date.now();

  const json = `${JSON.stringify(safe, null, 2)}\n`;
  const tmp = join(dir, `.state.${process.pid}.${Date.now()}.tmp`);

  await writeFile(tmp, json, { encoding: 'utf8', mode: STATE_MODE });
  await chmod(tmp, STATE_MODE);
  await rename(tmp, stateFile);
}

/**
 * Build the aggregate state document from a tick's data. Pure: no I/O, no
 * secrets. Shape is the widget's contract.
 *
 * @param {object} input
 * @param {number} input.ts
 * @param {object} input.host  { memAvailable, memTotal, psiSomeAvg10, ... }
 * @param {Array} input.containers  [{ id, name, current, max, ratio|null, severity }]
 * @param {object|null} input.earlyoom  { effectiveMemKillBytes }
 * @param {Array} input.activeAlerts
 * @param {object} input.config  to surface fastTickSec for staleness math
 */
export function buildState({ ts, host, containers, earlyoom, activeAlerts, config }) {
  return {
    schemaVersion: 1,
    ts,
    heartbeat: ts,
    fastTickSec: config.fastTickSec,
    host: {
      memAvailable: host?.memAvailable ?? null,
      memTotal: host?.memTotal ?? null,
      swapTotal: host?.swapTotal ?? null,
      swapFree: host?.swapFree ?? null,
      psiSomeAvg10: host?.psiSomeAvg10 ?? null,
      psiFullAvg10: host?.psiFullAvg10 ?? null,
    },
    earlyoom: earlyoom
      ? { effectiveMemKillBytes: earlyoom.effectiveMemKillBytes ?? null }
      : null,
    containers: (containers ?? []).map((c) => ({
      id: c.id,
      name: c.name ?? null,
      current: c.current,
      max: c.max, // null means unlimited ("max") -> exempt
      ratio: c.max === null ? null : c.ratio ?? (c.max ? c.current / c.max : null),
      exempt: c.max === null,
      severity: c.severity ?? 'ok',
    })),
    activeAlerts: activeAlerts ?? [],
  };
}
