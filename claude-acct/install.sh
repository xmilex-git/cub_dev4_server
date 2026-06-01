#!/bin/bash
# install.sh - claude-acct 헬퍼 설치 (standalone)
#
# 이 폴더의 claude-account.sh 를 ~/.claude-account.sh 로 복사하고,
# ~/.bashrc (있으면 ~/.zshrc) 에서 자동 source 되도록 한 줄 추가한다.
# 멱등: 여러 번 실행해도 중복 추가하지 않는다.
#
# 사용:  bash install.sh        (또는  ./install.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${SCRIPT_DIR}/claude-account.sh"
DST="${HOME}/.claude-account.sh"

BEGIN="# >>> claude-acct >>>"
END="# <<< claude-acct <<<"
SOURCE_LINE='[ -f "$HOME/.claude-account.sh" ] && source "$HOME/.claude-account.sh"'

if [ ! -f "${SRC}" ]; then
    echo "error: ${SRC} 가 없습니다. 이 스크립트는 claude-account.sh 와 같은 폴더에서 실행하세요." >&2
    exit 1
fi

# 1) 헬퍼 스크립트 배치
cp "${SRC}" "${DST}"
echo "[ok] installed ${DST}"

# 2) rc 파일에 source 블록 추가 (이미 있으면 건너뜀)
wire_rc() {
    local rc="$1"
    touch "${rc}"
    if grep -qF '.claude-account.sh' "${rc}" 2>/dev/null; then
        echo "[skip] ${rc} already sources claude-account.sh"
        return 0
    fi
    {
        printf '\n%s\n' "${BEGIN}"
        printf '%s\n'   "${SOURCE_LINE}"
        printf '%s\n'   "${END}"
    } >> "${rc}"
    echo "[ok] wired ${rc}"
}

wire_rc "${HOME}/.bashrc"
[ -f "${HOME}/.zshrc" ] && wire_rc "${HOME}/.zshrc"

cat <<'EOF'

설치 완료. 새 셸을 열거나 아래로 즉시 로드하세요:

  source ~/.bashrc        # zsh 사용자는: source ~/.zshrc

그 다음:

  claude auth login            # 사용할 계정으로 로그인
  claude setup-token           # 출력된 sk-ant-oat... 토큰 복사
  claude-acct save personal    # 토큰 붙여넣기

  claude-acct use personal     # 이후 실행되는 claude 가 이 계정 사용
  claude-acct help             # 전체 사용법
EOF
