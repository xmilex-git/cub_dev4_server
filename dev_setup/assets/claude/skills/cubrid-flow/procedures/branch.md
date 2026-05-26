
# branch (procedure)

새 작업 브랜치 부트스트랩. 회사 컨벤션은 JIRA 키 `CBRD-NNNNN` 이지만, **현장에서는 semantic name (`parallel_scan_all`) 또는 backport prefix (`cbrd_26495_10.2`) 도 흔함** — 본 skill 은 이름을 강제하지 않고 호출자가 명시하게 한다.

## 입력

- `BRANCH`: 만들 브랜치 이름. 검증: 비어있지 않고, `^[A-Za-z0-9._/-]+$` 만 허용, `develop` 자체 금지.
- `BASE` (선택): 기본 `origin/develop`. backport 시 `origin/develop_11.3` 등.
- `KEY` (선택): 연관된 JIRA CBRD 번호 — 브랜치 이름과 무관하게 `cubrid-flow` 의 상태 파일 키로만 사용.
- `STASH_MODE` (선택, **기본 1** — 2026-05-06 이후 정책 변경): tracked 변경이 있으면 `git stash push` 후 브랜치 작업 → 종료 시 `git stash pop`. 0 으로 명시 override 시에만 비활성. untracked 파일은 stash 안 함 (git checkout 에 영향 없음).

  **변경 사유**: 사용자 정책 — 본 워크스페이스의 stage 안 된 변경은 **항상** "커밋 대상 아님 + 보존 필요" 로 간주. 매번 묻지 않고 자동 stash → 자동 pop. 아래 "보존 대상 파일 패턴" 참조.

### 보존 대상 파일 패턴 (working tree 상시 dirty, 절대 커밋 금지)

본 워크스페이스에서 항상 working tree 에 남아 있는, 절대 커밋되면 안 되는 파일들. 어떤 step 의 어떤 dispatch 도 이 파일들을 `git add` 하면 안 됨:

**Tracked (M — 사용자 로컬 modification)**
- `.gitignore`
- `CMakeLists.txt`
- `cubrid-cci` (submodule pointer 또는 내부 변경)

**Untracked (??)**
- `CMakeUserPresets.json` (CMake user-local presets)
- `csql.access`, `csql.err` (csql runtime 파일)
- `ctpout.txt` (CTP regression 출력)

위 파일들은 **stash → branch ops → pop** 패턴으로 step 4-5 에서 보존되며, step 6 (구현) / step 9.2 (디버깅) / step 11 (테스트 수정) dispatch 시 agent / team 에게 "**아래 파일들은 절대 git add / git commit 대상 아님**" directive 를 명시 전달해야 함. 새 untracked 파일이 추가되면 이 목록도 갱신.

## 사전 검증

```bash
cd /home/cubrid/dev/cubrid

[[ -n "$BRANCH" ]] || { echo "ERR BRANCH empty"; exit 1; }
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || { echo "ERR invalid branch name '$BRANCH'"; exit 1; }
[[ "$BRANCH" == "develop" ]] && { echo "ERR cannot use 'develop'"; exit 1; }

BASE="${BASE:-origin/develop}"

# 1. dirty tree 차단 (STASH_MODE=1 일 때는 stash 가능)
if [[ -n "$(git status --porcelain -uno)" ]]; then
  # STASH_MODE 기본값 = 1 (사용자 정책). 명시적 STASH_MODE=0 일 때만 차단.
  if [[ "$STASH_MODE" == "0" ]]; then
    echo "ERR working tree dirty + STASH_MODE=0"
    exit 1
  fi
fi
STASH_MODE="${STASH_MODE:-1}"

# 2. xmilex remote 존재
git remote get-url xmilex >/dev/null 2>&1 || { echo "ERR no remote 'xmilex'"; exit 1; }

# 3. 동일 브랜치 로컬/원격 존재 차단
git show-ref --verify --quiet "refs/heads/$BRANCH" \
  && { echo "ERR local branch $BRANCH already exists"; exit 1; }
git ls-remote --exit-code --heads xmilex "$BRANCH" >/dev/null 2>&1 \
  && { echo "ERR xmilex/$BRANCH already exists"; exit 1; }

# 4. base 가 origin/* 형태인지 (안전 가드)
[[ "$BASE" == origin/* ]] || { echo "ERR base must be origin/<branch>, got $BASE"; exit 1; }
```

## 실행 절차

```bash
LOCAL_BASE="${BASE#origin/}"
STASHED=0

# tracked 변경이 있고 STASH_MODE=1 이면 stash 후 진행
if [[ "$STASH_MODE" == "1" && -n "$(git status --porcelain -uno)" ]]; then
  STASH_MSG="cubrid-flow:branch:$BRANCH:$(date +%s)"
  git stash push -m "$STASH_MSG"   # tracked-only (untracked 는 그대로 워킹트리에 남음)
  STASHED=1
fi

git fetch origin --prune
git checkout "$LOCAL_BASE"
git pull --ff-only origin "$LOCAL_BASE"     # ff-only — merge commit 차단
git checkout -b "$BRANCH" "$BASE"           # base 명시
git push -u xmilex "$BRANCH"

# 새 브랜치는 BASE 와 동일 트리 → stash 가 conflict 없이 pop 됨
if [[ "$STASHED" == "1" ]]; then
  git stash pop || { echo "ERR stash pop conflict — 'git stash list' 로 보존된 stash 확인 후 수동 처리"; exit 2; }
fi
```

성공 출력 (단일 라인):

```
OK branch=$BRANCH base=$BASE@$(git rev-parse --short $BASE) pushed=xmilex/$BRANCH stashed=$STASHED
```

## 실패 분기

| 상황 | 처리 |
|------|------|
| `git pull --ff-only` 거부 (local base 가 origin 과 발산) | `git reset --hard $BASE` 제안만, 자동 실행 금지 |
| `git push` 거부 | 사전 검증으로 거의 발생 안 함, 발생 시 BRANCH 중복 재확인 |
| `xmilex` SSH key 인증 실패 | `ssh -T git@github.com` 으로 진단 제안 |
| BASE 가 존재하지 않음 (`develop_11.3` 오타 등) | `git fetch` 후 `git branch -r | grep <pattern>` 으로 확인 제안 |

## 주의 / 안티 패턴

- 브랜치 이름을 `CBRD-NNNNN` 로 자동 가정 금지. `cubrid-jira` 가 만들어 준 KEY 를 항상 BRANCH 로 쓰지 말 것 — 사용자/팀 컨벤션 따라 결정.
- `git push -u origin $BRANCH` 금지 — origin 은 CUBRID/cubrid (read-only). 항상 xmilex.
- `git stash` 의 **자동** 호출 금지. 단, 사용자가 "커밋하지 않을 변경을 살려두고 브랜치 만들라" 명시할 때는 `STASH_MODE=1` 입력으로 stash → branch ops → stash pop 패턴 허용. 사용자 명시 없는 한 dirty tree 는 ERR 차단이 default.
- `git stash pop` 충돌 발생 시 자동 `git stash drop` 금지 — 사용자 데이터 손실. `git stash list` 에 보존된 entry 를 사용자에게 알리고 수동 처리 요청.
- `git stash --include-untracked` 사용 금지 — untracked 파일은 git checkout / pull 에 영향이 없으므로 stash 할 필요가 없고, 함께 stash 하면 untracked 가 일시 사라져 사용자 혼란 유발.
- branch prefix (`feature/`, `bugfix/`) 자동 부착 금지 — 회사에서 안 쓰는 컨벤션.
- `git pull` 을 fast-forward 가 아니라 merge 로 두면 develop 에 사용자 로컬 commit 이 섞일 위험. 반드시 `--ff-only`.
- BASE 를 `develop` (origin/ 없이) 로만 두면 stale local 에서 분기될 위험. 항상 `origin/<...>`.

## 후속 작업 가이드

- 성공 시: 사용자가 코딩 시작.
- `cubrid-flow` 상태 파일에는 BRANCH 가 아니라 KEY 로 매핑 (한 KEY 에 여러 brunch 가능 — backport 등). state 키 = `<KEY>` 또는 사용자가 지정한 별칭.
