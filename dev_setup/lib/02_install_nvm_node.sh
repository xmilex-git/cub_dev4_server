#!/bin/bash
# 02_install_nvm_node.sh - nvm + node + claude CLI 설치
#
# claude CLI 설치에 npm/npx 필요.
# 시스템 nodejs 대신 nvm 으로 깔아서 사용자 영역에 격리한다.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
NODE_VERSION="${NODE_VERSION:-24}"

if [ -s "${NVM_DIR}/nvm.sh" ]; then
    log_info "nvm already installed at ${NVM_DIR}"
else
    log_info "installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi

# shellcheck disable=SC1091
export NVM_DIR
. "${NVM_DIR}/nvm.sh"

if nvm ls "${NODE_VERSION}" >/dev/null 2>&1; then
    log_info "node ${NODE_VERSION} already installed"
else
    log_info "installing node ${NODE_VERSION} via nvm..."
    nvm install "${NODE_VERSION}"
fi

nvm alias default "${NODE_VERSION}" >/dev/null
nvm use default >/dev/null

log_info "node:  $(node --version)"
log_info "npm:   $(npm --version)"
log_info "npx:   $(npx --version)"

# --- claude CLI ---
if have claude; then
    log_info "claude already installed: $(claude --version 2>/dev/null || echo '?')"
else
    log_info "installing @anthropic-ai/claude-code..."
    npm install -g @anthropic-ai/claude-code
fi
