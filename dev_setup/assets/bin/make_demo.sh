#!/bin/bash

. $HOME/.cubrid.sh

if [ -z "$CUBRID" ]; then
	exit 1
fi

if [ $(cubrid server status | grep demodb | wc -l) -gt 0 ]; then
	cubrid server stop demodb
fi

if [ $(cat $CUBRID_DATABASES/databases.txt | grep demodb | wc -l) -gt 0 ]; then
	cubrid deletedb demodb
	rm -rf $CUBRID_DATABASES/demodb
else
	rm -rf $CUBRID_DATABASES/demodb
fi

mkdir -p $CUBRID_DATABASES/demodb/log

cubrid createdb \
	-F $CUBRID_DATABASES/demodb \
	-L $CUBRID_DATABASES/demodb/log \
	--db-volume-size=512M \
	--log-volume-size=512M \
	demodb \
	ko_KR.utf8

for OPTION in "$@"; do
	case $OPTION in
		"loaddb")
			cubrid loaddb \
				-u dba \
				-s $CUBRID/demo/demodb_schema \
				-d $CUBRID/demo/demodb_objects \
				demodb
			;;
		"loaddb-compat")
			cubrid loaddb \
				-u dba \
				-s $CUBRID/demo/demodb_schema \
				-d $CUBRID/demo/demodb_objects \
				--no-user-specified-name \
				demodb
			;;
		"javasp")

			;;
		*)
			;;
	esac
done
