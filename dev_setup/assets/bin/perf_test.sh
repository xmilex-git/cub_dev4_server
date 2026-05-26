#!/bin/bash

TESTNAME=$1
shift
SQL="$@"
rm -f perf.data

sudo perf record -F 999 -g --\
 $SQL

sudo perf script | /home/cubrid/git/FlameGraph/stackcollapse-perf.pl | /home/cubrid/git/FlameGraph/flamegraph.pl > $TESTNAME.svg
