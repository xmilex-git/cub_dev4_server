#!/bin/bash

docker run -d --name test1 \
	--hostname test1 \
        --net=my_ipvlan_1 \
        --privileged \
        --ip 192.168.7.3 \
        rockylinux:8 /usr/sbin/init

docker exec -it test1 /bin/bash