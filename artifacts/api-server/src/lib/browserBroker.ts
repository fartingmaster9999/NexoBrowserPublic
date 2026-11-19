import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { URL } from "node:url";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { logger } from "./logger";

const SOCKET_PATH = "/api/browser/ws";
const VNC_SOCKET_PATH = "/api/browser/vnc";
const WEBRTC_SOCKET_PATH = "/api/browser/webrtc";
const PAIRING_TTL_MS = 5 * 60 * 1000;
const VIEWER_TTL_MS = 60 * 1000;
const MAX_FRAME_MESSAGE_LENGTH = 1_800_000;

type BrowserStatus = {
  deviceConnected: boolean;
  browserOpen: boolean;
  currentUrl: string | null;
  pageTitle: string | null;
};

type BrowserSession = {
  worker: WebSocket;
  viewer?: WebSocket;
  status: BrowserStatus;
};

type Pairing = { ownerId: string; expiresAt: number };
type ViewerTicket = { ownerId: string; expiresAt: number };

const sessions = new Map<string, BrowserSession>();
const pairings = new Map<string, Pairing>();
const viewerTickets = new Map<string, ViewerTicket>();

function newOpaqueCode(byteLength = 18): string {
  return randomBytes(byteLength).toString("base64url");
}

function cleanExpiredEntries(): void {
  const now = Date.now();
  for (const [code, pairing] of pairings) {
    if (pairing.expiresAt <= now) pairings.delete(code);
  }
  for (const [ticket, record] of viewerTickets) {
    if (record.expiresAt <= now) viewerTickets.delete(ticket);
  }
}

export function createPairing(ownerId: string): {
  code: string;
  expiresAt: string;
} {
  cleanExpiredEntries();
  for (const [existingCode, pairing] of pairings) {
    if (pairing.ownerId === ownerId) pairings.delete(existingCode);
  }
  const code = randomBytes(8).toString("hex").toUpperCase();
  const expiresAt = Date.now() + PAIRING_TTL_MS;
  pairings.set(code, { ownerId, expiresAt });
  return { code, expiresAt: new Date(expiresAt).toISOString() };
}

export function getBrowserStatus(ownerId: string): BrowserStatus {
  const session = sessions.get(ownerId);
  return (
    session?.status ?? {
      deviceConnected: false,
      browserOpen: false,
      currentUrl: null,
      pageTitle: null,
    }
  );
}

export function createViewerTicket(ownerId: string): {
  ticket: string;
  socketPath: string;
} {
  cleanExpiredEntries();
  const ticket = newOpaqueCode();
  viewerTickets.set(ticket, { ownerId, expiresAt: Date.now() + VIEWER_TTL_MS });
  return { ticket, socketPath: VNC_SOCKET_PATH };
}

export function consumeViewerTicket(ticket: string): string | null {
  cleanExpiredEntries();
  const record = viewerTickets.get(ticket);
  if (!record || record.expiresAt <= Date.now()) {
    viewerTickets.delete(ticket);
    return null;
  }
  viewerTickets.delete(ticket);
  return record.ownerId;
}

export function stopBrowserSession(ownerId: string): void {
  const session = sessions.get(ownerId);
  if (session) {
    if (session.worker.readyState === WebSocket.OPEN) {
      session.worker.send(JSON.stringify({ type: "stop" }));
      session.worker.close(1000, "Stopped by owner");
    }
    session.viewer?.close(1000, "Stopped by owner");
    sessions.delete(ownerId);
  }

  for (const [code, pairing] of pairings) {
    if (pairing.ownerId === ownerId) pairings.delete(code);
  }
  for (const [ticket, record] of viewerTickets) {
    if (record.ownerId === ownerId) viewerTickets.delete(ticket);
  }
}

function readText(data: RawData): string | null {
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return null;
}

function sendStatus(session: BrowserSession): void {
  if (session.viewer?.readyState !== WebSocket.OPEN) return;
  session.viewer.send(JSON.stringify({ type: "status", ...session.status }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWorkerMessage(text: string): Record<string, unknown> | null {
  if (text.length > MAX_FRAME_MESSAGE_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || typeof value.type !== "string") return null;

    if (value.type === "status") {
      return {
        type: "status",
        browserOpen: value.browserOpen === true,
        currentUrl:
          typeof value.currentUrl === "string"
            ? value.currentUrl.slice(0, 2048)
            : null,
        pageTitle:
          typeof value.pageTitle === "string"
            ? value.pageTitle.slice(0, 300)
            : null,
      };
    }

    if (
      value.type === "frame" &&
      typeof value.data === "string" &&
      value.data.startsWith("data:image/jpeg;base64,") &&
      value.data.length <= MAX_FRAME_MESSAGE_LENGTH
    ) {
      return {
        type: "frame",
        data: value.data,
        width:
          typeof value.width === "number" && value.width > 0
            ? Math.min(4096, Math.floor(value.width))
            : 1280,
        height:
          typeof value.height === "number" && value.height > 0
            ? Math.min(4096, Math.floor(value.height))
            : 720,
      };
    }

    if (value.type === "error") {
      return { type: "error", message: "The remote browser reported an error." };
    }
  } catch {
    return null;
  }

  return null;
}

function isSafeViewerCommand(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  switch (value.type) {
    case "back":
    case "forward":
    case "reload":
    case "stop":
      return true;
    case "navigate": {
      if (typeof value.url !== "string" || value.url.length > 2048) return false;
      try {
        const url = new URL(value.url);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    }
    case "pointer":
      return (
        typeof value.x === "number" &&
        Number.isFinite(value.x) &&
        typeof value.y === "number" &&
        Number.isFinite(value.y) &&
        (value.action === "move" ||
          value.action === "down" ||
          value.action === "up") &&
        (value.button === "left" || value.button === "right")
      );
    case "scroll":
      return (
        typeof value.x === "number" &&
        typeof value.y === "number" &&
        typeof value.deltaX === "number" &&
        typeof value.deltaY === "number" &&
        Number.isFinite(value.deltaX) &&
        Number.isFinite(value.deltaY) &&
        Math.abs(value.deltaX) <= 3000 &&
        Math.abs(value.deltaY) <= 3000
      );
    case "key":
      return typeof value.key === "string" && value.key.length <= 40;
    case "text":
      return typeof value.text === "string" && value.text.length <= 5000;
    default:
      return false;
  }
}

function closeWithError(
  socket: WebSocket,
  code: number,
  message: string,
): void {
  socket.close(code, message);
}

function isAllowedViewerOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return false;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const forwardedHost = request.headers["x-forwarded-host"];
    const firstForwardedHost = Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : forwardedHost?.split(",")[0];
    const rawRequestHost = (firstForwardedHost || request.headers.host || "")
      .trim();
    const requestHost = new URL(`http://${rawRequestHost}`).host.toLowerCase();
    const configuredHosts = [
      ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
      process.env.REPLIT_DEV_DOMAIN,
    ]
      .filter((host): host is string => Boolean(host))
      .map((host) => new URL(`http://${host.trim()}`).host.toLowerCase());

    return (
      originHost === requestHost ||
      configuredHosts.some((host) => originHost === host)
    );
  } catch {
    return false;
  }
}

function handleWorkerSocket(socket: WebSocket, ownerId: string): void {
  const previous = sessions.get(ownerId);
  previous?.worker.close(1000, "Replaced by a new browser connection");
  previous?.viewer?.close(1000, "Browser connection replaced");

  const session: BrowserSession = {
    worker: socket,
    status: {
      deviceConnected: true,
      browserOpen: false,
      currentUrl: null,
      pageTitle: null,
    },
  };
  sessions.set(ownerId, session);
  socket.send(JSON.stringify({ type: "paired" }));

  socket.on("message", (data, isBinary) => {
    if (isBinary) return;
    const text = readText(data);
    if (!text) return;
    const message = parseWorkerMessage(text);
    if (!message) return;

    if (message.type === "status") {
      session.status = {
        deviceConnected: true,
        browserOpen: message.browserOpen === true,
        currentUrl:
          typeof message.currentUrl === "string" ? message.currentUrl : null,
        pageTitle:
          typeof message.pageTitle === "string" ? message.pageTitle : null,
      };
    }

    if (
      session.viewer?.readyState === WebSocket.OPEN &&
      session.viewer.bufferedAmount < 4_000_000
    ) {
      session.viewer.send(JSON.stringify(message));
    }
  });

  socket.on("close", (code) => {
    if (sessions.get(ownerId) !== session) return;
    logger.warn({ role: "worker", code }, "Browser WebSocket closed");
    sessions.delete(ownerId);
    session.status.deviceConnected = false;
    session.status.browserOpen = false;
    session.viewer?.close(1001, "Browser computer disconnected");
  });
}

function handleViewerSocket(socket: WebSocket, ownerId: string): void {
  const session = sessions.get(ownerId);
  if (!session || session.worker.readyState !== WebSocket.OPEN) {
    closeWithError(socket, 4404, "Browser computer is not connected");
    return;
  }

  session.viewer?.close(1000, "A new viewer connected");
  session.viewer = socket;
  session.worker.send(JSON.stringify({ type: "viewer", connected: true }));
  sendStatus(session);

  socket.on("message", (data, isBinary) => {
    if (isBinary || session.worker.readyState !== WebSocket.OPEN) return;
    const text = readText(data);
    if (!text || text.length > 16_000) return;
    try {
      const command: unknown = JSON.parse(text);
      if (!isSafeViewerCommand(command)) return;
      session.worker.send(JSON.stringify(command));
    } catch {
      socket.close(1003, "Invalid browser command");
    }
  });

  socket.on("close", (code) => {
    logger.info({ role: "viewer", code }, "Browser WebSocket closed");
    if (session.viewer === socket) {
      session.viewer = undefined;
      if (session.worker.readyState === WebSocket.OPEN) {
        session.worker.send(JSON.stringify({ type: "viewer", connected: false }));
      }
    }
  });
}

export function attachBrowserWebSocket(server: Server): void {
  const socketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 2_000_000,
    perMessageDeflate: false,
  });

  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (
      requestUrl.pathname === VNC_SOCKET_PATH ||
      requestUrl.pathname === WEBRTC_SOCKET_PATH
    ) {
      return;
    }
    const role = requestUrl.searchParams.get("role");
    const originHost = (() => {
      try {
        return request.headers.origin
          ? new URL(request.headers.origin).host
          : null;
      } catch {
        return "invalid";
      }
    })();
    const rejectUpgrade = (status: number, reason: string): void => {
      logger.warn(
        {
          role,
          status,
          reason,
          requestHost: request.headers.host ?? null,
          forwardedHost: Array.isArray(request.headers["x-forwarded-host"])
            ? request.headers["x-forwarded-host"][0]
            : request.headers["x-forwarded-host"]?.split(",")[0]?.trim() ?? null,
          originHost,
        },
        "Browser WebSocket upgrade rejected",
      );
      const message =
        status === 401
          ? "Unauthorized"
          : status === 403
            ? "Forbidden"
            : "Not Found";
      socket.write(`HTTP/1.1 ${status} ${message}\r\n\r\n`);
      socket.destroy();
    };

    if (requestUrl.pathname !== SOCKET_PATH) {
      rejectUpgrade(404, "unexpected_path");
      return;
    }

    cleanExpiredEntries();
    let ownerId: string | undefined;

    if (role === "worker") {
      const code = requestUrl.searchParams.get("code")?.toUpperCase();
      const pairing = code ? pairings.get(code) : undefined;
      if (!code || !pairing || pairing.expiresAt <= Date.now()) {
        rejectUpgrade(401, "pairing_missing_expired_or_already_used");
        return;
      }
      pairings.delete(code);
      ownerId = pairing.ownerId;
    } else if (role === "viewer") {
      if (!isAllowedViewerOrigin(request)) {
        rejectUpgrade(403, "viewer_origin_not_allowed");
        return;
      }
      const ticket = requestUrl.searchParams.get("ticket");
      const record = ticket ? viewerTickets.get(ticket) : undefined;
      if (!ticket || !record || record.expiresAt <= Date.now()) {
        rejectUpgrade(401, "viewer_ticket_missing_expired_or_already_used");
        return;
      }
      viewerTickets.delete(ticket);
      ownerId = record.ownerId;
    } else {
      rejectUpgrade(404, "unsupported_role");
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      logger.info({ role }, "Browser WebSocket accepted");
      if (role === "worker") {
        handleWorkerSocket(webSocket, ownerId!);
      } else {
        handleViewerSocket(webSocket, ownerId!);
      }
    });
  });
}
