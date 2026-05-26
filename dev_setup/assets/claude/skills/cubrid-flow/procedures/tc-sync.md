
# tc-sync (procedure)

CUBRID 의 testcase 봇 (`app/cubrid-tc-sync-bot`) 이 자동으로 만들어 둔 PR 에 expected output 변경분을 올린다.

## 봇 PR 의 (검증된) 패턴

| 항목 | 값 |
|------|-----|
| 작성자 | `app/cubrid-tc-sync-bot` (GitHub App) |
| head 브랜치 | `tc/pr-<cubrid_pr_number>` (예: cubrid#7062 → `tc/pr-7062`) |
| base 브랜치 | `develop` |
| 제목 | `[CBRD-NNNNN] Draft: TC changes for PR CUBRID/cubrid#NNNN` (CBRD 누락 케이스도 있음) |
| 생성 시점 | cubrid 본 PR 생성 직후 (수 초~수십 초) |
| 양 레포 동시 생성 | `cubrid-testcases` + `cubrid-testcases-private-ex` 양쪽 |

→ 본 skill 은 봇 head 이름을 **PR 번호로부터 결정**한다. CBRD 키 / cubrid 브랜치명에 의존하지 않음.

## 사용 시점

- `cubrid-ctp` 가 NOK → 분석 결과 "스펙에 의한 정답 변경" → sql/medium answer 갱신
- `cubrid-ci` 가 shell 카테고리 NOK → shell 케이스 정정

## 레포 라우팅

| 변경 경로 (top-level dir) | 대상 레포 | 로컬 클론 |
|----------------------------|-----------|-----------|
| `sql/`, `medium/`, `isolation/`, `tool/` | `CUBRID/cubrid-testcases` | `~/cubrid-testcases` |
| `shell/`, `shell_heavy/`, `shell_perf/` | `CUBRID/cubrid-testcases-private-ex` | `~/cubrid-testcases-private-ex` |

호출자가 변경 파일 목록 1개 이상을 제공. 첫 번째 파일의 top-level 디렉토리로 라우팅 결정.

## 입력

- `CUBRID_PR`: cubrid 본 레포의 PR 번호 (필수). 미제공 시 현재 브랜치로부터 `gh pr view --json number -q .number` 로 추출.
- `FILES`: 변경 파일 경로 (testcases 레포 기준 상대경로) — 1개 이상.
- `MSG_SUFFIX` (선택): commit 메시지 보강용.

## 실행 절차

```bash
cd /home/cubrid/dev/cubrid
CUBRID_PR=${CUBRID_PR:-$(gh pr view --json number -q .number 2>/dev/null)} \
  || { echo "ERR no cubrid PR — pass CUBRID_PR=N"; exit 1; }

BOT_HEAD="tc/pr-$CUBRID_PR"

# 라우팅 — 첫 변경파일 top-level 로 결정
case "${FILES[0]%%/*}" in
  sql|medium|isolation|tool) REPO="CUBRID/cubrid-testcases"; LOCAL=~/cubrid-testcases ;;
  shell|shell_heavy|shell_perf) REPO="CUBRID/cubrid-testcases-private-ex"; LOCAL=~/cubrid-testcases-private-ex ;;
  *) echo "ERR cannot route '${FILES[0]}' — first dir not recognized"; exit 1 ;;
esac
```

봇 PR 존재 검증:

```bash
PR_JSON=$(gh pr list --repo "$REPO" --search "head:$BOT_HEAD" --state open --json number,headRefName --limit 1)
PR_NUM=$(echo "$PR_JSON" | jq -r '.[0].number // empty')
[[ -n "$PR_NUM" ]] || { echo "ERR no bot PR $BOT_HEAD on $REPO yet — wait or check cubrid#$CUBRID_PR"; exit 1; }
```

checkout & 변경 적용 (호출자가 LOCAL 안에 변경 파일을 미리 적용한 상태여야 함):

```bash
cd "$LOCAL"
[[ -z "$(git status --porcelain)" ]] && { echo "ERR no local changes in $LOCAL"; exit 1; }

# stash 강제 금지 — 호출자가 의도해서 변경한 상태
# 다만 봇 head 로 옮겨가기 전에 사용자가 다른 브랜치에 있을 수 있으니 확인
CUR=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CUR" != "$BOT_HEAD" ]]; then
  echo "ERR currently on '$CUR', expected '$BOT_HEAD' — re-apply changes after checkout:"
  echo "    cd $LOCAL && git fetch origin && git checkout -B $BOT_HEAD origin/$BOT_HEAD"
  exit 1
fi

# 명시 add (전체 add 금지)
for f in "${FILES[@]}"; do git add -- "$f" || { echo "ERR add $f"; exit 1; }; done

git commit -m "[CBRD] tc-sync for cubrid#$CUBRID_PR ${MSG_SUFFIX:-}"
git push origin "$BOT_HEAD"

SHA=$(git rev-parse --short HEAD)
echo "OK tc-sync repo=$(basename $REPO) pr=#$PR_NUM head=$BOT_HEAD sha=$SHA"
```

## 호출자 워크플로우 권장

1. 변경 사항을 명확히 한 뒤 호출:
   ```bash
   cd ~/cubrid-testcases
   git fetch origin && git checkout -B tc/pr-7062 origin/tc/pr-7062
   # 여기서 expected output 파일들을 수정
   FILES=("sql/_24_basic/cases/foo.answer" "sql/_24_basic/cases/foo.sql") \
     CUBRID_PR=7062 cubrid-tc-sync ...
   ```
2. push 후 cubrid 본 PR 에 자동 코멘트 (선택):
   ```bash
   gh pr comment $CUBRID_PR --repo CUBRID/cubrid \
     --body "tc-sync: $REPO#$PR_NUM @ $SHA"
   ```

## 출력 규약

| 결과 | 출력 |
|------|------|
| 정상 push | `OK tc-sync repo=<name> pr=#NNN head=tc/pr-N sha=<short>` |
| 봇 PR 부재 | `ERR no bot PR tc/pr-N on <repo> yet` |
| 라우팅 실패 | `ERR cannot route '<path>'` |
| 로컬 dirty 없음 | `ERR no local changes` |
| 잘못된 브랜치 | `ERR currently on '<cur>', expected 'tc/pr-N'` |

## 주의 / 안티 패턴

- 봇 head 이름을 CBRD 키 기반으로 추정하지 말 것 (`CBRD-XXXXX`, `auto/CBRD-XXXXX` 등) — 항상 `tc/pr-<cubrid-PR-N>` 로 결정. 검증된 패턴은 이것 하나뿐.
- 봇 PR 이 아직 없는데 (cubrid PR 생성 직후 race) 새로 PR 만들지 말 것 — 봇 hook 가 곧 만든다. 부재 에러 후 사용자가 수십 초 뒤 재호출.
- `git add -A` / `git add .` 절대 금지 — 봇 PR 에 의도하지 않은 파일 (`.swp`, log, core) 섞임.
- 한 commit 에 sql 카테고리와 shell 카테고리를 섞지 말 것 — 두 레포가 다르다. 카테고리별 별도 호출.
- cubrid 본 레포에서 testcases 변경을 만들지 말 것 — 디렉토리 구조 다르고 commit 도 다른 레포.
- 봇이 만들어 둔 base (`develop`) 를 갈아엎지 말 것 — `git rebase` 금지, `git push --force` 금지. 추가 commit 만.
- `gh pr list --search "CBRD-XXXXX"` 로 봇 PR 검색하면 동명 PR 여러 개 매치될 수 있음 — `head:tc/pr-<N>` 로 정확 매칭.

## 후속 작업 가이드

- push 후 보통 `cubrid-ci run` 으로 `/run all` 재트리거 — 변경된 expected 가 적용된 상태로 CI 재검증.
- shell 카테고리 push 후엔 cubrid 본 레포에 코드 변경도 같이 들어가는 게 일반적이라, 두 PR 모두 push 됐는지 확인.
