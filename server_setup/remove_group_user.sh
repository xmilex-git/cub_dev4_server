#!/bin/bash

USERNAME=$1
GROUPNAME=$2

userdel -r $USERNAME
groupdel $GROUPNAME
