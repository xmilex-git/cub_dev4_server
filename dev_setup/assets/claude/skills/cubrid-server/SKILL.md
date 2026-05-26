---
name: cubrid-server
description: CUBRID 서버 start/stop/restart/status 실행기. cubrid server 명령을 60s timeout 내 status 폴링으로 강제 판정. 무한 sleep / nohup / & 금지. Triggers: 서버 시작/정지/재시작/기동, demodb 시작, cubrid server start.
---

# cubrid-server
# server (procedure)

CUBRID 서버를 켜거나 끄거나 재시작하고, 그 결과를 1분 안에 status로 확정한다.

## 사용 시점

사용자가 "서버 켜줘", "demodb 시작", "서버 재시작", "서버 정지" 등으로 요청할 때.
검증 스크립트(`csql -i ...`)를 돌리기 전에 서버가 안 떠있으면 자동으로 invoke 해도 됨.

## 인자

| 이름 | 값 | default |
|------|-----|---------|
| action | `start` \| `stop` \| `restart` \| `status` | (필수) |
| db | 데이터베이스 이름 | `demodb` |

## 핵심 원칙 (반드시 인지)

1. **반드시 `timeout: 60000` + `run_in_background: false`.** 둘 다 명시.
   `run_in_background: true` 로 띄우면 task-notification 을 기다리며 무한 대기에 들어갈 수 있다 — 절대 금지.
2. **무한 polling 금지.** `until ... do sleep N; done` 같은 조건부 무한 루프를 background로 돌리는 패턴 금지 — 종료 조건이 절대 만족 안 될 수 있다.
3. **명령은 foreground.** `run_in_background: false`. CUBRID 의 `cubrid server start <db>` 는 master 에 spawn 요청 후 빠르게 종료한다 (보통 5~15초). background 로 띄울 이유 없음.
4. **status가 진실.** start/stop 명령의 exit code 보다 `cubrid server status` 의 출력이 신뢰 가능. 무조건 status 폴링으로 검증한다.
5. **nohup / `&` 금지.** Bash 도구가 timeout 으로 처리하므로 추가 detach 필요 없음.

## 실행 절차

### action = start

Bash 도구로 다음을 `timeout: 60000` 으로 실행:

```bash
cubrid server start demodb 2>&1 | head -20 || true
deadline=$((SECONDS+55))
while [ $SECONDS -lt $deadline ]; do
  if cubrid server status 2>&1 | grep -q "Server demodb"; then
    echo "[UP]"
    cubrid server status 2>&1 | grep -E "Server|cubrid master"
    exit 0
  fi
  sleep 2
done
echo "[TIMEOUT-55s][server start did not surface in status]"
cubrid server status 2>&1 | head -20
exit 2
```

### action = stop

```bash
cubrid server stop demodb 2>&1 | head -20 || true
deadline=$((SECONDS+55))
while [ $SECONDS -lt $deadline ]; do
  if ! cubrid server status 2>&1 | grep -q "Server demodb"; then
    echo "[DOWN]"
    cubrid server status 2>&1 | head -10
    exit 0
  fi
  sleep 2
done
echo "[TIMEOUT-55s][server still in status output]"
cubrid server status 2>&1 | head -20
exit 2
```

### action = restart

```bash
cubrid server stop demodb 2>&1 | head -20 || true
sleep 1
cubrid server start demodb 2>&1 | head -20 || true
deadline=$((SECONDS+55))
while [ $SECONDS -lt $deadline ]; do
  if cubrid server status 2>&1 | grep -q "Server demodb"; then
    echo "[UP-AFTER-RESTART]"; cubrid server status 2>&1 | grep -E "Server|cubrid master"
    exit 0
  fi
  sleep 2
done
echo "[TIMEOUT-55s]"; cubrid server status 2>&1 | head -20
exit 2
```

### action = status

```bash
cubrid server status 2>&1
```

(timeout 30초로 충분.)

## 결과 판정

stdout 첫 라인에 `[UP]` / `[DOWN]` / `[UP-AFTER-RESTART]` / `[TIMEOUT-55s]` 마커가 찍히도록 만들어 뒀다. 이걸로 분기:

- `[UP]` / `[UP-AFTER-RESTART]` → 사용자에게 "기동 완료" 보고. 후속 csql 작업 진행 가능.
- `[DOWN]` → "정지 완료" 보고.
- `[TIMEOUT-55s]` → 1분 안에 status가 기대대로 안 바뀐 상태. master 자체가 죽었거나, db lock 파일이 stale 하거나, 설정 문제일 수 있음. 후속 가이드:
  - `cubrid_master.err`, `<db>_<server>.err` 로그 tail
  - `cubrid service status`
  - `/data/core/` 코어 파일 확인 (있으면 cubrid-ctp 스킬의 CORE_DUMP 처리 참조)

Bash 도구가 60초 hard timeout으로 끊어버린 경우(스크립트가 [TIMEOUT-55s] 마커 출력 전에 죽음)에도 동일하게 처리.

## DB 인자가 demodb 가 아닌 경우

위 스니펫에서 `demodb` 부분만 해당 DB 명으로 치환. 절차는 동일.

## 주의 / 안티 패턴

- `until cubrid server status | grep ...; do sleep 2; done` 형식의 background 무한 폴링 금지 — 영원히 안 끝남.
- `cubrid service start` 만 호출하고 끝내지 말 것 — cubrid.conf 의 `[service] server=` 라인에 db가 등록 안 돼있으면 demodb 가 자동 안 뜬다. 항상 `cubrid server start <db>` 를 명시.
- 결과 판단을 명령 exit code로 하지 말 것 — status 출력으로만 판정.
- 서버가 이미 떠있는데 다시 start 하는 건 idempotent (CUBRID가 "already running" 메시지 출력 후 종료). status 검증은 그대로 진행하면 됨.
- **`cubrid server start <db> 2>&1 | tail -N` 형태 절대 금지 — Bash 도구 hang 의 단골 원인.** 이유: `cubrid server start` 는 master 에 spawn 요청을 보낸 뒤 daemon 자식이 부모의 stdout/stderr fd 를 그대로 들고 분리된다. 자식이 그 fd 를 닫지 않는 한 `tail` 은 pipe EOF 를 영원히 못 보고 대기 → Bash 도구 timeout 까지 hang. 우회: (a) 본 skill 의 status-poll wrapper 사용 (canonical), (b) raw 로 써야 한다면 `head -N` 으로 강제 종료 (head 는 N 라인 후 SIGPIPE 로 upstream close), (c) `< /dev/null > /tmp/cub_start.log 2>&1` 처럼 stdin/stdout 을 파일로 redirect 해 pipe 자체를 끊기. **smoke / CTP / debugging 등 모든 server-using 절차는 raw bash 대신 본 skill (`Skill(skill="cubrid-server")` 또는 `Bash` + 본 SKILL.md 의 status-poll snippet) 을 호출할 것.**
