#!/bin/bash

yum install -y  yum-utils

yum config-manager --enable devel powertools

yum install -y \
                man \
                man-pages \
                kernel-doc \
                net-tools \
                scl-utils \
                openssh-server \
                vim-enhanced \
                bash-completion \
                hunspell-ko \
                podman \
                buildah \
                htop \
                passwd \
                ;

