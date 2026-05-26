#!/bin/bash
# 05_clone_repos.sh - cubrid / cubrid-testcases / cubrid-testtools clone + remote 세팅
#
# 결과:
#   ~/dev/cubrid              (origin=CUBRID/cubrid, ${GH_FORK_REMOTE}=${GH_USER}/cubrid)
#   ~/cubrid-testcases        (origin=CUBRID/cubrid-testcases, ${GH_FORK_REMOTE}=${GH_USER}/cubrid-testcases)
#   ~/cubrid-testtools        (origin=CUBRID/cubrid-testtools)

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

clone_or_update() {
    local url="$1" dst="$2"
    if [ -d "${dst}/.git" ]; then
        log_info "exists: ${dst}"
    else
        log_info "cloning ${url} -> ${dst}"
        mkdir -p "$(dirname "${dst}")"
        git clone "${url}" "${dst}"
    fi
}

set_remote() {
    local dst="$1" name="$2" url="$3"
    if git -C "${dst}" remote get-url "${name}" >/dev/null 2>&1; then
        local cur
        cur="$(git -C "${dst}" remote get-url "${name}")"
        if [ "${cur}" != "${url}" ]; then
            log_info "updating remote ${name} in ${dst}: ${cur} -> ${url}"
            git -C "${dst}" remote set-url "${name}" "${url}"
        else
            log_info "remote ${name} already set in ${dst}"
        fi
    else
        log_info "adding remote ${name} -> ${url} in ${dst}"
        git -C "${dst}" remote add "${name}" "${url}"
    fi
}

mkdir -p "${DEV_DIR}"

# --- cubrid ---
clone_or_update "git@github.com:CUBRID/cubrid.git" "${CUBRID_SRC}"
set_remote "${CUBRID_SRC}" "origin" "git@github.com:CUBRID/cubrid.git"
set_remote "${CUBRID_SRC}" "${GH_FORK_REMOTE}" "git@github.com:${GH_USER}/cubrid.git"

# --- cubrid-testcases ---
clone_or_update "git@github.com:CUBRID/cubrid-testcases.git" "${TESTCASES_DIR}"
set_remote "${TESTCASES_DIR}" "origin" "git@github.com:CUBRID/cubrid-testcases.git"
set_remote "${TESTCASES_DIR}" "${GH_FORK_REMOTE}" "git@github.com:${GH_USER}/cubrid-testcases.git"

# --- cubrid-testtools ---
clone_or_update "git@github.com:CUBRID/cubrid-testtools.git" "${TESTTOOLS_DIR}"
set_remote "${TESTTOOLS_DIR}" "origin" "git@github.com:CUBRID/cubrid-testtools.git"

log_info "fetching remotes..."
for d in "${CUBRID_SRC}" "${TESTCASES_DIR}" "${TESTTOOLS_DIR}"; do
    git -C "${d}" fetch --all --prune --quiet || log_warn "fetch failed in ${d}"
done

# cubrid 본체는 submodule 이 있다 (cubrid-cci, cubrid-jdbc, cubridmanager).
# 빌드 전에 init/update 가 필요하므로 여기서 같이 처리한다.
log_info "initializing cubrid submodules (cubrid-cci, cubrid-jdbc, cubridmanager)..."
git -C "${CUBRID_SRC}" submodule update --init --recursive || \
    log_warn "submodule update failed; run manually: git -C ${CUBRID_SRC} submodule update --init --recursive"

log_info "repo layout:"
for d in "${CUBRID_SRC}" "${TESTCASES_DIR}" "${TESTTOOLS_DIR}"; do
    printf '  %s\n' "${d}"
    git -C "${d}" remote -v | sed 's/^/    /'
done
