#!/bin/bash

pr=$1
build_type=${2:-debug}
version=${3:-11}
src_dir=${4:-/home/cubrid/dev/cubrid}

# pr이 제공되지 않았거나 비어 있는 경우 종료
if [ -z "$pr" ]; then
    echo "No pull request ID provided."
    exit 1
fi

if [ "$build_type" == "d" ]; then
    build_type="debug"
elif [ "$build_type" == "r" ]; then
    build_type="release"
fi

# build_type이 release나 debug가 아니라면 종료
if [ "$build_type" != "release" ] && [ "$build_type" != "debug" ]; then
    echo "Invalid build_type. It should be 'release' or 'debug'."
    exit 1
fi

cd $src_dir

# 해당 pull request가 있는지 확인
if ! git fetch origin pull/${pr}/head:pr-${pr}; then
    echo "Pull request not found or fetch failed."
    exit 1
fi

git checkout pr-${pr}

/home/cubrid/bin/build_cubrid.sh $build_type ${version}.PR-${pr}