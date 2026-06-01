#!/bin/bash
# 10_install_ctp_scripts.sh - ~/dev/cubrid/.vscode/ 의 CTP 래퍼 스크립트 배치
#
# cubrid-ctp 스킬이 .vscode/execute_ctp.sh + watch_core_and_kill.sh 에 의존한다.
# 둘 다 CUBRID 본체에 git-untracked 라 재clone 시 사라지므로 여기서 복원한다.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

SRC="${DEV_SETUP_ASSETS}/vscode"
DST="${CUBRID_SRC}/.vscode"

if [ ! -d "${CUBRID_SRC}" ]; then
    log_err "cubrid source not found at ${CUBRID_SRC}. run 05_clone_repos first."
    exit 1
fi

mkdir -p "${DST}"

for f in execute_ctp.sh watch_core_and_kill.sh; do
    s="${SRC}/${f}"
    d="${DST}/${f}"
    if [ ! -f "${s}" ]; then
        log_err "asset missing: ${s}"
        exit 1
    fi
    if [ -f "${d}" ] && cmp -s "${s}" "${d}"; then
        log_info ".vscode/${f} already up to date"
    else
        [ -f "${d}" ] && backup_once "${d}"
        cp "${s}" "${d}"
        log_info "installed ${d}"
    fi
    chmod +x "${d}"
done
