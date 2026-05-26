#!/bin/bash
usage() {
    echo "Usage: $0 <T_QUERY> <INIT_QUERY> <ITER>"
    echo "Ensure that T_QUERY exist."
}

IS_CBRD_RELEASE=`/home/cubrid/bin/get_cubrid_ver.sh | grep version | grep release`

if [ -z "$IS_CBRD_RELEASE" ]; then
    echo "Error: current CUBRID version is not release."
    exit 1
fi

T_QUERY=$1
INIT_QUERY=$2
ITER=${3:-1}

if [ "$#" -lt 1 ]; then
    echo "Error: At least one argument is required."
    usage
    exit 1
fi

if [ ! -f "$1" ]; then
    echo "Error: T_QUERY do not exist."
    usage
    exit 1
fi

cubrid server restart demodb

T_QUERY=`cat ${T_QUERY}`

if [ -f "$2" ]; then
    csql -u dba demodb -i $INIT_QUERY
fi

cubrid server stop demodb

valgrind --tool=callgrind \
         --instr-atstart=no \
         --trace-children=yes \
         --trace-children-skip='/bin/sh,*/bin/cub_master,*/bin/cub_javasp,*/bin/cub_pl' \
         cubrid server start demodb

csql -u dba demodb -c "${T_QUERY}"

 

callgrind_control -i on
for ((i=0; i<${ITER}; i++)); do
        csql -u dba demodb -c "${T_QUERY}"
done
callgrind_control -i off

 

cubrid service stop