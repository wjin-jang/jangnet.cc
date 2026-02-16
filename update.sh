#!/bin/bash
git add -A && git commit -m "Update site" --allow-empty=false 2>/dev/null; git push && \
ssh -p 2222 woojin@ssh.jangnet.cc "cd /home/woojin/website && git pull && cd /home/woojin/music && docker compose up -d --build"
