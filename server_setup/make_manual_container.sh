#!/bin/bash

IP_D_CLASS=$1

IP="192.168.6.${IP_D_CLASS}"
CONTAINER_NAME_T=${IP_D_CLASS}-manual

# /root/ip.txt에서 특정 IP 주소 검색
if awk -v ip="$IP" '$1 == ip { found=1; exit } END { exit !found }' /root/ip.txt; then
  echo "The IP address ${IP} already exists in /root/ip.txt."
  cat /root/ip.txt
  exit 0
else
  echo "No existing IP address found. Continuing..."
fi

shift   1

podman  run -d \
        --name ${CONTAINER_NAME_T} \
        --network=ipv1 \
        --ip=${IP} \
        localhost/cubrid_manual:1.2 /root/entrypoint.sh $@

/home/cubrid/cub_dev4_server/server_setup/update_ip.sh