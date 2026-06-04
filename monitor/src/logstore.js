// logstore.js — daily-bucketed JSONL metric logging with age-based pruning.
//
// Design (from the plan): never prune a single file in-place (a crash mid-prune
// could corrupt it). Instead append to per-day files `metrics-YYYYMMDD.jsonl`
// and delete whole files older than the retention window. A log-write failure
// (e.g. disk full) must degrade logging only — warn to stderr, do not throw, so
// the watchdog keeps alerting.

import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_RE = /^metrics-(\d{8})\.jsonl$/;

/**
 * UTC YYYYMMDD for a timestamp (ms). UTC keeps file boundaries deterministic
 * regardless of host TZ and matches the timestamp stored in each record.
 */
export function dayStamp(ts = Date.now()) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function metricsFileName(ts = Date.now()) {
  return `metrics-${dayStamp(ts)}.jsonl`;
}

/**
 * Append one sample as a JSON line to today's metrics file. Returns true on
 * success, false if logging degraded (already warned to stderr). Never throws.
 *
 * @param {string} logDir
 * @param {object} sample  must contain a `ts` (ms); a serialisable record
 * @param {(line:string)=>void} [stderr]
 */
export async function appendSample(logDir, sample, stderr = (l) => process.stderr.write(`${l}\n`)) {
  try {
    await mkdir(logDir, { recursive: true });
    const file = join(logDir, metricsFileName(sample.ts ?? Date.now()));
    await appendFile(file, `${JSON.stringify(sample)}\n`, 'utf8');
    return true;
  } catch (err) {
    // Disk full / permissions: degrade logging, keep the watchdog alive.
    stderr(`[logstore:append-failed] ${err.code ?? ''} ${err.message}`);
    return false;
  }
}

/**
 * Delete metrics-*.jsonl files whose day is older than `retentionHours`.
 * Returns the list of removed file names. Failures to read the dir or remove a
 * file are warned and skipped, never thrown.
 *
 * @param {string} logDir
 * @param {number} retentionHours
 * @param {object} [opts]
 * @param {number} [opts.now]  ms, for tests
 * @param {(line:string)=>void} [opts.stderr]
 */
export async function pruneOld(logDir, retentionHours, opts = {}) {
  const now = opts.now ?? Date.now();
  const stderr = opts.stderr ?? ((l) => process.stderr.write(`${l}\n`));
  const cutoff = now - retentionHours * 60 * 60 * 1000;
  const removed = [];

  let entries;
  try {
    entries = await readdir(logDir);
  } catch (err) {
    if (err.code === 'ENOENT') return removed; // nothing logged yet
    stderr(`[logstore:prune-readdir-failed] ${err.code ?? ''} ${err.message}`);
    return removed;
  }

  for (const name of entries) {
    const m = name.match(FILE_RE);
    if (!m) continue;
    const day = m[1];
    // Treat the file as covering up to the END of its UTC day; only prune once
    // that whole day is older than the cutoff. mtime is a secondary guard.
    const dayEndMs = Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(4, 6)) - 1,
      Number(day.slice(6, 8)),
      23, 59, 59, 999,
    );
    if (dayEndMs >= cutoff) continue;

    const full = join(logDir, name);
    try {
      const info = await stat(full);
      if (info.mtimeMs >= cutoff) continue; // recently touched; keep
      await unlink(full);
      removed.push(name);
    } catch (err) {
      stderr(`[logstore:prune-unlink-failed] ${name}: ${err.code ?? ''} ${err.message}`);
    }
  }

  return removed;
}
