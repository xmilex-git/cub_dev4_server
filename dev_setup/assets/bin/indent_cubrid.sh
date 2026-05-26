#!/bin/bash

process_file() {
    local file="$1"
    /home/cubrid/dev/cubrid/.github/workflows/codestyle.sh "$file" > /dev/null 2>&1

    if [ -f "$file~" ]; then
        rm "$file~"
    fi

    if [ -f "$file.orig" ]; then
        rm "$file.orig"
    fi
}

process_path() {
    local path="$1"
    if [ -d "$path" ]; then
        # 디렉토리인 경우 재귀적으로 처리
        for item in "$path"/*; do
            process_path "$item"
        done
    elif [ -f "$path" ]; then
        # 파일인 경우 처리
        process_file "$path"
    fi
}

# 주어진 모든 경로에 대해 처리
for path in "$@"
do
    process_path "$path"
done