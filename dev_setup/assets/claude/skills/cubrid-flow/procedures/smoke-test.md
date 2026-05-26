
# smoke-test (procedure)

CTP 회귀 (step 9) 진입 전, **본 PR 에서 새로 도입/수정한 기능 자체가 의도대로 동작하는지** 직접 실행해 확인하는 게이트. CTP 는 광범위 회귀(=주변 기능이 안 깨졌나)를 보지만, smoke test 는 핵심 변경 지점이 *실제로* 작동하는지를 본다. 둘은 다른 검증 축.

## 사용 시점

- step 8 (PR/JIRA sync) 완료 직후, step 9 (CTP) 진입 직전.
- 회귀 매트릭스에서 step 6 → 8.5 → 9 순.
- step 6 의 build green + agent review APPROVE 만으로는 "동작" 보장 안 됨 — 컴파일과 실행은 다른 차원.

## 입력

- `KEY` — `.omc/state/cubrid-flow/<KEY>.json` 의 키
- `.omc/ssot/<KEY>.md` 또는 `.omc/plans/<KEY>.md` — Goal / Acceptance Criteria 추출 소스
- 로컬 debug 빌드 산출물 (`/home/cubrid/CUBRID/bin/cub_server` 등) — `cubrid-build` skill 로 미리 확보

## cubrid.conf 의 boundary 규약 (server start 오류 시 자동 처리 영역)

`/home/cubrid/CUBRID/conf/cubrid.conf` 는 두 영역으로 나뉨:

| 영역 | 라인 | 정책 |
|------|------|------|
| **Stable zone** | line 1 ~ 51 (= `log_max_archives = 0` 이 있는 라인까지) | 사용자 관리. Claude 가 자동 수정 금지. |
| **Branch-experimental zone** | line 52 부터 끝까지 | 브랜치별 실험 파라미터가 쌓이는 영역. **server start 가 "Unrecognized keyword" 등으로 거부할 때 Claude 가 자동으로 해당 라인 주석 처리 + smoke 종료 후 복원 가능**. |

`log_max_archives = 0` 의 라인 번호는 환경에 따라 다를 수 있음 — `grep -n "^log_max_archives" /home/cubrid/CUBRID/conf/cubrid.conf` 로 boundary 라인을 먼저 확정한 뒤 그 미만은 stable, 그 초과는 자동 처리 영역. 만약 grep 결과가 비어있거나 (= 사용자가 임의로 옮겼거나 삭제) 한다면 자동 처리하지 말고 사용자 escalate.

### Server start 실패 시 자동 처리 절차 (boundary 초과 라인 한정)

```bash
CONF=/home/cubrid/CUBRID/conf/cubrid.conf
BACKUP="$CONF.smoke_$(date +%s)"

# 1. boundary 라인 확정
BOUNDARY=$(grep -n "^log_max_archives" "$CONF" | cut -d: -f1 | head -1)
[[ -z "$BOUNDARY" ]] && { echo "ERR no log_max_archives line — escalate to user"; exit 1; }

# 2. 첫 server start 시도 (실패 메시지에서 라인 번호 + 키워드 추출)
ERR=$(cubrid server start demodb 2>&1)
if echo "$ERR" | grep -qE "Unrecognized keyword|line .* in file"; then
  BAD_LINE=$(echo "$ERR" | grep -oE "line [0-9]+" | head -1 | awk '{print $2}')
  if [[ "$BAD_LINE" -gt "$BOUNDARY" ]]; then
    cp "$CONF" "$BACKUP"
    sed -i "${BAD_LINE}s/^\([^#]\)/#\1/" "$CONF"
    # 다시 시도 (다른 라인이 또 걸리면 같은 절차 반복, 단 BACKUP 은 최초 1회만 만들고 누적 주석)
    cubrid server start demodb
  else
    echo "ERR offending line $BAD_LINE is in stable zone (≤ boundary $BOUNDARY) — escalate to user"
    exit 1
  fi
fi

# 3. smoke 종료 후 trap 으로 복원
trap 'cp "$BACKUP" "$CONF" 2>/dev/null && rm -f "$BACKUP"' EXIT
```

복원 trap 은 smoke 시나리오 전체를 감싸야 함. 비정상 종료해도 conf 가 원래 상태로 돌아가야 다음 cubrid 사용에 영향 없음.

### Stable zone 안의 파라미터가 거부될 때

- 자동 수정 금지. 사용자에게 라인 + 메시지 보고하고 stop.
- 보통 빌드/소스 mismatch 의 신호 (= 본 PR 변경이 stable zone 의 파라미터 의미를 깬 경우) — debugger 에 escalate 가능.

## 실행 절차

### 1. 시나리오 합성

SSOT 의 Goal 첫 문장 + Acceptance Criteria 첫 항목 (또는 가장 측정 가능한 항목) 을 직접 실행 가능한 SQL/명령으로 변환. 종류 별 패턴:

| feature 종류 | smoke 시나리오 |
|--------------|----------------|
| 성능 최적화 (현 PR 같은 케이스) | 영향 받는 query 패턴을 demodb 또는 임시 테이블에 실행, 결과 sanity check + (선택) 측정 가능한 메트릭 (cubmonitor 카운터 / 시간) baseline 대비 비교 |
| 버그 수정 | JIRA / SSOT 의 reproduce step 그대로 실행, 수정 전엔 실패하던 결과가 의도대로 나오는지 |
| 새 SQL 문법 | 가장 단순한 사용 예 + 예외 1-2 케이스 |
| 새 system catalog / view | `SELECT * FROM <view>` + 기존 view 와의 정합성 |
| 스키마 / DDL | DDL 적용 → DML → 결과 확인 |

작성한 시나리오는 `.omc/smoke/<KEY>/` 디렉토리에 보존 (커밋 안 함, workspace-only):

```
.omc/smoke/<KEY>/
├── README.md           # 한 단락: 시나리오 의도 + 합격 기준
├── setup.sql           # 필요 시 (테이블/데이터 준비)
├── smoke.sql           # 핵심 query / 시나리오
└── expected.txt        # 기대 결과 또는 sanity range
```

### 2. 서버 기동 + 시나리오 실행

```bash
cd /home/cubrid/dev/cubrid

# 1. 서버 기동 (cubrid-server skill 사용 시 더 안전 — status 폴링 + 60s timeout)
cubrid server start demodb

# 2. 필요 시 setup
[ -f .omc/smoke/$KEY/setup.sql ] && csql -u dba demodb -i .omc/smoke/$KEY/setup.sql

# 3. 핵심 시나리오
csql -u dba demodb -i .omc/smoke/$KEY/smoke.sql > .omc/smoke/$KEY/actual.txt 2>&1
RC=$?

# 4. 서버 정지 (실패 케이스에서도 stop 보장 — trap 권장)
cubrid server stop demodb

echo "csql rc=$RC"
```

`run_in_background: true` 는 csql 자체엔 불필요 (대부분 짧음). server start/stop 만 cubrid-server skill 의 status 폴링에 맡겨도 OK.

### 3. 결과 분류

| 분기 | 신호 | 처리 |
|------|------|------|
| **PASS** | csql rc=0, actual.txt 가 expected.txt sanity range 안, server 정상 stop | 다음 step (9 CTP) 로 |
| **WRONG_RESULT** | csql rc=0, 결과가 expected 와 다름 | loopback → 6 (impl rework). same path 3회 → 사용자 escalate |
| **CRASH** | server core dump (`/data/core/` 에 새 파일), 또는 csql rc != 0 + cub_server 가 죽음 | loopback → 9.2 (tracer/debugger, opus). core 파일 **보존**, gdb backtrace 추출 |
| **SPEC_MISMATCH** | 결과는 일관되게 나오지만 SSOT 의 Goal 과 다른 양상 | loopback → 1 (SSOT 보강) 또는 2 (plan 수정). **사용자 명시 confirm** 필요 |

### 4. 보고

```
OK 8.5 smoke=PASS
   scenario=.omc/smoke/$KEY/smoke.sql
   actual=.omc/smoke/$KEY/actual.txt
   metric=<선택 — 카운터 delta 또는 wall-time>
NEXT step=9 (CTP)
```

또는 실패 시:

```
LOOPBACK 8.5 → 6 reason=WRONG_RESULT (expected: X, actual: Y)
   diff=.omc/smoke/$KEY/diff.txt
   attempts[6]=N
```

## 본 PR (CBRD-26761) 의 smoke 시나리오 예시

성능 PR 이라 시나리오는 "SAMPLING_SCAN 이 crash 없이 sensible result 반환 + (가능하면) Num_data_page_fix_ext 카운터 baseline 대비 감소" 형태:

```sql
-- setup.sql (선택 — demodb 의 가장 큰 테이블 history 면 default size 부족할 수 있음)
-- 아주 큰 테이블이 필요하면 임시로 row 다량 INSERT.
-- 본 PR 의 경우 5000 페이지 미만이면 stride=1 fallback 으로 빠지므로 작은 테이블도 의미 있는 검증.

-- smoke.sql
SELECT /*+ SAMPLING_SCAN */ COUNT(*) FROM history;
SELECT /*+ SAMPLING_SCAN */ COUNT(*) FROM athlete;
-- 파티션 테이블 검증 (있으면)
-- CREATE TABLE smoke_part (id INT) PARTITION BY HASH (id) PARTITIONS 4;
-- INSERT INTO smoke_part VALUES (1),(2),(3),...,(100);
-- SELECT /*+ SAMPLING_SCAN */ COUNT(*) FROM smoke_part;

-- expected.txt: 위 query 가 모두 정수 한 줄 반환 + csql rc=0 + server 가 stop 정상.
-- 카운터 비교는 선택 — perfmon 또는 cubmonitor 사용 시 별도 절차.
```

성공 기준: csql rc 0, count 가 정수 (테이블 row 개수와 동일하거나 sampling weight 곱한 추정치 — `SAMPLING_SCAN + COUNT(*)` 는 weight × measured 형태로 추정), `/data/core/` 변동 없음, server 정상 stop.

## 주의 / 안티 패턴

- smoke 시나리오를 commit 에 포함시키지 말 것 — `.omc/smoke/<KEY>/` 는 workspace-only. PR 본문 / JIRA 에는 결과 요약만.
- 테이블/데이터 셋업이 demodb 에 영구 영향을 주는 형태 금지 (DROP / TRUNCATE 의 부작용). 큰 데이터가 필요하면 임시 테이블 + 시나리오 끝에 `DROP TABLE`.
- `cubrid server start` 후 `stop` 미호출 금지 — 다음 CTP 가 server already running 으로 실패. trap 으로 보장.
- core dump 발생 시 자동 server restart / 재시도 금지. 사용자 / 9.2 단계에서 분석.
- expected.txt 를 "정확한 출력 한 글자도 안 다른 것" 으로 두지 말 것 — sampling 처럼 비결정적 / variance 있는 feature 는 sanity range 로.
- WRONG_RESULT 가 1회 발생했을 때 "노이즈" 로 무시 금지. 같은 시나리오 2회 재실행해도 같은 wrong 이면 무조건 loopback.

## 후속

- PASS → step 9 (CTP) 진입.
- WRONG_RESULT → step 6 으로 회귀 (executor/debugger).
- CRASH → step 9.2 (tracer + debugger, opus). core 보존.
- SPEC_MISMATCH → 사용자 escalate.
