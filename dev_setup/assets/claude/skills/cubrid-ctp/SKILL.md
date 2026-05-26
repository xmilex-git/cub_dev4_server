---
name: cubrid-ctp
description: CTP 회귀 테스트(.vscode/execute_ctp.sh sql|medium) 실행기. background 실행 후 ALL_PASS / NOK / CORE_DUMP 3분기 분류. ctpout.txt(12000+ 줄)는 grep/tail 만 사용. core 발생 시 watch_core_and_kill.sh 가 cub_master/server 등을 -9 강제 종료. Triggers: ctp, ctp 실행, ctp sql, ctp medium, 회귀 테스트.
---

# cubrid-ctp
# ctp (procedure)

CUBRID 회귀 테스트(CTP)를 안전하게 실행하고 결과를 3분기로 분류한다.

## 사용 시점

사용자가 "ctp 돌려줘", "ctp sql 실행", "ctp medium", "회귀 테스트" 등으로 요청할 때.

## 배경 동작 (반드시 인지)

`execute_ctp.sh` 가 하는 일:

- `watch_core_and_kill.sh` 를 백그라운드로 띄운다. `/data/core/` 에 코어 파일이 생기면 30초 후
  `cub_master / cub_server / cubrid / csql / java / cub_commdb / cub_pl / valgrind / gdb / tail`
  을 `killall -9` 로 강제 종료한다. CUBRID 프로세스들이 부모-자식 관계가 아니라 SIGKILL 외엔 안 죽기 때문.
- `ctp.sh sql|medium` 을 nohup으로 실행, 표준출력/에러는 `/home/cubrid/dev/cubrid/ctpout.txt` 로 리다이렉트.
- ctp 종료 시 trap으로 watch 프로세스를 자동 정리.

즉, **사용자가 명시적으로 프로세스 정리할 필요 없음**.

## 실행 절차

1. 인자 검증: `sql` | `medium` 둘 중 하나가 아니면 에러.
2. **Bash 도구의 `run_in_background: true`** 로 실행:
   ```bash
   bash /home/cubrid/dev/cubrid/.vscode/execute_ctp.sh <sql|medium>
   ```
3. **금지**: `nohup`, 끝의 `&` 를 추가로 붙이지 말 것 (스크립트 내부에서 이미 처리).
4. 완료 알림 받으면 아래 "결과 분류" 절차 진행.
5. **`ctpout.txt` 를 Read 도구로 통째 읽지 말 것** (12000줄 이상이 흔함). 항상 grep / tail / head 로 요약.

## 결과 분류 (순서대로)

### Step 1. CORE_DUMP 검사 (최우선)

```bash
ls -la /data/core/ 2>/dev/null
grep -c "Testing End!" /home/cubrid/dev/cubrid/ctpout.txt
```

판정:
- `/data/core/` 에 파일 있음 → **CORE_DUMP**
- 또는 `Testing End!` 카운트가 0 → 비정상 종료, **CORE_DUMP** 가능성 (보강 검사):
  ```bash
  tail -50 /home/cubrid/dev/cubrid/ctpout.txt
  ```

CORE_DUMP 보고 형식:
- `/data/core/` 의 파일 목록 (분석용으로 **삭제 금지**)
- `ctpout.txt` 마지막 50줄
- 마지막으로 진행 중이던 testcase 경로 (위 tail에서 추출)

### Step 2. NOK 검사 (코어 없음 확인된 후)

```bash
grep -E "^(Fail|Success|Total|Elapse Time):" /home/cubrid/dev/cubrid/ctpout.txt
```

분기:
- `Fail:0` → Step 3 (ALL_PASS) 로
- `Fail:N` (N>0) → **NOK**:
  ```bash
  grep "\[NOK\]" /home/cubrid/dev/cubrid/ctpout.txt
  ```
  NOK 케이스 경로 목록 + Fail 카운트 + 결과 디렉토리 (`Test Result Directory:` 라인) 를 보고.

### Step 3. ALL_PASS

`Fail:0` + `Testing End!` 존재 + `/data/core/` 비어있음. 다음만 보고:
- Total
- Elapse Time
- Test Log 경로

## 주의 / 안티 패턴

- ctpout.txt 통째 읽기 금지.
- `/data/core/` 자동 삭제 금지 — 사용자가 gdb로 분석할 수 있어야 함.
- 코어 발생 후 cubrid 서버를 자동으로 재시작하지 말 것 — 사용자가 코어 분석 끝낸 뒤 결정.
- watch_core_and_kill.sh 가 살아있는지 확인하려고 별도 ps 검사 금지 — execute_ctp.sh 의 trap이 정리한다.

## 후속 작업 가이드

- CORE_DUMP → `gdb /home/cubrid/CUBRID/bin/cub_server <core파일> -batch -ex bt` 로 백트레이스 추출 제안.
- NOK → 결과 디렉토리(`Test Result Directory:` 의 경로) 안에 `*.diff` 파일이 있으면 expected vs actual 비교 가능.
- ALL_PASS → 별도 후속 없음.
