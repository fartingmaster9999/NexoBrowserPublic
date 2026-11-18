# Local Chromium desktop

This starts Chromium inside the private Linux desktop used by the local
browser service. It replaces the old Render-paired screenshot worker.

1. From the repository root, install this folder's dependencies:

   ```sh
   cd tools/browser-worker
   npm install
   npx playwright install --with-deps chromium
   ```

2. In a separate WSL terminal, start the virtual desktop:

   ```sh
   bash tools/local-browser/start-desktop.sh
   ```

3. Start Chromium from the repository root:

   ```sh
   cd tools/browser-worker
   npm run start:desktop
   ```

Keep the Chromium terminal open. Its profile is separate from your normal
browser profile and is stored in `~/.nexo-browser/chromium-profile`.

Follow `tools/local-browser/README.md` to start the local API and Cloudflare
Quick Tunnel. The VNC port is bound to loopback and is only reachable through
the authenticated, one-use viewer ticket.
