#!/bin/bash

# 결과 파일 경로
LOG_FILE="/home/cubrid/dev/cubrid/ctpout.txt"
TARGET_DIR="/home/cubrid/dev/cubrid/.vscode/failed_cases"

rm -rf "${TARGET_DIR}/*"

# cases와 answer 디렉토리 생성
mkdir -p "${TARGET_DIR}/cases"
mkdir -p "${TARGET_DIR}/answers"

cat "$LOG_FILE" | grep "[NOK]" > "$LOG_FILE.nok"

# NOK가 포함된 라인에서 파일 경로 추출 및 복사
while IFS= read -r line; do
    if [[ $line == *"[NOK]"* ]]; then
        # 파일 경로 추출
        file_path=$(echo "$line" | grep -o '/home/cubrid/cubrid-testcases/.*\.sql')
        if [ -n "$file_path" ]; then
            # 파일 이름 추출
            file_name=$(basename "$file_path")
            base_name="${file_name%.sql}"
            # SQL 파일 복사
            cp "$file_path" "${TARGET_DIR}/cases/"
            
            # Answer 파일 경로 생성 및 복사 (cases를 제외한 경로에서 answer 디렉토리 찾기)
            answer_path="${file_path%/cases/*}/answers/${base_name}.answer"
            if [ -f "$answer_path" ]; then
                cp "$answer_path" "${TARGET_DIR}/answers/"
            else
                echo "Warning: Answer file not found - $answer_path"
            fi
            
            echo "$file_path"
        fi
    fi
done < "$LOG_FILE.nok"

echo "Copy completed to ${TARGET_DIR}"