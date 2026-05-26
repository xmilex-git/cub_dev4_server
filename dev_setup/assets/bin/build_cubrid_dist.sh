#!/bin/bash

build_type=$1
version=$2
src_dir=${3:-/home/cubrid/dev/cubrid}

if [ "$build_type" == "d" ]; then
    build_type="debug"
elif [ "$build_type" == "r" ]; then
    build_type="release"
elif [ "$build_type" == "p" ]; then 
    build_type="profile"
fi

# build_type이 release나 debug가 아니라면 종료
if [ "$build_type" != "release" ] && [ "$build_type" != "debug" ] && [ "$build_type" != "profile" ]; then
    echo "Invalid build_type. It should be 'release' or 'debug'."
    exit 1
fi

dest_dir="${HOME}/${build_type}/CUBRID-${version}"
build_dir="/home/cubrid/dev/build_x86_64_${build_type}"

cubrid service stop

if [ -d "${dest_dir}" ]; then
        rm -rf "${dest_dir}"
fi

mkdir -p "${dest_dir}"
mkdir -p ${dest_dir}/tmp 

cd ${src_dir}

echo
echo "build branch: "
git branch
echo

git pull

echo "${src_dir}/build.sh -m ${build_type} -b ${build_dir} -p ${dest_dir} -g ninja -z tarball build dist"
${src_dir}/build.sh -m ${build_type} -b ${build_dir} -p ${dest_dir} -g ninja -z shell build dist

TARGZ_FILE=$(ls ${build_dir}/*.tar.gz)

mv ${TARGZ_FILE} ./${version}_${build_type}.tar.gz




