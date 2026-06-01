
# ci (procedure)

PR 의 CI(CircleCI sql / medium / shell) 를 트리거하고 결과까지 추적한다.

## 사용 시점

- PR 첫 생성 직후, 또는 testcase/코드 수정 push 후 재검증이 필요할 때
- `cubrid-ctp` 로컬 통과 → 원격 CI 도 같은 결과인지 확인할 때

## 동작 1: 트리거 (`run`)

```bash
cd /home/cubrid/dev/cubrid
KEY=$(git rev-parse --abbrev-ref HEAD)
[[ "$KEY" =~ ^CBRD-[0-9]+$ ]] || { echo "ERR not on CBRD branch"; exit 1; }

PR_NUM=$(gh pr view --json number -q .number 2>/dev/null) \
  || { echo "ERR no PR for $KEY"; exit 1; }

gh pr comment "$PR_NUM" --body "/run all"
echo "OK triggered PR=#$PR_NUM"
```

코멘트 직후 CircleCI 가 webhook 받아 파이프라인 시작 — 보통 5~15초 후 status check 가 GitHub 에 등록되기 시작.

## 동작 2: 상태 폴링 (`watch`)

폴링 전략 — 기본 캐시 TTL(5분) 안쪽 270초 단위. 상한 90분.

```bash
DEADLINE=$(( $(date +%s) + 5400 ))   # 90분
while [[ $(date +%s) -lt $DEADLINE ]]; do
  STATE=$(gh pr checks "$PR_NUM" --json name,state,link 2>/dev/null)
  [[ -z "$STATE" ]] && { sleep 270; continue; }

  # state: SUCCESS / FAILURE / PENDING / IN_PROGRESS / SKIPPED
  PENDING=$(echo "$STATE" | jq '[.[] | select(.state=="PENDING" or .state=="IN_PROGRESS")] | length')
  FAIL=$(echo "$STATE" | jq '[.[] | select(.state=="FAILURE" or .state=="CANCELLED")] | length')

  if [[ "$PENDING" == "0" ]]; then
    if [[ "$FAIL" == "0" ]]; then
      echo "OK GREEN PR=#$PR_NUM"
      echo "$STATE" | jq -r '.[] | "  + \(.name) \(.state)"'
      exit 0
    else
      echo "FAIL PR=#$PR_NUM failed=$FAIL"
      echo "$STATE" | jq -r '.[] | select(.state=="FAILURE" or .state=="CANCELLED") | "  - \(.name) \(.link)"'
      exit 1
    fi
  fi

  echo "  ... pending=$PENDING (sleep 270s)"
  sleep 270
done

echo "ERR timeout PR=#$PR_NUM still pending after 90m"
exit 2
```

## 실패 분기 — 후속 작업 가이드

상위 호출자(cubrid-flow 등)가 받는 출력:

| 출력 | 의미 | 다음 단계 |
|------|------|-----------|
| `OK GREEN` | 모든 check pass | 리뷰 단계로(`cubrid-pr-review` 등) |
| `FAIL ... shell-test` | shell 카테고리 NOK | `cubrid-tc-sync` 또는 코드 수정 후 재 `run` |
| `FAIL ... sql-medium-test` | 9.1 동기화 누락 | 동일 — `cubrid-tc-sync` 사용 |
| `FAIL ... build` | 빌드 실패 (드물게) | 로컬 `cubrid-build` 로 재현 → 수정 후 push |
| `ERR timeout` | CircleCI 가 멈췄거나 webhook 미도달 | 사용자에게 수동 확인 요청 (재 트리거 자동 금지) |

## 주의 / 안티 패턴

- 폴링 간격 60초 미만 금지 — GitHub API rate limit 빠르게 소진. 최소 270초.
- 동일 PR 에 `/run all` 을 5분 안에 두 번 이상 보내지 말 것 — CircleCI 가 중복 파이프라인을 거절하거나 큐 적체.
- 실패한 job 의 로그를 자동으로 받지 말 것 (CircleCI 로그는 수십 MB). URL 만 사용자에게 전달.
- `gh pr checks --watch` 옵션은 사용 금지 — 실시간 스트림 도중 세션이 끊기면 결과 분류가 깨진다. 명시적 폴링.
- timeout 후 자동 `/run all` 재시도 금지 — 멈춘 원인이 webhook 인지 CI 인지 모르는 상태에서 코멘트만 더 쌓인다.
- 한 번에 여러 PR 동시 watch 금지 — 본 skill 은 단일 PR 가정. 여러 개면 호출자가 별도 인스턴스로 띄움.

## 후속 작업 가이드

- GREEN → 리뷰 대응 단계 (`cubrid-pr-review` 호출 가능).
- FAIL → 카테고리별 수정 후 본 skill 재호출. cubrid-flow 가 자동 재실행 루프를 가질지는 별도 정책 (기본은 사용자 confirm).
