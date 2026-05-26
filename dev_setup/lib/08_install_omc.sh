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

# --- oh-my-claudecode (npm CLI) ---
# 실제 `omc` 바이너리는 npm 패키지 `oh-my-claude-sisyphus` 가 제공한다.
# (`oh-my-claudecode` 라는 동명의 다른 패키지는 별도 도구이므로 혼동 금지.)
#
# 네이티브 모듈 (better-sqlite3 12.x) 빌드 요구사항:
#   - python: 3.7+ (walrus operator 필요) → Rocky 8 시스템 python (3.6.8) 안 됨
#   - g++:    c++20 지원 → Rocky 8 시스템 gcc 8.5 안 됨, gcc-toolset-13 필요
# 따라서 python3.11 + gcc-toolset-13 을 명시적으로 사용한다.
if have omc; then
    log_info "omc already installed: $(omc --version 2>/dev/null || echo '?')"
else
    log_info "installing omc (oh-my-claude-sisyphus CLI)..."

    PYTHON_BIN="$(command -v python3.11 || command -v python3)"
    log_info "  python: ${PYTHON_BIN}"

    SCL_PREFIX=""
    if [ -f /opt/rh/gcc-toolset-13/enable ]; then
        SCL_PREFIX="scl enable gcc-toolset-13 -- "
        log_info "  toolchain: gcc-toolset-13"
    elif [ -f /opt/rh/gcc-toolset-12/enable ]; then
        SCL_PREFIX="scl enable gcc-toolset-12 -- "
        log_info "  toolchain: gcc-toolset-12"
    else
        log_warn "  no gcc-toolset found; native build may fail (need c++20)"
    fi

    # 이전 시도가 부분 설치를 남겼다면 정리
    rm -f "$(npm config get prefix)/bin/omc" "$(npm config get prefix)/bin/omc-cli" 2>/dev/null
    rm -rf "$(npm config get prefix)/lib/node_modules/oh-my-claude-sisyphus" 2>/dev/null

    eval "${SCL_PREFIX}PYTHON='${PYTHON_BIN}' npm install -g oh-my-claude-sisyphus" || \
        log_warn "omc install failed (you can finish setup inside claude via /oh-my-claudecode:omc-setup)"
fi

log_info ""
log_info "Claude / OMC are installed. Final OMC plugin enablement is done inside claude:"
log_info "  1) run: claude"
log_info "  2) inside claude, run: /oh-my-claudecode:omc-setup"
log_info "  3) or simply: omc setup"
