// no-kill.test.js — enforce the NO-KILL INVARIANT by scanning the runtime
// source. The watchdog must be strictly read-only + alert + log: it must NEVER
// terminate a process/container or write to a cgroup/sysfs control file.
//
// This guards against a future edit accidentally introducing destructive code.
// We scan every .js under src/ (the code shipped to /opt and run by systemd).
// Comments/strings that merely mention "kill" (e.g. "earlyoom kills") are fine;
// we match dangerous CODE patterns, not the bare word.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');

async function listJsFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listJsFiles(full)));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

// Strip comments so prose that merely DESCRIBES the invariant ("never calls
// process.kill", "earlyoom kills") is not mistaken for destructive code. We only
// want to police actual executable statements. Replaces comment bodies with
// spaces to preserve line numbers for reporting.
function stripComments(source) {
  let out = '';
  let i = 0;
  let state = 'code'; // code | line | block | sQuote | dQuote | tQuote
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (c === '/' && next === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && next === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { state = 'sQuote'; out += c; i += 1; continue; }
      if (c === '"') { state = 'dQuote'; out += c; i += 1; continue; }
      if (c === '`') { state = 'tQuote'; out += c; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (state === 'line') {
      if (c === '\n') { state = 'code'; out += '\n'; } else { out += ' '; }
      i += 1; continue;
    }
    if (state === 'block') {
      if (c === '*' && next === '/') { state = 'code'; out += '  '; i += 2; continue; }
      out += c === '\n' ? '\n' : ' '; i += 1; continue;
    }
    // string states: keep contents (so exec-arg literals are still scanned) but
    // honour escapes and the matching closing quote.
    out += c;
    if (c === '\\') { out += source[i + 1] ?? ''; i += 2; continue; }
    if ((state === 'sQuote' && c === "'") || (state === 'dQuote' && c === '"') || (state === 'tQuote' && c === '`')) {
      state = 'code';
    }
    i += 1;
  }
  return out;
}

// Forbidden CODE patterns. Each is a [regex, label].
const FORBIDDEN = [
  // Process signalling.
  [/\bprocess\.kill\b/, 'process.kill'],
  [/\bprocess\s*\.\s*kill\b/, 'process . kill'],
  // Spawning a kill / killall binary as an argv[0] string.
  [/['"`]killall?['"`]/, "'kill'/'killall' command"],
  [/['"`]pkill['"`]/, "'pkill' command"],
  // Destructive podman subcommands as string literals.
  [/\bpodman\s+(stop|kill|rm|pause|restart)\b/, 'podman destructive subcommand (string)'],
  [/['"`](stop|kill|rm|pause|restart)['"`]/, 'destructive podman subcommand literal'],
  // SIGKILL/SIGTERM being SENT (we only RECEIVE SIGTERM via process.on).
  [/\.send\([^)]*SIG(KILL|TERM)/, 'sending a signal'],
  // Writing to cgroup/sysfs control files.
  [/writeFile\s*\([^)]*\/sys\/fs\/cgroup/, 'writeFile to cgroup'],
  [/writeFileSync\s*\([^)]*\/sys\/fs\/cgroup/, 'writeFileSync to cgroup'],
  [/writeFile\s*\([^)]*pids\.(max|current)/, 'writeFile to pids control file'],
];

// Lines that legitimately reference a forbidden-looking token but are NOT
// destructive (e.g. process.on('SIGTERM', ...) for graceful shutdown). We allow
// signal RECEIPT but not signal SENDING.
const ALLOWLIST = [
  /process\.on\(['"]SIG(TERM|INT)['"]/, // receiving shutdown signals is fine
];

test('runtime source contains no process-killing or container-stopping code', async () => {
  const files = await listJsFiles(SRC);
  assert.ok(files.length >= 8, `expected to scan the src tree, found ${files.length} files`);

  const violations = [];
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const code = stripComments(raw); // ignore prose in comments
    const lines = code.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!line.trim()) continue;
      if (ALLOWLIST.some((re) => re.test(line))) continue;
      for (const [re, label] of FORBIDDEN) {
        if (re.test(line)) {
          violations.push(`${file}:${i + 1} [${label}] -> ${line.trim()}`);
        }
      }
    }
  }

  assert.deepEqual(violations, [], `NO-KILL invariant violated:\n${violations.join('\n')}`);
});

test('runtime source only ever invokes read-only podman subcommands', async () => {
  const files = await listJsFiles(SRC);
  const allowedPodmanVerbs = new Set(['ps', 'stats', 'events']);
  // Collect every podman argv first element used in an exec(['<verb>', ...]) form.
  const verbRe = /\[\s*['"`](ps|stats|events|stop|kill|rm|pause|restart|run|exec|create|start)['"`]/g;
  const found = new Set();
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    let m;
    while ((m = verbRe.exec(text)) !== null) {
      found.add(m[1]);
    }
  }
  for (const verb of found) {
    assert.ok(allowedPodmanVerbs.has(verb), `disallowed podman verb in argv form: ${verb}`);
  }
});
