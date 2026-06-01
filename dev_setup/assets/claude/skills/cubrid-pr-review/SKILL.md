---
name: cubrid-pr-review
description: CUBRID PR 리뷰 오케스트레이터. PR 번호를 받아 체크아웃한 뒤 `.claude/code-review.md` 의 8개 룰을 적용한다. Rule 1(베이스라인) 단일 에이전트 → Rule 2~8 격리된 병렬 에이전트 → lead 가 결과를 사람 리뷰어 톤으로 통합. 빌드/컴파일/unit_test/CTP 는 실행하지 않는다. 출력 톤은 `voice-guide.md` 에 정의된 CUBRID 사내 리뷰어 패턴(youngjinj / shparkcubrid / Hamkua / sohee-dgist / hornetmj 분석)을 따른다. Triggers — "PR 리뷰", "PR <번호> 리뷰", "code review PR", "리뷰해줘 PR".
---

# cubrid-pr-review

CUBRID PR 을 `.claude/code-review.md` 의 8개 룰로 다각도 리뷰하는 오케스트레이터.
빌드/컴파일/unit_test/CTP 회귀는 **실행하지 않는다** (코드만 정독).

**톤 가이드 — `voice-guide.md` 를 반드시 먼저 읽고 따른다.** 이 skill 의 모든 출력(lane 에이전트 산출물, lead 통합 리포트, 후속 대화)은 CUBRID 사내 사람 리뷰어들의 실제 코멘트 패턴을 따른다. 영문 헤더 표, `Why:/Fix:` 라벨, severity 영문 라벨, lane 이름 노출 등 AI 티 나는 구조는 금지.

## 사용 시점

사용자가 "PR 12345 리뷰해줘", "review PR #12345", "이 PR 코드 리뷰 돌려" 같은 형태로 PR 번호를 주면서 요청할 때.
PR 번호가 빠지면 한 번 묻고 진행한다.

## 입력 / 출력 계약

| 항목 | 값 |
|------|----|
| 입력 | PR 번호 (필수). 옵션: 베이스 브랜치(기본 `develop`). |
| 출력 | 통합 리뷰 리포트 — 사람 리뷰어 톤(한국어, 질문/제안형 어미, 자연어 본문). lane 메타 정보는 본문에 노출하지 않음. |
| 사이드이펙트 | `gh pr checkout` 으로 작업 트리가 PR 브랜치로 전환됨. 보호 파일은 stash 로 보존. |
| 안 함 | 빌드, 컴파일, unit test, CTP, push, commit, comment 등록. |

## 실행 절차

### Phase 0 — 사전 점검 & 체크아웃

1. **voice-guide.md 로드**
   ```bash
   cat .claude/skills/cubrid-pr-review/voice-guide.md
   ```
   톤 가이드는 모든 lane 에이전트 프롬프트에 그대로 첨부되어야 한다. lead 도 통합 리포트 작성 직전에 셀프 체크리스트(7절) 를 통과시킨다.

2. **보호 파일 stash**
   - project-memory directive: branch ops 시 `STASH_MODE=1` 자동 보존.
   - 다음을 실행해 현재 작업 사항을 보존한다:
     ```bash
     git status --short
     git stash push -u -m "cubrid-pr-review:auto:<PR번호>" -- \
       .gitignore CMakeLists.txt cubrid-cci cubridmanager \
       CMakeUserPresets.json csql.access csql.err ctpout.txt 2>/dev/null || true
     ```
   - 보호 대상 외의 untracked / modified 가 있으면 사용자에게 한 번 확인.

3. **PR 체크아웃 & 메타 수집** (parallel Bash 호출)
   ```bash
   gh pr checkout <PR>
   gh pr view <PR> --json number,title,body,author,baseRefName,headRefName,url
   gh pr diff <PR> --patch
   git log --oneline <base>..HEAD
   ```
   - diff 가 크면 (>2000 lines) `gh pr diff <PR> --name-only` 로 파일 목록만 먼저 받고, 에이전트가 필요 시 개별 hunk 를 `git show` / `git diff <base>...HEAD -- <file>` 로 읽도록 한다.

4. **리뷰 워크스페이스 생성**
   ```bash
   mkdir -p .omc/cubrid-pr-review/<PR번호>
   ```
   여기에 메타 / diff / 각 에이전트 결과를 저장. PR 번호별 격리.

### Phase 1 — Rule 1 baseline (단일 에이전트, blocking)

Rule 1 은 **나머지 모든 룰의 사전 컨텍스트** 이므로 먼저 단독으로 돌린다.

- Agent: `Agent(subagent_type="general-purpose", model="opus")`
  프롬프트에 "read-only codebase 이해 전문가 (architect) 역할 — 코드를 수정하지 말고 변경 전 동작/invariant 만 정리" 를 명시해 역할을 부여한다.
- 입력으로 전달:
  - PR 메타 + diff + 변경 파일 목록
  - `.claude/code-review.md` 의 Rule 1 본문
  - `voice-guide.md` 전체
  - 출력 저장 위치: `.omc/cubrid-pr-review/<PR>/rule1-baseline.md`
- 출력 형식:
  - 변경된 각 모듈/파일별 **pre-PR 동작 요약** — 한국어 자연어 한 단락. "이 함수는 ~ 합니다" 가 아니라 "~ 한 것으로 알고 있습니다 / ~ 하는 흐름입니다" 톤.
  - 의존하는 invariant 목록 — 짧은 bullet, 함수명/매크로 영문 그대로.
  - PR 이 건드리는 entry point 와 호출 경로 — 호출 경로는 `caller → callee` 화살표로.
  - 전체 1.5KB 이하.
- 실패 시: Rule 1 결과 없이는 진행하지 않는다. 사용자에게 보고하고 중단.

### Phase 2 — Rule 2~8 격리 병렬 실행

**중요 — 격리 원칙**:
각 에이전트는 별도 `Agent` 호출로 생성되어 **서로의 context 를 보지 못한다**.
공유되는 입력은 (a) PR 메타/diff, (b) Rule 1 baseline, (c) 본인이 담당하는 룰 본문, (d) `voice-guide.md`. 네 가지뿐.
서로의 발견을 읽지 못하므로 **중복/충돌은 의도된 설계** — lead 가 Phase 3 에서 자연어로 녹여낸다.

병렬로 단일 메시지에서 7개 `Agent` 호출을 동시에 송신한다. 모든 lane 은 네이티브 `subagent_type="general-purpose"` 로 띄우고, 아래 "역할 (inline 지침)" 컬럼의 전문가 페르소나 + "초점" 을 **프롬프트에 직접 inline** 해 역할을 부여한다. 각 에이전트는 자기 결과를 `.omc/cubrid-pr-review/<PR>/rule<N>-<lane>.md` 에 저장하도록 지시.

| Rule | Lane | subagent_type | 역할 (inline 지침) | 모델 | 초점 |
|------|------|---------------|--------------------|------|------|
| 2 | behavior | `general-purpose` | 코드 리뷰어 | opus | 동작 변화, spec 정합성, SA/CS/SERVER 영향, error/abort 경로 |
| 3 | convention | `general-purpose` | 코드 리뷰어 (컨벤션) | sonnet | 주석/네이밍/indent/include 순서/`memory_wrapper.hpp` LAST/`_FILENAME_H_` 가드/`free_and_init` |
| 4 | integration | `general-purpose` | 통합/설계 비평가 (critic) | opus | 최소 변경, 기존 모듈과의 통합, shadow subsystem 여부, 죽은 코드 |
| 5 | safety | `general-purpose` | 보안/안전성 리뷰어 | opus | race / lock ordering / buffer overflow / integer overflow / UAF / uninitialized |
| 6 | error | `general-purpose` | 코드 리뷰어 (에러 핸들링) | sonnet | `er_set` + return-code 일치, 자원 해제, 새 error code 6-place 프로토콜 |
| 7 | test | `general-purpose` | 테스트 엔지니어 | sonnet | unit_tests/ + CTP 커버리지 적정성, 엣지/concurrency repro |
| 8 | spec | `general-purpose` | 스펙 비평가 (critic) | sonnet | PR description / JIRA 의 명시적 요구사항 위반 / 누락 |

각 에이전트의 **내부 산출물** 스키마 (`.omc/cubrid-pr-review/<PR>/rule<N>-<lane>.md`) — 이 파일은 사용자에게 직접 노출되지 않고 lead 가 통합용으로 읽는다. 따라서 정렬을 위한 메타 필드는 유지하되, 본문은 사람 톤으로 작성한다:

```markdown
# rule<N> — <lane> (internal)

severity_meta: blocker | major | minor | nit   <!-- lead 통합 정렬용. 사용자 출력에는 사용 안 함 -->

## findings

- **<file>:<line>** — <한 문장, 사람 어미: ~지 않나요? / ~인 것 같습니다 / ~는 어떨까요? / ~해주세요>
  <필요 시 한 단락 부연. 기존 함수/매크로 인용, reproducible SQL/diff 첨부 환영. 6줄 이내.>

  `severity_meta: <등급>`

- **<file>:<line>** — ...

## 확인 못 한 항목

- <스펙 모호, 코드 외부 의존, 컨텍스트 부족>

## verdict_meta

approve | request-changes | needs-discussion   <!-- lead 통합 정렬용. 사용자 출력에는 본문에 쓰지 않음 -->
```

- 각 에이전트는 **자기 룰 밖의 발견은 기록하지 않는다** (lead 가 통합).
- `severity_meta`, `verdict_meta` 는 lead 정렬용 메타데이터 — lead 가 본문에 노출하지 않는다.
- 본문은 `voice-guide.md` 의 어미/표현/길이 룰을 따른다.

### Phase 3 — Lead 통합 (사용자에게 보고하는 메인 컨텍스트)

7개 에이전트 결과를 모두 받은 뒤, **lead = 현재 메인 세션** 이 직접 처리한다 (별도 에이전트로 위임하지 않음 — 사용자와 후속 대화하려면 lead 가 배경지식을 보유해야 함).

Lead 의 통합 절차 (내부 작업, 사용자에게 보이지 않음):

1. 7개 결과를 모두 읽는다 (`.omc/cubrid-pr-review/<PR>/rule*.md`).
2. **같은 `file:line` 묶기** — 두 개 이상 lane 이 같은 코드 위치를 지적하면 하나로 통합한다. lane 이름은 본문에 쓰지 말고, 더 설득력 있는 근거 한 줄로 합친다.
3. **상반된 의견 처리** — lane 간 의견 차이는 본문에 그대로 노출하지 않는다. lead 가 한쪽으로 정리하거나, 진짜 결정 불가면 "확인 부탁드립니다" 섹션에 한 줄로 옮긴다.
4. **누락 영역 점검** — baseline invariant 와 비교해서 어느 lane 도 안 본 변경 파일이 있으면, 짧게 한 줄 짚는다 (없으면 생략).
5. **severity 분포 → 톤 결정** — `severity_meta` 합산으로 통합 verdict 를 내부적으로 정한 뒤, 본문 도입부의 톤(질문 위주 / 단정 위주)으로 자연스럽게 드러낸다. 영문 라벨로 쓰지 않는다.

#### Lead 최종 리포트 포맷 — 사람 리뷰 톤

본 리포트는 GitHub 코멘트로 그대로 붙여도 자연스러워야 한다. 영문 헤더, lane 이름, severity 영문 라벨, verdict 영문 라벨, `Why:/Fix:` 구조, "Aggregated findings / Coverage gaps / Per-lane verdicts" 같은 메타 용어는 **본문에 절대 쓰지 않는다**.

권장 구조 (이 자체도 템플릿일 뿐 — 자연스러우면 변형 가능):

```markdown
PR #<번호> — <PR 제목> 읽어봤습니다.

<PR 전체 흐름을 한 단락으로. "이 PR 은 X 합니다" 가 아니라 "~ 흐름으로 보입니다 / ~ 한 의도로 이해했습니다" 톤. baseline 의 invariant 중 핵심만 한두 가지 녹여넣기.>

---

검토 중에 눈에 띈 부분들입니다.

1. **<file>:<line>** — <한 문장, 질문형 / 단정형 / 권유형>
   <필요시 한 단락 부연. 기존 함수/매크로 인용 또는 reproducible 케이스.>

2. **<file>:<line>** — ...

3. `NIT:` **<file>:<line>** — <한 줄>

4. `NIT:` **<file>:<line>** — <한 줄>

---

(있으면) 확인 부탁드립니다:
- <스펙 모호 / 외부 의존 / 검증 못 한 path 한 줄씩>

(있으면) 추가로 논의가 필요해 보입니다:
- <PR 범위 밖이지만 짚어야 할 사항 한 줄씩>
```

#### 우선순위 정렬

내부 `severity_meta` 기준으로:

1. `blocker` → 본문 앞쪽, 단정형 어미 ("~ 가 누락된 것으로 보입니다 / 수정이 필요합니다")
2. `major` → 본문 중간, 단정형 또는 강한 질문형 ("~ 인 것으로 보이는데 의도된 동작인가요?")
3. `minor` → 본문 뒤쪽, 질문형 / 권유형
4. `nit` → 맨 뒤에 `NIT:` 접두어로 묶음

같은 finding 이라도 lane 두 개 이상이 지적했으면 한 항목으로 묶고, lane 이름은 쓰지 않는다.

#### 셀프 체크리스트 (출력 직전)

`voice-guide.md` 7절을 그대로 통과시킨다. 통과하지 못한 항목이 있으면 본문을 다시 손본다.

### Phase 4 — 후속 대화 모드

사용자가 "이거 같이 보자" / "이 PR 관련해서 추가 질문" / "근데 X 부분은 어떻게 생각해?" 같이 후속 요청하면, lead 는 Phase 3 의 통합 리포트 + Phase 1 baseline + PR diff 를 **이미 컨텍스트에 보유** 하고 있으므로 추가 도구 호출 없이 즉답한다.

후속 답변도 같은 톤(한국어, 질문/제안형 어미, 도메인 영문 용어, 영문 라벨/메타 용어 금지) 으로.

필요 시 `.omc/cubrid-pr-review/<PR>/` 의 lane 별 원본 보고서를 `Read` 로 다시 불러올 수 있다. 이 때도 lane 이름을 그대로 사용자에게 노출하지 말고 ("rule3 convention 에서는 ..." 금지), 근거만 자연어로 풀어쓴다.

## 보호 파일 / 안티 패턴

- **절대 `git add` 금지** (project-memory critical directive): `.gitignore`, `CMakeLists.txt`, `cubrid-cci`, `cubridmanager`, `CMakeUserPresets.json`, `csql.access`, `csql.err`, `ctpout.txt`. 리뷰 중 어떤 단계에서도 stage/commit 하지 않는다.
- **빌드/CTP 실행 금지** — 이 skill 의 책무 밖. 필요하면 `cubrid-build` / `cubrid-ctp` 를 사용자가 별도 호출.
- **에이전트 간 cross-talk 금지** — Rule 2~8 lane 끼리 결과 공유 안 함. lead 만 통합.
- **`gh pr comment` 자동 등록 금지** — 사용자가 명시적으로 요청할 때만. 등록 시에도 본문은 lead 통합 리포트의 사람 톤 그대로.
- **PR 번호 없는 호출** — 한 번 묻고, 없으면 진행 안 함.
- **이전 PR 작업 트리 잔존** — 새 PR 체크아웃 전에 `git status` 로 잔존 변경 점검 (보호 파일 외는 사용자 확인).
- **AI 티 나는 출력 패턴 금지** (`voice-guide.md` 2절 / 5절 / 7절 셀프 체크리스트 참조)

## 에이전트 호출 시 공통 프롬프트 골격

각 lane 에이전트에 전달할 프롬프트는 다음을 포함한다 (그대로 복붙 가능한 골격):

```
You act as a <역할 (inline 지침) — e.g. 보안/안전성 리뷰어, 코드 리뷰어, 테스트 엔지니어>.
You are reviewing CUBRID PR #<N> under Rule <K> of .claude/code-review.md.
You are isolated from other rule lanes — DO NOT speculate about other lanes' findings.
Report ONLY findings that fall under Rule <K>. If something matters but belongs to
another rule, ignore it.

## TONE — strict
당신의 산출물은 CUBRID 사내 사람 리뷰어(youngjinj / shparkcubrid / Hamkua /
sohee-dgist / hornetmj / beyondykk9 / tw-kang) 의 코멘트와 구분되지 않아야 한다.

반드시 `.claude/skills/cubrid-pr-review/voice-guide.md` 의 전체 내용을 그대로 따른다:
- 한국어 본문, 도메인 식별자(함수명/매크로/타입/ER_*/PRM_*) 는 영문 그대로
- 질문형 / 부드러운 단정형 / 권유형 어미 (~지 않나요? / ~인 것 같습니다 / ~는 어떨까요? / 확인해주세요)
- finding 한 건당 한 줄 ~ 한 단락(최대 6줄)
- `Why:` / `Fix:` 라벨 금지, 영문 severity 라벨 금지 (`NIT:` 접두어만 허용)
- emoji 금지, "LGTM" / "Strongly recommend" 류 금지
- 기존 함수/매크로 인용으로 근거 제시, reproducible SQL/diff 첨부 환영
- 출력 직전 voice-guide.md 7절 셀프 체크리스트 통과

## voice-guide.md 본문 (참조용 전체 복사)
<voice-guide.md 본문>

## PR meta
<gh pr view 결과 요약>

## Changed files
<diff --name-only 결과>

## Rule 1 baseline (read-only context — DO NOT critique this)
<rule1-baseline.md 본문>

## Your rule (Rule <K>)
<.claude/code-review.md 의 해당 섹션 본문>

## Diff to review
<gh pr diff 결과 또는 file 목록 + 개별 hunk 접근 지시>

## Output
Write your findings to `.omc/cubrid-pr-review/<PR>/rule<K>-<lane>.md` in the
schema specified by the skill (사람 톤 본문 + severity_meta / verdict_meta 메타).
Do NOT add commentary outside that file. Reply to the orchestrator with only
the file path and a one-line verdict (한국어 한 줄, 영문 라벨 금지).
```

## 트리거 키워드

- "PR <번호> 리뷰", "PR 리뷰해줘", "review PR <N>", "이 PR 코드 리뷰"
- "code-review PR", "PR 정독", "리뷰 좀 돌려줘 PR"

명시적으로 `/cubrid-pr-review` 호출도 동일.

## 참고 — 톤 베이스라인의 출처

`voice-guide.md` 의 표현 / 어미 / 길이 / 인용 스타일은 xmilex-git 이 CUBRID 에 올린 PR 약 46건(#7176 ~ #6316) 에 대한 사내 리뷰 코멘트 386건(인라인) + 73건(이슈 레벨) 을 분석한 결과다. 봇 코멘트(greptile, github-actions, chatgpt-codex-connector) 는 분석에서 제외했다. 이 분석을 업데이트하려면 `gh api repos/CUBRID/cubrid/pulls/<PR>/comments --paginate` 로 새 샘플을 받아 같은 필터(`user.login != "xmilex-git" and not bot`) 로 재집계하면 된다.
