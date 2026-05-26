#!/bin/bash

ps -ef | grep -E 'cub_server demodb|csql -u dba demodb' | grep -v grep | awk '{print $2}' | xargs kill -9