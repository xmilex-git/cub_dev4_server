#!/bin/bash
# 06_install_bin.sh - ~/bin 셸 스크립트 일괄 설치
#
# build_cubrid.sh, ctp_test.sh 등 일상 도구들.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

SRC="${DEV_SETUP_ASSETS}/bin"
DST="${HOME}/bin"

if [ ! -d "${SRC}" ]; then
    log_err "assets/bin missing: ${SRC}"
    exit 1
fi

mkdir -p "${DST}"

installed=0
updated=0
for f in "${SRC}"/*; do
    name="$(basename "${f}")"
    target="${DST}/${name}"
    if [ -f "${target}" ] && cmp -s "${f}" "${target}"; then
        continue
    fi
    if [ -f "${target}" ]; then
        backup_once "${target}"
        updated=$((updated+1))
    else
        installed=$((installed+1))
    fi
    install -m 0755 "${f}" "${target}"
done

log_info "~/bin: ${installed} new, ${updated} updated"
log_info "files now in ~/bin:"
ls "${DST}" | sed 's/^/  /'
