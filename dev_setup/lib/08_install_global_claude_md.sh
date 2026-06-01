#!/bin/bash
# 08_install_global_claude_md.sh - ~/.claude/CLAUDE.md 전역 규칙 주입
#
# 모든 프로젝트에 적용할 전역 지침(scratch/임시파일 위치 규칙 등)을
# 사용자의 전역 ~/.claude/CLAUDE.md 에 marked block 으로 주입한다.
# 사용자가 직접 작성한 기존 내용은 보존하고, 블록 안쪽만 매 실행마다 최신으로 교체.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

SRC="${DEV_SETUP_ASSETS}/claude/global-rules.md"
DST="${HOME}/.claude/CLAUDE.md"

# markdown 친화적 마커 (md 에서 안 보이는 HTML 주석)
BEGIN="<!-- >>> dev_setup:global-rules >>> -->"
END="<!-- <<< dev_setup:global-rules <<< -->"

if [ ! -f "${SRC}" ]; then
    log_err "asset missing: ${SRC}"
    exit 1
fi

mkdir -p "$(dirname "${DST}")"
touch "${DST}"

# 기존 블록(있으면)을 제거한 본문 + 최신 블록을 재조립한다.
NEW="${DST}.dev_setup.new"
stripped="$(awk -v b="${BEGIN}" -v e="${END}" '
    $0==b {inblk=1; next}
    $0==e {inblk=0; next}
    !inblk {print}
' "${DST}")"

{
    [ -n "${stripped}" ] && printf '%s\n\n' "${stripped}"
    printf '%s\n' "${BEGIN}"
    cat "${SRC}"
    printf '%s\n' "${END}"
} > "${NEW}"

if cmp -s "${NEW}" "${DST}"; then
    rm -f "${NEW}"
    log_info "~/.claude/CLAUDE.md already up to date (global-rules block)"
else
    backup_once "${DST}"
    mv "${NEW}" "${DST}"
    log_info "injected/updated global-rules block in ~/.claude/CLAUDE.md"
fi
