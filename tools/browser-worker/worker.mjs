import os from "node:os";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import process from "node:process";
import { WebSocket } from "ws";
import { chromium } from "playwright";

const WIDTH = 1280;
const HEIGHT = 720;
const FRAME_INTERVAL_MS = 450;

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

const serverUrl = getArg("--server");
const pairingCode = getArg("--code")?.trim().toUpperCase();

if (!serverUrl || !pairingCode) {
  process.stderr.write(
    "Usage: node worker.mjs --server https://your-private-browser-url --code PAIRING_CODE\n",
  );
  process.exit(1);
}

let endpoint;
try {
  endpoint = new URL("/api/browser/ws", serverUrl);
  if (endpoint.protocol === "https:") endpoint.protocol = "wss:";
  else if (endpoint.protocol === "http:") endpoint.protocol = "ws:";
  else throw new Error("The server URL must use http or https.");
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Invalid server URL"}\n`,
  );
  process.exit(1);
}

endpoint.searchParams.set("role", "worker");
endpoint.searchParams.set("code", pairingCode);

const profileDir = path.join(os.homedir(), ".private-browser", "chromium-profile");
await mkdir(profileDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: true,
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  args: process.platform === "linux" ? ["--no-sandbox"] : [],
});

let page = context.pages()[0] ?? (await context.newPage());
let stopping = false;
let frameTimer;
let viewerAttached = false;
let commandQueue = Promise.resolve();
let socket;

function send(payload) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function currentPage() {
  const pages = context.pages();
  if (page.isClosed() || !pages.includes(page)) {
    page = pages.at(-1) ?? page;
  }
  return page;
}

async function publishStatus() {
  const activePage = currentPage();
  const pageTitle = activePage.isClosed()
    ? ""
    : await activePage.title().catch(() => "");
  send({
    type: "status",
    browserOpen: !activePage.isClosed(),
    currentUrl: activePage.url(),
    pageTitle,
  });
}

function watchPage(nextPage) {
  page = nextPage;
  nextPage.on("domcontentloaded", publishStatus);
  nextPage.on("load", publishStatus);
  nextPage.on("close", publishStatus);
  publishStatus();
}

for (const existingPage of context.pages()) watchPage(existingPage);
context.on("page", watchPage);

socket = new WebSocket(endpoint, {
  handshakeTimeout: 12_000,
  maxPayload: 2_000_000,
});

async function closeWorker() {
  if (stopping) return;
  stopping = true;
  clearTimeout(frameTimer);
  try {
    await context.close();
  } catch {
    // The browser may already have exited.
  }
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close(1000, "Worker stopped");
  }
}

async function handleCommand(command) {
  const activePage = currentPage();
  try {
    switch (command.type) {
      case "navigate": {
        const target = new URL(command.url);
        if (target.protocol !== "http:" && target.protocol !== "https:") return;
        await activePage.goto(target.href, { waitUntil: "domcontentloaded" });
        break;
      }
      case "back":
        await activePage.goBack({ waitUntil: "domcontentloaded" });
        break;
      case "forward":
        await activePage.goForward({ waitUntil: "domcontentloaded" });
        break;
      case "reload":
        await activePage.reload({ waitUntil: "domcontentloaded" });
        break;
      case "pointer": {
        const x = Math.max(0, Math.min(WIDTH, Number(command.x)));
        const y = Math.max(0, Math.min(HEIGHT, Number(command.y)));
        const button = command.button === "right" ? "right" : "left";
        if (command.action === "move") await activePage.mouse.move(x, y);
        if (command.action === "down")
          await activePage.mouse.down({ button });
        if (command.action === "up") await activePage.mouse.up({ button });
        break;
      }
      case "scroll":
        await activePage.mouse.move(
          Math.max(0, Math.min(WIDTH, Number(command.x))),
          Math.max(0, Math.min(HEIGHT, Number(command.y))),
        );
        await activePage.mouse.wheel(
          Number(command.deltaX),
          Number(command.deltaY),
        );
        break;
      case "key":
        if (typeof command.key === "string" && command.key.length <= 40) {
          await activePage.keyboard.press(command.key);
        }
        break;
      case "text":
        if (typeof command.text === "string" && command.text.length <= 5000) {
          await activePage.keyboard.type(command.text);
        }
        break;
      case "stop":
        await closeWorker();
        return;
      default:
        break;
    }
  } catch {
    send({ type: "error", message: "The browser could not complete that action." });
  }
  if (
    command.type === "navigate" ||
    command.type === "back" ||
    command.type === "forward" ||
    command.type === "reload"
  ) {
    publishStatus();
  }
}

async function streamFrames() {
  if (stopping || !viewerAttached || socket.readyState !== WebSocket.OPEN) return;
  try {
    const activePage = currentPage();
    if (!activePage.isClosed()) {
      const frame = await activePage.screenshot({
        type: "jpeg",
        quality: 66,
        timeout: 5000,
      });
      send({
        type: "frame",
        data: `data:image/jpeg;base64,${frame.toString("base64")}`,
        width: WIDTH,
        height: HEIGHT,
      });
    }
  } catch {
    // A navigation can temporarily prevent a screenshot. The next frame retries.
  }
  if (viewerAttached) frameTimer = setTimeout(streamFrames, FRAME_INTERVAL_MS);
}

socket.on("open", () => {
  process.stdout.write("Connected. Chromium is ready for the private browser.\n");
  publishStatus();
  void streamFrames();
});

socket.on("message", (raw) => {
    let command;
    try {
      command = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (command?.type === "viewer") {
      viewerAttached = command.connected === true;
      if (!viewerAttached) clearTimeout(frameTimer);
      else void streamFrames();
      return;
    }
    commandQueue = commandQueue
      .then(() => handleCommand(command))
      .catch(() => {
        send({ type: "error", message: "The browser could not complete that action." });
      });
  });

socket.on("error", async () => {
  process.stderr.write(
    "Could not connect. Check the app URL and create a fresh pairing code.\n",
  );
  await closeWorker();
});

socket.on("close", async (code) => {
  if (code === 4401 || code === 4404) {
    process.stderr.write(
      "The pairing code expired or was already used. Create a new code in the app.\n",
    );
  } else if (!stopping) {
    process.stdout.write("The browser connection closed.\n");
  }
  await closeWorker();
});

process.on("SIGINT", () => void closeWorker());
process.on("SIGTERM", () => void closeWorker());
