# Private Browser computer connector

This connector runs Chromium on your own computer and makes an outbound,
encrypted WebSocket connection to your Private Browser app. It does not open a
port on your computer, need a tunnel, or use your normal Chrome profile. Its
separate Chromium profile stays in `~/.private-browser/chromium-profile`.

## Connect

1. On the computer that should run Chromium, install Node.js 20 or later.
2. Sign in to Private Browser, download the connector ZIP, and extract it.
3. Choose **Generate pairing code** in Private Browser. The app displays a
   command containing its address and a one-time pairing code.
4. Open a terminal in the extracted connector folder and run:

   ```sh
   npm install
   npx playwright install chromium
   node worker.mjs --server https://YOUR-PRIVATE-BROWSER-URL --code ONE_TIME_CODE
   ```

   Replace the example address and code with the command shown in the app. On
   Linux, if Chromium reports missing system libraries, run
   `npx playwright install --with-deps chromium` on a machine where you have
   permission to install them.

5. Keep the terminal open. Return to the app and choose **Open browser** when
   the computer shows as connected.

The pairing code expires after five minutes and works once. Generate a new code
if you close the connector or the connection is lost. Your browser cookies are
kept only in the connector's separate profile on this computer; do not share
that profile directory.

The remote view sends page images and your input actions through the private
app connection. It is intended for the account owner only. Keep the app private
and press Ctrl+C in the connector terminal when you are done.
