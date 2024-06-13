#!/bin/bash

VERSION=$1

podman  build -t dev4_image_base:${VERSION} `dirname $0`
