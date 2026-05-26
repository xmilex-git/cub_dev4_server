---
name: cubrid-flow
description: CUBRID 13단계 개발 플로우 마스터 (SSOT → JIRA → 브랜치 → 구현 → PR → CTP → CI → 리뷰). 단계 상태를 .omc/state/cubrid-flow/<KEY>.json 으로 추적하고 procedures/<name>.md 절차서로 라우팅한다. 사용자 명시 호출 only.
disable-model-invocation: true
---

# cubrid-flow

CUBRID 개발 13단계 프로세스의 마스터. 각 단계의 상태를 `.omc/state/cubrid-flow/<KEY>.json` 으로 추적하고, 단계별로 적절한 절차서(`procedures/<name>.md`) / OMC skill / agent 로 라우팅한다.

이 skill 은 **사용자 명시 호출**(`/cubrid-flow`, "cubrid 작업 시작" 등)에서만 진입한다. 자동 트리거는 frontmatter `disable-model-invocation: true` 로 비활성.

## 자동 진행 정책 (2026-05-06 이후)

사용자 명시 정책: **"한 번 세팅해두면 너 혼자 잘 진행"** — routine 결정은 사용자에게 묻지 말고 default / SSOT / plan 에 정의된 대로 자동 진행. 사용자 confirm 이 필요한 케이스는 아래 enumerated list 만:

**confirm 필요 (lead 가 자동 진행 금지, 사용자 입력 대기)**
- 회귀 매트릭스 외 경로 (자동 결정 금지 명시 ESCALATE)
- 같은 단계 `attempts ≥ 5`
- 같은 회귀 경로 2회 반복 (loop 의심)
- CORE_DUMP 분석 후 SSOT/spec 자체 회귀 결론
- 머지 결정 / PR 본문 외부에 보낼 경우 — step 7 PR create 는 SSOT/plan 으로부터 본문이 결정적으로 derivable 하면 confirm 없이 진행 OK
- 진짜 destructive 작업 (`git push --force-with-lease` to main, branch delete on remote, history rewrite, release tag 발행 등) — Auto Mode 의 "destructive 보호" 그대로 적용

**confirm 불필요 (자동 진행 OK)**
- 단계 간 routine 진입 (사용자가 명시 cancel 안 한 이상 다음 단계로 자동)
- Plan 의 dispatch 권고 (step 6 / 9.2 / 11) 따르기 — 사용자 override 없으면 항상 plan 권고 사용
- working tree dirty + 보존 대상 패턴 → 자동 stash (`STASH_MODE=1` default)
- JIRA / branch / PR / CI 트리거 — 입력이 SSOT / plan / state 에서 결정적이면 진행 결과만 보고
- 외부 send 의 결과 보고 (성공 / 실패) — 실패 시 디버깅 자동 진입 (사용자 입력 없이 patch 후 재시도)

**보존 대상 파일 (절대 커밋 금지)**
`procedures/branch.md` § "보존 대상 파일 패턴" 참조 — `.gitignore` / `cubrid-cci` (M) + `CMakeUserPresets.json` / `csql.access` / `csql.err` / `ctpout.txt` (??). 모든 step 6 / 9.2 / 11 dispatch 시 agent / team 에 이 목록 inject.

## 13단계 매핑

| # | 단계 | 호출 |
|---|------|------|
| 1 | SSOT 작성 | `Skill(skill="oh-my-claudecode:deep-interview")` — Socratic 인터뷰 후 `.omc/ssot/<KEY>.md` 산출 |
| 2 | 스펙/구현 계획 | task 복잡도로 dispatch — 단순/단일 모듈: `Skill(skill="oh-my-claudecode:omc-plan")` (=`oh-my-claudecode:plan`). 멀티파일 리팩터/레이어 이동/아키텍처 트레이드오프: `Skill(skill="oh-my-claudecode:ralplan")` 으로 planner+architect+critic 합의 루프. 단일 agent 만으로 충분하면 `Agent(subagent_type="oh-my-claudecode:planner")` 로도 가능. 매핑 디테일은 ↓ "step 2 plan dispatch 가이드". 산출: `.omc/plans/<KEY>.md` |
| 3 | JIRA 티켓 발행 | `procedures/jira.md` (`create`) |
| 4 | origin/develop pull | `procedures/branch.md` (1단계) |
| 5 | xmilex 브랜치 생성/push | `procedures/branch.md` (2단계) |
| 6 | 구현 | **plan §"Step 6 Dispatch Recommendation" 무조건 따름** (사용자 override 없으면 confirm 없이 진행). plan 권고 없는 경우의 default — 단순/단일책임: `Agent(subagent_type="oh-my-claudecode:executor")`. 아키텍처/멀티파일 리팩토링/큰 변경/레이어 이동: `Skill(skill="oh-my-claudecode:team")` (opus, architect+executor+code-reviewer). 어느 dispatch 든 "보존 대상 파일 (procedures/branch.md)" inject 필수. 빌드는 `cubrid-build` skill |
| 7a | PR/JIRA 본문 준비 | `procedures/pr-prep.md` (~/.cache/cubrid-pr/<KEY>/ 채움) |
| 7b | PR 생성 | `procedures/pr.md` (`create`) |
| 8 | PR/JIRA 본문 동기화 | `procedures/pr.md` 가 자동 수행 |
| 8.5 | **feature 동작 검증 (smoke test)** | `procedures/smoke-test.md` — 본 PR 에서 도입/수정한 기능을 실 query/시나리오로 호출해 정상 동작 확인. CTP 진입 전 게이트. cubrid-server start → csql 또는 직접 실행 → 결과 sanity check → cubrid-server stop. **CTP 보다 먼저 돌려서 회귀 매트릭스의 정상 진입로를 좁힌다.** |
| 9 | ctp.sh sql medium | `cubrid-ctp` skill |
| 9.1 | TC 답안 업데이트 | `procedures/tc-sync.md` (sql/medium 라우팅) |
| 9.2 | 코드 오류 수정 | NOK 단순: `Agent(subagent_type="oh-my-claudecode:debugger")`. CORE_DUMP / 분석 필요: tracer→debugger→executor→verifier 조합 또는 `Skill(skill="oh-my-claudecode:team")` (opus). 빌드는 `cubrid-build` skill |
| 10 | `/run all` 트리거 | `procedures/ci.md` (`run`) |
| 11 | shell test 수정 | testcase 단독 수정: `Agent(subagent_type="oh-my-claudecode:test-engineer")` 또는 `qa-tester`. 코드+testcase 동시: debugger+executor 조합 또는 `Skill(skill="oh-my-claudecode:team")`. 그 후 `procedures/tc-sync.md` (shell 라우팅) |
| 12 | `/run all` 재트리거 + 그린 대기 | `procedures/ci.md` (`run` + `watch`) |
| 13 | 리뷰 대응 | `pr-review-loop` skill |

**절차서 호출 규약**: `procedures/<name>.md` 가 가리키는 단계는 lead 가 해당 파일을 `Read` 한 뒤 본문의 "실행 절차" 를 그대로 수행한다 (별도 sub-skill 등록 없음 — 본문이 곧 절차). 자주 쓰여 자동 트리거가 유용한 `cubrid-build` / `cubrid-ctp` / `cubrid-server` 만 외부 top-level skill 로 유지하고, 나머지(`jira` / `branch` / `pr-prep` / `pr` / `tc-sync` / `ci`) 는 `procedures/` 로 흡수해 description 예산을 절약했다.

## 회귀 (loopback) 매트릭스

각 단계 실패 시 자동 회귀 대상. 회귀는 항상 **사용자 confirm** 필요 — 자동 무한 루프 금지.

| 실패 지점 | 분류 | 1차 회귀 | 비고 |
|----------|------|---------|------|
| 2 (plan) | SSOT 모호/모순 발견 | → 1 (SSOT 보강) → 2 | deep-interview 재호출 |
| 6 (구현) | 빌드 실패 (컴파일/링크) | → 6 재시도 | executor agent 자체 수정. 같은 에러 3회 → 사용자 escalate |
| 6 (구현) | plan 단계 누락/모순 발견 | → 2 (plan 수정) → 6 | plan 갱신 후 재구현 |
| 6 (구현) | SSOT 자체 모순/요구 충돌 | → 1 (SSOT) → 2 → 6 | 드물지만 critical. 사용자 명시 confirm |
| 8.5 (smoke) | 결과 wrong (의도된 동작 안 함) | → 6 (impl rework) → 8.5 | executor / debugger dispatch. 같은 에러 3회 → 사용자 escalate |
| 8.5 (smoke) | server crash | → 9.2 (tracer/debugger, opus) → 6 → 8.5 | core 파일 보존, gdb 백트레이스 추출 |
| 8.5 (smoke) | 결과는 OK 인데 SSOT 의도와 다른 정답 | → 1 (SSOT) 또는 2 (plan) → ... → 8.5 | 사용자 명시 confirm 필요 |
| 9 (CTP) | NOK + 스펙 의도 (정답 변경) | → 9.1 (tc-sync) → 12 | 코드 OK, expected 만 갱신 |
| 9 (CTP) | NOK + 코드 오류 | → 9.2 (debugger) → 6 → 9 | 코드 수정 후 재 CTP. opus 권장 |
| 9 (CTP) | CORE_DUMP | → 9.2 (tracer/debugger, opus) → 6 → 9 | 항상 opus. core 파일 보존 |
| 10/12 (CI) | shell FAIL | → 11 (shell fix) → 12 | 코드 또는 testcases-private-ex 수정 |
| 10/12 (CI) | sql/medium FAIL | → 9.2 (재분석) 또는 9.1 (tc-sync 누락) → 12 | 로컬 CTP 와 차이 원인 분석 |
| 10/12 (CI) | 빌드 FAIL | → 6 (로컬 재현) → 12 | 환경 차이 가능 — `cubrid-build` skill 로 재현 |
| 10/12 (CI) | 본질적 spec 회귀 | → 2 또는 1 → ... → 12 | 스펙/SSOT 자체 수정. 사용자 escalate |
| 13 (리뷰) | 리뷰가 spec 의문 제기 | → 1 또는 2 → ... → 13 | greptile/사람 리뷰의 valid 한 spec 지적 시 |
| 13 (리뷰) | 리뷰가 구현 지적 | → 6 → 12 → 13 | 구현 수정 후 CI 재검증 |

**자동 회귀 vs 사용자 escalate 기준**:
- **자동 회귀 OK**: 같은 단계 attempts < 3, 회귀 대상이 인접 단계 (e.g. 6→6, 9→9.2→6)
- **사용자 confirm 필요**: 비인접 회귀 (6→1, 12→2), 같은 단계 attempts ≥ 3, CORE_DUMP 분석 결과 스펙 회귀
- **무조건 사용자 escalate**: attempts ≥ 5, 같은 회귀 경로 2회 반복 (loop 의심)

## 상태 파일 형식

`/home/cubrid/dev/cubrid/.omc/state/cubrid-flow/CBRD-XXXXX.json`:

```json
{
  "key": "CBRD-XXXXX",
  "summary": "Expand parallel heap scan to parallel scan",
  "current_step": 7,
  "steps": {
    "1_ssot":       {"status": "done",    "ts": "...", "attempts": 1},
    "2_plan":       {"status": "done",    "ref": ".omc/plans/CBRD-XXXXX.md", "attempts": 1},
    "3_jira":       {"status": "done",    "key": "CBRD-XXXXX", "url": "...", "attempts": 1},
    "4_5_branch":   {"status": "done",    "branch": "CBRD-XXXXX", "attempts": 1},
    "6_impl":       {"status": "in_progress", "attempts": 2},
    "7_pr":         {"status": "pending", "attempts": 0},
    "8_jira_sync":  {"status": "pending", "attempts": 0},
    "9_ctp_sql":    {"status": "pending", "attempts": 0},
    "9_ctp_medium": {"status": "pending", "attempts": 0},
    "10_run_all_1": {"status": "pending", "attempts": 0},
    "11_shell_fix": {"status": "pending", "attempts": 0},
    "12_run_all_2": {"status": "pending", "attempts": 0},
    "13_review":    {"status": "pending", "attempts": 0}
  },
  "history": [
    {"ts": "...", "from": "9_ctp_sql", "to": "9.2_code_fix", "reason": "CTP NOK in btree corner case"},
    {"ts": "...", "from": "9.2_code_fix", "to": "6_impl",    "reason": "scope expanded — header signature change"}
  ]
}
```

`status` 값: `pending` / `in_progress` / `done` / `failed` / `looped_back`. `failed` 는 사용자 escalate 필요. `looped_back` 은 다른 단계에서 다시 진입 예정.

`attempts` 는 단계별 누적 시도 횟수. **`attempts == 5` 도달 시 자동 진행 중단**, 사용자에게 escalate.

`history` 는 회귀 발생마다 append-only 로그. loop 감지(`from→to` 가 2회 반복) 의 근거.

## 진입 동작

```bash
KEY="$1"   # 또는 현재 브랜치에서 추출
STATE="/home/cubrid/dev/cubrid/.omc/state/cubrid-flow/$KEY.json"
mkdir -p "$(dirname $STATE)"

if [[ ! -f "$STATE" ]]; then
  # 신규 진입 — 1단계부터 안내
  echo "NEW $KEY — start with step 1 (SSOT 작성)"
  exit 0
fi

CUR=$(jq -r .current_step "$STATE")
echo "CUR step=$CUR"
jq '.steps' "$STATE"
```

## 단계 진행 (`advance`) — Claude orchestrator 규약

호출자(Claude) 가 `cubrid-flow advance` 라고 요청하면 **Claude 가** 다음을 수행:

1. 현재 단계 읽기 (`jq .current_step "$STATE"`)
2. 해당 단계의 진입 조건 검증
3. 매핑된 절차서/OMC skill/agent 호출:
   - **절차서 호출**: `Read .claude/skills/cubrid-flow/procedures/<name>.md` 후 본문의 "실행 절차" 수행
   - **OMC skill**: `Skill(skill="oh-my-claudecode:deep-interview")` 등 외부 skill 직접 호출
   - **agent dispatch**: `Agent(subagent_type="oh-my-claudecode:executor", prompt="...")` (구현/디버그 단계)
   - **사람 단계**: SSOT 작성, 머지 결정 등 — 사용자에게 명시적으로 "manual" 알림
4. 결과를 받아 `.omc/state/cubrid-flow/<KEY>.json` 의 `steps.<N>.{status,ts,...}` 갱신 (atomic write — `mv tmp.json target.json`)
5. `current_step` 증가
6. 사용자에게 `DONE step=N / NEXT step=N+1 [auto|manual]` 보고

**중요**: 한 번에 한 단계만 진행. 연쇄 자동화 금지 — 매 단계 사이에 사용자 확인.

**사용 도구 매핑**:
| 단계 dispatch | 도구 |
|--------------|------|
| 절차서 호출 | `Read` (`.claude/skills/cubrid-flow/procedures/<name>.md`) — 본문의 절차 그대로 수행 |
| OMC skill 호출 | `Skill` (예: `oh-my-claudecode:deep-interview`, `oh-my-claudecode:plan`, `pr-review-loop`) |
| agent dispatch (단일) | `Agent` 도구, `subagent_type` 으로 OMC agent 선택. catalog 는 `omc-reference` skill 의 "Agent Catalog" 참조. `model` 은 **lead 가 task 복잡도로 판단** — 단순/반복은 sonnet, 아키텍처·멀티파일 리팩토링·심층 디버깅은 opus, 모르면 생략(agent 기본값) |
| agent dispatch (멀티) | `Skill(skill="oh-my-claudecode:team")` — 멀티-책임 task (architect+executor+code-reviewer, tracer+debugger+executor+verifier 등) 를 한 번에 분담. 단일 agent 로 처리 불가능한 큰 변경에만 사용 (실패 시 디버깅 비용 큼) |
| bash 실행 | `Bash`, 빌드/CTP 같은 long-running 은 `run_in_background: true` |
| 상태 파일 update | `Read`/`Write` (mtime 충돌 시 사용자 알림) |

## 구현/디버깅 단계의 agent dispatch 가이드 (6 / 9.2 / 11)

OMC agent catalog 는 `omc-reference` skill 의 "Agent Catalog" 섹션에 등재 — `explore` / `analyst` / `planner` / `architect` / `debugger` / `executor` / `verifier` / `tracer` / `security-reviewer` / `code-reviewer` / `test-engineer` / `designer` / `writer` / `qa-tester` / `scientist` / `document-specialist` / `git-master` / `code-simplifier` / `critic`.

dispatch 패턴은 단일 agent vs `oh-my-claudecode:team` 둘 중 하나:

| 패턴 | 적용 시점 | 호출 |
|------|----------|------|
| **단일 agent** | task 가 한 책임 안에 떨어짐 | `Agent(subagent_type="oh-my-claudecode:<role>")` |
| **team 분담** | 멀티 책임 / 검증 분리 / 큰 변경 | `Skill(skill="oh-my-claudecode:team")` 으로 task 분산 — agent 조합 자동 라우팅 |

자주 쓰는 매핑 (full catalog 는 `omc-reference`):

- **6단계 (구현)**
  - 단순/패턴화 (sonnet): `executor`
  - 미지의 영역 (sonnet): `explore` → `planner` → `executor` → `verifier`
  - 아키텍처 / 멀티파일 리팩토링 (opus): `team` 으로 `architect` + `executor` + `code-reviewer`
  - 보안 민감 변경: 위 조합 + `security-reviewer`
- **9.2단계 (CTP NOK / CORE_DUMP 코드 수정)**
  - NOK 단순 (sonnet): `debugger` 단독 → `executor`
  - NOK 어려움 (opus): `tracer` 로 evidence → `debugger` → `executor` → `verifier`
  - CORE_DUMP (opus, team 권장): `tracer` + `debugger` + `executor` + `verifier`
- **11단계 (shell test 실패)**
  - testcase expected 만 갱신: `qa-tester` 또는 `test-engineer`
  - 코드 + testcase 동시: `debugger` + `executor`, 큰 변경이면 `team`

**team 사용 가이드**: 단일 agent 의 책임 범위를 넘어가는 경우(설계+구현+리뷰 동시, tracing+debugging+verification 동시) 만 `team` 사용. 우선 단일 agent 로 시도 → 부족하면 escalation. team 은 실패 시 디버깅 비용이 크고 토큰 소모도 많음.

## step 2 plan dispatch 가이드

step 2 의 dispatch 는 **plan task 의 복잡도 + 합의 가치** 로 결정:

| 패턴 | 적용 시점 | 호출 |
|------|----------|------|
| **단일 skill** (omc-plan) | 단일 모듈 / 단일 책임 / SSOT 가 이미 거의 plan 수준 | `Skill(skill="oh-my-claudecode:omc-plan")` (=`oh-my-claudecode:plan`) |
| **단일 agent** (planner) | skill 오버헤드 없이 빠르게 plan 만 받고 싶을 때 | `Agent(subagent_type="oh-my-claudecode:planner", model="opus")` — SSOT 경로/배경 직접 inject |
| **합의 루프** (ralplan) | 멀티파일 / 레이어 이동 / 아키텍처 트레이드오프 / backward-compat 고려 / 알고리즘 설계 + refactor 동시 | `Skill(skill="oh-my-claudecode:ralplan")` — planner + architect + critic 가 consensus 까지 반복 |
| **수동 team** (Skill team) | ralplan 결과가 부족하거나 design 검토에 추가 역할 (security-reviewer 등) 이 필요할 때 | `Skill(skill="oh-my-claudecode:team")` 으로 `planner` + `architect` + `critic` (+추가 역할) 분담 |

선택 기준:
- SSOT 가 file:line 까지 명시하고 변경이 한 디렉토리 내면 → **omc-plan** 단독
- "어디로 옮겨야 layer 가 깨지지 않나" / "namespace 구조" / "backward-compat alias 어떻게" / "기존 N개 호출처 어떻게 마이그" 같은 design 결정이 잡혀있지 않으면 → **ralplan** consensus
- 디자인은 잡혔지만 별도 시각(보안/성능/테스트)이 필요하면 → **team** 으로 추가 역할 합류

**중요 — chain 금지**: ralplan 은 plan 만 산출하고 종료. autopilot / ralph / team execution 으로 자동 chain 되지 않도록 args 에 "Output plan only. Do NOT proceed to autopilot/ralph/team — cubrid-flow handles step 6 implementation separately." 명시.

## 라우팅 규칙 (단계별 진입 조건)

| 단계 | 진입 조건 |
|------|-----------|
| 1 (SSOT) | KEY 잠정값 정함 (정식 CBRD 발급 전이면 임시 슬러그). `oh-my-claudecode:deep-interview` 가 사용자와 인터뷰 후 `.omc/ssot/<KEY>.md` 생성 |
| 2 (plan) | `.omc/ssot/<KEY>.md` 존재. 단순 task: `oh-my-claudecode:omc-plan` (또는 `plan`) 단독. 멀티파일/리팩터/레이어 이동: `oh-my-claudecode:ralplan` 합의 루프 권장. 산출 `.omc/plans/<KEY>.md`. ralplan 호출 시 "consensus plan only — autopilot/ralph/team 으로 chain 금지, cubrid-flow 가 step 6 에서 호출한다" 명시 |
| 3 (JIRA) | `~/.config/cubrid-skills/jira.env` 존재. SSOT 의 한 줄 요약 + Description 으로 `procedures/jira.md` (`create`) |
| 4-5 (branch) | working tree clean, KEY 또는 BRANCH 이름 결정 |
| 7 (PR) | 현재 브랜치 push 완료, `~/.cache/cubrid-pr/$KEY/` 의 3개 파일 준비 (`procedures/pr-prep.md` 가 SSOT/plan 으로부터 채움) |
| 8.5 (smoke) | 로컬 debug 빌드 산출물 존재 (`/home/cubrid/CUBRID/bin/cub_server` 등) + PR 본문 / JIRA 동기화 완료. plan / SSOT 의 Goal 또는 Acceptance Criteria 첫 항목을 query/시나리오로 변환 가능 |
| 9 (CTP) | 8.5 PASS (smoke test 통과) + 로컬 빌드 성공 + 서버 기동 가능 |
| 10 (CI) | PR 존재 |
| 12 (CI 재) | 9.1 또는 11 의 push 가 새로 발생 |

**KEY 잠정값 처리**: 1단계 진입 시점엔 JIRA 키가 아직 없을 수 있다. 사용자가 슬러그(`parallel_scan_v2`) 로 시작하고, 3단계 발급 후 상태 파일을 `<slug>.json` → `<CBRD-NNNNN>.json` 으로 rename + SSOT/plan 파일 동기화.

## 출력 규약

매 advance 후 셋 중 하나로 보고:

```
DONE     step=N action=<summary>
NEXT     step=N+1 action=<what to do> [auto|manual]
```

```
LOOPBACK step=N→M reason=<요약> attempts[M]=<count>
NEXT     step=M action=<what to do> [auto|manual]
```

```
ESCALATE step=N attempts=<K> max=5
         reason=<why blocked>
         options=<suggested user actions>
```

`auto` = 자동 실행 가능 / `manual` = 사용자 작업 필요 / `ESCALATE` = lead 가 자동 진행 중단, 사용자 결정 대기.

회귀 매트릭스에 정의되지 않은 경로로 가야 하는 경우엔 자동 진행 금지하고 `ESCALATE`.

## procedures / lib / templates 디렉토리

```
.claude/skills/cubrid-flow/
├── SKILL.md                  # 본 파일 (오케스트레이터)
├── procedures/               # 단계별 절차서 — Read 로 로드해 수행
│   ├── jira.md               # JIRA 티켓 조회/생성/갱신
│   ├── branch.md             # 작업 브랜치 + xmilex push
│   ├── pr-prep.md            # PR 본문/JIRA 본문 3종 채우기
│   ├── pr.md                 # PR 발행 + JIRA 동기화
│   ├── tc-sync.md            # cubrid-testcases* 봇 PR 에 push
│   └── ci.md                 # /run all + status 폴링
├── lib/                      # procedures/jira.md 가 호출하는 Python CLI
│   ├── jira_client.py
│   ├── jira_cli.py
│   └── jira_mcp_server.py
└── templates/                # procedures/pr-prep.md 가 채우는 템플릿
    ├── title.tpl
    ├── pr-body.md.tpl
    └── jira-desc.wiki.tpl
```

procedures/ 안의 .md 들은 **개별 skill 이 아니다** — Claude Code 의 skill discovery 는 top-level `.claude/skills/<name>/SKILL.md` 만 스캔. 따라서 본 디렉토리는 cubrid-flow 가 활성일 때만 `Read` 로 참조된다 (description 예산 0).

## 주의 / 안티 패턴

- **자동 13단계 끝까지 돌리기 금지** — 6단계(구현) 와 13단계(리뷰 대응) 는 본질적으로 사람의 판단 단위. 자동 루프는 매번 사고 위험.
- 단계 건너뛰기 자동 허용 금지 — 사용자가 "8단계로 점프" 라고 명시할 때만 허용.
- 상태 파일 충돌 (같은 KEY 가 두 워크트리에서 진행) 시 lock 사용 금지 — JSON 파일 편집은 atomic rename 으로만, 충돌 감지는 mtime + sha 비교.
- 9, 10, 12 단계의 결과를 무시하고 다음 단계 진행 금지. NOK 시 반드시 회귀 매트릭스대로 9.1 / 9.2 / 11 로 분기.
- 13단계는 시작은 자동(`pr-review-loop` 등록) 가능하나 종료 판정은 사용자 — 머지는 cubrid-flow 가 하지 않음.
- **회귀 무한루프 방지**: 같은 `from→to` 가 history 에 2회 반복되면 자동 진행 중단 → ESCALATE. 같은 단계 `attempts ≥ 5` 도 마찬가지. 회귀는 진단 도구지 해결책이 아님.
- **회귀 매트릭스 외 경로 자동 결정 금지** — 매트릭스에 없는 회귀(예: 7→4)는 lead 가 임의로 가지 말고 ESCALATE 후 사용자 결정.
- LOOPBACK 시 상태 파일의 회귀 대상 단계 status 를 `looped_back` 으로 표기 + `history` 에 entry append. `current_step` 은 회귀 대상으로 되돌림.

## 시작 방법

### 신규 작업 (CBRD 번호 없음 — 보통의 시작)

CBRD-NNNNN 은 **3단계 (`procedures/jira.md` `create`) 에서야 발급**된다. 1~2단계 시점엔 사용자가 임시 슬러그로 시작.

```
사용자: "/cubrid-flow parallel_scan_v2"   (또는 "병렬 스캔 v2 작업 시작")
→ cubrid-flow:
   - 슬러그 정규화: parallel_scan_v2
   - 상태 파일: .omc/state/cubrid-flow/parallel_scan_v2.json (KEY=슬러그)
   - 1단계 진입: Skill(skill="oh-my-claudecode:deep-interview")
     → 인터뷰 종료 후 .omc/ssot/parallel_scan_v2.md 산출
사용자: "진행"
→ cubrid-flow advance:
   - 2단계: Skill(skill="oh-my-claudecode:plan")
     → .omc/plans/parallel_scan_v2.md 산출
사용자: "진행"
→ cubrid-flow advance:
   - 3단계: Read procedures/jira.md → "create" 절차 수행
     → CBRD-26800 발급
   - 상태 파일 rename: parallel_scan_v2.json → CBRD-26800.json
   - SSOT/plan 파일도 rename: parallel_scan_v2.md → CBRD-26800.md
   - 이후 단계는 KEY=CBRD-26800 으로 진행
사용자: "진행"
→ cubrid-flow advance: 4-5단계 (procedures/branch.md) ...
```

### 기존 CBRD 키로 시작 (드물게 — JIRA 가 다른 경로로 먼저 발급된 경우)

```
사용자: "/cubrid-flow CBRD-26800"
→ cubrid-flow:
   - 상태 파일이 없으면 신규 진입, KEY=CBRD-26800 그대로 사용
   - 3단계는 "이미 발급됨" 으로 mark, JIRA 본문만 동기화 (procedures/jira.md `update-desc`, 8단계 시점에 한 번 더)
   - 1단계 deep-interview 부터 동일 진행
```

### 진행 중 작업 재개

```
사용자: "/cubrid-flow status" 또는 "다음 단계"
→ cubrid-flow:
   - 현재 KEY 결정 (현재 브랜치 / 사용자 명시 / 가장 최근 mtime 의 상태 파일)
   - 상태 파일 dump + NEXT 보고
```

### 슬러그 → CBRD-NNNNN rename 규칙

3단계 발급 직후 atomic rename:

```bash
mv .omc/state/cubrid-flow/parallel_scan_v2.json  .omc/state/cubrid-flow/CBRD-26800.json
mv .omc/ssot/parallel_scan_v2.md                 .omc/ssot/CBRD-26800.md
mv .omc/plans/parallel_scan_v2.md                .omc/plans/CBRD-26800.md
```

상태 파일의 `key` 필드도 갱신, `history` 에 `{from: "slug:parallel_scan_v2", to: "CBRD-26800", reason: "JIRA assigned"}` append.

## 후속 작업 가이드

- 13단계까지 완료 후 머지가 끝나면 상태 파일은 `.omc/state/cubrid-flow/done/` 으로 이동 (감사 로그).
- 동일 KEY 재진입 시 done/ 의 파일을 발견하면 사용자에게 confirm.
