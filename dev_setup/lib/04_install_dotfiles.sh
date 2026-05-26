#!/bin/bash
# 04_install_dotfiles.sh - .bashrc / .dev4_profile / .cubrid.sh 설치
#
# - .dev4_profile, .cubrid.sh 는 통째로 배치
# - .bashrc 는 사용자 기존 파일 보존, 필요한 라인만 marked block 으로 append

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

ASSET="${DEV_SETUP_ASSETS}/dotfiles"

install_file() {
    local src="$1" dst="$2"
    if [ ! -f "${src}" ]; then
        log_warn "asset missing: ${src}"
        return 0
    fi
    if [ -f "${dst}" ] && cmp -s "${src}" "${dst}"; then
        log_info "${dst} already up to date"
        return 0
    fi
    backup_once "${dst}"
    cp "${src}" "${dst}"
    log_info "installed ${dst}"
}

install_file "${ASSET}/dev4_profile" "${HOME}/.dev4_profile"
install_file "${ASSET}/cubrid.sh"    "${HOME}/.cubrid.sh"

# .bashrc append (PATH + dev4_profile sourcing + nvm)
backup_once "${HOME}/.bashrc"
append_block "${HOME}/.bashrc" "path-and-profile" <<'EOF'
# User specific environment
if ! [[ "$PATH" =~ "$HOME/.local/bin:$HOME/bin:" ]]; then
    PATH="$HOME/.local/bin:$HOME/bin:$PATH"
fi
export PATH

[ -f "$HOME/.dev4_profile" ] && source "$HOME/.dev4_profile"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
EOF

# .zshrc - nvm 라인만 (있을 때만)
if [ -f "${HOME}/.zshrc" ]; then
    append_block "${HOME}/.zshrc" "nvm" <<'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
EOF
fi
