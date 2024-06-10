#!/bin/bash

NIC=eno1np0

systemctl set-default multi-user.target

yum install -y epel-release
yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm

# you have to reboot
server_setup/install_pkg.sh

rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org
yum install -y https://www.elrepo.org/elrepo-release-8.el8.elrepo.noarch.rpm
yum --enablerepo=elrepo-kernel install -y kernel-ml kernel-ml-devel

echo "exclude=kernel*" >> /etc/yum.conf

systemctl disable avahi-daemon.service \
                        firewalld.service \
&& systemctl enable  cockpit.socket \
                         sshd

rm -rf /etc/localtime \
&& ln -s /usr/share/zoneinfo/Asia/Seoul /etc/localtime

mkdir -p /home/docker

docker network create \
                -d ipvlan \
                --subnet=192.168.6.0/24 \
                --gateway=192.168.6.1 \
                -o parent=eno1np0 \
                -o ipvlan_mode=l2 \
                my_ipvlan_1

