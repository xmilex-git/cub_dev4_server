
yum update

systemctl set-default multi-user.target

yum config-manager --enable devel

yum install -y epel-release
yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm

yum install -y yum-utils

yum groupinstall -y "Core" --setopt=group_package_types=mandatory,default,optional
yum install -y hunspell-ko

yum groupinstall -y "Base" --setopt=group_package_types=mandatory,default,optional
yum groupinstall -y "Development Tools" --setopt=group_package_types=mandatory,default,optional

yum install -y scl-utils

yum install -y cgdb
yum install -y elfutils-libelf-devel
yum install -y ncurses-devel
yum install -y openssl openssl-devel
yum install -y python3 python3-devel
yum install -y java-11-openjdk java-11-openjdk-devel
yum install -y ninja-build

#podman
cat > /etc/containers/containers.conf <<EOF
[containers]
  root = "/home/podman"
  dns = ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4"]
  netns = "bridge"
  userns = "auto"
  ipcns = "auto"
  utsns = "auto"

[engine]
  cgroup_manager = "cgroupfs"
  events_logger = "file"
  volume_path = "/home/podman/volumes"
EOF

cat > /etc/containers/storage.conf <<EOF
[storage]
driver = "overlay"
graphroot = "/home/podman"
runroot = "/var/run/podman"
EOF

sed -i "s/#\s*insecure = false/insecure = true/" /etc/containers/registries.conf


