#!/bin/bash

# 인자 개수 확인
if [ $# -ne 2 ]; then
  echo "Usage: $0 IP_D_CLASS HOST_NAME_T"
  exit 1
fi

# 변수 할당
IP_D_CLASS=$1
HOST_NAME_T=$2

IP="192.168.6.${IP_D_CLASS}"

CONTAINER_NAME_T=${IP_D_CLASS}-${HOST_NAME_T}

podman stop ${CONTAINER_NAME_T}
podman rm ${CONTAINER_NAME_T}

