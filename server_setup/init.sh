#!/bin/bash

NIC=eno1np0
OLD_NIC=eno1

systemctl set-default multi-user.target

yum install -y epel-release
yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm

server_setup/install_pkg.sh

rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org
yum install -y https://www.elrepo.org/elrepo-release-8.el8.elrepo.noarch.rpm
yum --enablerepo=elrepo-kernel install -y kernel-ml kernel-ml-devel

yum update -y

grubby --info=ALL
grubby --set-default=/boot/vmlinuz-${kernel-version} # you need to choose
grubby --set-default=/boot/vmlinuz-6.9.3-1.el8.elrepo.x86_64
cp /etc/sysconfig/network-scripts/ifcfg-${OLD_NIC} /etc/sysconfig/network-scripts/ifcfg-${NIC}
# you need to change new ifcfg-${NIC}, device and name
# you have to reboot

rm -rf /etc/localtime \
&& ln -s /usr/share/zoneinfo/Asia/Seoul /etc/localtime

sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

mkdir -p /home/podman

mkdir -p /data/overlay-images

ln -s /data/overlay-images /home/podman/

sed -i 's|graphroot = "/var/lib/containers/storage"|graphroot = "/home/podman"|' /etc/containers/storage.conf

systemctl enable podman-restart

podman network create \
                -d ipvlan \
                -o parent=eno1np0 \
                -o mode=l2 \
                --subnet 192.168.6.0/24 \
                --gateway 192.168.6.1 \
                ipv1
