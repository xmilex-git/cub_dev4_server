// collectors/earlyoom.js — parse the earlyoom config so the watchdog can derive
// the memory "point-of-no-return": the MemAvailable level at which earlyoom will
// SIGKILL. We warn well before that line.
//
// Target config (/etc/default/earlyoom):
//   EARLYOOM_ARGS="-r 0 -m 5,5 -M 409600,409600 --prefer ... --avoid ..."
// Relevant flags:
//   -m PERCENT[,KILL_PERCENT]  memory min available, percent of MemTotal
//   -M SIZE[,KILL_SIZE]        memory min available, absolute KiB
// earlyoom processes -m and -M left-to-right via getopt and they write the SAME
// internal threshold, so the flag that appears LAST on the command line WINS
// (overrides the earlier one). e.g. "-m 5,5 -M 409600,409600" => -M wins => the
// SIGKILL line is 409600 KiB (~400 MiB), confirmed by earlyoom's own journal
// ("SIGKILL when mem <= 0.21%"). We replicate that last-wins rule below.

import { readFile } from 'node:fs/promises';

const KIB = 1024;

/**
 * Extract the EARLYOOM_ARGS string from a /etc/default/earlyoom file body.
 * Handles `EARLYOOM_ARGS="..."`, single quotes, or unquoted.
 */
export function extractArgsLine(text) {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^EARLYOOM_ARGS\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[1].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return null;
}

function parsePair(token) {
  // "5,5" -> { warn: 5, kill: 5 }; "409600" -> { warn: 409600, kill: 409600 }
  const parts = token.split(',').map((p) => Number(p.trim()));
  if (parts.length === 1) return { warn: parts[0], kill: parts[0] };
  return { warn: parts[0], kill: parts[1] };
}

/**
 * Parse an EARLYOOM_ARGS string into the memory thresholds.
 *
 * @returns {{
 *   memPercent: {warn:number, kill:number} | null,   // from -m, percent
 *   memKiB:     {warn:number, kill:number} | null,   // from -M, absolute KiB
 *   reportInterval: number | null                    // from -r, seconds
 * }}
 */
export function parseEarlyoomArgs(text) {
  // `lastMemFlag` records whether -m or -M appeared last, so we can replicate
  // earlyoom's getopt "last option wins" override behaviour downstream.
  const result = { memPercent: null, memKiB: null, reportInterval: null, lastMemFlag: null };
  if (!text) return result;
  const tokens = text.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    if (tok === '-m' && next !== undefined) {
      result.memPercent = parsePair(next);
      result.lastMemFlag = 'm';
      i += 1;
    } else if (tok === '-M' && next !== undefined) {
      result.memKiB = parsePair(next);
      result.lastMemFlag = 'M';
      i += 1;
    } else if (tok === '-r' && next !== undefined) {
      result.reportInterval = Number(next);
      i += 1;
    }
  }
  return result;
}

/**
 * Compute the effective MemAvailable SIGKILL threshold in bytes.
 *
 * earlyoom's -m and -M write the same internal threshold, so the flag specified
 * LAST on the command line wins. We replicate that: if both are present, use the
 * one named by `lastMemFlag`; if only one is present, use it. We take the `kill`
 * (SIGKILL, more aggressive) column.
 *
 * @param {ReturnType<typeof parseEarlyoomArgs>} args
 * @param {number} totalMemBytes  MemTotal in bytes (for the percent line)
 * @returns {number|null} effective SIGKILL MemAvailable floor in bytes, or null
 *   if neither flag was present.
 */
export function computeEffectiveMemKillBytes(args, totalMemBytes) {
  const fromKiB = () =>
    args.memKiB && Number.isFinite(args.memKiB.kill) ? args.memKiB.kill * KIB : null;
  const fromPercent = () =>
    args.memPercent && Number.isFinite(args.memPercent.kill) && Number.isFinite(totalMemBytes)
      ? (args.memPercent.kill / 100) * totalMemBytes
      : null;

  const haveKiB = fromKiB() !== null;
  const havePercent = fromPercent() !== null;
  if (!haveKiB && !havePercent) return null;
  if (haveKiB && !havePercent) return fromKiB();
  if (havePercent && !haveKiB) return fromPercent();
  // Both present: last flag on the command line wins (earlyoom getopt semantics).
  return args.lastMemFlag === 'm' ? fromPercent() : fromKiB();
}

/**
 * Load and parse the earlyoom defaults file. Returns the parsed args plus the
 * effective kill threshold (needs totalMemBytes). Returns null if the file is
 * absent (earlyoom not configured here) so the caller skips the PONR rule.
 */
export async function loadEarlyoom(earlyoomDefaultsPath, totalMemBytes) {
  let text;
  try {
    text = await readFile(earlyoomDefaultsPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  const argsLine = extractArgsLine(text);
  const args = parseEarlyoomArgs(argsLine);
  const effectiveMemKillBytes = computeEffectiveMemKillBytes(args, totalMemBytes);
  return { args, effectiveMemKillBytes };
}
