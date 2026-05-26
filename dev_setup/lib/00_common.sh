#!/bin/bash
# Shared helpers for dev_setup steps.

: "${DEV_SETUP_DIR:?DEV_SETUP_DIR must be set by setup.sh}"
: "${DEV_SETUP_ASSETS:?DEV_SETUP_ASSETS must be set by setup.sh}"

# Where the new server should keep its CUBRID source tree.
export DEV_DIR="${HOME}/dev"
export CUBRID_SRC="${DEV_DIR}/cubrid"
export TESTCASES_DIR="${HOME}/cubrid-testcases"
export TESTTOOLS_DIR="${HOME}/cubrid-testtools"

# Default git remote setup. Override by exporting before running setup.sh.
export GH_USER="${GH_USER:-xmilex-git}"
export GH_FORK_REMOTE="${GH_FORK_REMOTE:-xmilex}"

log_info() { printf '\033[1;36m[setup]\033[0m %s\n' "$*"; }
log_step() { printf '\033[1;35m[setup]\033[0m %s\n' "$*"; }
log_warn() { printf '\033[1;33m[setup]\033[0m %s\n' "$*" >&2; }
log_err()  { printf '\033[1;31m[setup]\033[0m %s\n' "$*" >&2; }

have() { command -v "$1" >/dev/null 2>&1; }

confirm() {
    local prompt="${1:-Continue? [y/N] }"
    local reply
    read -r -p "${prompt}" reply || return 1
    case "${reply}" in
        y|Y|yes|YES) return 0 ;;
        *) return 1 ;;
    esac
}

sudo_run() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    else
        sudo "$@"
    fi
}

# Backup a file before overwriting. Idempotent: backup once per run.
backup_once() {
    local f="$1"
    if [ -e "${f}" ] && [ ! -e "${f}.dev_setup.bak" ]; then
        cp -a "${f}" "${f}.dev_setup.bak"
        log_info "backed up ${f} -> ${f}.dev_setup.bak"
    fi
}

# Append a marked block to a file if not already present.
# Usage: append_block <file> <marker> <<'EOF' ... EOF
append_block() {
    local file="$1"
    local marker="$2"
    local content
    content="$(cat)"
    local begin="# >>> dev_setup:${marker} >>>"
    local end="# <<< dev_setup:${marker} <<<"
    touch "${file}"
    if grep -qF "${begin}" "${file}"; then
        log_info "block '${marker}' already present in ${file}, skipping"
        return 0
    fi
    {
        printf '\n%s\n' "${begin}"
        printf '%s\n' "${content}"
        printf '%s\n' "${end}"
    } >> "${file}"
    log_info "appended block '${marker}' to ${file}"
}
