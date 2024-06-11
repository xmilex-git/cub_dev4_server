#!/bin/bash

# 인자 개수 확인
if [ $# -ne 2 ]; then
  echo "Usage: $0 IP_D_CLASS HOST_NAME_T"
  exit 1
fi

# 변수 할당
IP_D_CLASS=$1
HOST_NAME_T=$2

IP="192.168.226.${IP_D_CLASS}"

CONTAINER_NAME_T=${HOST_NAME_T}-${IP_D_CLASS}

podman stop ${CONTAINER_NAME_T}
podman rm ${CONTAINER_NAME_T}

UID_T=${IP_D_CLASS}0001
GID_T=${IP_D_CLASS}0000

GROUPNAME_T=${CONTAINER_NAME_T}_group
USERNAME_T=${CONTAINER_NAME_T}_user

userdel -r $USERNAME_T
groupdel $GROUPNAME_T

rm -rf /data/${CONTAINER_NAME_T}

sed -i "/${IP}/d" /root/ip.txt