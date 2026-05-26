#!/bin/bash
# 01_install_packages.sh - OS 패키지 설치
#
# dev4 베이스 이미지에는 대부분 이미 깔려있다고 가정한다.
# 여기서는 새 서버에서 종종 빠져있는 것들만 보수적으로 설치한다.

set -euo pipefail
source "${DEV_SETUP_DIR}/lib/00_common.sh"

# 필수: tmux, gh, git, python3.11, clang (build_cubrid_clang.sh 용)
# nodejs는 nvm으로 따로 깔기 때문에 시스템 패키지로는 안 깐다.
PKGS=(
    git
    git-lfs
    tmux
    gh
    python3.11
    python3.11-pip
    clang
    clang-tools-extra
    cmake
    ninja-build
    curl
    wget
    rsync
    jq
    which
    ca-certificates
    openssh-clients
)

if ! have dnf && ! have yum; then
    log_warn "neither dnf nor yum found, skipping package install"
    exit 0
fi

PM="dnf"
have dnf || PM="yum"

log_info "checking installed packages..."
missing=()
for p in "${PKGS[@]}"; do
    if ! rpm -q "${p}" >/dev/null 2>&1; then
        missing+=("${p}")
    fi
done

if [ "${#missing[@]}" -eq 0 ]; then
    log_info "all required packages already installed."
    exit 0
fi

log_info "missing packages: ${missing[*]}"
log_info "installing via ${PM} (sudo)..."
sudo_run "${PM}" install -y "${missing[@]}" || {
    log_warn "some packages failed to install; you may need to enable EPEL/PowerTools and retry."
    log_warn "continuing - run again after fixing repos if needed."
}
