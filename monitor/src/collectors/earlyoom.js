// collectors/earlyoom.js — parse the earlyoom config so the watchdog can derive
// the memory "point-of-no-return": the MemAvailable level at which earlyoom will
// SIGKILL. We warn well before that line.
//
// Target config (/etc/default/earlyoom):
//   EARLYOOM_ARGS="-r 0 -m 5,5 -M 409600,409600 --prefer ... --avoid ..."
// Relevant flags:
//   -m PERCENT[,KILL_PERCENT]  memory min available, percent of MemTotal
//   -M SIZE[,KILL_SIZE]        memory min available, absolute KiB
// earlyoom kills when MemAvailable drops below the *larger* effective floor of
// the -m / -M lines it is using. We compute the SIGKILL (more aggressive) line.

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
  const result = { memPercent: null, memKiB: null, reportInterval: null };
  if (!text) return result;
  const tokens = text.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    if (tok === '-m' && next !== undefined) {
      result.memPercent = parsePair(next);
      i += 1;
    } else if (tok === '-M' && next !== undefined) {
      result.memKiB = parsePair(next);
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
 * earlyoom uses BOTH the -m (percent of MemTotal) and -M (absolute KiB) floors
 * and acts on whichever is reached first — i.e. it triggers when MemAvailable
 * drops below the LARGER of the two computed byte values. We take the `kill`
 * column of each.
 *
 * @param {ReturnType<typeof parseEarlyoomArgs>} args
 * @param {number} totalMemBytes  MemTotal in bytes (for the percent line)
 * @returns {number|null} effective SIGKILL MemAvailable floor in bytes, or null
 *   if neither flag was present.
 */
export function computeEffectiveMemKillBytes(args, totalMemBytes) {
  const candidates = [];
  if (args.memKiB && Number.isFinite(args.memKiB.kill)) {
    candidates.push(args.memKiB.kill * KIB);
  }
  if (args.memPercent && Number.isFinite(args.memPercent.kill) && Number.isFinite(totalMemBytes)) {
    candidates.push((args.memPercent.kill / 100) * totalMemBytes);
  }
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
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
