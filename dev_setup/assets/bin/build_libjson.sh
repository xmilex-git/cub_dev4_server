#!/bin/bash

CUBRID_REPO_PATH=$1

cd ${CUBRID_REPO_PATH}
git submodule update
git submodule init

cd ${CUBRID_REPO_PATH}/cubridmanager/server/external/jsoncpp

g++ -m64 -o src/json_reader.o -c -Wall -Iinclude src/json_reader.cpp
g++ -m64 -o src/json_value.o -c -Wall -Iinclude src/json_value.cpp
g++ -m64 -o src/json_writer.o -c -Wall -Iinclude src/json_writer.cpp

ar rc src/libjson.a src/*.o
ranlib src/libjson.a

rm -f ${CUBRID_REPO_PATH}/cubridmanager/server/external/jsoncpp/linux_64/lib/libjson.a
mv src/libjson.a ${CUBRID_REPO_PATH}/cubridmanager/server/external/jsoncpp/linux_64/lib/libjson.a
