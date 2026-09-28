#!/bin/sh
# RupeeTrail: double-click to start on a Mac (on Linux: ./start.command or python3 start.py)
cd "$(dirname "$0")" || exit 1
exec python3 start.py "$@"
