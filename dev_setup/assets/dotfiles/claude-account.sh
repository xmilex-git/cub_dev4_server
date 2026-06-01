# claude-account.sh - Claude Code 계정(OAuth 토큰) 전환 헬퍼
#
# 회사/개인 등 여러 Claude 구독 계정 사이를 전환한다. 토큰을 발급해 두고
# CLAUDE_CODE_OAUTH_TOKEN 환경변수를 토글하는 방식이라, 한 계정의 사용량 한도를
# 소진하면 다른 계정으로 바로 갈아탈 수 있다.
#
# 이 파일은 *source* 되어야 한다 (~/.bashrc / ~/.zshrc 에서). 실행파일이 아니다.
#
# 사용법:
#   claude-acct save <name>   # `claude setup-token` 으로 받은 토큰을 저장 (입력 숨김)
#   claude-acct use  <name>   # 현재 셸에 토큰 적용 (이후 실행되는 claude 에 반영)
#   claude-acct off           # 토큰 해제 -> 기본 로그인 계정으로 폴백
#   claude-acct list          # 저장된 계정 목록 (* = 현재 활성)
#   claude-acct which         # 지금 활성화된 계정
#   claude-acct rm   <name>   # 저장된 토큰 삭제
#
# 토큰 발급 순서 (계정마다 1회):
#   1) 그 계정으로 로그인:  claude auth login
#   2) 토큰 생성:           claude setup-token   (sk-ant-oat... 출력)
#   3) 저장:               claude-acct save <name>   (위 토큰 붙여넣기)
# 주의: 토큰은 "발급 시점에 로그인된 계정" 기준이다. 다른 계정 토큰을 만들려면
#       반드시 claude auth logout -> 그 계정으로 claude auth login 후 setup-token.
#
# 저장 위치: macOS = Keychain(service: claude-oauth-token),
#            그 외  = $XDG_CONFIG_HOME/claude-account/<name>.token (권한 0600)
# 주의: env 변경은 "현재 셸"에만 적용된다. 새 탭/창에선 다시 `use` 하거나,
#       항상 한 계정으로 시작하려면 rc 파일 끝에 `claude-acct use <name>` 추가.

_CLAUDE_ACCT_SVC="claude-oauth-token"
_CLAUDE_ACCT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/claude-account"
_CLAUDE_ACCT_ACTIVE_FILE="${_CLAUDE_ACCT_DIR}/.active"
_CLAUDE_ACCT_INDEX="${_CLAUDE_ACCT_DIR}/.accounts"

# macOS Keychain 사용 가능 여부
_claude_acct_keychain() {
  [ "$(uname -s 2>/dev/null)" = "Darwin" ] && command -v security >/dev/null 2>&1
}

_claude_acct_mkdir() {
  mkdir -p "${_CLAUDE_ACCT_DIR}" 2>/dev/null && chmod 700 "${_CLAUDE_ACCT_DIR}" 2>/dev/null
}

# 토큰 저장: <name> <token>
_claude_acct_store() {
  local name="$1" tok="$2"
  if _claude_acct_keychain; then
    security add-generic-password -U -s "${_CLAUDE_ACCT_SVC}" -a "${name}" -w "${tok}"
  else
    _claude_acct_mkdir
    printf '%s' "${tok}" > "${_CLAUDE_ACCT_DIR}/${name}.token" && \
      chmod 600 "${_CLAUDE_ACCT_DIR}/${name}.token"
  fi
}

# 토큰 로드: <name> -> stdout
_claude_acct_load() {
  local name="$1"
  if _claude_acct_keychain; then
    security find-generic-password -s "${_CLAUDE_ACCT_SVC}" -a "${name}" -w 2>/dev/null
  else
    cat "${_CLAUDE_ACCT_DIR}/${name}.token" 2>/dev/null
  fi
}

# 토큰 삭제: <name>
_claude_acct_delete() {
  local name="$1"
  if _claude_acct_keychain; then
    security delete-generic-password -s "${_CLAUDE_ACCT_SVC}" -a "${name}" >/dev/null 2>&1
  else
    rm -f "${_CLAUDE_ACCT_DIR}/${name}.token"
  fi
}

# 숨김 입력 (bash/zsh 양쪽)
_claude_acct_read_secret() {
  # 결과를 전역 _CLAUDE_ACCT_TOK 에 담는다
  _CLAUDE_ACCT_TOK=""
  if [ -n "${ZSH_VERSION:-}" ]; then
    read -rs "_CLAUDE_ACCT_TOK?토큰 붙여넣기: "
  else
    read -rsp "토큰 붙여넣기: " _CLAUDE_ACCT_TOK
  fi
  echo
}

# 현재 로그인된 계정 이메일 (있으면 출력)
_claude_acct_current_email() {
  command -v claude >/dev/null 2>&1 || return 0
  claude auth status 2>/dev/null | grep -oE '"email":[^,]*' | head -1 | sed 's/.*: *"//; s/"$//'
}

claude-acct() {
  local cmd="${1:-}"
  [ $# -gt 0 ] && shift
  case "${cmd}" in
    save)
      local name="${1:-}"
      [ -z "${name}" ] && { echo "usage: claude-acct save <name>"; return 1; }
      local email; email="$(_claude_acct_current_email)"
      if [ -n "${email}" ]; then
        echo "현재 로그인 계정: ${email}"
        echo "이 계정으로 \`claude setup-token\` 한 토큰을 '${name}' 으로 저장합니다."
        echo "(다른 계정이면 먼저 claude auth login 으로 전환 후 setup-token 하세요.)"
      else
        echo "먼저 \`claude setup-token\` 으로 토큰을 받아두세요 (sk-ant-oat... 로 시작)."
      fi
      _claude_acct_read_secret
      [ -z "${_CLAUDE_ACCT_TOK}" ] && { echo "토큰이 비어 있습니다. 취소."; return 1; }
      _claude_acct_store "${name}" "${_CLAUDE_ACCT_TOK}" \
        || { echo "토큰 저장 실패"; _CLAUDE_ACCT_TOK=""; return 1; }
      _CLAUDE_ACCT_TOK=""
      _claude_acct_mkdir
      touch "${_CLAUDE_ACCT_INDEX}"
      grep -qxF "${name}" "${_CLAUDE_ACCT_INDEX}" 2>/dev/null || echo "${name}" >> "${_CLAUDE_ACCT_INDEX}"
      echo "[ok] '${name}' 저장 완료"
      ;;
    use)
      local name="${1:-}"
      [ -z "${name}" ] && { echo "usage: claude-acct use <name>"; return 1; }
      local tok; tok="$(_claude_acct_load "${name}")"
      [ -z "${tok}" ] && { echo "'${name}' 토큰을 찾을 수 없습니다. \`claude-acct list\` 확인."; return 1; }
      export CLAUDE_CODE_OAUTH_TOKEN="${tok}"
      _claude_acct_mkdir
      echo "${name}" > "${_CLAUDE_ACCT_ACTIVE_FILE}"
      echo "-> 활성 계정: ${name} (이 셸에서 실행되는 claude 에 적용됨)"
      ;;
    off)
      unset CLAUDE_CODE_OAUTH_TOKEN
      rm -f "${_CLAUDE_ACCT_ACTIVE_FILE}"
      echo "-> 토큰 해제. 기본 로그인 계정으로 폴백합니다."
      ;;
    list)
      if [ -s "${_CLAUDE_ACCT_INDEX}" ]; then
        local active; active="$(cat "${_CLAUDE_ACCT_ACTIVE_FILE}" 2>/dev/null)"
        echo "저장된 계정:"
        while IFS= read -r n; do
          [ -z "${n}" ] && continue
          if [ "${n}" = "${active}" ] && [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
            echo "  * ${n}  (활성)"
          else
            echo "  - ${n}"
          fi
        done < "${_CLAUDE_ACCT_INDEX}"
      else
        echo "저장된 계정이 없습니다. \`claude-acct save <name>\` 로 추가하세요."
      fi
      ;;
    which)
      if [ -n "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]; then
        echo "활성 계정: $(cat "${_CLAUDE_ACCT_ACTIVE_FILE}" 2>/dev/null || echo '(token set, name unknown)')"
      else
        echo "활성 계정: (env 미설정 -> 기본 로그인 사용)"
      fi
      ;;
    rm)
      local name="${1:-}"
      [ -z "${name}" ] && { echo "usage: claude-acct rm <name>"; return 1; }
      _claude_acct_delete "${name}" && echo "[rm] '${name}' 삭제됨" || echo "'${name}' 없음"
      if [ -f "${_CLAUDE_ACCT_INDEX}" ]; then
        grep -vxF "${name}" "${_CLAUDE_ACCT_INDEX}" > "${_CLAUDE_ACCT_INDEX}.tmp" 2>/dev/null
        mv "${_CLAUDE_ACCT_INDEX}.tmp" "${_CLAUDE_ACCT_INDEX}"
      fi
      ;;
    ""|help|-h|--help)
      cat <<'USAGE'
claude-acct - Claude Code 계정(OAuth 토큰) 전환

  claude-acct save <name>   토큰 저장 (claude setup-token 출력값 붙여넣기)
  claude-acct use  <name>   현재 셸에 적용 (이후 실행되는 claude 에 반영)
  claude-acct off           토큰 해제 -> 기본 로그인 계정
  claude-acct list          저장된 계정 목록 (* = 활성)
  claude-acct which         현재 활성 계정
  claude-acct rm   <name>   저장된 토큰 삭제

토큰 발급:  claude auth login  ->  claude setup-token  ->  claude-acct save <name>
편의 별칭:  claude-work / claude-personal
USAGE
      ;;
    *)
      echo "알 수 없는 명령: ${cmd}"; echo "claude-acct help 로 사용법 확인"; return 1
      ;;
  esac
}

# 편의 별칭 (원하면 사용)
claude-work()     { claude-acct use work; }
claude-personal() { claude-acct use personal; }
