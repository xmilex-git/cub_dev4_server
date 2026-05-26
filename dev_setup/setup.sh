#!/bin/bash
# dev_setup/setup.sh - CUBRID 개발 워크스페이스 일괄 세팅
#
# 가정:
# - Rocky/RHEL 8 계열, sudo 권한 있는 일반 사용자
# - 컨테이너/서버는 dev4 이미지 기반으로 OS 패키지가 대부분 깔려있음
# - HOME=/home/<user> (보통 /home/cubrid)
#
# 멱등성을 목표로 하지만, gh auth / SSH key 등록 단계는 인터랙티브.
# 실패하면 같은 단계부터 다시 실행 가능.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEV_SETUP_DIR="${SCRIPT_DIR}"
export DEV_SETUP_ASSETS="${SCRIPT_DIR}/assets"

# shellcheck source=lib/00_common.sh
source "${SCRIPT_DIR}/lib/00_common.sh"

STEPS=(
    "01_install_packages"
    "02_install_nvm_node"
    "03_setup_github_ssh"
    "04_install_dotfiles"
    "05_clone_repos"
    "06_install_bin"
    "07_install_cmake_presets"
    "08_install_omc"
    "09_install_claude_skills"
)

run_step() {
    local step="$1"
    local script="${SCRIPT_DIR}/lib/${step}.sh"
    if [ ! -f "${script}" ]; then
        log_err "missing step script: ${script}"
        return 1
    fi
    log_step ">>> ${step}"
    bash "${script}"
    log_step "<<< ${step} done"
}

usage() {
    cat <<EOF
Usage: $0 [options] [step ...]

Run all steps if no step is given. Step names match files in lib/*.sh
(without the .sh extension).

Options:
  --list        List available steps and exit
  --from STEP   Run from STEP to the end
  -h, --help    Show this help

Examples:
  $0                          # run everything
  $0 --list
  $0 03_setup_github_ssh      # run a single step
  $0 --from 05_clone_repos    # resume from a step
EOF
}

list_steps() {
    printf '%s\n' "${STEPS[@]}"
}

main() {
    local from=""
    local targets=()

    while [ $# -gt 0 ]; do
        case "$1" in
            -h|--help) usage; exit 0 ;;
            --list)    list_steps; exit 0 ;;
            --from)    from="$2"; shift 2 ;;
            -*)        log_err "unknown option: $1"; usage; exit 2 ;;
            *)         targets+=("$1"); shift ;;
        esac
    done

    if [ -n "${from}" ]; then
        local seen=0
        for s in "${STEPS[@]}"; do
            [ "${s}" = "${from}" ] && seen=1
            [ "${seen}" = "1" ] && targets+=("${s}")
        done
        if [ "${#targets[@]}" -eq 0 ]; then
            log_err "unknown --from step: ${from}"
            exit 2
        fi
    fi

    if [ "${#targets[@]}" -eq 0 ]; then
        targets=("${STEPS[@]}")
    fi

    log_info "dev_setup starting on $(hostname) as $(whoami)"
    log_info "HOME=${HOME}"
    log_info "steps: ${targets[*]}"
    echo

    for step in "${targets[@]}"; do
        run_step "${step}"
        echo
    done

    log_info "all steps completed."
    cat <<EOF

Next:
  1) Open a new shell (or 'source ~/.bashrc') so PATH and CUBRID env load.
  2) Build CUBRID:    build_cubrid.sh d 11.5.develop
  3) Launch Claude:   claude
EOF
}

main "$@"
