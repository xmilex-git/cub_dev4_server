// collectors/podman.js — enrichment data from the podman CLI.
//
// These calls fork a process, so they run ONLY on the slow/enrich tick (or when
// a finding needs culprit attribution), never on the fast detection tick. The
// `exec` function is injected so tests pass a fake; the default wraps
// child_process.execFile with a timeout. Read-only: only `ps`, `stats`, and
// `events` are ever invoked — never stop/kill/rm/pause/restart.

import { execFile } from 'node:child_process';

/**
 * Default exec: run `podman <args>` with a timeout and capture stdout.
 * Rejects on non-zero exit / timeout. Returns the trimmed stdout string.
 */
export function defaultExec(args, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('podman', args, { timeout: timeoutMs, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) {
        err.stderr = stderr;
        reject(err);
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Parse `podman ps --format "{{.ID}} {{.Names}}"` output into a Map of
 * id -> name. The cgroup uses the full 64-char ID while `podman ps` prints the
 * 12-char short ID; we index by both the short id and the short id as-is so the
 * caller can look up using a prefix.
 */
export function parseIdNameMap(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) {
      map.set(trimmed, trimmed);
      continue;
    }
    const id = trimmed.slice(0, spaceIdx);
    const name = trimmed.slice(spaceIdx + 1).trim();
    map.set(id, name);
  }
  return map;
}

/**
 * Build the container id -> name map. Returns an empty Map on failure so the
 * caller degrades to showing raw ids rather than crashing.
 */
export async function idNameMap(exec = defaultExec) {
  try {
    const out = await exec(['ps', '--all', '--format', '{{.ID}} {{.Names}}']);
    return parseIdNameMap(out);
  } catch {
    return new Map();
  }
}

/**
 * Parse `podman stats --no-stream --format "{{.ID}} {{.Name}} {{.PIDS}} {{.MemUsage}}"`.
 * Returns [{ id, name, pids, memUsage }]. Tolerant of fewer columns.
 */
export function parseStats(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cols = trimmed.split(/\s+/);
    const [id, name, pids, ...memParts] = cols;
    rows.push({
      id,
      name: name ?? null,
      pids: pids !== undefined ? Number.parseInt(pids, 10) : null,
      memUsage: memParts.length ? memParts.join(' ') : null,
    });
  }
  return rows;
}

export async function stats(exec = defaultExec) {
  try {
    const out = await exec(['stats', '--no-stream', '--format', '{{.ID}} {{.Name}} {{.PIDS}} {{.MemUsage}}']);
    return parseStats(out);
  } catch {
    return [];
  }
}

/**
 * Read recent OOM events. `podman events` streams unless bounded, so we pass an
 * explicit time window and --stream=false. Returns the raw lines (each a JSON
 * or text event) — callers only need a count/presence signal.
 */
export async function oomEvents(exec = defaultExec, { sinceSec = 60 } = {}) {
  try {
    const out = await exec([
      'events',
      '--filter',
      'event=oom',
      '--since',
      `${sinceSec}s`,
      '--stream=false',
    ]);
    return out ? out.split('\n').filter((l) => l.trim()) : [];
  } catch {
    return [];
  }
}
