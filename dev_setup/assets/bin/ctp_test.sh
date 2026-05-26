#!/bin/bash

# 1. /data/core 파일 정리
echo "Cleaning /data/core..."
if [ -d "/data/core" ]; then
    # 파일이 하나라도 있는지 확인 후 삭제
    if [ "$(ls -A /data/core)" ]; then
        echo "Deleting files in /data/core..."
        rm -rf /data/core/*
    else
        echo "/data/core is already empty."
    fi
else
    echo "/data/core directory not found. Skipping cleanup."
fi

# 2. CTP 실행
echo "Starting CTP..."
nohup /home/cubrid/cubrid-testtools/CTP/bin/ctp.sh "$@" > ctpout.txt 2>&1 &
CTP_PID=$!
echo "CTP PID: $CTP_PID"

# 3. Watcher 실행
echo "Starting Watcher..."
nohup /home/cubrid/dev/cubrid/.vscode/watch_core_and_kill.sh > /dev/null 2>&1 &
WATCH_PID=$!
echo "Watcher PID: $WATCH_PID"

# 4. 종료 처리 (Trap)
# Ctrl+C (SIGINT) 또는 종료 신호 발생 시 watcher를 종료합니다.
cleanup() {
    echo -e "\n[CLEANUP] Stopping Watcher (PID: $WATCH_PID)..."
    kill $WATCH_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# 5. 로그 모니터링
echo "Tailing ctpout.txt (Press Ctrl+C to stop)..."
tail -f ctpout.txt
