#!/bin/bash

yum config-manager --enable devel ha nfv plus powertools remi resilient-storage rt

yum install -y  man \
                man-pages \
                kernel-doc

# Group-Id: development
# RUN yum groupinstall -y "Development Tools" --setopt=group_package_types=mandatory,default,optional
# # Mandatory Packages:

yum install -y \
                autoconf \
                automake \
                binutils \
                bison \
                flex \
                gcc \
                gcc-c++ \
                gettext \
                libtool \
                make \
                patch \
                pkgconfig \
                redhat-rpm-config \
                rpm-build \
                rpm-sign \
# Default Packages:
                byacc \
                cscope \
                ctags \
                diffstat \
                doxygen \
                elfutils \
                gcc-gfortran \
                git \
                indent \
                intltool \
                patchutils \
                rcs \
                # subversion \
                swig \
                systemtap \
# Optional Packages:
                # ElectricFence \ #MARK!
                ant \
                # babel \
                # bzr \
                ccache \
                chrpath \
                # clips \
                # clips-devel \
                # clips-doc \
                # clips-emacs \
                # clips-xclips \
                # clipsmm-devel \
                # clipsmm-doc \
                cmake \
                # cmucl \
                colordiff \
                # compat-gcc-44 \ #MARK!
                # compat-gcc-44-c++ \ #MARK!
                # cvs \
                # cvsps \
                # darcs \
                dejagnu \
                # email2trac \
                expect \
                # ftnchek \ #MARK!
                gcc-gnat \
                gcc-objc \
                gcc-objc++ \
                # ghc \
                git \
                # haskell-platform \
                imake \
                javapackages-tools \
                # ksc \
                # lua \
                # mercurial \
                mock \
                # mod_dav_svn \
                nasm \
                # nqc \
                # nqc-doc \
                # ocaml \
                perltidy \
                # qgit \ #MARK!
                rpmdevtools \
                rpmlint \
                # sbcl \
                # scorep \
                systemtap-sdt-devel \
                systemtap-server \
                # trac \
                # trac-git-plugin \
                # trac-mercurial-plugin \
                # trac-webadmin \
                # translate-toolkit \
                ;

# Group-Id: base
# RUN yum groupinstall -y "Base" --setopt=group_package_types=mandatory,default
# Mandatory Packages:

RUN yum install -y \
                   acl \
                   at \
                   attr \
                   bc \
                   bind-utils \
                   # centos-indexhtml \
                   cpio \
                   # crda \
                   crontabs \
                   # cyrus-sasl-plain \
                   dbus \
                   ed \
                   file \
                   logrotate \
                   lsof \
                   man-db \
                   net-tools \
                   # ntsysv \
                   pciutils \
                   psacct \
                   # quota \
                   # setserial \
                   traceroute \
                   # usb_modeswitch \
# Deult Packages:
                   # abrt-addon-ccpp \
                   # abrt-addon-python \
                   # abrt-cli \
                   # abrt-console-notification \
                   bash-completion \
                   blktrace \
                   bpftool \
                   bridge-utils \
                   bzip2 \
                   chrony \
                   # cryptsetup \
                   # dmraid \
                   dosfstools \
                   ethtool \
                   # fprintd-pam \
                   gnupg2 \
                   hunspell \
                   hunspell-en \
                   # kmod-kvdo \
                   # kpatch \
                   # ledmon \
                   libaio \
                   # libreport-plugin-mailx \
                   # libstoragemgmt \
                   # lvm2 \
                   man-pages \
                   man-pages-overrides \
                   # mdadm \
                   mlocate \
                   mtr \
                   nano \
                   # ntpdate \
                   pinfo \
                   # plymouth \
                   # pm-utils \
                   rdate \
                   # rfkill \
                   rng-tools \
                   rsync \
                   scl-utils \
                   # setuptool \ #MARK!
                   # smartmontools \
                   # sos \
                   # sssd-client \
                   strace \
                   sysstat \
                   systemtap-runtime \
                   tcpdump \
                   tcsh \
                   # teamd \
                   time \
                   unzip \
                   # usbutils \
                   # vdo \
                   vim-enhanced \
                   virt-what \
                   wget \
                   which \
                   words \
                   # xfsdump \
                   xz \
                   # yum-langpacks \ #MARK!
                   yum-utils \
                   zip \
# Optional Packages: NULL
# Conditional Packages: NULL
                   hunspell-ko \
                   ;