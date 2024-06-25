FROM    rockylinux:8

RUN     yum install -y  make python3 git && \
        pip3 install sphinx_rtd_theme

COPY    entrypoint.sh /root/entrypoint.sh

RUN     chmod +x /root/entrypoint.sh

CMD     ["/root/entrypoint.sh"]