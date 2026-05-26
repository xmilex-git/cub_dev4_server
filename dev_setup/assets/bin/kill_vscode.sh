#!/bin/bash

# 'ps -ef' 명령어를 실행하고 'grep vscode'로 필터링
ps -ef | grep vscode | grep -v grep | while read -r line ; do
    # 두 번째 필드(PID)를 추출하여 'kill -15' 명령어를 실행
    pid=$(echo $line | awk '{print $2}')
    echo "Killing process with PID: $pid"
    kill -15 $pid
done

