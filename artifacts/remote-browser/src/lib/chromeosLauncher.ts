export function createChromeOsLauncherHtml(appUrl: string): string {
  const safeAppUrl = JSON.stringify(appUrl).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="dark">
    <title>Private Browser launcher</title>
    <style>
      :root { color-scheme: dark; background: #0b0d0f; }
      html, body, iframe { width: 100%; height: 100%; margin: 0; border: 0; }
      body { overflow: hidden; }
      iframe { display: block; background: #0b0d0f; }
      #status {
        position: fixed;
        inset: auto 12px 12px;
        z-index: 2;
        margin: 0;
        padding: 10px 12px;
        border: 1px solid #30363a;
        border-radius: 6px;
        background: #111416;
        color: #aeb6bb;
        font: 14px/1.5 Arial, sans-serif;
      }
    </style>
  </head>
  <body>
    <iframe id="browser" title="Private Browser" allow="fullscreen"></iframe>
    <p id="status" role="status" aria-live="polite">Loading the browser. Sign in if prompted; it will connect when your computer is online.</p>
    <script>
      const appUrl = ${safeAppUrl};
      const frame = document.getElementById('browser');
      const status = document.getElementById('status');
      frame.referrerPolicy = 'no-referrer';
      frame.src = appUrl;
      frame.addEventListener('load', () => { status.hidden = true; });
      window.setTimeout(() => {
        if (!status.hidden) status.textContent = 'Still loading. Check your internet connection and try again.';
      }, 12000);
    </script>
  </body>
</html>`;
}
