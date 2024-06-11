#!/bin/bash

# 인자 개수 확인
if [ $# -ne 4 ]; then
  echo "Usage: $0 UID USERNAME GID GROUPNAME"
  exit 1
fi

echo $@