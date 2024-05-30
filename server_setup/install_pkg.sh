#!/bin/bash

yum install -y  yum-utils

yum config-manager --enable devel ha nfv plus powertools remi resilient-storage rt

yum install -y  man \
                man-pages \
                kernel-doc

yum groupinstall -y "Development Tools" --setopt=group_package_types=mandatory,default,optional
yum groupinstall -y "Base" --setopt=group_package_types=mandatory,default
yum install -y hunspell-ko
yum groupinstall -y "Core" --allowerasing --setopt=group_package_types=mandatory

yum install -y \
                scl-utils \
                ninja-build \
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
                cmake3 \
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
                ;

