#!/bin/bash
# 07_install_cmake_presets.sh - ~/dev/cubrid/CMakeUserPresets.json 배치
#
# build_cubrid_clang.sh 가 cmake --preset debug_clang / release_clang 을 호출하므로
# 해당 preset 을 정의한 user presets 파일이 필요하다.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

SRC="${DEV_SETUP_ASSETS}/cmake/CMakeUserPresets.json"
DST="${CUBRID_SRC}/CMakeUserPresets.json"

if [ ! -f "${SRC}" ]; then
    log_err "asset missing: ${SRC}"
    exit 1
fi

if [ ! -d "${CUBRID_SRC}" ]; then
    log_err "cubrid source not found at ${CUBRID_SRC}. run 05_clone_repos first."
    exit 1
fi

if [ -f "${DST}" ] && cmp -s "${SRC}" "${DST}"; then
    log_info "CMakeUserPresets.json already up to date"
    exit 0
fi

backup_once "${DST}"
cp "${SRC}" "${DST}"
log_info "installed ${DST}"
