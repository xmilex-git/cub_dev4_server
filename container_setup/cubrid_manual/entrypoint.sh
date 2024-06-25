#!/bin/bash
trap 'kill -SIGTERM $SCRIPT_PID; wait $SCRIPT_PID' SIGTERM

# 스크립트 실행 중 에러 발생 시 종료
set -e

# 사용법 함수 정의
usage() {
  echo "Usage: $0 [-p PR_NUMBER] [-r repository_url] -b branch_name"
  exit 1
}

# 변수 초기화
PR_NUMBER=""
REPO_URL="https://github.com/CUBRID/cubrid-manual"
BRANCH_NAME=""

cd /root

# 옵션 처리
while getopts "p:r:b:" opt; do
  case $opt in
    p)
      PR_NUMBER=$OPTARG
      ;;
    r)
      REPO_URL=$OPTARG
      ;;
    b)
      BRANCH_NAME=$OPTARG
      ;;
    *)
      usage
      ;;
  esac
done

# 레포지토리 이름 추출
REPO_NAME=$(basename -s .git $REPO_URL)

# 레포지토리 클론
git clone $REPO_URL

# 디렉토리 이동
cd $REPO_NAME

# PR 번호가 제공된 경우, 해당 PR 브랜치 가져오기
if [ -n "$PR_NUMBER" ]; then
  PR_BRANCH="pr/$PR_NUMBER"
  git fetch origin pull/$PR_NUMBER/head:$PR_BRANCH
  git checkout $PR_BRANCH
else
  # 브랜치 체크아웃
  git fetch origin
  git checkout $BRANCH_NAME
fi

make html

cd /root/cubrid-manual/ko/_build/html
python3 -m http.server 80 &

cd /root/cubrid-manual/en/_build/html
python3 -m http.server 81 &

SCRIPT_PID=$!

wait $SCRIPT_PID
