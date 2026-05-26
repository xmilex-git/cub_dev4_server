#!/bin/bash

if [ $# -ne 1 ]; then
    echo "Usage: $0 <summary.xml>"
    exit 1
fi

XML_FILE=$1

if [ ! -f "$XML_FILE" ]; then
    echo "Error: File $XML_FILE does not exist"
    exit 1
fi

# 결과 저장할 임시 파일 생성
TEMP_CASES=$(mktemp)
TEMP_ANSWERS=$(mktemp)

# 실패한 케이스와 정답 파일 추출
echo "=== 실패한 케이스 목록 ==="
awk '
    /<result>fail<\/result>/ { 
        printf "%s\n", prev_case 
    } 
    /<case>/ { 
        split($0,a,">"); 
        split(a[2],b,"<"); 
        prev_case=b[1] 
    }
' "$XML_FILE" > "$TEMP_CASES"

echo -e "\n=== 실패한 케이스의 정답 파일 목록 ==="
awk '
    /<result>fail<\/result>/ { 
        printf "%s\n", prev_answer 
    } 
    /<answer>/ { 
        split($0,a,">"); 
        split(a[2],b,"<"); 
        prev_answer=b[1] 
    }
' "$XML_FILE" > "$TEMP_ANSWERS"

# 결과 출력
cat "$TEMP_CASES" "$TEMP_ANSWERS"

# 대상 디렉토리 생성
mkdir -p /home/cubrid/cubrid-testcases/parallel/{cases,answers}

# 케이스 파일 복사
while read -r line; do
    src=${line#"~/cubrid-testcases/"}
    src=${src#"sql/"}
    if [[ $src == *"/cases/"* ]]; then
        target_dir="/home/cubrid/cubrid-testcases/parallel/cases"
        mkdir -p "$target_dir"
        cp "/home/cubrid/cubrid-testcases/sql/$src" "/home/cubrid/cubrid-testcases/parallel/cases"
        echo "Copied: $src to parallel/cases/"
    fi
done < "$TEMP_CASES"

# 정답 파일 복사
while read -r line; do
    src=${line#"~/cubrid-testcases/"}
    src=${src#"sql/"}
    if [[ $src == *"/answers/"* ]]; then
        target_dir="/home/cubrid/cubrid-testcases/parallel/answers"
        mkdir -p "$target_dir"
        cp "/home/cubrid/cubrid-testcases/sql/$src" "/home/cubrid/cubrid-testcases/parallel/answers"
        echo "Copied: $src to parallel/answers/"
    fi
done < "$TEMP_ANSWERS"

# 임시 파일 삭제
rm -f "$TEMP_CASES" "$TEMP_ANSWERS"

echo "모든 작업이 완료되었습니다."