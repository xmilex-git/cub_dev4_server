
# pr-prep (procedure)

`cubrid-pr` 은 `~/.cache/cubrid-pr/<KEY>/` 의 3개 파일을 입력으로 받는다. 본 skill 은 그 3개 파일을 SSOT(또는 구현 계획) 으로부터 채우는 절차를 정의한다.

## 입력 / 출력

**입력 (둘 중 하나, 우선순위 순)**
1. `.omc/ssot/<KEY>.md` — 명시적 SSOT (보통 step 1 SSOT 인터뷰 산출물)
2. `.omc/plans/<KEY>.md` — step 2 plan 산출물
3. 사용자가 대화창에 직접 붙여넣은 spec/리뷰 문서

**출력 (반드시 3개 모두)**
- `~/.cache/cubrid-pr/<KEY>/title.txt` — 한 줄 요약 (제목용 prefix `[<KEY>] ` 는 cubrid-pr 이 자동 부착)
- `~/.cache/cubrid-pr/<KEY>/pr-body.md` — GitHub markdown, 짧게
- `~/.cache/cubrid-pr/<KEY>/jira-desc.wiki` — JIRA wiki markup, 풀스펙

## 템플릿 위치

`/home/cubrid/dev/cubrid/.claude/skills/cubrid-flow/templates/`

| 파일 | placeholder |
|------|-------------|
| `title.tpl` | `{{SUMMARY}}` |
| `pr-body.md.tpl` | `{{PURPOSE}}`, `{{IMPLEMENTATION_REF}}` |
| `jira-desc.wiki.tpl` | `{{DESCRIPTION}}`, `{{SPEC_CHANGES}}`, `{{IMPLEMENTATION}}`, `{{ACCEPTANCE}}`, `{{DOD}}` |

## 실행 절차 (LLM/Claude)

1. KEY 결정: 인자 또는 현재 브랜치에서 추출. `.omc/state/cubrid-flow/<KEY>.json` 이 있으면 그걸 우선.

2. SSOT 읽기:
   ```bash
   cat .omc/ssot/<KEY>.md 2>/dev/null \
     || cat .omc/plans/<KEY>.md 2>/dev/null \
     || echo "ERR no SSOT/plan for $KEY — paste content or specify path"
   ```

3. 출력 디렉토리 준비:
   ```bash
   mkdir -p ~/.cache/cubrid-pr/<KEY>
   ```

4. **title.txt** 생성: SSOT 의 한 줄 요약 (보통 SSOT 첫 헤더 또는 `Purpose` 첫 문장).
   - 길이 60~80자. 공식 PR 컨벤션 — 명령형/평서문 일관 유지.
   - 예: `Expand parallel heap scan to parallel scan (index, heap, list)`

5. **pr-body.md** 생성:
   - **본문 언어 = 한국어** (사용자 정책, 2026-05-06). 식별자 / 함수명 / 파일 경로 / 커밋 SHA / 카운터 이름 등은 영어 그대로. 영어 prose 로 PR 본문 작성 금지.
   - `### Purpose` (H3, H2 아님 — 회사 PR 컨벤션): 한두 단락. 무엇/왜.
   - `### Implementation`: 코드 레벨 설명을 본문에 길게 쓰지 말 것. 보통 한 줄: `리뷰 문서 참고: [pr_<N>_code_review.md](<github-attachment-url>)` 또는 핵심 변경 3~5 항목 bullet.
   - JIRA URL 헤더는 cubrid-pr 이 자동 추가 (`<http://jira.cubrid.org/browse/<KEY>>` 형태로 auto-link) — 본문에 중복 작성 금지.
   - **PR diff 에 포함되지 않은 파일을 본문에서 언급 금지**. 특히 `.omc/ssot/<KEY>.md`, `.omc/plans/<KEY>.md`, `.omc/smoke/<KEY>/...`, `~/.cache/cubrid-pr/<KEY>/...` 같은 workspace-only 산출물은 PR 리뷰어에게 보이지 않으므로 "in-tree under .omc/..." 같은 안내 문구를 절대 넣지 말 것. SSOT/plan 의 핵심 결론은 PR 본문 또는 JIRA description 에 직접 인용하되 파일 경로 언급 자체를 피한다. 위반 시 broken-link 와 동일하게 리뷰 신뢰도 저하.

### Implementation 섹션 작성 규칙 (2026-05-06 추가, canonical reference: CBRD-26711)

- **commit 단위로 쓰지 말 것**. C1/C2/C3 식 commit-by-commit 분할 금지. PR 의 Implementation 은 코드 변경의 역사가 아니라 **무엇이 어떻게 동작하는지** 의 단면이다. 같은 commit 안에 여러 파일이 있어도 의도가 다르면 분리, 다른 commit 에 있어도 의도가 같으면 한 묶음.
- **묶음 단위 = 기능 / 컴포넌트 / 책임**. 헤더는 `**<무엇을 한 묶음인지> (<관련 파일 1~3개>)**` 형태. 예: `**ftab 모듈을 storage 계층으로 이동 (src/storage/ftab_set.{hpp,cpp})**`. 헤더 뒤에 그 묶음 안의 변경을 2~5개 bullet 로.
- **식별자 / 함수명 나열만으로 끝내지 말 것**. "이 함수를 추가했다, 저 인자를 바꿨다" 식 caveat dump 금지. 각 bullet 은 동작 변화를 한국어로 풀어서 1~2 문장 (필요시 식별자/경로는 보조 표기). reviewer 가 PR 을 cold 로 처음 봤을 때 무슨 일이 일어나는지 이해 가능해야 함.
- **너무 어려운 내부 식별자 무비판적 인용 금지**. `qdata_aggregate_accumulator_to_accumulator`, `db_change_private_heap` 같은 깊은 함수를 본문에 노출해야 한다면 그 함수가 "무엇을 하는지" 한 줄 설명 동반. 그렇지 않으면 그 함수의 표면적 의미만 prose 로 풀어쓰고 식별자는 생략.
- **너무 mechanical 한 단어 금지** — "C1 commit", "atomic merge", "rebased onto", "build-stable per commit" 같은 메타-프로세스 어휘는 PR 리뷰어가 알 필요 없음. 그건 cubrid-flow 내부 / migration order 의 어휘이지 PR 본문이 아님.
- **canonical 예시**: 본 procedure 와 같은 디렉토리의 `templates/pr-body.md.tpl` 또는 운영 PR `CBRD-26711` ([http://jira.cubrid.org/browse/CBRD-26711](http://jira.cubrid.org/browse/CBRD-26711)) 의 Implementation 구조를 따름.

### Implementation 섹션 anti-pattern (자주 빠지는 함정)

```
### Implementation (BAD — commit-by-commit + jargon dump)

* **C1** `7bce34a` — relocate src/query/parallel/... to src/storage/...
* **C2** `109dc3b` — new src/storage/ftab_set.cpp implementing collect_strided_vpids ...
* **C3** `224ad1b` — atomic merge: sampling_info extended with picked_vpids/picked_count/picked_cursor; scan_open_heap_scan rewires to ...
```

```
### Implementation (GOOD — 컴포넌트 + prose-first + 한국어)

**ftab 모듈을 storage 계층으로 이동 (src/storage/ftab_set.{hpp,cpp})**

- 기존 `src/query/parallel/px_ftab_set.hpp` 를 `src/storage/ftab_set.hpp` 로 옮깁니다.
- `parallel_query` 네임스페이스를 제거해 `ftab_set` 이 sampling 같은 query 외부 코드에서도 자연스럽게 쓰일 수 있도록 합니다.
- ...

**샘플링 페이지 사전 선택 함수 추가 (src/storage/ftab_set.cpp)**

- 새 함수 `collect_strided_vpids` — 힙 파일의 ftab 비트맵을 한 번 훑어 5000 개 VPID 를 균등 간격(stride) 로 골라 리턴합니다.
- 페이지 fix 는 발생하지 않고 메타데이터만 봅니다.
- ...
```

6. **jira-desc.wiki** 생성 (JIRA wiki markup):
   - `h2. *Description*`: SSOT Purpose 와 동일하거나 확장.
   - `h2. *Specification Changes*`: 사용자에게 노출되는 동작/스펙 변경.
     - `h3. <subsection>` 으로 세분.
     - 표는 `||header||header||\n|cell|cell|`.
     - 코드는 `{code:java}\n...\n{code}`.
     - 인라인 코드는 `{{...}}`. (백틱 아님)
   - `h2. *Implementation*`: 코드 구조/심볼/모듈 변경.
     - `h3. 1. ...`, `h3. 2. ...` 식으로 단계 분할.
   - `h2. *Acceptance Criteria*`: 측정 가능한 기준 (성능/통과 조건).
   - `h2. *Definition of done*`: AC + 회귀 없음 + QA 통과 같은 산출물.

7. 산출물 검증:
   ```bash
   for f in title.txt pr-body.md jira-desc.wiki; do
     [[ -s ~/.cache/cubrid-pr/<KEY>/$f ]] || { echo "ERR empty $f"; exit 1; }
   done
   wc -l ~/.cache/cubrid-pr/<KEY>/*
   ```

8. 보고:
   ```
   OK prep <KEY>
     title=~/.cache/cubrid-pr/<KEY>/title.txt
     pr=~/.cache/cubrid-pr/<KEY>/pr-body.md ($(wc -l < .../pr-body.md) lines)
     jira=~/.cache/cubrid-pr/<KEY>/jira-desc.wiki ($(wc -l < .../jira-desc.wiki) lines)
   NEXT  invoke cubrid-pr create
   ```

## JIRA wiki markup 빠른 참조

| 의도 | 문법 |
|------|------|
| h2 | `h2. *Description*` |
| h3 | `h3. 1. 디렉토리 재구성` |
| 표 | `||a||b||\n|1|2|` |
| 코드 블록 | `{code:java}\n...\n{code}` |
| 인라인 코드 | `{{symbol}}` |
| 굵게 | `*text*` |
| 기울임 | `_text_` |
| 리스트 | `* item` (space 들여쓰기는 `**` `***`) |
| 링크 | `[text\|http://url]` |
| 노트 박스 | `{note}...{note}`, `{warning}...{warning}` |

이 외에는 https://jira.atlassian.com/secure/WikiRendererHelpAction.jspa?section=all 참조 (사내 7.7.1 동일).

## 주의 / 안티 패턴

- PR 본문에 JIRA 와 중복된 풀스펙 쓰지 말 것 — PR 은 변경 요점 + JIRA 링크면 충분, 풀스펙은 JIRA 한 곳에만.
- title.txt 는 `[CBRD-XXXXX]` prefix 포함 금지 — cubrid-pr 이 자동 부착. 중복되면 `[CBRD-X] [CBRD-X] ...` 가 된다.
- jira-desc.wiki 에 GitHub markdown (`##`, ```, `**bold**`) 섞지 말 것 — JIRA 가 그대로 출력하지 못함. 항상 wiki markup.
- 한 번 만든 파일을 cubrid-pr 호출 후 다시 채우지 말 것 — git 상태와 PR 본문이 어긋남. 변경하려면 `cubrid-pr update` 모드로 재발행.
- 템플릿 placeholder 는 단순 치환 — 빈 섹션을 그대로 두면 placeholder 텍스트가 그대로 PR/JIRA 에 노출. 검증 단계에서 `grep -l '{{.*}}' ~/.cache/cubrid-pr/<KEY>/*` 로 잔존 placeholder 차단.

## 후속

`cubrid-pr` `create` 호출. JIRA 동기화는 cubrid-pr 이 자동 처리.
