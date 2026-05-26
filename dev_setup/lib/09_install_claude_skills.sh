#!/bin/bash
# 09_install_claude_skills.sh - ~/dev/cubrid/.claude/ 자산 마이그레이션
#
# 복사 항목:
#   - CLAUDE.md
#   - hooks/   (codestyle-precommit.sh 등)
#   - skills/  (cubrid-build, cubrid-ctp, cubrid-flow, cubrid-pr-review,
#              cubrid-server, omc-reference)

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

SRC="${DEV_SETUP_ASSETS}/claude"
DST="${CUBRID_SRC}/.claude"

if [ ! -d "${CUBRID_SRC}" ]; then
    log_err "cubrid source not found at ${CUBRID_SRC}. run 05_clone_repos first."
    exit 1
fi

mkdir -p "${DST}"

# CLAUDE.md
if [ -f "${SRC}/CLAUDE.md" ]; then
    if [ -f "${DST}/CLAUDE.md" ] && ! cmp -s "${SRC}/CLAUDE.md" "${DST}/CLAUDE.md"; then
        backup_once "${DST}/CLAUDE.md"
    fi
    cp "${SRC}/CLAUDE.md" "${DST}/CLAUDE.md"
    log_info "installed ${DST}/CLAUDE.md"
fi

# hooks
if [ -d "${SRC}/hooks" ]; then
    mkdir -p "${DST}/hooks"
    cp -a "${SRC}/hooks/." "${DST}/hooks/"
    chmod +x "${DST}/hooks/"*.sh 2>/dev/null || true
    log_info "installed hooks:"
    ls "${DST}/hooks" | sed 's/^/  /'
fi

# skills
if [ -d "${SRC}/skills" ]; then
    mkdir -p "${DST}/skills"
    for d in "${SRC}/skills"/*/; do
        name="$(basename "${d}")"
        target="${DST}/skills/${name}"
        if [ -d "${target}" ]; then
            log_info "skill exists, refreshing: ${name}"
        else
            log_info "installing skill: ${name}"
        fi
        rm -rf "${target}"
        cp -a "${d}" "${target}"
    done
fi

log_info "claude assets in ${DST}:"
ls -la "${DST}" | sed 's/^/  /'
