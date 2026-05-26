#!/bin/bash
# 03_setup_github_ssh.sh - GitHub 인증 + SSH 키 생성/등록
#
# 흐름:
#   1) gh auth login (인터랙티브)
#   2) ~/.ssh/id_ed25519 가 없으면 생성
#   3) gh ssh-key add 로 GitHub 에 자동 등록
#   4) git user.name/user.email 설정

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

if ! have gh; then
    log_err "gh CLI not found. run 01_install_packages first."
    exit 1
fi

# --- 1) gh auth ---
if gh auth status >/dev/null 2>&1; then
    log_info "gh already authenticated:"
    gh auth status 2>&1 | sed 's/^/  /'
else
    log_info "starting 'gh auth login' (interactive)..."
    log_info "  protocol: choose SSH"
    log_info "  scopes:   admin:public_key, repo, read:org, gist 권장"
    gh auth login
fi

# --- 2) SSH key ---
mkdir -p "${HOME}/.ssh"
chmod 700 "${HOME}/.ssh"

KEY_PATH="${HOME}/.ssh/id_ed25519"
if [ ! -f "${KEY_PATH}" ]; then
    EMAIL="${GIT_EMAIL:-$(git config --global user.email 2>/dev/null || echo "${USER}@$(hostname)")}"
    log_info "generating SSH key at ${KEY_PATH} (comment=${EMAIL})..."
    ssh-keygen -t ed25519 -f "${KEY_PATH}" -N "" -C "${EMAIL}"
else
    log_info "ssh key already exists at ${KEY_PATH}"
fi

eval "$(ssh-agent -s)" >/dev/null 2>&1 || true
ssh-add "${KEY_PATH}" >/dev/null 2>&1 || true

# --- 3) register to GitHub ---
KEY_TITLE="${KEY_TITLE:-$(whoami)@$(hostname)-$(date +%Y%m%d)}"
if gh ssh-key list 2>/dev/null | grep -qF "$(awk '{print $2}' "${KEY_PATH}.pub")"; then
    log_info "ssh key already registered on GitHub."
else
    log_info "uploading ssh key to GitHub (title=${KEY_TITLE})..."
    gh ssh-key add "${KEY_PATH}.pub" --title "${KEY_TITLE}" || {
        log_warn "gh ssh-key add failed. Add manually:"
        log_warn "  gh ssh-key add ${KEY_PATH}.pub --title '${KEY_TITLE}'"
    }
fi

# Make sure github.com host key is known and SSH actually works.
ssh-keyscan -t ed25519,rsa github.com >> "${HOME}/.ssh/known_hosts" 2>/dev/null || true
sort -u "${HOME}/.ssh/known_hosts" -o "${HOME}/.ssh/known_hosts"

log_info "verifying SSH to github.com..."
if ssh -T -o StrictHostKeyChecking=accept-new git@github.com 2>&1 | grep -q "successfully authenticated"; then
    log_info "SSH to GitHub OK."
else
    log_warn "SSH test did not confirm auth. You may need to wait a moment and retry:"
    log_warn "  ssh -T git@github.com"
fi

# --- 4) git config ---
if [ -z "$(git config --global user.name 2>/dev/null || true)" ]; then
    NAME="${GIT_NAME:-${GH_USER}}"
    log_info "setting git user.name = ${NAME}"
    git config --global user.name "${NAME}"
fi
if [ -z "$(git config --global user.email 2>/dev/null || true)" ]; then
    EMAIL="${GIT_EMAIL:-$(gh api user --jq .email 2>/dev/null || echo "${USER}@$(hostname)")}"
    log_info "setting git user.email = ${EMAIL}"
    git config --global user.email "${EMAIL}"
fi
