#!/bin/bash
cd "$(dirname "$0")"
while true; do
    echo "$(date): Starting server..." >> /tmp/seo-tool-watchdog.log
    node server.js
    echo "$(date): Server crashed, restarting in 3s..." >> /tmp/seo-tool-watchdog.log
    sleep 3
done
