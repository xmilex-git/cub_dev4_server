#!/bin/bash
# 08_install_omc.sh - claude CLI + oh-my-claudecode 설치
#
# 전제: nvm/node 가 02 단계에서 깔려있음.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

# nvm 로드 (이 셸에서 node/npm 쓰려고)
export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR}/nvm.sh"
    nvm use default >/dev/null 2>&1 || true
fi

if ! have npm; then
    log_err "npm not found. run 02_install_nvm_node first."
    exit 1
fi

# --- claude CLI ---
if have claude; then
    log_info "claude already installed: $(claude --version 2>/dev/null || echo '?')"
else
    log_info "installing @anthropic-ai/claude-code..."
    npm install -g @anthropic-ai/claude-code
fi

# --- oh-my-claudecode ---
# OMC 는 claude 플러그인 마켓플레이스(omc)로 깔리고, 부가 CLI 'omc' 는 npm 패키지로 제공된다.
# 가장 안전한 방법: 사용자가 claude 안에서 /oh-my-claudecode:omc-setup 한 번 돌리는 것.
# 여기서는 npm 패키지(omc)만 미리 깔아둔다.
if have omc; then
    log_info "omc already installed: $(omc --version 2>/dev/null || echo '?')"
else
    log_info "installing omc (oh-my-claudecode CLI)..."
    npm install -g oh-my-claudecode || log_warn "omc install failed (you can finish setup inside claude via /oh-my-claudecode:omc-setup)"
fi

log_info ""
log_info "Claude / OMC are installed. Final OMC plugin enablement is done inside claude:"
log_info "  1) run: claude"
log_info "  2) inside claude, run: /oh-my-claudecode:omc-setup"
log_info "  3) or simply: omc setup"
