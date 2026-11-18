#!/usr/bin/env bash
set -euo pipefail

pkill -f 'x11vnc.*-rfbport 5900' 2>/dev/null || true
pkill -x openbox 2>/dev/null || true
pkill -f 'Xvfb :99 ' 2>/dev/null || true
echo "Private browser desktop stopped."
