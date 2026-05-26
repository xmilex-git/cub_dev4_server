#!/bin/bash

LOG_FILE=$1

echo "$(date '+%Y-%m-%d %H:%M:%S') - 테스트 시작" 

tail -f "$LOG_FILE" | while read line; do
    if echo "$line" | grep -q "Failed to connect to database server"; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 오류 감지: \"Failed to connect to database server\"" 
        echo "cub_server와 java 프로세스 종료 중..." 
        
        # 프로세스 종료
        killall -9 cub_server java 
	cubrid service stop
        
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 프로세스 종료 완료, 최근 기록 30줄" 

	tail -30 "$LOG_FILE" 

	echo 

	rm -f /tmp/core.*

        exit 0

    elif echo "$line" | grep -q "Testing End!"; then
        echo "$(date '+%Y-%m-%d %H:%M:%S') - 테스트 종료 감지: \"Testing End!\""
        echo "프로세스 종료 중..."
        break

    else
        echo $line
    fi
done


echo "$(date '+%Y-%m-%d %H:%M:%S') - 테스트가 정상적으로 종료되었습니다." 


echo "$(date '+%Y-%m-%d %H:%M:%S') - 테스트 결과 요약:" 
grep "NOK" "$LOG_FILE" 

echo 

tail -18 "$LOG_FILE" 

echo 

