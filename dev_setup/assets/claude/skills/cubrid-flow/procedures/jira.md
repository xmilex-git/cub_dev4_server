
# jira (procedure)

CUBRID 사내 JIRA(7.7.1 Server) 와 통신하는 헬퍼. 검증된 `jira_client.py` (httpx + JSESSIONID 세션) 위의 CLI wrapper `jira_cli.py` 를 호출한다.

## 핵심 — basic auth 사용 금지

- JIRA 7.7.1 은 basic auth 실패가 누적되면 즉시 `X-Authentication-Denied-Reason: CAPTCHA_CHALLENGE` (HTTP 403) 으로 잠긴다.
- 풀려면 사용자가 직접 브라우저에서 CAPTCHA 풀고 로그인해야 한다 — 자동 복구 불가.
- 따라서 **항상 form login (`POST /rest/auth/1/session`)** 으로 JSESSIONID 받아서 쓴다. 본 skill 의 모든 명령은 그 경로만 사용.

## 자격증명

`~/.config/cubrid-skills/jira.env`:

```
JIRA_BASE_URL=http://jira.cubrid.org
JIRA_USERNAME=<id>
JIRA_PASSWORD=<password>
JIRA_PROJECT=CBRD
```

권한 `chmod 600`. 변수명 그대로 — `jira_client.py` 가 이 이름들을 읽는다.

## 공통 호출 패턴

```bash
set -a; source ~/.config/cubrid-skills/jira.env; set +a
PY=/usr/bin/python3.11
CLI=/home/cubrid/dev/cubrid/.claude/skills/cubrid-flow/lib/jira_cli.py
```

`python3.11` 고정 — 시스템 `python3` (3.6.8) 은 `httpx`/typing 문법 불호환. `httpx` 는 user-local 에 설치됨 (`~/.local/lib/python3.11/site-packages/httpx`).

## 동작 1: 조회 (`get`)

```bash
"$PY" "$CLI" get CBRD-12345
```

Stdout = `_flatten_issue` 된 LLM-friendly JSON (key, summary, status, description, comments[:50], custom_fields, links 등). 본문이 길면 호출자가 `jq` 로 필요한 필드만 추출.

## 동작 2: 생성 (`create`)

### Description 본문 형식 (mandatory — 매번 재설명 금지)

CUBRID 사내 JIRA 의 spec / Development Subject 티켓은 **5개 섹션 고정 형식**을 따른다. 형식·예시·anti-pattern 은 `templates/jira-desc.wiki.tpl` 헤더 주석에 박혀 있으므로 **본 파일에서 다시 정의하지 않는다** — 호출자는 그 템플릿의 주석부를 그대로 따른다.

요지 (반복 안내 방지용 한 줄 요약):

| 항목 | 규칙 |
|------|------|
| Title | English OK, <70자, action-oriented |
| Body 언어 | **Korean prose**. 식별자(함수/변수/타입/매크로) 는 영어 plain text — `{{}}` 또는 `{code}` markup 사용 금지 |
| 섹션 (정확히 5개, 순서 고정) | Description / Specification Changes / Implementation / Acceptance Criteria / Definition of done |
| 섹션 헤딩 | `h2. *<Name>*` (bold asterisks 포함) |
| Sub-heading | `*bold paragraph-lead*` 한 줄 — `h3.` 사용 금지 |
| 불릿 | ` * item` (선행 1-space + asterisk), 서브-불릿 ` ** subitem` |
| Definition of done | 보통 한 줄: "Acceptance Criteria를 만족한다." |
| 금지 섹션 | Goal / Background / References / Migration → 위 5개 안에 fold |

**예시·anti-pattern 은 `templates/jira-desc.wiki.tpl` 의 헤더 주석을 read 해서 참조** (CBRD-26722 형식이 canonical reference).

### CBRD 프로젝트 mandatory custom fields

CUBRID JIRA workflow 는 issue type 별 mandatory custom field 를 강제한다. 누락 시 HTTP 400 + `errors: {customfield_NNNNN: "X is required."}`. **2026-05-06 디버깅 결과**:

| Issue Type | 필수 customfield | 추천 default |
|------------|------------------|-------------|
| `Development Subject` | `customfield_210565` (QA Scenario) | `{"value":"Not Required"}` (option type — JSON 필요, plain string 보내면 `"Could not find valid 'id' or 'value' in the Parent Option object."`) |

**option/cascade/multi-select 필드 인코딩**:
- option (단일): `{"value":"<label>"}` 또는 `{"id":"<numeric>"}`
- cascade: `{"value":"<parent>","child":{"value":"<child>"}}`
- multi-select: `[{"value":"<a>"},{"value":"<b>"}]`

`jira_cli.py create --field key=value` 는 value 가 `{` 또는 `[` 로 시작하면 JSON 파싱 — option 필드는 반드시 JSON literal 로 전달.

신규 issue type 도입 시 mandatory field 발견 절차:
1. `jira_cli.py create ...` 1차 호출 → 400 응답
2. `_request` 의 body-preview 로그 (`HTTP 400 ... -- body: {...}`) 에서 `errors.customfield_NNNNN` 확인
3. 다른 같은-issue-type 티켓 GET 으로 raw 형식 확인: `JiraSession.get_issue_raw(KEY, fields=["customfield_NNNNN"])`
4. 형식대로 `--field` 추가하여 재호출

**현 시점 본 procedure 의 검증된 호출 패턴 (Development Subject)**:

```bash
"$PY" "$CLI" create "<title>" --desc-stdin --type "Development Subject" \
  --field 'customfield_210565={"value":"Not Required"}' \
  < /tmp/desc.wiki
```

### 호출

description 본문은 **stdin 으로**:

```bash
"$PY" "$CLI" create "Expand parallel scan to list/index" --desc-stdin --type "Development Subject" \
  < /tmp/desc.wiki
```

성공 출력: `OK CBRD-NNNNN http://jira.cubrid.org/browse/CBRD-NNNNN` (단일 라인)

`--type` 미지정 시 `Task`. 회사 컨벤션 상 spec 티켓은 `Development Subject` 가 일반적이지만, 호출자가 명시.

## 동작 3: description 갱신 (`update-desc`)

```bash
"$PY" "$CLI" update-desc CBRD-12345 < /tmp/desc.wiki
```

JIRA wiki markup (h2./h3./{code}) 그대로 송신. 기존 description 을 **덮어씀** (병합 아님). 보존이 필요하면 호출자가 `get` → 머지 → `update-desc`.

성공 출력: `OK CBRD-12345 http://jira.cubrid.org/browse/CBRD-12345`

## 동작 4: 코멘트 (`comment`)

```bash
echo "tc-sync: cubrid-testcases#456 abc1234" | "$PY" "$CLI" comment CBRD-12345
```

성공 출력: `OK CBRD-12345 comment=<id> http://jira.cubrid.org/browse/CBRD-12345`

## 출력 / 에러 규약

| 형태 | 의미 |
|------|------|
| `OK <KEY> <URL> ...` | 성공 (단일 라인) |
| `ERR not_found <KEY>` | 404 |
| `ERR auth <msg>` | 401/403 — CAPTCHA 또는 비밀번호 |
| `ERR <ExceptionName> <msg>` | 기타 예외 |

CAPTCHA 의심 시 (auth 에러 + 이전에 잘 되던 경우) 자동 재시도 금지 — 사용자에게 브라우저 로그인 요청.

## 주의 / 안티 패턴

- **basic auth 금지** (`-u user:pass`, Authorization Basic 헤더 등) — CAPTCHA 잠금 트리거.
- 비밀번호를 명령줄 인자/echo/heredoc 으로 전달 금지 — shell history + transcript 노출. 항상 env 파일.
- `jira_client.py` 의 logger 가 INFO 로그를 stderr 에 흘림 — stdout 파싱 시 영향 없지만, 호출자가 stderr 도 같이 캡처하면 분리 처리 필요.
- `update-desc` 는 atomic 덮어쓰기 — 동일 티켓에 여러 호출이 동시 진행되면 마지막만 남는다. 보호가 필요하면 호출자 lock.
- description / comment 본문은 항상 stdin — 인라인 인자 escape 사고 (한글 `!`, 백틱, `$`) 빈번.
- `Development Subject` 같은 issue type 이름은 회사 JIRA 워크플로우에 종속 — 미지정 시 `Task` fallback 으로 두지 말고 호출자가 명시 선호.

## 후속 작업 가이드

- 신규 티켓 생성 직후 `cubrid-branch` 가 KEY 받아서 브랜치 생성.
- `update-desc` 직후 PR 본문 갱신을 원하면 `cubrid-pr update` 도 같이 호출.

## 파일 구성 (skill 디렉토리 내부 자기-완결)

```
.claude/skills/cubrid-flow/lib/
├── SKILL.md
├── jira_client.py        # JiraSession + 플래트닝
├── jira_cli.py           # 본 skill 이 호출하는 CLI wrapper
└── jira_mcp_server.py    # 별도 MCP 서버 (선택, 본 skill 과 무관)
```

`jira_cli.py` 가 `from jira_client import ...` 를 하므로 두 파일은 **같은 디렉토리**에 있어야 한다 — 이동/이름 변경 시 동기화 필수.

## 의존성 검증 (한 번만)

```bash
cd /home/cubrid/dev/cubrid/.claude/skills/cubrid-flow/lib
/usr/bin/python3.11 -c "import httpx; import jira_client" && echo OK
```

`OK` 안 뜨면 `httpx` 설치 — `/usr/bin/python3.11 -m pip install --user httpx` (이미 설치돼 있어야 정상).
