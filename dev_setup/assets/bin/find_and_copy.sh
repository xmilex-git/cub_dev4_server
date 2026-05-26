#!/bin/bash

if [ "$#" -ne 2 ]; then
    echo "사용법: $0 <검색할_문자열> <대상_폴더>"
    exit 1
fi

search_string="$1"
target_dir="$2"

# 대상 폴더가 없으면 생성
mkdir -p "$target_dir"

# 현재 디렉토리에서 검색어를 포함한 파일을 찾아서 복사
find . -type f -name "*${search_string}*" -exec cp {} "$target_dir" \;

echo "복사가 완료되었습니다."
