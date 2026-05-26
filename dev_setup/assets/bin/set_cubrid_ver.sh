#!/bin/bash

build_type=$1
version=$2

if [ "$build_type" == "d" ]; then
    build_type="debug"
elif [ "$build_type" == "r" ]; then
    build_type="release"
fi

dest_dir="${HOME}/${build_type}/CUBRID-${version}"

# 인자 개수 확인
if [ "$#" -eq 0 ]; then
    echo
    echo "usage : set_cubrid_ver.sh [debug/release/d/r] [version]"
    
    
    # 첫 번째 디렉토리 내용 나열
    echo
    echo "Listing versions of cubrid(debug):"
    echo
    ls -al "${HOME}/debug/" | tail -n +4 | awk '{print $NF}'
    # 두 번째 디렉토리 내용 나열
    echo
    echo "Listing versions of cubrid(release):"
    echo
    ls -al "${HOME}/release/" | tail -n +4 | awk '{print $NF}'

    exit 0
fi

if [ ! -d "${dest_dir}" ]; then
        echo "$0 : version not installed : ${build_type}/CUBRID-${version}"
        exit 1
fi

if [ -d "${HOME}/CUBRID" ]; then
        rm -rf ${HOME}/CUBRID
fi

echo "$0 : set cubrid version ${dest_dir}"

ln -sf "${dest_dir}" ${HOME}/CUBRID

. ${HOME}/.cubrid.sh

