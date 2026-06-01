# dev_setup - 새 CUBRID 개발 서버 워크스페이스 일괄 세팅

dev4 베이스 이미지(Rocky 8) 위에서, 새 컨테이너/서버에 본 사용자 개발 환경을
**`./setup.sh` 한 번**으로 끝내기 위한 스크립트 모음.

## 무엇을 해주나

| 단계 | 스크립트 | 내용 |
|---|---|---|
| 01 | `01_install_packages.sh` | dnf 로 `gh`, `tmux`, `python3.11`, `clang`, `cmake`, `ninja`, `git-lfs`, `jq` 등 누락된 것만 설치 |
| 02 | `02_install_nvm_node.sh` | nvm + Node.js (`npx`/`npm` 용) + `@anthropic-ai/claude-code` (claude CLI) 설치 |
| 03 | `03_setup_github_ssh.sh` | `gh auth login` → ed25519 SSH 키 생성 → `gh ssh-key add` 로 GitHub에 자동 등록 → SSH 연결 검증 → `git user.name/email` 설정 |
| 04 | `04_install_dotfiles.sh` | `~/.dev4_profile`, `~/.cubrid.sh`, `~/.claude-account.sh` 배치 + `~/.bashrc` 에 PATH/profile/nvm/claude-account 블록 append |
| 05 | `05_clone_repos.sh` | `~/dev/cubrid`, `~/cubrid-testcases`, `~/cubrid-testtools` SSH clone + fork remote(`xmilex`) 등록 |
| 06 | `06_install_bin.sh` | `~/bin/` 의 모든 셸 스크립트 (`build_cubrid.sh`, `ctp_test.sh`, ...) 설치 |
| 07 | `07_install_cmake_presets.sh` | `~/dev/cubrid/CMakeUserPresets.json` 배치 (clang preset 정의) |
| 09 | `09_install_claude_skills.sh` | `~/dev/cubrid/.claude/` 의 `CLAUDE.md`, `hooks/`, `skills/` 마이그레이션 |

## 사용법

새 서버에 SSH 로 접속한 뒤, 이 레포를 받아서 실행:

```bash
# 사용자 홈에서 (예: /home/cubrid)
git clone https://github.com/xmilex-git/cub_dev4_server.git
cd cub_dev4_server/dev_setup

# 전체 실행
./setup.sh

# 또는 단계별
./setup.sh --list
./setup.sh 05_clone_repos
./setup.sh --from 06_install_bin
```

03 단계의 `gh auth login` 만 인터랙티브이고, 나머지는 자동입니다.
중단되면 같은 명령으로 재실행해도 멱등(idempotent)하게 동작합니다.

### `gh auth login` 답변 가이드

| Prompt | 답 |
|---|---|
| Where do you use GitHub? | `GitHub.com` |
| Preferred protocol for Git? | **`SSH`** |
| Generate a new SSH key? | **`Skip`** (스크립트가 직접 생성/등록) |
| Authenticate Git with credentials? | `Yes` |
| How to authenticate? | `Login with a web browser` |

> ⚠️ **중요**: SSH 키 자동 업로드가 동작하려면 토큰에 `admin:public_key`
> 스코프가 필요합니다. `gh auth login` 시 SSH 프로토콜을 고르면 보통 자동으로
> 요청되지만, 누락된 경우 다음으로 추가:
> ```bash
> gh auth refresh -h github.com -s admin:public_key
> ```
> 스코프가 없거나 등록이 실패하면 03 단계가 public key 를 출력하면서
> https://github.com/settings/ssh/new 에서 수동 등록하는 방법을 안내합니다.

## Claude 계정 전환 (`claude-acct`)

여러 Claude 구독 계정(예: 개인 / 회사)을 쓸 때, 한 계정의 사용량 한도를 소진하면
다른 계정으로 갈아타기 위한 헬퍼. 04 단계에서 `~/.claude-account.sh` 가 설치되고
`~/.bashrc`(있으면 `~/.zshrc`) 에서 자동 source 된다. 새 셸을 열면 `claude-acct`
명령을 쓸 수 있다.

```bash
# 계정마다 1회 등록
claude auth login            # 그 계정으로 로그인
claude setup-token           # sk-ant-oat... 토큰 출력
claude-acct save personal    # 위 토큰 붙여넣기 (입력 숨김)

# 회사 계정은 로그아웃 후 다시 로그인하고 토큰을 새로 발급해야 한다
claude auth logout
claude auth login            # 회사 계정으로
claude setup-token
claude-acct save work

# 전환
claude-acct use work         # 이후 실행되는 claude 가 work 계정 사용
claude-acct use personal
claude-acct list             # 저장된 계정 (* = 활성)
claude-acct off              # 토큰 해제 -> 기본 로그인 계정
```

> 토큰은 **발급 시점에 로그인된 계정** 기준이다. "토큰이 다르다"가 "계정이
> 다르다"를 보장하지 않으니, 다른 계정 토큰은 반드시 `claude auth logout` →
> 그 계정으로 `claude auth login` 후 `setup-token` 으로 만들 것.
>
> 저장 위치: macOS = Keychain, Linux = `~/.config/claude-account/<name>.token`(0600).
> `CLAUDE_CODE_OAUTH_TOKEN` 환경변수를 토글하는 방식이라 **현재 셸에만** 적용되며,
> 이미 떠 있는 claude 세션엔 반영되지 않는다(새로 실행해야 함). `setup-token` 은
> Claude 구독(Max 권장)이 필요하다.

## 사전 조건

- Rocky/RHEL 8 (`dnf` 사용 가능)
- sudo 권한 있는 일반 사용자 계정 (root 직접 실행 비권장)
- 외부 네트워크 접근 (github.com, npmjs.com, nvm github, dnf repos)
- dev4 베이스 이미지에 이미 포함된 가정: `git`, `curl`, `sudo`, glibc 기본 빌드 체인

## 끝나고 나면

```bash
exec bash -l        # 새 셸로 .bashrc 다시 로드
build_cubrid.sh d 11.5.develop   # debug 빌드 검증
claude                # claude CLI 동작 확인
```

## 환경 변수로 커스터마이즈

| 변수 | 기본값 | 용도 |
|---|---|---|
| `GH_USER` | `xmilex-git` | 본인 GitHub username (fork remote URL에 사용) |
| `GH_FORK_REMOTE` | `xmilex` | fork remote 이름 |
| `GIT_NAME` | `gh user` | `git config --global user.name` |
| `GIT_EMAIL` | (gh 또는 user@host) | `git config --global user.email` |
| `NODE_VERSION` | `24` | nvm 으로 설치할 node major 버전 |
| `KEY_TITLE` | `user@host-YYYYMMDD` | GitHub에 등록될 SSH 키 라벨 |

예:
```bash
GH_USER=otheruser GIT_EMAIL=me@example.com ./setup.sh
```

## 디렉토리 레이아웃

```
dev_setup/
├── README.md
├── setup.sh                  # 메인 진입점
├── lib/                      # 각 단계별 스크립트
│   ├── 00_common.sh          # 공통 헬퍼 (로깅, backup, append_block)
│   ├── 01_install_packages.sh
│   ├── 02_install_nvm_node.sh
│   ├── 03_setup_github_ssh.sh
│   ├── 04_install_dotfiles.sh
│   ├── 05_clone_repos.sh
│   ├── 06_install_bin.sh
│   ├── 07_install_cmake_presets.sh
│   └── 09_install_claude_skills.sh
└── assets/
    ├── bin/                  # ~/bin 에 깔릴 셸 스크립트들 (스냅샷)
    ├── dotfiles/             # .dev4_profile, .cubrid.sh, claude-account.sh
    ├── cmake/                # CMakeUserPresets.json
    └── claude/               # CLAUDE.md, hooks/, skills/
```

## 멱등성/안전성 노트

- 모든 단계는 재실행 안전. 이미 설치/설정된 항목은 스킵.
- 사용자 기존 `~/.bashrc`, `~/.cubrid.sh`, `~/.dev4_profile` 은 덮어쓰기 전에
  `*.dev_setup.bak` 으로 1회 백업.
- `.bashrc` 추가는 `# >>> dev_setup:path-and-profile >>>` 마커 블록으로 들어가므로
  마커가 보이면 다시 추가하지 않음.
- SSH 키는 이미 GitHub에 등록돼 있으면 재업로드하지 않음.
