# podman-watchdog

A **read-only** risk-monitoring watchdog for a Podman host (Rocky Linux 8.10,
cgroup v1, rootful podman, ~24 shared CUBRID containers) plus a thin static
Cockpit widget.

It watches per-container **pidmax** (`pids.current / pids.max`), per-container
**memory** (working set vs. host RAM), and host **memory** pressure, and sends
**Discord** or **Microsoft Teams** alerts *before* the host is in trouble. It
also keeps a 24–48h rolling metrics log and exposes an aggregate `state.json`
for the Cockpit widget.

## The one invariant that matters

**NO-KILL.** This tool never terminates a process or container and never writes
to any cgroup/sysfs control file. Its only automatic actions are *alert* and
*log*. Memory OOM auto-cleanup stays delegated to the existing `earlyoom`;
manual cleanup stays in Cockpit (`podman stop`) / the Cockpit terminal
(`kill -9`). A unit test (`test/no-kill.test.js`) scans the runtime source and
fails the build if any process-killing / container-stopping / cgroup-write code
is ever introduced.

## Architecture

Two-tier cadence so the monitor never becomes the resource consumer it watches:

- **fast tick (~5s)** — fork-free pseudo-file reads only: `/proc/meminfo`,
  `/proc/pressure/memory`, and per-container
  `…/libpod-<ID>/pids.{current,max}`. Risk is evaluated here. Each fast tick
  writes `state.json` (atomic) and appends one JSONL metrics record.
- **slow / enrich tick (~30s, or whenever a finding appears)** — forks: refresh
  the `podman ps` id→name map, read `podman stats`, check OOM events
  (`podman events --filter event=oom`), re-read `/etc/default/earlyoom`, and
  attribute the top consumer (PID / comm / thread count) for any active finding.

Other safety properties:

- **systemd dead-man switch** — `Type=notify` + `WatchdogSec=30`: if the
  watchdog hangs and stops sending `WATCHDOG=1`, systemd restarts it (going
  silent is the monitor's worst failure mode).
- **self-resource caps** — `MemoryMax=256M`, `TasksMax=128`: the monitor can
  never starve the host it protects.
- **secret isolation** — the Discord webhook URL is injected at runtime via
  `DISCORD_WEBHOOK_URL` (systemd `EnvironmentFile=/etc/podman-watchdog/watchdog.env`,
  a git-ignored 0600 file); it may also sit in the root-only `config.json` (0600),
  with the env value taking precedence. It is never written to `state.json`, the
  logs, or the repo. `state.json` is 0644 (the widget reads it) and aggregate-only.
- **degrade, never crash** — a vanished container (ENOENT race) is skipped; a
  webhook POST that fails after retries is logged in full to stderr (journald)
  so the alert is not lost; a log-write failure (disk full) degrades logging
  only.

```
src/
  index.js            entry: arg parse, 2-tier loop, sd_notify, SIGTERM
  config.js           defaults + deep-merge + validation
  rateTracker.js      per-container pids history; projectTicksToMax()
  rules.js            PURE risk evaluation -> findings[]
  alert.js            cooldown/debounce/escalate/resolve + Discord POST
  logstore.js         daily JSONL append + age-based prune
  state.js            atomic, secret-free state.json (widget contract)
  collectors/
    proc.js           meminfo / pressure / stat / process info
    cgroup.js         per-container pids (ENOENT-tolerant, "max"=>exempt)
    podman.js         id->name, stats, oom events (injectable exec)
    earlyoom.js       parse -m/-M/-r; effective SIGKILL MemAvailable floor
cockpit/podman-watchdog/   static vanilla-JS Cockpit widget
systemd/podman-watchdog.service
deploy/install.sh          deploy to root-owned paths (idempotent, gated)
tools/pid-pressure-test.sh GATED live no-kill proof (destructive-adjacent)
test/                      node:test units + fixtures
```

## Risk rules (calibrated defaults — all overridable in config)

**pidmax** (ratio = `pids.current / pids.max`, cap usually 2048):

- warn ≥ 80% → count `floor(0.80 × max)` = **1638**/2048
- crit ≥ 90% → count `floor(0.90 × max)` = **1843**/2048
- `pids.max == "max"` (unlimited) → **EXEMPT** (recorded as `ratio: null`,
  `exempt: true`; never alerted — host `pid_max` is 4.19M).
- **rate-of-approach** — early warn if, at the current per-tick delta, the
  container is projected to hit `pids.max` within 3 fast ticks AND the ratio is
  already ≥ 0.50.

**memory** (host):

- `/proc/pressure/memory` `some avg10` → warn ≥ 10%, crit ≥ 30%
- `MemAvailable` absolute backstops → warn ≤ ~12 GiB, crit ≤ ~5 GiB
- **point-of-no-return** CRIT — parse `/etc/default/earlyoom`, compute the
  effective SIGKILL `MemAvailable` floor, add a 512 MiB buffer. If MemAvailable
  drops to that line, earlyoom is about to act: a single dominant CRIT fires.

**container memory** (per container, opt-in `memory.alertContainer`):

- the signal is one container's **working set** (`memory.usage_in_bytes −
  total_inactive_file`, i.e. what `podman stats` shows) measured against the
  memory it is allowed to use:
  - **with a cgroup memory limit** → warn ≥ `memory.containerLimitWarnPct` of
    that limit (default 0.75 → ≥48 GiB of a 64 GiB cap).
  - **with no binding limit** (cgroup "unlimited", or a limit ≥ host RAM) → warn
    ≥ `memory.containerNoLimitHostPct` of host `MemTotal` (default 0.50).
  Read fork-free from the cgroup v1 memory controller (`memory.usage_in_bytes`,
  `memory.stat`, `memory.limit_in_bytes`) on the fast tick.

**rule gates & sink**: each lane is independently switchable in config —
`pidmax.alertWarn`, `pidmax.alertRate`, `memory.alertHost`,
`memory.alertContainer` (the `pidmax` ≥`critPct` finding is always on, it is the
core protection). Alerts are delivered to the `notifier` sink — `"discord"`
(embed) or `"teams"` (a Power Automate "Workflows" Adaptive Card showing the
container name + warning text). `sendResolve` toggles recovery messages.

On the `teams` sink, a container alert can **@mention its owner** so they get
pinged: set `teams.mentions` to a map keyed by the container owner base name
(the `[a-z]+` after the leading `<num>-`, e.g. `34-ilhansong_data2` → `ilhansong`)
with `{ "name": "<display>", "id": "<UPN/email or Entra Object ID>" }`. The map
holds people's addresses, so it is a **secret**: keep it only in the real
`/etc/podman-watchdog/config.json` on the host, never in the repo. Host-level
findings and unmapped containers stay plain; resolves never tag.

**alerting**: per-`(entity, severity)` cooldown 300s; warn→crit escalation fires
immediately; when `sendResolve` is on, a RESOLVE is emitted after the condition
clears for 2 consecutive evaluations (otherwise the key is simply forgotten).

## Configuration

Copy `config.example.json` to `/etc/podman-watchdog/config.json` (0600,
root-owned) for the thresholds (documented inline under `_comment`, all
overridable). The **Discord webhook URL is a secret injected via env**: copy
`watchdog.env.example` to `/etc/podman-watchdog/watchdog.env` (0600) and set
`DISCORD_WEBHOOK_URL` (and/or `TEAMS_WEBHOOK_URL` when `notifier` is `"teams"`)
there — each overrides the matching `*.webhookUrl`, so the URL never needs to be
in `config.json`. Both `config.json` and `*.env` are git-ignored.

## Development

Pure functions for all parsing and rule logic; every collector takes its
filesystem root / `exec` so tests run on macOS against `test/fixtures/` with no
real `/proc`, `/sys`, or podman. Requires Node ≥ 22 (uses only built-ins:
`node:fs/promises`, `node:child_process`, global `fetch`, `node:test`).

```sh
node --test          # run the unit suite (zero npm dependencies)
```

Manual smoke test against the bundled fixtures (writes nothing to system paths):

```sh
node src/index.js --config <your-fixture-config.json> --dry-run --once
```

CLI flags: `--config <path>`, `--dry-run` (no webhook send, no state/log writes
to system paths — prints instead), `--once` (single evaluation then exit).

## Deployment (gated — run manually on the host)

`deploy/install.sh` (run as root) copies `src/` + `package.json` to
`/opt/podman-watchdog/` (root-owned), seeds `/etc/podman-watchdog/config.json`
from the example *only if absent* (your secret is preserved on redeploy),
creates `/var/lib/podman-watchdog` + `/var/log/podman-watchdog`, installs the
Cockpit widget to `/usr/share/cockpit/podman-watchdog/`, installs the systemd
unit, and runs `daemon-reload`. It is idempotent and prints every action. It
does **not** start the service or open any network surface — those are separate
gated steps:

```sh
sudo deploy/install.sh
sudoedit /etc/podman-watchdog/watchdog.env    # set DISCORD_WEBHOOK_URL (0600, never committed)
node /opt/podman-watchdog/src/index.js --config /etc/podman-watchdog/config.json --dry-run --once
sudo systemctl enable --now podman-watchdog.service
sudo systemctl enable --now cockpit.socket    # after scoping the firewall
```

## P7-RISK live test (DESTRUCTIVE-ADJACENT — explicit confirmation only)

`tools/pid-pressure-test.sh` proves the no-kill invariant *live*: it creates an
**isolated throwaway** container (`wd-pidtest`, hard caps `--pids-limit 2048
--cpus 1 --memory 256m --memory-swap 256m`), spawns sleeping processes toward
the PID cap so the watchdog fires WARN/CRIT, confirms nothing is auto-killed,
and **always** tears the container down on exit/trap. It refuses to run without
`--i-understand-this-is-destructive` and must never run unattended. It never
touches any of the real containers. The memory axis is *not* exercised live
(shared 188 GiB host + earlyoom) — memory behaviour is covered by unit tests.
