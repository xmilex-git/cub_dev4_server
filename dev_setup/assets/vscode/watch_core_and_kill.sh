#!/bin/bash
# Watch /data/core every 1 second; if any file exists, kill specified processes

CORE_DIR="/data/core"
TARGETS="cub_server csql java cub_master cubrid cub_commdb cub_pl valgrind gdb tail"

while true; do
    if [ -d "$CORE_DIR" ] && [ -n "$(ls -A "$CORE_DIR" 2>/dev/null)" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Files found in $CORE_DIR, killing processes..."
	sleep 30
        killall -9 $TARGETS 2>/dev/null
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done."
	exit 0
    fi
    sleep 1
done
