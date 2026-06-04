// collectors/cgroup.js — read per-container pids accounting from cgroup v1.
//
// Target layout (rootful podman 4.9.4, cgroup v1):
//   /sys/fs/cgroup/pids/libpod_parent/libpod-<ID>/pids.current
//   /sys/fs/cgroup/pids/libpod_parent/libpod-<ID>/pids.max   ("max" = unlimited)
//
// `cgroupRoot` is injectable so tests run against fixture directories. All reads
// tolerate ENOENT: a container can stop or be created mid-scan (a race), and
// that must skip the container, never crash the watchdog.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LIBPOD_PREFIX = 'libpod-';

/**
 * List per-container pids cgroups under `cgroupRoot`. Returns an array of
 * { id, dir, currentPath, maxPath }. Returns [] if the parent cgroup itself is
 * absent (podman not running / different layout) rather than throwing.
 */
export async function listContainers(cgroupRoot) {
  let entries;
  try {
    entries = await readdir(cgroupRoot, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const containers = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(LIBPOD_PREFIX)) continue;
    const id = entry.name.slice(LIBPOD_PREFIX.length).replace(/\.scope$/, '');
    const dir = join(cgroupRoot, entry.name);
    containers.push({
      id,
      dir,
      currentPath: join(dir, 'pids.current'),
      maxPath: join(dir, 'pids.max'),
    });
  }
  return containers;
}

/**
 * Read pids.current and pids.max for one container cgroup directory.
 *
 * @returns {{ current:number, max:number|null }|null}
 *   max === null means the literal "max" (unlimited) -> EXEMPT from pidmax
 *   alerting. Returns null if the directory/files vanished (ENOENT race) so the
 *   caller skips this container.
 */
export async function readContainerPids(dir) {
  let currentRaw;
  let maxRaw;
  try {
    [currentRaw, maxRaw] = await Promise.all([
      readFile(join(dir, 'pids.current'), 'utf8'),
      readFile(join(dir, 'pids.max'), 'utf8'),
    ]);
  } catch (err) {
    // Container vanished (stopped / removed) between listing and reading, or is
    // mid-creation. Documented race in the plan: log-and-skip, non-fatal.
    if (err.code === 'ENOENT') return null;
    throw err;
  }

  const current = Number.parseInt(currentRaw.trim(), 10);
  const maxTrimmed = maxRaw.trim();
  const max = maxTrimmed === 'max' ? null : Number.parseInt(maxTrimmed, 10);

  if (!Number.isFinite(current)) return null;
  if (max !== null && !Number.isFinite(max)) return null;

  return { current, max };
}

/**
 * Read the PIDs in a container cgroup (cgroup.procs) for culprit attribution.
 * ENOENT-tolerant. Returns an array of numeric PIDs (possibly empty).
 */
export async function readContainerProcs(dir) {
  try {
    const text = await readFile(join(dir, 'cgroup.procs'), 'utf8');
    return text
      .split('\n')
      .map((line) => Number.parseInt(line.trim(), 10))
      .filter((pid) => Number.isFinite(pid));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * Convenience: list all containers and read their pids in one call. Containers
 * that vanished mid-scan are dropped. Returns
 * [{ id, dir, current, max }] where max is null for unlimited cgroups.
 */
export async function collectContainerPids(cgroupRoot) {
  const containers = await listContainers(cgroupRoot);
  const results = await Promise.all(
    containers.map(async (c) => {
      const pids = await readContainerPids(c.dir);
      if (pids === null) return null;
      return { id: c.id, dir: c.dir, current: pids.current, max: pids.max };
    }),
  );
  return results.filter((r) => r !== null);
}
