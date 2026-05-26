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

if [ -f /home/cubrid/CUBRID/conf/cubrid.conf ]; then
    cp /home/cubrid/CUBRID/conf/cubrid.conf ~/cubrid.conf.bak
fi

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

echo "${src_dir}/build.sh -m ${build_type} -b ${build_dir} -p ${dest_dir} build"
${src_dir}/build.sh -m ${build_type} -b ${build_dir} -p ${dest_dir} build

/home/cubrid/bin/set_cubrid_ver.sh ${build_type} ${version}

source ~/.bashrc
set -e

. /home/cubrid/.cubrid.sh

if [ ! -d $CUBRID_DATABASES ]; then
        mkdir $CUBRID_DATABASES
fi

if [ -f ~/cubrid.conf.bak ]; then
    cp ~/cubrid.conf.bak $CUBRID/conf/cubrid.conf
else
    sed -i -e "s/^#server=foo,bar/server=demodb/" $CUBRID/conf/cubrid.conf
    echo "thread_worker_timeout_seconds=4" >> $CUBRID/conf/cubrid.conf
    echo "double_write_buffer_size=0" >> $CUBRID/conf/cubrid.conf
fi
cp /home/cubrid/dev/cubrid/.vscode/libcubrid_all_locales.so /home/cubrid/CUBRID/lib/libcubrid_all_locales.so

cp /home/cubrid/dev/cubrid/.vscode/make_locale.sh /home/cubrid/CUBRID/bin/make_locale.sh

#/home/cubrid/bin/make_demo.sh