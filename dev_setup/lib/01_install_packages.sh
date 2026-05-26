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
    # better-sqlite3 (omc 의존성) 가 c++20 을 요구하므로 newer gcc 필요.
    # 시스템 gcc 8.5 와 별도로 toolset 만 깔아두고, omc 설치 때 scl enable 한다.
    gcc-toolset-13-gcc-c++
    gcc-toolset-13-libstdc++-devel
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

# Rocky/RHEL 8 의 기본 repo 에는 gh 가 없으므로 GitHub CLI repo 를 먼저 등록한다.
if ! rpm -q gh >/dev/null 2>&1 && [ ! -f /etc/yum.repos.d/gh-cli.repo ]; then
    log_info "registering GitHub CLI repo..."
    sudo_run "${PM}" install -y dnf-plugins-core
    sudo_run "${PM}" config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
fi

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
