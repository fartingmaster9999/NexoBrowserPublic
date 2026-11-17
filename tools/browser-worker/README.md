# Private Browser computer connector

This small connector runs Chromium on your own computer and makes an outbound,
encrypted WebSocket connection to your Private Browser app. It does not open a
port on your computer or use your normal Chrome profile. Its separate Chromium
profile stays in `~/.private-browser/chromium-profile`.

## Connect

1. Sign in to Private Browser and choose **Connect this computer** to create a
   one-time pairing code.
2. Install Node.js 20 or later on the computer that should run Chromium.
3. Download this `tools/browser-worker` folder to that computer.
4. In the folder, run:

   ```sh
   npm install
   npx playwright install chromium
   node worker.mjs --server https://YOUR-PRIVATE-BROWSER-URL --code PAIRING_CODE
   ```

   On Linux, Playwright may also need its system libraries. Run
   `npx playwright install --with-deps chromium` on a machine where you have
   permission to install them.

5. Return to the app. The browser view will connect when the computer reports
   that Chromium is ready.

The pairing code expires after five minutes and works once. Generate a new code
if you close the connector or the connection is lost. Your browser cookies are
kept only in the connector's separate profile on this computer; do not share
that profile directory.

The remote view sends page images and your input actions through the private
app connection. It is intended for the account owner only. Keep the app private
and stop the session when you are done.
