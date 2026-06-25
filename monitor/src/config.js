// config.js — default configuration, deep-merge of a loaded JSON file, and
// type validation. Pure data + small pure helpers; the only I/O is loadConfig().
//
// The Discord webhook URL lives ONLY in the config file. It is never written
// to state.json or to the logs. The repo ships config.example.json with a
// placeholder URL; the real config.json is git-ignored.

import { readFile } from 'node:fs/promises';

const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;

/**
 * Built-in defaults. These are the calibrated thresholds for the target host
 * (Rocky 8.10, cgroup v1, ~24 shared CUBRID containers, pids.max=2048,
 * 188 GiB RAM, earlyoom active). Every value is overridable by the config file.
 */
export const DEFAULT_CONFIG = Object.freeze({
  // Loop cadence.
  fastTickSec: 5, // pseudo-file detection tick (no fork)
  slowTickSec: 30, // enrich tick: podman ps/stats/events, earlyoom reread

  // Per-container pidmax rule (ratio = pids.current / pids.max).
  pidmax: {
    warnPct: 0.8, // -> 1638 / 2048
    critPct: 0.9, // -> 1843 / 2048
    // rate-of-approach: warn early if, at the current per-tick delta, the
    // container is projected to reach pids.max within `projectTicks` fast
    // ticks AND the current ratio is at least `minRatio`.
    rateProjectTicks: 3,
    rateMinRatio: 0.5,
    // Per-lane emission gates (the rule still computes; these decide whether the
    // finding is emitted). Default true preserves the original behaviour; set
    // false in config.json to silence that lane. The >=critPct finding always
    // emits — it is the core protection and is not gated.
    alertWarn: true, // emit the WARN (>=warnPct, below critPct) finding
    alertRate: true, // emit the rate-of-approach finding
  },

  // Memory rule.
  memory: {
    // /proc/pressure/memory "some avg10=" thresholds (percent).
    psiSomeAvg10WarnPct: 10,
    psiSomeAvg10CritPct: 30,
    // MemAvailable absolute backstops (bytes).
    memAvailWarnBytes: 12 * GiB, // ~12 GiB
    memAvailCritBytes: 5 * GiB, // ~5 GiB
    // Buffer added to the earlyoom-derived effective kill threshold to compute
    // the "point-of-no-return" CRIT line (bytes).
    ponrBufferBytes: 512 * MiB,
    // Emit the host-level memory findings (PSI / MemAvailable / point-of-no-
    // return). Default true preserves the original behaviour.
    alertHost: true,
    // Per-container memory rule: emit a WARN when a single container's working
    // set gets close to the memory it is allowed to use. When the container has
    // a binding cgroup memory limit, the ceiling is `containerLimitWarnPct` of
    // its own limit (e.g. 0.75 of a 64 GiB cap => 48 GiB). When it has no binding
    // limit (cgroup "unlimited", or a limit >= host RAM), the meaningful ceiling
    // is `containerNoLimitHostPct` of host MemTotal instead. Default OFF (opt-in).
    alertContainer: false,
    containerLimitWarnPct: 0.75,
    containerNoLimitHostPct: 0.5,
  },

  // Alerting / debounce.
  cooldownSec: 300, // per (entity, severity)
  resolveAfterClears: 2, // consecutive clear evaluations before RESOLVE
  sendResolve: true, // emit a RESOLVE message when a condition clears
  earlyoomRereadSec: 300,
  logRetentionHours: 48,

  // Which sink alerts are delivered to: 'discord' or 'teams'.
  notifier: 'discord',

  discord: {
    webhookUrl: '', // SECRET — set in the real config.json only
    retries: 3,
    backoffMs: 1000,
  },

  // Microsoft Teams via a Power Automate "Workflows" incoming webhook (an
  // Adaptive Card envelope). webhookUrl is a SECRET injected via the
  // TEAMS_WEBHOOK_URL env (like DISCORD_WEBHOOK_URL), so it never lives in the
  // repo-tracked config.
  teams: {
    webhookUrl: '', // SECRET — set via TEAMS_WEBHOOK_URL env or the real config.json
    retries: 3,
    backoffMs: 1000,
  },

  paths: {
    procRoot: '/proc',
    cgroupRoot: '/sys/fs/cgroup/pids/libpod_parent',
    memCgroupRoot: '/sys/fs/cgroup/memory/libpod_parent',
    stateFile: '/var/lib/podman-watchdog/state.json',
    logDir: '/var/log/podman-watchdog',
    earlyoomDefaults: '/etc/default/earlyoom',
  },
});

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Deep-merge `override` onto `base`, returning a new object. Plain objects are
 * merged recursively; every other value (numbers, strings, arrays) is replaced.
 * Keys present only in `override` are ignored unless they exist in `base` so the
 * config file cannot introduce unknown nested structures silently.
 */
export function deepMerge(base, override) {
  if (!isPlainObject(override)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(out[key]) && isPlainObject(value)) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function assert(condition, message) {
  if (!condition) {
    throw new TypeError(`Invalid config: ${message}`);
  }
}

function assertPositiveNumber(value, name) {
  assert(typeof value === 'number' && Number.isFinite(value) && value > 0, `${name} must be a positive number`);
}

function assertNonNegativeNumber(value, name) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0, `${name} must be a non-negative number`);
}

function assertPct(value, name) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1, `${name} must be a fraction in [0, 1]`);
}

/**
 * Validate a fully-merged config object. Throws TypeError on the first problem.
 */
export function validateConfig(config) {
  assertPositiveNumber(config.fastTickSec, 'fastTickSec');
  assertPositiveNumber(config.slowTickSec, 'slowTickSec');

  assertPct(config.pidmax.warnPct, 'pidmax.warnPct');
  assertPct(config.pidmax.critPct, 'pidmax.critPct');
  assert(config.pidmax.critPct >= config.pidmax.warnPct, 'pidmax.critPct must be >= pidmax.warnPct');
  assertPositiveNumber(config.pidmax.rateProjectTicks, 'pidmax.rateProjectTicks');
  assertPct(config.pidmax.rateMinRatio, 'pidmax.rateMinRatio');
  assert(typeof config.pidmax.alertWarn === 'boolean', 'pidmax.alertWarn must be a boolean');
  assert(typeof config.pidmax.alertRate === 'boolean', 'pidmax.alertRate must be a boolean');

  assertNonNegativeNumber(config.memory.psiSomeAvg10WarnPct, 'memory.psiSomeAvg10WarnPct');
  assertNonNegativeNumber(config.memory.psiSomeAvg10CritPct, 'memory.psiSomeAvg10CritPct');
  assert(
    config.memory.psiSomeAvg10CritPct >= config.memory.psiSomeAvg10WarnPct,
    'memory.psiSomeAvg10CritPct must be >= memory.psiSomeAvg10WarnPct',
  );
  assertPositiveNumber(config.memory.memAvailWarnBytes, 'memory.memAvailWarnBytes');
  assertPositiveNumber(config.memory.memAvailCritBytes, 'memory.memAvailCritBytes');
  assert(
    config.memory.memAvailWarnBytes >= config.memory.memAvailCritBytes,
    'memory.memAvailWarnBytes must be >= memory.memAvailCritBytes',
  );
  assertNonNegativeNumber(config.memory.ponrBufferBytes, 'memory.ponrBufferBytes');
  assert(typeof config.memory.alertHost === 'boolean', 'memory.alertHost must be a boolean');
  assert(typeof config.memory.alertContainer === 'boolean', 'memory.alertContainer must be a boolean');
  assertPct(config.memory.containerLimitWarnPct, 'memory.containerLimitWarnPct');
  assertPct(config.memory.containerNoLimitHostPct, 'memory.containerNoLimitHostPct');

  assertPositiveNumber(config.cooldownSec, 'cooldownSec');
  assertPositiveNumber(config.resolveAfterClears, 'resolveAfterClears');
  assert(typeof config.sendResolve === 'boolean', 'sendResolve must be a boolean');
  assertPositiveNumber(config.earlyoomRereadSec, 'earlyoomRereadSec');
  assertPositiveNumber(config.logRetentionHours, 'logRetentionHours');

  assert(config.notifier === 'discord' || config.notifier === 'teams', "notifier must be 'discord' or 'teams'");

  assert(typeof config.discord.webhookUrl === 'string', 'discord.webhookUrl must be a string');
  assertNonNegativeNumber(config.discord.retries, 'discord.retries');
  assertPositiveNumber(config.discord.backoffMs, 'discord.backoffMs');

  assert(typeof config.teams.webhookUrl === 'string', 'teams.webhookUrl must be a string');
  assertNonNegativeNumber(config.teams.retries, 'teams.retries');
  assertPositiveNumber(config.teams.backoffMs, 'teams.backoffMs');

  for (const key of ['procRoot', 'cgroupRoot', 'memCgroupRoot', 'stateFile', 'logDir', 'earlyoomDefaults']) {
    assert(typeof config.paths[key] === 'string' && config.paths[key].length > 0, `paths.${key} must be a non-empty string`);
  }

  return config;
}

/**
 * Build a validated config from DEFAULT_CONFIG merged with `override` (already
 * parsed JSON). Used directly by tests; loadConfig() wraps it with file I/O.
 */
export function buildConfig(override = {}) {
  const merged = deepMerge(DEFAULT_CONFIG, override);
  return validateConfig(merged);
}

/**
 * Apply environment-variable overrides for secrets. The Discord webhook URL is
 * injected at runtime via the env (systemd `EnvironmentFile=/etc/podman-watchdog/
 * watchdog.env`, a git-ignored 0600 file) so the secret never lives in the
 * repo-tracked config. The env value, when present and non-empty, wins over any
 * webhookUrl in config.json.
 */
export function applyEnvOverrides(config, env = process.env) {
  const fromEnv = env.DISCORD_WEBHOOK_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    config.discord.webhookUrl = fromEnv.trim();
  }
  const teamsFromEnv = env.TEAMS_WEBHOOK_URL;
  if (typeof teamsFromEnv === 'string' && teamsFromEnv.trim().length > 0) {
    config.teams.webhookUrl = teamsFromEnv.trim();
  }
  return config;
}

/**
 * Read and parse the JSON config file, deep-merge over defaults, apply env-based
 * secret injection, and validate. A missing file is a hard error (the operator
 * must place a real config), but the caller decides how to surface it.
 */
export async function loadConfig(configPath, env = process.env) {
  const raw = await readFile(configPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new SyntaxError(`Config file ${configPath} is not valid JSON: ${err.message}`);
  }
  // config.example.json carries a `_comment` documentation block; strip any
  // leading-underscore keys so they never reach validation or runtime.
  for (const key of Object.keys(parsed)) {
    if (key.startsWith('_')) delete parsed[key];
  }
  // Merge + env injection happen before validation so an env-only webhook
  // (empty webhookUrl in the file) still validates.
  const merged = deepMerge(DEFAULT_CONFIG, parsed);
  applyEnvOverrides(merged, env);
  return validateConfig(merged);
}
