
# pr (procedure)

GitHub PR 발행 + JIRA description 동기화를 한 호출로 처리한다.

## 사용 시점

- 첫 커밋 push 완료 후 PR 을 처음 만들 때
- 기존 PR 의 본문을 새로 갱신해야 할 때 (`--update` 모드)

## 입력 (모두 파일 기반)

브랜치 루트에서 다음 디렉토리를 작업 폴더로 사용한다:

```
~/.cache/cubrid-pr/<KEY>/
  ├── title.txt        # 한 줄: "Expand parallel heap scan to parallel scan (index, heap, list)"
  ├── pr-body.md       # GitHub markdown (Purpose + Implementation 위주, 짧게)
  └── jira-desc.wiki   # JIRA wiki markup (h2./h3./{code} 사용, 풀스펙)
```

세 파일이 모두 존재하지 않으면 에러로 빠진다 — 인라인 인자/heredoc 으로 본문 받지 말 것 (escape 깨짐, 한글 손실).

## 사전 검증

```bash
cd /home/cubrid/dev/cubrid

# KEY 는 인자로 받거나 ~/.cache/cubrid-pr/<KEY>/ 디렉토리에서 결정
# (브랜치 이름이 KEY 가 아닐 수 있음 — 예: branch='parallel_scan_all', KEY='CBRD-26722')
KEY="${KEY:?KEY=CBRD-NNNNN required}"
[[ "$KEY" =~ ^CBRD-[0-9]+$ ]] || { echo "ERR invalid KEY '$KEY'"; exit 1; }

DIR="$HOME/.cache/cubrid-pr/$KEY"
for f in title.txt pr-body.md jira-desc.wiki; do
  [[ -s "$DIR/$f" ]] || { echo "ERR missing $DIR/$f — run cubrid-pr-prep first"; exit 1; }
done

BRANCH=$(git rev-parse --abbrev-ref HEAD)
[[ "$BRANCH" == "develop" ]] && { echo "ERR on develop — switch to feature branch"; exit 1; }

# 원격에 push 된 상태인지 확인 (gh pr create 가 요구)
git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1 \
  || { echo "ERR upstream not set — run: git push -u xmilex $BRANCH"; exit 1; }
```

## 동작 1: PR 생성 (`create`)

```bash
SUMMARY=$(cat "$DIR/title.txt")
TITLE="[$KEY] $SUMMARY"

# PR 본문은 JIRA URL 헤더 + 사용자 본문 (URL 은 <> wrap → GitHub auto-link)
{
  echo "<http://jira.cubrid.org/browse/$KEY>"
  echo
  cat "$DIR/pr-body.md"
} > "$DIR/pr-final.md"

gh pr create \
  --repo CUBRID/cubrid \
  --base develop \
  --head "xmilex-git:$BRANCH" \
  --title "$TITLE" \
  --body-file "$DIR/pr-final.md"
```

성공 시 `gh` 가 PR URL 을 stdout 으로 출력. 캡처해서 보고:

```
OK PR https://github.com/CUBRID/cubrid/pull/NNNN
```

## 동작 2: 기존 PR 본문 갱신 (`update`)

```bash
PR_URL=$(gh pr view --json url -q .url 2>/dev/null) \
  || { echo "ERR no PR for branch $KEY"; exit 1; }

gh pr edit \
  --title "[$KEY] $(cat $DIR/title.txt)" \
  --body-file "$DIR/pr-final.md"
```

## 동작 3: JIRA description 동기화 (자동, create/update 둘 다 후행)

`cubrid-jira` 의 `update-desc` 패턴을 그대로 호출:

```bash
set -a; source ~/.config/cubrid-skills/jira.env; set +a

PAYLOAD=$(jq -Rs '{fields:{description:.}}' < "$DIR/jira-desc.wiki")
HTTP=$(curl -sS -o /tmp/jira_resp -w "%{http_code}" \
  -u "$JIRA_USER:$JIRA_PASS" -H "Content-Type: application/json" \
  -X PUT "$JIRA_BASE/rest/api/2/issue/$KEY" -d "$PAYLOAD")

[[ "$HTTP" == "204" ]] || { echo "ERR JIRA $HTTP $(jq -r '.errorMessages[]?' </tmp/jira_resp)"; exit 1; }
echo "OK JIRA $JIRA_BASE/browse/$KEY"
```

## 종합 출력

```
OK PR  https://github.com/CUBRID/cubrid/pull/NNNN
OK JIRA http://jira.cubrid.org/browse/CBRD-XXXXX
```

둘 중 하나만 성공하면 반쪽 결과를 명시적으로 보고 (사용자가 수동 보강 가능).

## 주의 / 안티 패턴

- PR 제목/본문에 인라인 한글 + escape 시퀀스 섞어 보내지 말 것 — `gh` 의 `--title` 인자 해석 실패가 잦다. 항상 `--body-file`.
- `gh pr create --head xmilex-git:$KEY` 의 `xmilex-git` 은 GitHub 사용자명. local remote 이름(`xmilex`) 과 다르다는 점 주의.
- JIRA wiki markup ↔ GitHub markdown 자동 변환 시도 금지 — 두 본문을 사용자가 따로 작성하는 것이 SSOT 분리 원칙에 부합. (회사 컨벤션상 PR 본문은 짧게, JIRA 가 풀스펙)
- description PUT 은 기존 본문을 통째로 덮어쓴다 — 보존이 필요하면 호출 전 GET 후 머지.
- `gh pr view` 가 여러 PR 후보를 반환하면 (포크 + 다른 base) `--repo CUBRID/cubrid` 를 명시.
- create 가 422 (already exists) 면 자동으로 update 모드로 전환하지 말고, 사용자에게 확인 후 진행.

## 후속 작업 가이드

- 생성 직후: cubrid-testcases 봇 PR 이 같이 생성됐는지 `gh pr list --repo CUBRID/cubrid-testcases --search "head:CBRD-$KEY"` 로 확인 → `cubrid-tc-sync` 가 처리.
- CI 트리거: `cubrid-ci` 호출.
