#!/bin/bash

# 인자 개수 확인
if [ $# -ne 4 ]; then
  echo "Usage: $0 UID USERNAME GID GROUPNAME"
  exit 1
fi

USERNAME_T=$1
UID_T=$2
GROUPNAME_T=$3
GID_T=$4

groupadd -g ${GID_T} ${GROUPNAME_T}
useradd -u ${UID_T} -g ${GROUPNAME_T} ${USERNAME_T}
echo "$USERNAME_T:password" | chpasswd

chown -R ${USERNAME_T}:${GROUPNAME_T} /home/${USERNAME_T}
chown -R ${USERNAME_T}:${GROUPNAME_T} /data

cat /etc/passwd | grep ${USERNAME_T}

echo "${USERNAME_T}     ALL=(ALL)       ALL" >> /etc/sudoers

systemctl set-default multi-user.target