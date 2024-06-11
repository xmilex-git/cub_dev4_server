#!/bin/bash

# 인자 개수 확인
if [ $# -ne 2 ]; then
  echo "Usage: $0 IP_D_CLASS host_name"
  exit 1
fi

# 변수 할당
IP_D_CLASS=$1
HOST_NAME=$2

CONTAINER_NAME=${HOST_NAME}-${IP_D_CLASS}
IP="192.168.226.${IP_D_CLASS}"

UID=${IP_D_CLASS}0001
GID=${IP_D_CLASS}0000

GROUPNAME=${CONTAINER_NAME}_group
USERNAME=${CONTAINER_NAME}_user

if cat /etc/passwd | grep $USERNAME; then 
  echo "The user ${USERNAME} already exists in /etc/passwd."
  exit 0
else 
  groupadd -g ${GID} ${GROUPNAME}
  useradd -u ${UID} -g ${GROUPNAME} ${USERNAME}
fi

# /root/ip.txt에서 특정 IP 주소 검색
if grep ${IP} /root/ip.txt; then
  echo "The IP address ${IP} already exists in /root/ip.txt."
  exit 0
else
  echo "No existing IP address found. Continuing..."
fi

echo "${IP}     ${HOSTNAME}" >> /root/ip.txt

mkdir   -p /data/${CONTAINER_NAME}

podman  run -d --name ${CONTAINER_NAME} \
	--hostname ${HOST_NAME} \
        --network=ipv1 \
        --ip=${IP} \
        --cap-add AUDIT_READ \
        --cap-add AUDIT_WRITE \
        --cap-add PERFMON \
        --cap-add SYS_PTRACE \
        --cap-add DAC_OVERRIDE \
        --security-opt seccomp=unconfined \
        dev4_image_base:1 /usr/sbin/init

sleep   5s

podman  exec -it ${CONTAINER_NAME} /bin/bash /etc/dev4_skeleton/entrypoint.sh cubrid ${UID} ${CONTAINER_NAME}_group ${GID}
