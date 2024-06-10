FROM    rockylinux/rockylinux:8.10.20240528

RUN     yum install -y  yum-utils

RUN     yum install -y epel-release && \
        yum install -y https://rpms.remirepo.net/enterprise/remi-release-8.rpm && \
        yum config-manager --enable devel powertools remi

RUN     yum install -y  man man-pages kernel-doc

RUN     yum groupinstall -y "Development Tools" --setopt=group_package_types=mandatory,default,optional 
RUN     yum groupinstall -y "Base" --setopt=group_package_types=mandatory,default 
RUN     yum groupinstall -y "Core" --allowerasing --setopt=group_package_types=mandatory 

COPY    yum_requirements.txt yum_requirements.txt

RUN     yum install -y $(cat yum_requirements.txt)

RUN     rm -rf /etc/localtime && \
        ln -s /usr/share/zoneinfo/Asia/Seoul /etc/localtime

CMD     ["/usr/sbin/init"]


                        