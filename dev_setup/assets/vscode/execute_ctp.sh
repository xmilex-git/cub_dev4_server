#!/bin/bash

if [[ "$1" != "sql" && "$1" != "medium" ]]; then
  echo "Usage: $0 [sql|medium]"
  exit 1
fi

WATCH_SCRIPT="/home/cubrid/dev/cubrid/.vscode/watch_core_and_kill.sh"
CTP_LOG="/home/cubrid/dev/cubrid/ctpout.txt"

# Start watch_core_and_kill in background
nohup "$WATCH_SCRIPT" > /dev/null 2>&1 &
WATCH_PID=$!

cleanup() {
  echo "Killing watch_core_and_kill (PID $WATCH_PID)..."
  kill -9 "$WATCH_PID" 2>/dev/null
  wait "$WATCH_PID" 2>/dev/null
}
trap cleanup EXIT

# Run ctp.sh and wait for it
echo "Starting ctp.sh $1 ..."
nohup ctp.sh "$1" > "$CTP_LOG" 2>&1 &
CTP_PID=$!

wait "$CTP_PID"
CTP_EXIT=$?

echo "ctp.sh finished with exit code $CTP_EXIT."
exit $CTP_EXIT
