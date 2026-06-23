#!/usr/bin/env bash
#
# install.sh — deploy podman-watchdog from this repo to root-owned system paths.
#
# Idempotent. Prints every action before doing it. Must be run as root on the
# target host (Rocky 8.10). It performs system changes (copies files, creates
# dirs, installs a systemd unit, daemon-reload) but does NOT enable/start the
# service or open any network surface — those are separate, gated manual steps:
#
#   systemctl enable --now podman-watchdog.service
#   systemctl enable --now cockpit.socket   # (after firewall scoping)
#
# It also does NOT overwrite an existing /etc/podman-watchdog/config.json, so
# your real webhook secret/policy is preserved across redeploys.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

OPT_DIR=/opt/podman-watchdog
CONF_DIR=/etc/podman-watchdog
STATE_DIR=/var/lib/podman-watchdog
LOG_DIR=/var/log/podman-watchdog
COCKPIT_DIR=/usr/share/cockpit/podman-watchdog
UNIT_DST=/etc/systemd/system/podman-watchdog.service

log() { printf '[install] %s\n' "$*"; }

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "ERROR: must run as root (system paths + systemd)." >&2
    exit 1
  fi
}

require_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node not found. Install Node 22 first (dnf module install nodejs:22)." >&2
    exit 1
  fi
  log "node: $(node --version) at $(command -v node)"
}

main() {
  require_root
  require_node

  log "source repo: ${REPO_DIR}"

  # 1) Runtime code -> /opt (root-owned, 0755).
  log "install code -> ${OPT_DIR}"
  install -d -m 0755 "${OPT_DIR}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${REPO_DIR}/src/" "${OPT_DIR}/src/"
  else
    rm -rf "${OPT_DIR}/src"
    cp -a "${REPO_DIR}/src" "${OPT_DIR}/src"
  fi
  install -m 0644 "${REPO_DIR}/package.json" "${OPT_DIR}/package.json"
  [[ -f "${REPO_DIR}/README.md" ]] && install -m 0644 "${REPO_DIR}/README.md" "${OPT_DIR}/README.md"
  chown -R root:root "${OPT_DIR}"

  # 2) Config dir + config (0600). Do NOT clobber an existing real config.
  log "ensure config dir ${CONF_DIR} (0700)"
  install -d -m 0700 "${CONF_DIR}"
  if [[ -f "${CONF_DIR}/config.json" ]]; then
    log "config.json already present -> preserved"
  else
    log "config.json absent -> seeding from config.example.json (webhookUrl can stay empty; inject via env)"
    install -m 0600 "${REPO_DIR}/config.example.json" "${CONF_DIR}/config.json"
  fi

  # 2b) Secret env file (0600). Holds webhook URLs; never in the repo.
  #     Preserved across redeploys so the real secret is kept.
  if [[ -f "${CONF_DIR}/watchdog.env" ]]; then
    log "watchdog.env already present -> preserved (secret kept)"
  else
    log "watchdog.env absent -> seeding from watchdog.env.example (EDIT IT: set the selected webhook URL)"
    install -m 0600 "${REPO_DIR}/watchdog.env.example" "${CONF_DIR}/watchdog.env"
  fi

  # 3) Runtime state + log dirs.
  log "ensure state dir ${STATE_DIR} (0755) and log dir ${LOG_DIR} (0755)"
  install -d -m 0755 "${STATE_DIR}"
  install -d -m 0755 "${LOG_DIR}"

  # 4) Cockpit widget (static, 0644).
  log "install cockpit widget -> ${COCKPIT_DIR}"
  install -d -m 0755 "${COCKPIT_DIR}"
  install -m 0644 "${REPO_DIR}/cockpit/podman-watchdog/manifest.json" "${COCKPIT_DIR}/manifest.json"
  install -m 0644 "${REPO_DIR}/cockpit/podman-watchdog/index.html" "${COCKPIT_DIR}/index.html"
  install -m 0644 "${REPO_DIR}/cockpit/podman-watchdog/app.js" "${COCKPIT_DIR}/app.js"
  install -m 0644 "${REPO_DIR}/cockpit/podman-watchdog/style.css" "${COCKPIT_DIR}/style.css"

  # 5) systemd unit.
  log "install unit -> ${UNIT_DST}"
  install -m 0644 "${REPO_DIR}/systemd/podman-watchdog.service" "${UNIT_DST}"
  log "systemctl daemon-reload"
  systemctl daemon-reload

  cat <<EOF

[install] done. NOT started (gated). Next manual steps:
  1) Edit ${CONF_DIR}/watchdog.env -> set DISCORD_WEBHOOK_URL and/or TEAMS_WEBHOOK_URL (0600, never committed)
  2) Validate:   node ${OPT_DIR}/src/index.js --config ${CONF_DIR}/config.json --dry-run --once
  3) Enable:     systemctl enable --now podman-watchdog.service
  4) Cockpit:    systemctl enable --now cockpit.socket   (after firewall scoping)
EOF
}

main "$@"
