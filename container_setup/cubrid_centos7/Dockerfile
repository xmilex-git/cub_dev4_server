FROM    192.168.2.253:5000/development/cubrid:1.0.1

RUN     mkdir -p /data && \
        mkdir -p /etc/dev4_skeleton

RUN     export CMAKE_VERSION=3.26.3 && \
        curl -L https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION-linux-x86_64.tar.gz -o cmake-$CMAKE_VERSION-linux-x86_64.tar.gz && \
        tar -xzvf cmake-$CMAKE_VERSION-linux-x86_64.tar.gz  && \
        cp -fR cmake-$CMAKE_VERSION-linux-x86_64/* /usr  && \
        rm -rf cmake-$CMAKE_VERSION-linux-x86_64 cmake-$CMAKE_VERSION-linux-x86_64.tar.gz

RUN     export NINJA_VERSION=1.11.1 && \
        curl -L https://github.com/ninja-build/ninja/archive/refs/tags/v$NINJA_VERSION.tar.gz -o ninja-$NINJA_VERSION.tar.gz  && \
        tar -xzvf ninja-$NINJA_VERSION.tar.gz  && \
        cd ninja-$NINJA_VERSION && \
        cmake -Bbuild-cmake && \
        cmake --build build-cmake && \
        mv build-cmake/ninja /usr/bin/ninja && \
        cd .. && \
        rm -rf ninja-$NINJA_VERSION ninja-$NINJA_VERSION.tar.gz

RUN     yum install -y ant libtool libtool-ltdl autoconf automake rpm-build
RUN     yum install -y flex

RUN     export BISON_VERSION=3.0.5 && \
        curl -L https://ftp.gnu.org/gnu/bison/bison-$BISON_VERSION.tar.gz -o bison-$BISON_VERSION.tar.gz && \
        tar -xzvf bison-$BISON_VERSION.tar.gz && \
        cd bison-$BISON_VERSION && \
        ./configure --prefix=/usr && \
        make all install && \
        cd .. && \
        rm -rf bison-$BISON_VERSION bison-$BISON_VERSION.tar.gz

COPY    entrypoint.sh /etc/dev4_skeleton/entrypoint.sh

ENTRYPOINT ["/usr/sbin/init"]