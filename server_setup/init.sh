#!/bin/bash

INTERFACE=ens160

systemctl set-default multi-user.target

yum install -y epel-release
yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm

rpm --import https://www.elrepo.org/RPM-GPG-KEY-elrepo.org
yum install -y https://www.elrepo.org/elrepo-release-8.el8.elrepo.noarch.rpm
yum --enablerepo=elrepo-kernel install -y kernel-ml kernel-ml-devel

# you have to reboot
server_setup/install_pkg_orig.sh

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

mkdir -p /home/podman

mkdir -p /home/podman/volumes

#podman
cat > /etc/containers/containers.conf <<EOF
[containers]
  root = "/home/podman"
  dns = ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"]
  cgroups="enabled"
  userns="host"

[engine]
  cgroup_manager = "cgroupfs"
  events_logger = "file"
  events_logfile_path= "/home/podman/podman_log"
  volume_path = "/home/podman/volumes"
EOF

cat > /etc/containers/storage.conf <<EOF
[storage]
driver = "overlay"
runroot = "/run/containers/storage"
graphroot = "/var/lib/containers/storage"
EOF

sed -i "s/#\s*insecure = false/insecure = true/" /etc/containers/registries.conf

podman network create \
        --driver ipvlan \
	--subnet=192.168.226.0/24 \
	--gateway=192.168.226.2 \
        --interface-name=$INTERFACE \
	--opt mode=l2 \
	ipvlan3

podman run -d --name rc3 \
	--hostname rc3 \
        --network ipvlan3 \
        --privileged \
        --ip=192.168.226.135 \
        rockylinux:8 /sbin/init

podman exec -it rc3 /bin/bash
