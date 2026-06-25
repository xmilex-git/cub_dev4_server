// collectors/cgroupMem.js — read per-container memory usage from cgroup v1.
//
// Target layout (rootful podman, cgroup v1 memory controller):
//   /sys/fs/cgroup/memory/libpod_parent/libpod-<ID>/memory.usage_in_bytes
//   /sys/fs/cgroup/memory/libpod_parent/libpod-<ID>/memory.stat (total_inactive_file)
//   /sys/fs/cgroup/memory/libpod_parent/libpod-<ID>/memory.limit_in_bytes
//
// "Working set" = usage_in_bytes - total_inactive_file (the reclaimable page
// cache). This matches what `podman stats` reports as MEM USAGE, so a container
// merely holding a lot of evictable file cache does not trip a false alarm.
//
// `limit` = memory.limit_in_bytes. When a container has no memory limit, cgroup
// v1 reports a huge sentinel (~9.22e18, i.e. > Number.MAX_SAFE_INTEGER); the
// rules layer treats such a value (and any limit >= host RAM) as "no limit".
//
// `memCgroupRoot` is injectable so tests run against fixture directories. All
// reads tolerate ENOENT: a container can stop or be created mid-scan (a race),
// and that must skip the container, never crash the watchdog. Strictly read-only.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LIBPOD_PREFIX = 'libpod-';

/**
 * List per-container memory cgroups under `memCgroupRoot`. Returns an array of
 * { id, dir }. Returns [] if the parent cgroup itself is absent (memory
 * controller not mounted there / different layout) rather than throwing.
 */
export async function listMemContainers(memCgroupRoot) {
  let entries;
  try {
    entries = await readdir(memCgroupRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(LIBPOD_PREFIX)) continue;
    const id = entry.name.slice(LIBPOD_PREFIX.length).replace(/\.scope$/, '');
    out.push({ id, dir: join(memCgroupRoot, entry.name) });
  }
  return out;
}

/**
 * Parse the `total_inactive_file` counter (bytes) from a memory.stat body.
 * Returns 0 when the field is absent so the working set degrades to raw usage.
 */
export function parseInactiveFile(text) {
  const m = text.match(/^total_inactive_file\s+(\d+)/m);
  return m ? Number(m[1]) : 0;
}

/**
 * Read the configured memory limit (bytes) for one container memory cgroup.
 * Returns null when the file is absent (ENOENT race) or unparseable; the rules
 * layer treats a null/huge limit as "no binding limit".
 */
export async function readMemLimit(dir) {
  let raw;
  try {
    raw = await readFile(join(dir, 'memory.limit_in_bytes'), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const limit = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(limit) ? limit : null;
}

/**
 * Read the working-set bytes and memory limit for one container memory cgroup.
 *
 * @returns {{ usage:number, workingSet:number, limit:number|null }|null}
 *   Returns null if the directory/files vanished (ENOENT race) so the caller
 *   skips this container.
 */
export async function readContainerMem(dir) {
  let usageRaw;
  let statRaw;
  try {
    [usageRaw, statRaw] = await Promise.all([
      readFile(join(dir, 'memory.usage_in_bytes'), 'utf8'),
      readFile(join(dir, 'memory.stat'), 'utf8'),
    ]);
  } catch (err) {
    // Container vanished (stopped / removed) between listing and reading, or is
    // mid-creation. Documented race: skip, non-fatal.
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  const usage = Number.parseInt(usageRaw.trim(), 10);
  if (!Number.isFinite(usage)) return null;
  const inactiveFile = parseInactiveFile(statRaw);
  const workingSet = Math.max(0, usage - inactiveFile);
  const limit = await readMemLimit(dir);
  return { usage, workingSet, limit };
}

/**
 * List all container memory cgroups and read each working set in one call.
 * Returns a Map of id -> { usage, workingSet, limit }. Containers that vanished
 * mid-scan are dropped.
 */
export async function collectContainerMem(memCgroupRoot) {
  const containers = await listMemContainers(memCgroupRoot);
  const map = new Map();
  await Promise.all(
    containers.map(async (c) => {
      const mem = await readContainerMem(c.dir);
      if (mem !== null) map.set(c.id, mem);
    }),
  );
  return map;
}
