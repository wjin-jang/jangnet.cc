#!/bin/bash
ssh -p 2222 woojin@ssh.jangnet.cc "cd /home/woojin/website && git pull && cd /home/woojin/music && docker compose up -d --build"
