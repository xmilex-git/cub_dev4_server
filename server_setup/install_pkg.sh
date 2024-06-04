#!/bin/bash

yum install -y  yum-utils

yum config-manager --enable devel ha nfv plus powertools remi resilient-storage rt

yum install -y  man \
                man-pages \
                kernel-doc

yum groupinstall -y "Development Tools" --setopt=group_package_types=mandatory,default,optional
yum groupinstall -y "Base" --setopt=group_package_types=mandatory,default
yum groupinstall -y "Core" --allowerasing --setopt=group_package_types=mandatory

yum install -y \
                scl-utils \
                ninja-build \
                libstdc++-static \
                elfutils-libelf-devel \
                ncurses-devel \
                openssl \
                openssl-devel \
                java-1.8.0-openjdk \
                java-1.8.0-openjdk-devel \
                java-11-openjdk \
                java-11-openjdk-devel \
                python3 \
                python3-devel \
                cgdb \
                cmake \
                glances \
                htop \
                jq \
                maven \
                samba \
                telnet \
                zsh \
                dh-autoreconf \
                curl-devel \
                expat-devel \
                gettext-devel \
                openssl-devel \
                perl-devel \
                zlib-devel \
                asciidoc \
                xmlto \
                docbook2X \
                cockpit \
                glibc \
                glibc-static \
                kcachegrind \
                indent \
                lsof \
                man-db \
                man-pages \
                openssh-server \
                systemtap-sdt-devel \
                unixODBC-devel \
                vim-enhanced \
                yum-utils \
                bash-completion \
                astyle \
                ant \
                rapid-json \
                hunspell-ko \
                nmap-ncat \
                ;

yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

yum install -y docker-ce docker-ce-cli containerd.io --allow-erasing
