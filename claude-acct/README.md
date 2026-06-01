# claude-acct — Claude Code 다중 계정 전환 헬퍼

여러 Claude 구독 계정(예: **개인 / 회사**)을 한 머신에서 번갈아 쓰기 위한 셸 헬퍼입니다.
한 계정의 사용량 한도를 소진하면 `claude-acct use <다른계정>` 한 번으로 갈아탑니다.

동작 방식은 단순합니다 — 계정마다 장기 OAuth 토큰을 하나씩 만들어 저장해두고,
`claude`가 읽는 `CLAUDE_CODE_OAUTH_TOKEN` 환경변수를 현재 셸에서 토글합니다.

---

## 📦 공유 파일 (이 폴더 통째로 전달)

| 파일 | 용도 |
|---|---|
| `claude-account.sh` | 헬퍼 본체 (`claude-acct` 셸 함수). bash/zsh 호환 |
| `install.sh` | 설치 스크립트 (위 파일 배치 + rc 파일에 source 한 줄 추가) |
| `README.md` | 이 문서 |

> 폴더째 복사하거나 zip으로 압축해서 전달하면 됩니다. 외부 의존성 없습니다.

---

## 🔧 설치

### 방법 1) 설치 스크립트 (권장)

```bash
cd claude-acct
bash install.sh
source ~/.bashrc      # zsh 사용자는: source ~/.zshrc
```

`install.sh`가 하는 일:
1. `claude-account.sh` → `~/.claude-account.sh` 로 복사
2. `~/.bashrc` (있으면 `~/.zshrc`) 에 아래 한 줄을 마커 블록으로 추가 (멱등):
   ```bash
   [ -f "$HOME/.claude-account.sh" ] && source "$HOME/.claude-account.sh"
   ```

### 방법 2) 수동 설치

```bash
cp claude-account.sh ~/.claude-account.sh
echo '[ -f "$HOME/.claude-account.sh" ] && source "$HOME/.claude-account.sh"' >> ~/.bashrc
source ~/.bashrc
```

> **전제 조건**: `claude` CLI 가 설치돼 있고, **Claude 구독(Max 권장)** 계정이어야
> `claude setup-token` 으로 토큰을 만들 수 있습니다.

---

## 🚀 사용법

### 1단계 — 계정마다 토큰 등록 (계정당 1회)

토큰은 **"발급 시점에 로그인된 계정"** 기준으로 만들어집니다. 따라서 계정별로
로그인 → 토큰 발급 → 저장을 반복합니다.

```bash
# 개인 계정
claude auth login            # 브라우저에서 개인 계정으로 로그인
claude setup-token           # sk-ant-oat... 토큰 출력 → 복사
claude-acct save personal    # 붙여넣기 (입력은 화면에 안 보임)

# 회사 계정 (반드시 로그아웃 후 다시 로그인하고 새 토큰 발급)
claude auth logout
claude auth login            # 브라우저에서 회사 계정으로 로그인
claude setup-token
claude-acct save work
```

> ⚠️ **흔한 실수**: `claude setup-token` 을 로그아웃/재로그인 없이 두 번 돌리면
> 토큰 문자열은 달라도 **둘 다 같은 계정** 토큰입니다. 전환해도 아무 일도 안
> 일어납니다. 다른 계정 토큰은 꼭 `logout → 그 계정으로 login → setup-token` 순서로.

### 2단계 — 전환

```bash
claude-acct use work         # 이후 실행되는 claude 가 work 계정 사용
claude-acct use personal     # 개인 계정으로
claude                       # 전환된 계정으로 실행
```

### 그 외 명령

```bash
claude-acct list      # 저장된 계정 목록 (* = 현재 활성)
claude-acct which     # 지금 활성 계정
claude-acct off       # 토큰 해제 → 기본 로그인 계정으로 폴백
claude-acct rm work   # 저장된 토큰 삭제
claude-acct help      # 도움말

# 편의 별칭
claude-work           # = claude-acct use work
claude-personal       # = claude-acct use personal
```

---

## ⚠️ 꼭 알아둘 점

1. **현재 셸에만 적용됩니다.** `use` 는 그 셸의 환경변수만 바꿉니다. 새 터미널
   탭/창에서는 다시 `claude-acct use <name>` 를 하거나, 항상 한 계정으로 시작하려면
   rc 파일 맨 끝에 `claude-acct use personal` 을 추가하세요.
2. **이미 떠 있는 claude 세션엔 즉시 반영되지 않습니다.** `use` 후 `claude` 를
   새로 실행해야 적용됩니다 (환경변수는 프로세스 시작 시 읽힘).
3. **한도는 5시간 롤링 윈도우**라 시간이 지나면 원래 계정도 복구됩니다. 소진 시
   `claude-acct use <다른계정>` 한 번 쳐주는 흐름입니다.
4. 회사/개인 계정 혼용은 각자 회사 정책/ToS 를 확인하세요.

---

## 🔒 토큰 저장 위치

- **macOS**: 시스템 Keychain (`security`, service: `claude-oauth-token`) — 평문 파일 없음
- **Linux 등**: `~/.config/claude-account/<name>.token` (권한 `0600`)

토큰은 1년 유효한 장기 OAuth 토큰입니다. 분실/유출 시 해당 계정에서
재발급(`claude setup-token`)하면 이전 토큰은 무효가 됩니다.

---

## 🧹 제거

```bash
claude-acct rm personal && claude-acct rm work   # 저장된 토큰 삭제
rm -f ~/.claude-account.sh
# 그리고 ~/.bashrc (및 ~/.zshrc) 에서 '# >>> claude-acct >>>' 블록 삭제
```
