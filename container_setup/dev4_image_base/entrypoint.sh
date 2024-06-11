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

mv      /etc/dev4_skeleton/.cubrid.sh           /home/${USERNAME_T}/.cubrid.sh      
mv      /etc/dev4_skeleton/.dev4_profile        /home/${USERNAME_T}/.dev4_profile
mv      /etc/dev4_skeleton/.gdbinit             /home/${USERNAME_T}/.gdbinit

chown -R ${USERNAME_T}:${GROUPNAME_T} /home/${USERNAME_T}

echo "source /home/${USERNAME_T}/.dev4_profile" >> /home/${USERNAME_T}/.bashrc

cat /etc/passwd | grep ${USERNAME_T}

