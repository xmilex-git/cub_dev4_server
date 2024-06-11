# Server and Container Setup Guide

## Table of Contents
1. [Server Preparation](#server-preparation)
2. [Installing Tools](#installing-tools)
3. [Building the Container Image](#building-the-container-image)
4. [Running Scripts](#running-scripts)

### Server Preparation
- **Kernel Update**: Ensure your server is running on the latest kernel. Modify the GRUB settings as needed. Refer to the script at `server_setup/init.sh` but **do not execute it directly** without reviewing its content.

### Installing Tools
- **Install Podman and Buildah**: These tools are essential for container management and image creation.

### Building the Container Image
- Navigate to the setup directory and build your image:
  ```bash
  cd container_setup/dev4_image_base
  podman build -t {your_image_name:your_tag} .
  ```

### Running Scripts
- As the root user, execute the script to set up the container. Here’s an example command:
  ```bash
  sudo ./server_setup/make_container.sh {IP_D_CLASS} {YOUR NAME}
  ```
