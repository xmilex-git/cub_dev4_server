---
name: cubrid-build
description: CUBRID 빌드 실행기. release(`build_cubrid.sh r 11.5.develop`) / debug(`build_cubrid.sh d 11.5.develop`) 를 Bash run_in_background 로 실행, 완료 후 exit code + 에러 요약 보고. nohup/& 금지. Triggers: 빌드, build cubrid, release 빌드, debug 빌드, rebuild.
---

# cubrid-build
# build (procedure)

CUBRID server / client library / utility를 release 또는 debug 모드로 빌드한다.

## 사용 시점

사용자가 "빌드해줘", "release 빌드", "debug 빌드", "rebuild cubrid" 등으로 요청할 때.

## 실행 절차

1. 모드 결정: `release` | `debug`
2. **Bash 도구의 `run_in_background: true`** 로 다음 명령을 실행한다.

   - **release**:
     ```bash
     bash build_cubrid.sh r 11.5.develop > /tmp/build_release.log 2>&1
     ```
   - **debug**:
     ```bash
     bash build_cubrid.sh d 11.5.develop > /tmp/build_debug.log 2>&1
     ```

   주의 — release와 debug는 **스크립트 이름 자체가 다름** (`build_cubrid.sh` vs `build_cubrid_clang.sh`). 절대 혼용하지 말 것.

3. **금지**: `nohup`, 명령 끝의 `&`. 둘 다 쓰지 않는다. 백그라운딩은 `run_in_background` 가 담당한다.
4. 진행 상황은 짧은 sleep으로 폴링하지 말고 background notification을 기다리거나 Monitor 도구를 쓴다 (빌드는 보통 5~15분).

## 완료 후 처리

exit code로 분기:

- **exit 0 (성공)**:
  ```bash
  tail -10 /tmp/build_<mode>.log
  ```
  마지막 10줄 요약을 사용자에게 보고.

- **exit != 0 (실패)**:
  ```bash
  grep -nE "error:|FAILED|undefined reference|fatal:|cannot find|ninja: build stopped" /tmp/build_<mode>.log | tail -30
  ```
  에러 라인을 추출해서 요약. 라인 번호 포함하면 사용자가 로그를 직접 열어 추가 조사 가능.

## 로그 파일 경로 (고정)

- release → `/tmp/build_release.log`
- debug → `/tmp/build_debug.log`

## 주의 / 안티 패턴

- `nohup` 또는 `&` 사용 금지 — exit code 감지 불가.
- 빌드 도중 `sleep 30 && check` 같은 폴링 루프 금지 — `run_in_background` 알림이 자동으로 들어온다.
- 한 번에 release와 debug를 동시에 띄우지 말 것. 동일 source tree를 다른 빌드 디렉토리로 깎지만 충돌 가능.
- 빌드 실패 시 로그 통째로 cat 하지 말고 grep으로 에러 라인만 추출.
