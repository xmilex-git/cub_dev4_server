#!/bin/bash

# 입력된 초 간격으로 cubrid memmon demodb 실행
INTERVAL=$1

if [ -z "$INTERVAL" ]; then
    echo "사용법: $0 <초 간격>"
    echo "예시: $0 5 (5초마다 실행)"
    exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - $INTERVAL초 간격으로 메모리 모니터링을 시작합니다."

while true; do
    echo "$(date '+%Y-%m-%d %H:%M:%S') - 메모리 정보 수집 중..."
    cubrid memmon demodb
    echo "-------------------------------------------"
    sleep $INTERVAL
done