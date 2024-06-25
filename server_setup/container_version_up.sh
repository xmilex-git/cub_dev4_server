#!/bin/bash

IP_D_CLASS=$1
HOST_NAME_T=$2
NEW_IMAGE_V=$3

CONTAINER_NAME_T=${IP_D_CLASS}-${HOST_NAME_T}
VOLUME_NAME_T=${CONTAINER_NAME_T}_volume
IP="192.168.6.${IP_D_CLASS}"

UID_T=${IP_D_CLASS}0001
GID_T=${IP_D_CLASS}0000

GROUPNAME_T=${CONTAINER_NAME_T}_group
USERNAME_T=${CONTAINER_NAME_T}_user

podman stop ${CONTAINER_NAME_T}
podman rm ${CONTAINER_NAME_T}

podman  run -d \
        -v /data/${CONTAINER_NAME_T}:/data \
        -v ${VOLUME_NAME_T}:/home \
        --name ${CONTAINER_NAME_T} \
	--hostname ${HOST_NAME_T} \
        --network=ipv1 \
        --ip=${IP} \
        --privileged \
        --restart=always \
        ${NEW_IMAGE_V} /usr/sbin/init

podman  exec -it ${CONTAINER_NAME_T} /bin/bash /etc/dev4_skeleton/version_up_entrypoint.sh cubrid ${UID_T} ${CONTAINER_NAME_T}_group ${GID_T}