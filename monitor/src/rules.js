// rules.js — the pure risk-evaluation core. Given a snapshot of host + container
// metrics and the config, produce a flat array of findings. No I/O, no clock
// access beyond the `ts` passed in: trivially unit-testable.
//
// Finding shape:
//   {
//     entity:   string,                 // container id or 'host'
//     name:     string|null,            // friendly name when known
//     kind:     'pidmax'|'rate'|'mem',
//     severity: 'warn'|'crit',
//     ratio:    number|null,            // pids ratio or PSI/avail context value
//     detail:   object,                 // kind-specific numbers
//     culprit:  object|null,            // filled later on enrich, not here
//     msg:      string,
//     ts:       number,
//   }

import { projectTicksToMax } from './rateTracker.js';

function finding(partial) {
  return { name: null, ratio: null, detail: {}, culprit: null, ...partial };
}

/**
 * Evaluate per-container pidmax + rate-of-approach rules.
 *
 * @param {Array<{id:string, name?:string|null, current:number, max:number|null}>} containers
 * @param {object} config
 * @param {RateTracker} rateTracker
 * @param {number} ts
 */
export function evaluatePidmax(containers, config, rateTracker, ts) {
  const { warnPct, critPct, rateProjectTicks, rateMinRatio } = config.pidmax;
  const findings = [];

  for (const c of containers) {
    // Unlimited cgroup (pids.max === "max"): EXEMPT. Host pid_max is 4.19M so
    // exhaustion is unrealistic and the tiny ratio would look "healthy" — never
    // alert, just record the exemption upstream.
    if (c.max === null) continue;
    if (!Number.isFinite(c.max) || c.max <= 0) continue;

    const ratio = c.current / c.max;
    const name = c.name ?? null;

    // Compare against integer COUNT thresholds (floor of pct*max) rather than
    // the float ratio, so the documented boundaries hold exactly:
    //   warn = floor(0.80 * 2048) = 1638, crit = floor(0.90 * 2048) = 1843.
    const warnCount = Math.floor(warnPct * c.max);
    const critCount = Math.floor(critPct * c.max);

    if (c.current >= critCount) {
      findings.push(
        finding({
          entity: c.id,
          name,
          kind: 'pidmax',
          severity: 'crit',
          ratio,
          detail: { current: c.current, max: c.max, pct: critPct, threshold: critCount },
          msg: `pids ${c.current}/${c.max} (${(ratio * 100).toFixed(1)}%) >= crit ${critCount} (${(critPct * 100).toFixed(0)}%)`,
          ts,
        }),
      );
    } else if (c.current >= warnCount) {
      findings.push(
        finding({
          entity: c.id,
          name,
          kind: 'pidmax',
          severity: 'warn',
          ratio,
          detail: { current: c.current, max: c.max, pct: warnPct, threshold: warnCount },
          msg: `pids ${c.current}/${c.max} (${(ratio * 100).toFixed(1)}%) >= warn ${warnCount} (${(warnPct * 100).toFixed(0)}%)`,
          ts,
        }),
      );
    } else if (ratio >= rateMinRatio) {
      // rate-of-approach: only consider once at least half-full, and only when
      // projected to hit the cap within `rateProjectTicks` fast ticks. This is a
      // distinct 'rate' kind (separate cooldown lane) so it does not mask the
      // later pidmax warn.
      const delta = rateTracker.deltaPerTick(c.id);
      const ticks = projectTicksToMax(c.current, c.max, delta);
      if (Number.isFinite(ticks) && ticks <= rateProjectTicks) {
        findings.push(
          finding({
            entity: c.id,
            name,
            kind: 'rate',
            severity: 'warn',
            ratio,
            detail: { current: c.current, max: c.max, deltaPerTick: delta, ticksToMax: ticks },
            msg: `pids rising fast: ${c.current}/${c.max} +${delta}/tick, ~${ticks.toFixed(1)} ticks to max`,
            ts,
          }),
        );
      }
    }
  }

  return findings;
}

/**
 * Evaluate host memory rules: PSI "some avg10", MemAvailable absolute backstops,
 * and the earlyoom-derived point-of-no-return CRIT.
 *
 * @param {object} host  { meminfo, pressure } where pressure may be null
 * @param {object|null} earlyoom  { effectiveMemKillBytes } or null
 * @param {object} config
 * @param {number} ts
 */
export function evaluateMemory(host, earlyoom, config, ts) {
  const findings = [];
  const { meminfo, pressure } = host;
  const mem = config.memory;

  const memAvailable = meminfo?.MemAvailable;
  const psiSome = pressure?.some?.avg10 ?? null;

  // --- Point-of-no-return (earlyoom about to SIGKILL) -> CRIT, highest signal.
  if (
    earlyoom &&
    Number.isFinite(earlyoom.effectiveMemKillBytes) &&
    Number.isFinite(memAvailable)
  ) {
    const ponr = earlyoom.effectiveMemKillBytes + mem.ponrBufferBytes;
    if (memAvailable <= ponr) {
      findings.push(
        finding({
          entity: 'host',
          kind: 'mem',
          severity: 'crit',
          ratio: memAvailable,
          detail: {
            reason: 'point-of-no-return',
            memAvailable,
            earlyoomKillBytes: earlyoom.effectiveMemKillBytes,
            ponrBytes: ponr,
          },
          msg: `MemAvailable ${fmtBytes(memAvailable)} at point-of-no-return (earlyoom kills near ${fmtBytes(earlyoom.effectiveMemKillBytes)})`,
          ts,
        }),
      );
      return findings; // PONR dominates; no point also emitting a softer mem warn
    }
  }

  // --- MemAvailable absolute backstops.
  if (Number.isFinite(memAvailable)) {
    if (memAvailable <= mem.memAvailCritBytes) {
      findings.push(
        finding({
          entity: 'host',
          kind: 'mem',
          severity: 'crit',
          ratio: memAvailable,
          detail: { reason: 'memAvailable', memAvailable, threshold: mem.memAvailCritBytes },
          msg: `MemAvailable ${fmtBytes(memAvailable)} <= crit ${fmtBytes(mem.memAvailCritBytes)}`,
          ts,
        }),
      );
    } else if (memAvailable <= mem.memAvailWarnBytes) {
      findings.push(
        finding({
          entity: 'host',
          kind: 'mem',
          severity: 'warn',
          ratio: memAvailable,
          detail: { reason: 'memAvailable', memAvailable, threshold: mem.memAvailWarnBytes },
          msg: `MemAvailable ${fmtBytes(memAvailable)} <= warn ${fmtBytes(mem.memAvailWarnBytes)}`,
          ts,
        }),
      );
    }
  }

  // --- PSI "some avg10": fast early signal on page-cache-heavy boxes. Emitted
  // as a separate finding (distinct detail.reason) so it can coexist with the
  // avail backstop; cooldown keys on (entity, severity) so the worst wins.
  if (Number.isFinite(psiSome)) {
    if (psiSome >= mem.psiSomeAvg10CritPct) {
      findings.push(
        finding({
          entity: 'host',
          kind: 'mem',
          severity: 'crit',
          ratio: psiSome,
          detail: { reason: 'psi', psiSomeAvg10: psiSome, threshold: mem.psiSomeAvg10CritPct },
          msg: `memory PSI some avg10 ${psiSome.toFixed(1)}% >= crit ${mem.psiSomeAvg10CritPct}%`,
          ts,
        }),
      );
    } else if (psiSome >= mem.psiSomeAvg10WarnPct) {
      findings.push(
        finding({
          entity: 'host',
          kind: 'mem',
          severity: 'warn',
          ratio: psiSome,
          detail: { reason: 'psi', psiSomeAvg10: psiSome, threshold: mem.psiSomeAvg10WarnPct },
          msg: `memory PSI some avg10 ${psiSome.toFixed(1)}% >= warn ${mem.psiSomeAvg10WarnPct}%`,
          ts,
        }),
      );
    }
  }

  return findings;
}

/**
 * Top-level evaluation. Combines pidmax/rate and memory findings.
 *
 * @param {object} snapshot { host:{meminfo,pressure}, containers:[...], earlyoom, totalMem }
 * @param {object} config
 * @param {RateTracker} rateTracker
 * @param {number} [ts]
 * @returns {Array<object>} findings
 */
export function evaluate(snapshot, config, rateTracker, ts = Date.now()) {
  const { host, containers = [], earlyoom = null } = snapshot;
  const findings = [];
  findings.push(...evaluatePidmax(containers, config, rateTracker, ts));
  if (host) findings.push(...evaluateMemory(host, earlyoom, config, ts));
  return findings;
}

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 1) return `${gib.toFixed(2)} GiB`;
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(0)} MiB`;
}
