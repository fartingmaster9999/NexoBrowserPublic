# Run the browser on your Windows computer

This setup keeps the dark website on Render, but moves the Express API,
Chromium, and browser display to your computer. Cloudflare Quick Tunnel gives
the local API an HTTPS address. Render does not relay the live browser screen.

The Quick Tunnel URL is temporary and changes after a restart. The site saves
the current URL in this browser; update it from the sign-in page when you start
a new tunnel.

## 1. Install WSL 2 and Ubuntu

In an Administrator PowerShell window:

```powershell
wsl --install -d Ubuntu
```

Restart Windows if asked, open Ubuntu, and finish its first-run setup.

## 2. Install local tools in Ubuntu

```bash
sudo apt update
sudo apt install -y xvfb x11vnc openbox curl git
```

Install Node.js 24 and pnpm using their official instructions. Install the
[GitHub CLI](https://github.com/cli/cli/blob/trunk/docs/install_linux.md), then
authenticate and clone the private repository inside Ubuntu (not under
`/mnt/c`):

```bash
gh auth login
gh repo clone fartingmaster9999/nexobrowser
cd nexobrowser
corepack enable
pnpm install --frozen-lockfile
cd tools/browser-worker
npm install
npx playwright install --with-deps chromium
cd ../..
```

## 3. Set local-only account values

From the repository root:

```bash
cp tools/local-browser/.env.local.example .env.local
```

Edit `.env.local` and set the approved email, a long unique password, and a
random session secret. Generate a suitable secret with:

```bash
openssl rand -hex 32
```

Keep `.env.local` private. It is ignored by Git and must never be committed.

## 4. Start the isolated browser desktop

In Ubuntu terminal 1, from the repository root:

```bash
bash tools/local-browser/start-desktop.sh
```

In Ubuntu terminal 2:

```bash
cd tools/browser-worker
npm run start:desktop
```

Leave the Chromium terminal open while using the browser. This Chromium profile
is separate from your normal browser profile.

## 5. Start the local API and tunnel

In Ubuntu terminal 3, from the repository root:

```bash
bash tools/local-browser/start-api.sh
```

Install `cloudflared` in Ubuntu using Cloudflare's official installation
instructions. In Ubuntu terminal 4, start a free Quick Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:8080
```

Copy the printed `https://....trycloudflare.com` address. Do not share the
address publicly; anyone who has it can reach the login page, though the API
still requires the owner password and a short-lived single-use viewer ticket.

## 6. Connect the Render website

1. Open the Render site and choose **Set up local browser connection** on the
   sign-in page.
2. Paste the current `trycloudflare.com` URL and save.
3. Sign in with the approved email and local password from `.env.local`.
4. Choose **Open browser**.

When the computer or tunnel restarts, repeat step 5 and replace the saved URL
on the sign-in page. The browser profile remains on your computer.

## Stop everything

Press Ctrl+C in the Chromium and API terminals. Then stop the virtual display:

```bash
bash tools/local-browser/stop-desktop.sh
```

Stop the Cloudflare Tunnel terminal too. The tunnel URL stops working when
`cloudflared` exits. The VNC server listens only on `127.0.0.1`; the public
tunnel exposes the API and ticket-checked WebSocket, not the raw VNC port.
