#!/bin/bash

. $HOME/.cubrid.sh

echo "create_table_reuseoid=n" >> $CUBRID/conf/cubrid.conf

set -e

cubrid loaddb -u dba -s /home/cubrid/cubrid-testcases/medium/files/mdb_schema -i /home/cubrid/cubrid-testcases/medium/files/mdb_indexes -d /home/cubrid/cubrid-testcases/medium/files/mdb_objects --no-user-specified-name demodb

