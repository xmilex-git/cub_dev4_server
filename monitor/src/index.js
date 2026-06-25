#!/usr/bin/env node
// index.js — podman-watchdog entry point.
//
// Two-tier cadence (so the monitor never becomes the resource consumer it
// watches):
//   fast tick (~5s): fork-free pseudo-file reads — meminfo, pressure, per-
//     container pids — and risk evaluation.
//   slow/enrich tick (~30s, or on a new finding): podman ps id->name refresh,
//     podman stats, OOM events, earlyoom reread, and top-task culprit
//     attribution for any active finding.
//
// Each fast tick writes state.json (atomic) and appends one JSONL sample.
// systemd integration: sd_notify READY=1 once, then WATCHDOG=1 heartbeats via
// the NOTIFY_SOCKET datagram (skipped silently if unset). Graceful SIGTERM.
//
// NO-KILL INVARIANT: this process is strictly read-only + alert + log. It never
// calls process.kill, never spawns kill/podman stop|kill|rm|pause|restart, and
// never writes to any cgroup/sysfs control file. See test/no-kill.test.js.

import process from 'node:process';
import { execFile } from 'node:child_process';

import { loadConfig } from './config.js';
import { readMeminfo, readPressure, readProcessInfo } from './collectors/proc.js';
import { collectContainerPids, readContainerProcs } from './collectors/cgroup.js';
import { collectContainerMem } from './collectors/cgroupMem.js';
import { idNameMap, oomEvents, defaultExec } from './collectors/podman.js';
import { loadEarlyoom } from './collectors/earlyoom.js';
import { RateTracker } from './rateTracker.js';
import { evaluate } from './rules.js';
import { AlertManager } from './alert.js';
import { appendSample, pruneOld } from './logstore.js';
import { writeStateAtomic, buildState } from './state.js';

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const args = { config: '/etc/podman-watchdog/config.json', dryRun: false, once: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--config') {
      args.config = argv[i + 1];
      i += 1;
    } else if (a.startsWith('--config=')) {
      args.config = a.slice('--config='.length);
    } else if (a === '--dry-run') {
      args.dryRun = true;
    } else if (a === '--once') {
      args.once = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    }
  }
  return args;
}

const HELP = `podman-watchdog — read-only Podman host risk monitor (no-kill)

Usage: node src/index.js [options]

  --config <path>   Config file (default /etc/podman-watchdog/config.json)
  --dry-run         Do not POST webhooks; do not write state/log to system
                    paths. Print alerts and a state preview to stdout instead.
  --once            Run a single evaluation tick, then exit.
  -h, --help        Show this help.
`;

// ---------------------------------------------------------------------------
// sd_notify
// ---------------------------------------------------------------------------
//
// systemd's NOTIFY_SOCKET is an AF_UNIX SOCK_DGRAM socket. Node's node:dgram
// only supports udp4/udp6 (no AF_UNIX datagram), so there is no built-in way to
// write to it from pure Node without a native addon. The zero-dependency path
// on a systemd host is the `systemd-notify` helper, which is always present
// where a NOTIFY_SOCKET exists. We invoke it read-only (no kill semantics) and
// keep it strictly best-effort: any failure is swallowed so liveness reporting
// can never break monitoring. If NOTIFY_SOCKET is unset (e.g. running under
// --once or by hand), notifications are skipped silently.

function makeNotifier() {
  const enabled = Boolean(process.env.NOTIFY_SOCKET);
  return {
    notify(state) {
      if (!enabled) return;
      try {
        execFile('systemd-notify', [state], { timeout: 2000 }, () => {});
      } catch {
        // best-effort; never let liveness reporting break the watchdog
      }
    },
    close() {},
  };
}

// ---------------------------------------------------------------------------
// collection
// ---------------------------------------------------------------------------

/**
 * Fast tick: fork-free reads + evaluation. Returns the snapshot, findings, and
 * a normalised container list for state/logging.
 */
async function fastCollect(config, rateTracker, idNames, ts) {
  const { procRoot, cgroupRoot, memCgroupRoot } = config.paths;

  const [meminfo, pressure, rawContainers, memById] = await Promise.all([
    readMeminfo(procRoot),
    readPressure(procRoot, 'memory'),
    collectContainerPids(cgroupRoot),
    // Per-container memory is only needed for the container-memory rule; skip the
    // extra (fork-free) reads when that rule is off so the default tick is
    // unchanged.
    config.memory.alertContainer ? collectContainerMem(memCgroupRoot) : Promise.resolve(new Map()),
  ]);

  const containers = rawContainers.map((c) => {
    rateTracker.record(c.id, c.current, ts);
    const mem = memById.get(c.id) ?? null;
    return {
      ...c,
      name: lookupName(idNames, c.id),
      memBytes: mem ? mem.workingSet : null,
      memLimitBytes: mem ? mem.limit : null,
    };
  });
  rateTracker.retainOnly(containers.map((c) => c.id));

  const totalMem = meminfo.MemTotal ?? null;
  const earlyoom = config._earlyoomCache ?? null;

  const snapshot = {
    host: { meminfo, pressure },
    containers,
    earlyoom,
    totalMem,
  };

  const findings = evaluate(snapshot, config, rateTracker, ts);
  return { snapshot, findings, containers };
}

/**
 * Look up a friendly name from the id->name map, tolerating the cgroup's full
 * 64-char id vs podman's 12-char short id.
 */
function lookupName(idNames, id) {
  if (!idNames || idNames.size === 0) return null;
  if (idNames.has(id)) return idNames.get(id);
  const short = id.slice(0, 12);
  if (idNames.has(short)) return idNames.get(short);
  for (const [mapId, name] of idNames) {
    if (id.startsWith(mapId) || mapId.startsWith(short)) return name;
  }
  return null;
}

/**
 * Enrich a finding with the top consumer in its cgroup (highest thread count).
 * Best-effort and ENOENT-tolerant; leaves culprit null on failure.
 */
async function attributeCulprit(config, finding, rawContainers) {
  if (finding.entity === 'host') return finding;
  const container = rawContainers.find((c) => c.id === finding.entity);
  if (!container) return finding;

  const pids = await readContainerProcs(container.dir);
  let best = null;
  for (const pid of pids) {
    const info = await readProcessInfo(config.paths.procRoot, pid);
    if (!info) continue;
    if (!best || (info.threads ?? 0) > (best.threads ?? 0)) best = info;
  }
  if (best) finding.culprit = best;
  return finding;
}

// ---------------------------------------------------------------------------
// state + log emission
// ---------------------------------------------------------------------------

function severityFor(findings, entity) {
  let sev = 'ok';
  for (const f of findings) {
    if (f.entity !== entity) continue;
    if (f.severity === 'crit') return 'crit';
    if (f.severity === 'warn') sev = 'warn';
  }
  return sev;
}

function hostSummary(snapshot) {
  const { meminfo, pressure } = snapshot.host;
  return {
    memAvailable: meminfo?.MemAvailable ?? null,
    memTotal: meminfo?.MemTotal ?? null,
    swapTotal: meminfo?.SwapTotal ?? null,
    swapFree: meminfo?.SwapFree ?? null,
    psiSomeAvg10: pressure?.some?.avg10 ?? null,
    psiFullAvg10: pressure?.full?.avg10 ?? null,
  };
}

async function emitOutputs(config, args, alertMgr, ts, snapshot, findings, containers) {
  const host = hostSummary(snapshot);
  const stateContainers = containers.map((c) => ({
    id: c.id,
    name: c.name,
    current: c.current,
    max: c.max,
    ratio: c.max === null ? null : c.current / c.max,
    severity: severityFor(findings, c.id),
  }));

  const state = buildState({
    ts,
    host,
    containers: stateContainers,
    earlyoom: snapshot.earlyoom,
    activeAlerts: alertMgr.snapshot(),
    config,
  });

  const sample = {
    ts,
    host,
    earlyoom: snapshot.earlyoom ? { effectiveMemKillBytes: snapshot.earlyoom.effectiveMemKillBytes } : null,
    containers: stateContainers,
    findings: findings.map((f) => ({ entity: f.entity, kind: f.kind, severity: f.severity, ratio: f.ratio, msg: f.msg })),
  };

  if (args.dryRun) {
    process.stdout.write(`[dry-run state] ${JSON.stringify(state)}\n`);
    return;
  }

  await writeStateAtomic(config.paths.stateFile, state);
  await appendSample(config.paths.logDir, sample);
}

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------

export async function runOnce(config, args, ctx) {
  const ts = Date.now();
  const { rateTracker, alertMgr, exec } = ctx;

  // Refresh enrich data on the slow cadence or first run.
  const dueSlow = ctx.lastSlowMs === 0 || ts - ctx.lastSlowMs >= config.slowTickSec * 1000;
  if (dueSlow || args.once) {
    ctx.idNames = await idNameMap(exec);
    ctx.lastSlowMs = ts;
  }

  // earlyoom reread on its own cadence.
  const dueEarlyoom = ctx.lastEarlyoomMs === 0 || ts - ctx.lastEarlyoomMs >= config.earlyoomRereadSec * 1000;
  if (dueEarlyoom || args.once) {
    const meminfoForTotal = await readMeminfo(config.paths.procRoot).catch(() => ({}));
    config._earlyoomCache = await loadEarlyoom(config.paths.earlyoomDefaults, meminfoForTotal.MemTotal).catch(() => null);
    ctx.lastEarlyoomMs = ts;
  }

  const { snapshot, findings } = await fastCollect(config, rateTracker, ctx.idNames, ts);
  // Keep the raw container list (with dirs) for culprit attribution.
  const rawContainers = snapshot.containers;

  // Enrich findings with culprit attribution (forks only when there are
  // findings, i.e. only when something is wrong).
  if (findings.length > 0) {
    await Promise.all(findings.map((f) => attributeCulprit(config, f, rawContainers)));
    // OOM events are context for a memory finding.
    const hasMem = findings.some((f) => f.kind === 'mem');
    if (hasMem) {
      const events = await oomEvents(exec).catch(() => []);
      if (events.length) {
        for (const f of findings) {
          if (f.kind === 'mem') f.detail.oomEvents = events.length;
        }
      }
    }
  }

  await alertMgr.dispatch(findings);
  await emitOutputs(config, args, alertMgr, ts, snapshot, findings, rawContainers);

  // Prune old logs on the slow cadence.
  if ((dueSlow || args.once) && !args.dryRun) {
    await pruneOld(config.paths.logDir, config.logRetentionHours).catch(() => []);
  }

  return findings;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  let config;
  try {
    config = await loadConfig(args.config);
  } catch (err) {
    process.stderr.write(`[fatal] cannot load config ${args.config}: ${err.message}\n`);
    return 1;
  }

  const rateTracker = new RateTracker();
  const alertMgr = new AlertManager(config, { dryRun: args.dryRun });
  const ctx = {
    rateTracker,
    alertMgr,
    exec: defaultExec,
    idNames: new Map(),
    lastSlowMs: 0,
    lastEarlyoomMs: 0,
  };

  const notifier = makeNotifier();

  if (args.once) {
    await runOnce(config, args, ctx);
    notifier.close();
    return 0;
  }

  notifier.notify('READY=1');

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  const fastMs = config.fastTickSec * 1000;
  while (!stopping) {
    const started = Date.now();
    try {
      await runOnce(config, args, ctx);
      notifier.notify('WATCHDOG=1');
    } catch (err) {
      // A tick failure must not kill the loop; log and continue so a transient
      // read error does not silence the monitor.
      process.stderr.write(`[tick-error] ${err.stack ?? err.message}\n`);
    }
    const elapsed = Date.now() - started;
    const wait = Math.max(0, fastMs - elapsed);
    await sleepInterruptible(wait, () => stopping);
  }

  notifier.notify('STOPPING=1');
  notifier.close();
  process.stderr.write('[shutdown] SIGTERM received, exiting cleanly\n');
  return 0;
}

/**
 * Sleep up to `ms`, waking early in small slices if `shouldStop()` flips true so
 * SIGTERM is honoured promptly without an extra dependency.
 */
async function sleepInterruptible(ms, shouldStop) {
  const slice = 200;
  let remaining = ms;
  while (remaining > 0) {
    if (shouldStop()) return;
    const chunk = Math.min(slice, remaining);
    await new Promise((r) => setTimeout(r, chunk));
    remaining -= chunk;
  }
}

// Run only when invoked directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[fatal] ${err.stack ?? err.message}\n`);
      process.exit(1);
    },
  );
}
