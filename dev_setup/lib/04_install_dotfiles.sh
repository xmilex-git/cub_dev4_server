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

install_file "${ASSET}/dev4_profile"      "${HOME}/.dev4_profile"
install_file "${ASSET}/cubrid.sh"         "${HOME}/.cubrid.sh"
install_file "${ASSET}/claude-account.sh" "${HOME}/.claude-account.sh"

# .bashrc - 필요한 라인만 조건부로 append.
# 기존 .bashrc 가 이미 갖고 있는 라인은 다시 안 넣음 (PATH/nvm/profile sourcing 중복 방지).
backup_once "${HOME}/.bashrc"
BASHRC="${HOME}/.bashrc"
touch "${BASHRC}"

# PATH: ~/bin, ~/.local/bin
if ! grep -qE '\$HOME/(\.local/bin:)?\$HOME?/?bin' "${BASHRC}" 2>/dev/null && \
   ! grep -qF '$HOME/.local/bin:$HOME/bin' "${BASHRC}" 2>/dev/null; then
    append_block "${BASHRC}" "path" <<'EOF'
if ! [[ "$PATH" =~ "$HOME/.local/bin:$HOME/bin:" ]]; then
    PATH="$HOME/.local/bin:$HOME/bin:$PATH"
fi
export PATH
EOF
else
    log_info ".bashrc already has ~/bin in PATH, skipping path block"
fi

# dev4_profile sourcing
if ! grep -qE 'source.*\.dev4_profile|\..*\.dev4_profile' "${BASHRC}" 2>/dev/null; then
    append_block "${BASHRC}" "dev4-profile" <<'EOF'
[ -f "$HOME/.dev4_profile" ] && source "$HOME/.dev4_profile"
EOF
else
    log_info ".bashrc already sources .dev4_profile, skipping profile block"
fi

# nvm
if ! grep -q 'NVM_DIR' "${BASHRC}" 2>/dev/null; then
    append_block "${BASHRC}" "nvm" <<'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
EOF
else
    log_info ".bashrc already loads nvm, skipping nvm block"
fi

# claude-account (Claude 계정 전환 헬퍼) sourcing
if ! grep -qF '.claude-account.sh' "${BASHRC}" 2>/dev/null; then
    append_block "${BASHRC}" "claude-account" <<'EOF'
[ -f "$HOME/.claude-account.sh" ] && source "$HOME/.claude-account.sh"
EOF
else
    log_info ".bashrc already sources .claude-account.sh, skipping block"
fi

# .zshrc - nvm + claude-account 라인만 (있을 때만)
if [ -f "${HOME}/.zshrc" ]; then
    append_block "${HOME}/.zshrc" "nvm" <<'EOF'
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion"
EOF
    if ! grep -qF '.claude-account.sh' "${HOME}/.zshrc" 2>/dev/null; then
        append_block "${HOME}/.zshrc" "claude-account" <<'EOF'
[ -f "$HOME/.claude-account.sh" ] && source "$HOME/.claude-account.sh"
EOF
    fi
fi
