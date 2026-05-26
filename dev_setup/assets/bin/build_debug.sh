#!/bin/bash

cubrid service stop

cd /home/cubrid/dev/cubrid

/home/cubrid/dev/cubrid/build.sh -m debug -b /home/cubrid/dev/build build

. /home/cubrid/.cubrid.sh

source ~/.bashrc
set -e

sed -i -e "s/^#server=foo,bar/server=demodb/" $CUBRID/conf/cubrid.conf
if ! grep -q 'java_stored_procedure=' $CUBRID/conf/cubrid.conf; then
	echo "java_stored_procedure=yes" >> $CUBRID/conf/cubrid.conf
fi

cubrid deletedb demodb

rm -rf $CUBRID_DATABASES/demodb
mkdir $CUBRID_DATABASES/demodb

cubrid createdb -F "$CUBRID_DATABASES/demodb" --db-volume-size=100M --log-volume-size=100M demodb en_US.utf8
# createdb -F "/home/cubrid/databases/demodb" --db-volume-size=100M --log-volume-size=100M demodb en_US.utf8
cubrid loaddb -u dba -s $CUBRID/demo/demodb_schema -d $CUBRID/demo/demodb_objects demodb 

#cubrid service start

#csql -u dba demodb -S