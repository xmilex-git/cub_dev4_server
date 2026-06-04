// collectors/proc.js — read & parse host pseudo-files under /proc.
// Every function takes `procRoot` so tests run against fixture directories on
// macOS instead of a real /proc. Read-only.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const KIB = 1024;

/**
 * Parse /proc/meminfo text into a map of field -> bytes. meminfo reports most
 * fields in kB; we normalise to bytes. Fields without a unit (e.g. HugePages
 * counts) are kept as raw integers.
 *
 * @returns {{ MemTotal:number, MemFree:number, MemAvailable:number,
 *             SwapTotal:number, SwapFree:number, [k:string]:number }}
 */
export function parseMeminfo(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^(\w+):\s+(\d+)(?:\s+(\w+))?/);
    if (!match) continue;
    const [, key, value, unit] = match;
    const num = Number(value);
    out[key] = unit && unit.toLowerCase() === 'kb' ? num * KIB : num;
  }
  return out;
}

export async function readMeminfo(procRoot) {
  const text = await readFile(join(procRoot, 'meminfo'), 'utf8');
  return parseMeminfo(text);
}

/**
 * Parse a single /proc/pressure/<resource> file. Each file has up to two lines:
 *   some avg10=0.00 avg60=0.00 avg300=0.00 total=12345
 *   full avg10=0.00 avg60=0.00 avg300=0.00 total=6789
 * Returns { some: {avg10,avg60,avg300,total}, full: {...} }. A missing "full"
 * line (valid for the cpu resource) yields `full: null`.
 */
export function parsePressure(text) {
  const result = { some: null, full: null };
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const kind = trimmed.startsWith('some') ? 'some' : trimmed.startsWith('full') ? 'full' : null;
    if (!kind) continue;
    const metrics = {};
    for (const field of ['avg10', 'avg60', 'avg300', 'total']) {
      const m = trimmed.match(new RegExp(`${field}=([\\d.]+)`));
      metrics[field] = m ? Number(m[1]) : null;
    }
    result[kind] = metrics;
  }
  return result;
}

/**
 * Read /proc/pressure/<resource>. Defaults to "memory". Returns null if PSI is
 * unavailable (ENOENT) — older/CONFIG_PSI-off kernels — so the caller can fall
 * back to MemAvailable alone instead of crashing.
 */
export async function readPressure(procRoot, resource = 'memory') {
  try {
    const text = await readFile(join(procRoot, 'pressure', resource), 'utf8');
    return parsePressure(text);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Parse the aggregate "cpu" line of /proc/stat into named jiffy counters and a
 * total. Used by the enrich tick for context; not a primary alert trigger.
 */
export function parseStat(text) {
  const fieldNames = ['user', 'nice', 'system', 'idle', 'iowait', 'irq', 'softirq', 'steal', 'guest', 'guestNice'];
  for (const line of text.split('\n')) {
    if (!line.startsWith('cpu ')) continue;
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    const cpu = {};
    let total = 0;
    for (let i = 0; i < fieldNames.length; i += 1) {
      const value = Number.isFinite(parts[i]) ? parts[i] : 0;
      cpu[fieldNames[i]] = value;
      total += value;
    }
    cpu.total = total;
    return cpu;
  }
  return null;
}

export async function readStat(procRoot) {
  const text = await readFile(join(procRoot, 'stat'), 'utf8');
  return parseStat(text);
}

/**
 * Read a process's comm + thread count for culprit attribution on the enrich
 * tick. ENOENT-tolerant (the process may exit between listing and reading).
 * Returns null if the process vanished.
 */
export async function readProcessInfo(procRoot, pid) {
  try {
    const [comm, status] = await Promise.all([
      readFile(join(procRoot, String(pid), 'comm'), 'utf8'),
      readFile(join(procRoot, String(pid), 'status'), 'utf8'),
    ]);
    const threadsMatch = status.match(/^Threads:\s+(\d+)/m);
    return {
      pid: Number(pid),
      comm: comm.trim(),
      threads: threadsMatch ? Number(threadsMatch[1]) : null,
    };
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
