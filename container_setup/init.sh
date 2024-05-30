#!/bin/bash

systemctl set-default multi-user.target

yum install -y epel-release
yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm

server_setup/install_pkg.sh

systemctl disable avahi-daemon.service \
                        firewalld.service \
&& systemctl enable  cockpit.socket \
                         sshd.service

mkdir -p /usr/local/src/astyle_3.1_linux \
&& curl -L https://jaist.dl.sourceforge.net/project/astyle/astyle/astyle%203.1/astyle_3.1_linux.tar.gz -o /usr/local/src/astyle_3.1_linux.tar.gz \
&& tar -zxvf /usr/local/src/astyle_3.1_linux.tar.gz -C /usr/local/src/astyle_3.1_linux --strip-components=1 \
&& cd /usr/local/src/astyle_3.1_linux && cmake3 . && make && make install

rm -rf /etc/localtime \
&& ln -s /usr/share/zoneinfo/Asia/Seoul /etc/localtime

sed -i 's/#Port 22/Port 22/' /etc/ssh/sshd_config

useradd cubrid
echo "cubrid:password" | chpasswd
usermod -aG wheel cubrid

systemctl restart sshd