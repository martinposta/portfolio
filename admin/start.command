#!/bin/bash
# Double-click this file to start the portfolio admin tool.
cd "$(dirname "$0")"
echo "Starting Martin Pošta portfolio admin tool..."
( sleep 1 && open "http://localhost:4173" ) &
node server.js
