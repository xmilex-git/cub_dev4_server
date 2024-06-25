#!/bin/bash

# 인자 개수 확인
if [ $# -ne 3 ]; then
  echo "Usage: $0 IP_D_CLASS HOST_NAME_T IMAGE_V"
  exit 1
fi

# 변수 할당
IP_D_CLASS=$1
HOST_NAME_T=$2
IMAGE_V=$3

CONTAINER_NAME_T=${IP_D_CLASS}-${HOST_NAME_T}
VOLUME_NAME_T=${CONTAINER_NAME_T}_volume
IP="192.168.6.${IP_D_CLASS}"

UID_T=${IP_D_CLASS}0001
GID_T=${IP_D_CLASS}0000

GROUPNAME_T=${CONTAINER_NAME_T}_group
USERNAME_T=${CONTAINER_NAME_T}_user

if cat /etc/passwd | grep $USERNAME_T; then 
  echo "The user ${USERNAME_T} already exists in /etc/passwd."
  exit 0
else 
  groupadd -g ${GID_T} ${GROUPNAME_T}
  useradd -u ${UID_T} -g ${GROUPNAME_T} ${USERNAME_T}
  echo "$USERNAME_T:password" | chpasswd
fi

if awk -v ip="$IP" '$1 == ip { found=1; exit } END { exit !found }' /root/ip.txt; then
  echo "The IP address ${IP} already exists in /root/ip.txt."
  cat /root/ip.txt
  exit 0
else
  echo "No existing IP address found. Continuing..."
fi

mkdir   -p /data/${CONTAINER_NAME_T}
podman  volume create ${VOLUME_NAME_T}

podman  run -d \
        -v /data/${CONTAINER_NAME_T}:/data \
        -v ${VOLUME_NAME_T}:/home \
        --name ${CONTAINER_NAME_T} \
	      --hostname ${HOST_NAME_T} \
        --network=ipv1 \
        --ip=${IP} \
        --privileged \
        --restart=always \
        ${IMAGE_V} /usr/sbin/init

sleep   1s

podman  exec -it ${CONTAINER_NAME_T} /bin/bash /etc/dev4_skeleton/entrypoint.sh cubrid ${UID_T} ${CONTAINER_NAME_T}_group ${GID_T}

/home/cubrid/cub_dev4_server/server_setup/update_ip.sh

exit    0
