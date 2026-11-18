import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import { chromium } from "playwright";

if (!process.env.DISPLAY) {
  process.stderr.write(
    "No virtual display is active. Run tools/local-browser/start-desktop.sh first.\n",
  );
  process.exit(1);
}

const profileDir = path.join(os.homedir(), ".nexo-browser", "chromium-profile");
await mkdir(profileDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: null,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = context.pages()[0] ?? (await context.newPage());
await page.bringToFront();
process.stdout.write(
  "Chromium is open in the private desktop. Keep this terminal running.\n",
);

let closing = false;
async function closeBrowser() {
  if (closing) return;
  closing = true;
  await context.close().catch(() => undefined);
}

process.on("SIGINT", () => void closeBrowser().finally(() => process.exit(0)));
process.on("SIGTERM", () => void closeBrowser().finally(() => process.exit(0)));
