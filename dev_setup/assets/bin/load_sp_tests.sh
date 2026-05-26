#!/bin/bash

cd /home/cubrid/cubrid-testtools/CTP/sql/function/stored_procedure/src
rm *.class

sp_array=`ls SpTest*.java`

for sp in ${sp_array[@]}; do
    class_name=$(echo $sp | sed 's/.java//')
    javac $sp -cp $CUBRID/jdbc/cubrid_jdbc.jar
    loadjava demodb $class_name.class
done

