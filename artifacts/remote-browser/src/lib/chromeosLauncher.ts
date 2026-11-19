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
      :root {
        color-scheme: dark;
        font-family: Arial, sans-serif;
        background: #0b0d0f;
        color: #e8ecef;
      }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        padding: 24px;
        box-sizing: border-box;
      }
      main {
        width: min(100%, 420px);
        padding: 28px;
        border: 1px solid #30363a;
        border-radius: 12px;
        background: #111416;
      }
      h1 { margin: 0; font-size: 22px; }
      p { color: #aeb6bb; font-size: 14px; line-height: 1.6; }
      button {
        width: 100%;
        min-height: 44px;
        margin-top: 12px;
        border: 0;
        border-radius: 6px;
        background: #d5d9dc;
        color: #111416;
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      button:focus-visible { outline: 3px solid #66b8ff; outline-offset: 3px; }
      #status { min-height: 1.5em; }
    </style>
  </head>
  <body>
    <main>
      <h1>Private Browser</h1>
      <p>Open the hosted browser in a separate Chrome window. If asked, sign in there; the remote viewer will connect automatically when your computer is online.</p>
      <button id="launch" type="button">Open Private Browser</button>
      <p id="status" role="status" aria-live="polite">If Chrome blocks the window, allow pop-ups for the hosted site and try again.</p>
    </main>
    <script>
      const appUrl = ${safeAppUrl};
      document.getElementById('launch').addEventListener('click', () => {
        const popup = window.open(
          appUrl,
          '_blank',
          'popup,width=1280,height=900,toolbar=yes,location=yes,resizable=yes'
        );
        const status = document.getElementById('status');
        if (!popup) {
          status.textContent = 'Chrome blocked the window. Allow pop-ups for the hosted site, then try again.';
          return;
        }
        status.textContent = 'Opening the hosted browser in a new Chrome window…';
        popup.focus();
      });
    </script>
  </body>
</html>`;
}
