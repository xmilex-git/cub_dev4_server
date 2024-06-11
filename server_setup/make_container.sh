#!/bin/bash

# 인자 개수 확인
if [ $# -ne 2 ]; then
  echo "Usage: $0 IP_D_CLASS HOST_NAME_T"
  exit 1
fi

# 변수 할당
IP_D_CLASS=$1
HOST_NAME_T=$2

CONTAINER_NAME_T=${HOST_NAME_T}-${IP_D_CLASS}
IP="192.168.226.${IP_D_CLASS}"

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
fi

# /root/ip.txt에서 특정 IP 주소 검색
if grep ${IP} /root/ip.txt; then
  echo "The IP address ${IP} already exists in /root/ip.txt."
  exit 0
else
  echo "No existing IP address found. Continuing..."
fi

echo "${IP}     ${HOST_NAME_T}" >> /root/ip.txt

mkdir   -p /data/${CONTAINER_NAME_T}

podman  run -d \
        -v /data/${CONTAINER_NAME_T}:/data \
        --name ${CONTAINER_NAME_T} \
	--hostname ${HOST_NAME_T} \
        --network=ipv1 \
        --ip=${IP} \
        --cap-add AUDIT_READ \
        --cap-add AUDIT_WRITE \
        --cap-add PERFMON \
        --cap-add SYS_PTRACE \
        --cap-add DAC_OVERRIDE \
        --security-opt seccomp=unconfined \
        dev4_image_base:1.1 /usr/sbin/init

sleep   5s

podman  exec -it ${CONTAINER_NAME_T} /bin/bash /etc/dev4_skeleton/entrypoint.sh cubrid ${UID_T} ${CONTAINER_NAME_T}_group ${GID_T}

exit    0
