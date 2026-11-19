---
name: Ubuntu Wayland with Xvfb
description: Keep the local Chromium window on the isolated Xvfb display when Ubuntu's desktop session uses Wayland.
---

On Ubuntu running a Wayland desktop, local-browser processes can inherit Wayland settings and open Chromium on the physical desktop instead of the Xvfb display. For this project, clear `WAYLAND_DISPLAY`, set `DISPLAY=:99` and `XDG_SESSION_TYPE=x11`, and force Chromium to use `--ozone-platform=x11`. If `xclock` appears in the remote VNC view but Chromium does not, the tunnel and VNC path are working; diagnose Chromium's display selection or window placement.

**Why:** A successful tunnel and VNC connection can still show a black frame when Chromium draws on a different display.

**How to apply:** Use these checks when the Ubuntu host reports Wayland detection or the VNC viewer is connected but black. Do not change the tunnel until an X11 test window also fails to appear.
