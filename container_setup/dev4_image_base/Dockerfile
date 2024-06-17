FROM    rockylinux:8

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

RUN     mkdir -p /etc/dev4_skeleton
RUN     mkdir -p /etc/dev4_skeleton/install
RUN     mkdir -p /data

COPY    .cubrid.sh      /etc/dev4_skeleton/.cubrid.sh
COPY    .dev4_profile   /etc/dev4_skeleton/.dev4_profile 
COPY    .gdbinit        /etc/dev4_skeleton/.gdbinit  
COPY    entrypoint.sh   /etc/dev4_skeleton/entrypoint.sh

RUN     cd /etc/dev4_skeleton && \
        wget https://download.savannah.gnu.org/releases/texi2html/texi2html-1.82.tar.gz && \
        tar -zxvf texi2html-1.82.tar.gz && \
        cd texi2html-1.82 && \
        ./configure --prefix=/etc/dev4_skeleton/install && \
        make && make install

RUN     echo 'PATH=/etc/dev4_skeleton/install/bin:${PATH}' >> /etc/bashrc && \
        source /etc/bashrc

RUN     source /etc/bashrc && \
        cd /etc/dev4_skeleton && \
        wget https://ftp.gnu.org/gnu/indent/indent-2.2.11.tar.gz && \
        tar -zxvf indent-2.2.11.tar.gz && \
        cd indent-2.2.11 && \
        ./configure --prefix=/etc/dev4_skeleton/install && \
        make && make install

RUN     chmod +x /etc/dev4_skeleton/entrypoint.sh

RUN     sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

CMD     ["/usr/sbin/init"]


                        