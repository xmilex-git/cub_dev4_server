#!/bin/bash

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")

systemctl set-default multi-user.target

yum install -y epel-release
yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm

${SCRIPT_DIR}/install_pkg.sh

systemctl disable avahi-daemon.service \
                        firewalld.service \
&& systemctl enable  cockpit.socket \
                         sshd.service

rm -rf /etc/localtime \
&& ln -s /usr/share/zoneinfo/Asia/Seoul /etc/localtime

sed -i 's/#Port 22/Port 22/' /etc/ssh/sshd_config

useradd cubrid
echo "cubrid:password" | chpasswd
usermod -aG wheel cubrid

systemctl restart sshd