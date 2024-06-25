#!/bin/bash

# podman ps -a 명령어 실행 출력
output=$(podman ps -a)

# 첫 줄을 제외한 라인에서 숫자와 이름 추출하여 임시 파일에 저장
echo "$output" | tail -n +2 | awk '{print $NF}' | while IFS=- read -r number name; do
    echo -e "${number}\t${name}"
done > /tmp/ip_unsorted.txt

echo -e "0\tsubnet" >> /tmp/ip_unsorted.txt
echo -e "1\tgateway" >> /tmp/ip_unsorted.txt
echo -e "2\thost" >> /tmp/ip_unsorted.txt

# 숫자 기준으로 정렬하고 각 줄 앞에 "192.168.6."을 붙여서 /root/ip.txt에 저장
sort -n /tmp/ip_unsorted.txt | while IFS=$'\t' read -r number name; do
    echo -e "192.168.6.${number}\t${name}"
done > /root/ip.txt

# 임시 파일 삭제
rm /tmp/ip_unsorted.txt