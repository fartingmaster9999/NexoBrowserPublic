#!/usr/bin/env bash
set -euo pipefail

if ! command -v Xvfb >/dev/null 2>&1; then
  echo "Xvfb is missing. Install the packages listed in tools/local-browser/README.md." >&2
  exit 1
fi
if ! command -v x11vnc >/dev/null 2>&1; then
  echo "x11vnc is missing. Install the packages listed in tools/local-browser/README.md." >&2
  exit 1
fi

# Ubuntu's desktop may be Wayland, but this service deliberately shares an
# isolated Xvfb display. Remove Wayland markers so x11vnc targets that display.
unset WAYLAND_DISPLAY
export XDG_SESSION_TYPE=x11

mkdir -p "$HOME/.nexo-browser"
if ! pgrep -f 'Xvfb :99 ' >/dev/null 2>&1; then
  nohup Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp \
    >"$HOME/.nexo-browser/xvfb.log" 2>&1 </dev/null &
fi
export DISPLAY=:99

if command -v openbox >/dev/null 2>&1 && ! pgrep -x openbox >/dev/null 2>&1; then
  nohup openbox >"$HOME/.nexo-browser/openbox.log" 2>&1 </dev/null &
fi

for _ in $(seq 1 20); do
  if [ -S /tmp/.X11-unix/X99 ]; then break; fi
  sleep 0.25
done
if [ ! -S /tmp/.X11-unix/X99 ]; then
  echo "The private desktop did not start. Check ~/.nexo-browser/xvfb.log." >&2
  exit 1
fi

if ! pgrep -f 'x11vnc.*-rfbport 5900' >/dev/null 2>&1; then
  nohup x11vnc -display :99 -rfbport 5900 -localhost -forever -shared -nopw \
    >"$HOME/.nexo-browser/x11vnc.log" 2>&1 </dev/null &
fi

for _ in $(seq 1 20); do
  if (echo >/dev/tcp/127.0.0.1/5900) >/dev/null 2>&1; then
    echo "Private desktop is ready on loopback port 5900."
    exit 0
  fi
  sleep 0.25
done

echo "The VNC display did not start. Check ~/.nexo-browser/x11vnc.log." >&2
exit 1
