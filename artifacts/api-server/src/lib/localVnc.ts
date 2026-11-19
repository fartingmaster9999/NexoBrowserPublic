import { createConnection, type Socket } from "node:net";
import type { IncomingMessage, Server } from "node:http";
import { URL } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { RTCPeerConnection, type RTCDataChannel } from "werift";
import { consumeViewerTicket } from "./browserBroker";
import { logger } from "./logger";

const VNC_SOCKET_PATH = "/api/browser/vnc";
const WEBRTC_SOCKET_PATH = "/api/browser/webrtc";
const MAX_VNC_BUFFERED_BYTES = 8_000_000;
const MAX_WEBRTC_MESSAGE_BYTES = 100_000;
const MAX_WEBRTC_BUFFERED_BYTES = 8_000_000;
const WEBRTC_CHUNK_BYTES = 16_384;
const activeViewers = new Map<string, WebSocket>();
const activeWebRtcViewers = new Map<string, () => void>();

function rejectUpgrade(
  request: IncomingMessage,
  socket: import("node:stream").Duplex,
  status: 401 | 403 | 404 | 503,
  reason: string,
): void {
  const messages = {
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    503: "Service Unavailable",
  };
  logger.warn(
    {
      status,
      reason,
      requestHost: request.headers.host ?? null,
      originHost: (() => {
        try {
          return request.headers.origin
            ? new URL(request.headers.origin).host
            : null;
        } catch {
          return "invalid";
        }
      })(),
    },
    "Local VNC WebSocket upgrade rejected",
  );
  socket.write(
    `HTTP/1.1 ${status} ${messages[status]}\r\nConnection: close\r\n\r\n`,
  );
  socket.destroy();
}

function originIsAllowed(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return false;

  try {
    const originUrl = new URL(origin);
    const configured = process.env.BROWSER_FRONTEND_ORIGIN?.trim();
    if (configured && originUrl.origin === new URL(configured).origin) {
      return true;
    }

    const forwardedHost = Array.isArray(request.headers["x-forwarded-host"])
      ? request.headers["x-forwarded-host"][0]
      : request.headers["x-forwarded-host"]?.split(",")[0]?.trim();
    const requestHost = new URL(
      `http://${forwardedHost || request.headers.host || ""}`,
    ).host.toLowerCase();
    if (originUrl.host.toLowerCase() === requestHost) return true;

    const replitHosts = [
      ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
      process.env.REPLIT_DEV_DOMAIN,
    ].filter((host): host is string => Boolean(host));
    return replitHosts.some((host) => originUrl.host.toLowerCase() === host.trim().toLowerCase());
  } catch {
    return false;
  }
}

export function isVncServerAvailable(
  host = process.env.VNC_HOST || "127.0.0.1",
  port = Number(process.env.VNC_PORT || "5900"),
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (available: boolean) => {
      socket.destroy();
      resolve(available);
    };
    socket.setTimeout(350, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function bridgeViewer(
  webSocket: WebSocket,
  ownerId: string,
  host: string,
  port: number,
): void {
  activeWebRtcViewers.get(ownerId)?.();
  activeViewers.get(ownerId)?.close(1000, "Replaced by a newer browser view");
  activeViewers.set(ownerId, webSocket);

  const tcp: Socket = createConnection({ host, port });
  let finished = false;
  const closeBridge = (code = 1000, reason = "Browser view closed") => {
    if (finished) return;
    finished = true;
    tcp.destroy();
    if (webSocket.readyState === WebSocket.OPEN) webSocket.close(code, reason);
    if (activeViewers.get(ownerId) === webSocket) activeViewers.delete(ownerId);
  };

  tcp.setTimeout(10_000, () => closeBridge(1011, "Local VNC service timed out"));
  tcp.once("connect", () => {
    tcp.setTimeout(0);
    logger.info({ role: "viewer" }, "Local VNC viewer connected");
  });
  tcp.on("data", (chunk) => {
    if (webSocket.readyState !== WebSocket.OPEN) return;
    if (webSocket.bufferedAmount > MAX_VNC_BUFFERED_BYTES) {
      closeBridge(1013, "Browser view is receiving data too quickly");
      return;
    }
    webSocket.send(chunk, { binary: true }, (error) => {
      if (error) closeBridge(1011, "Could not forward local browser display");
    });
  });
  tcp.once("error", () => closeBridge(1011, "Local VNC service is unavailable"));
  tcp.once("close", () => closeBridge(1000, "Local browser display disconnected"));

  webSocket.on("message", (data, isBinary) => {
    if (!isBinary || tcp.destroyed) return;
    const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (!tcp.write(chunk)) {
      webSocket.pause();
      tcp.once("drain", () => webSocket.resume());
    }
  });
  webSocket.once("close", () => closeBridge());
  webSocket.once("error", () => closeBridge(1011, "Browser view network error"));
}

function bridgeWebRtcViewer(
  webSocket: WebSocket,
  ownerId: string,
  host: string,
  port: number,
): void {
  activeViewers.get(ownerId)?.close(1000, "Replaced by a newer browser view");
  activeWebRtcViewers.get(ownerId)?.();

  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  let channel: RTCDataChannel | undefined;
  let tcp: Socket | undefined;
  let offerReceived = false;
  let finished = false;

  const closeBridge = (code = 1000, reason = "Browser view closed") => {
    if (finished) return;
    finished = true;
    clearTimeout(connectionTimer);
    tcp?.destroy();
    if (channel && channel.readyState !== "closed") channel.close();
    try {
      peer.close();
    } catch {
      // The peer may already be closed.
    }
    if (webSocket.readyState === WebSocket.OPEN) {
      webSocket.close(code, reason);
    }
    if (activeWebRtcViewers.get(ownerId) === closeBridge) {
      activeWebRtcViewers.delete(ownerId);
    }
  };

  const connectionTimer = setTimeout(
    () => closeBridge(1013, "Direct browser connection timed out"),
    30_000,
  );
  activeWebRtcViewers.set(ownerId, closeBridge);

  const failNegotiation = (error: unknown) => {
    logger.warn(
      { err: error, role: "viewer" },
      "WebRTC browser connection negotiation failed",
    );
    if (webSocket.readyState === WebSocket.OPEN) {
      webSocket.send(
        JSON.stringify({
          type: "error",
          message: "Direct connection failed. Use the standard connection instead.",
        }),
      );
    }
    closeBridge(1011, "WebRTC negotiation failed");
  };

  peer.ondatachannel = (event) => {
    const nextChannel = event.channel;
    if (nextChannel.label !== "rfb") {
      nextChannel.close();
      closeBridge(1008, "Unexpected data channel");
      return;
    }

    channel = nextChannel;
    channel.onopen = () => {
      clearTimeout(connectionTimer);
      tcp = createConnection({ host, port });
      tcp.setTimeout(10_000, () => closeBridge(1011, "Local VNC service timed out"));
      tcp.once("connect", () => {
        tcp?.setTimeout(0);
        logger.info({ role: "viewer" }, "WebRTC VNC data channel connected");
      });
      tcp.on("data", (chunk) => {
        if (!channel || channel.readyState !== "open") return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        for (let offset = 0; offset < bytes.length; offset += WEBRTC_CHUNK_BYTES) {
          if (channel.bufferedAmount > MAX_WEBRTC_BUFFERED_BYTES) {
            closeBridge(1013, "WebRTC display is receiving data too quickly");
            return;
          }
          channel.send(bytes.subarray(offset, offset + WEBRTC_CHUNK_BYTES));
        }
      });
      tcp.once("error", () => closeBridge(1011, "Local VNC service is unavailable"));
      tcp.once("close", () => closeBridge(1000, "Local browser display disconnected"));
    };
    channel.onmessage = (event) => {
      if (!tcp || tcp.destroyed) return;
      const data = event.data;
      const bytes = Buffer.isBuffer(data)
        ? data
        : typeof data === "string"
          ? Buffer.from(data)
          : Buffer.from(data);
      if (tcp.writableLength > MAX_WEBRTC_BUFFERED_BYTES) {
        closeBridge(1013, "Browser input is receiving data too quickly");
        return;
      }
      tcp.write(bytes);
    };
    channel.onclose = () => closeBridge();
    channel.onerror = () => closeBridge(1011, "WebRTC data channel failed");
  };

  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "failed") {
      closeBridge(1011, "Direct browser connection failed");
    }
  };

  webSocket.on("message", (data, isBinary) => {
    if (isBinary) {
      closeBridge(1003, "Invalid WebRTC signaling message");
      return;
    }
    const text = Buffer.isBuffer(data)
      ? data.toString("utf8")
      : Array.isArray(data)
        ? Buffer.concat(data).toString("utf8")
        : Buffer.from(data as ArrayBuffer).toString("utf8");
    if (!text || text.length > MAX_WEBRTC_MESSAGE_BYTES) {
      closeBridge(1009, "WebRTC signaling message is too large");
      return;
    }

    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      closeBridge(1003, "Invalid WebRTC signaling message");
      return;
    }
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      message.type !== "offer" ||
      !("sdp" in message) ||
      typeof message.sdp !== "string" ||
      message.sdp.length > MAX_WEBRTC_MESSAGE_BYTES
    ) {
      closeBridge(1003, "Invalid WebRTC offer");
      return;
    }
    if (offerReceived) {
      closeBridge(1008, "Only one WebRTC offer is allowed");
      return;
    }

    offerReceived = true;
    const offerSdp = message.sdp as string;
    void (async () => {
      await peer.setRemoteDescription({ type: "offer", sdp: offerSdp });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      const localDescription = peer.localDescription;
      if (webSocket.readyState === WebSocket.OPEN) {
        webSocket.send(
          JSON.stringify({ type: "answer", sdp: localDescription?.sdp ?? "" }),
        );
      }
    })().catch(failNegotiation);
  });

  webSocket.once("close", () => closeBridge());
  webSocket.once("error", () => closeBridge(1011, "WebRTC signaling failed"));
}

export function closeLocalVncViewer(ownerId: string): void {
  activeViewers.get(ownerId)?.close(1000, "Disconnected by the owner");
  activeViewers.delete(ownerId);
  activeWebRtcViewers.get(ownerId)?.();
  activeWebRtcViewers.delete(ownerId);
}

export function attachVncWebSocket(server: Server): void {
  const socketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 4_000_000,
    perMessageDeflate: false,
  });
  const host = process.env.VNC_HOST || "127.0.0.1";
  const port = Number(process.env.VNC_PORT || "5900");

  server.on("upgrade", (request, socket, head) => {
    const requestUrl = new URL(request.url ?? "/", "http://localhost");
    if (
      requestUrl.pathname !== VNC_SOCKET_PATH &&
      requestUrl.pathname !== WEBRTC_SOCKET_PATH
    ) {
      return;
    }

    if (process.env.BROWSER_LOCAL_MODE !== "true") {
      rejectUpgrade(request, socket, 503, "local_browser_mode_disabled");
      return;
    }
    if (!originIsAllowed(request)) {
      rejectUpgrade(request, socket, 403, "viewer_origin_not_allowed");
      return;
    }
    const ticket = requestUrl.searchParams.get("ticket");
    const ownerId = ticket ? consumeViewerTicket(ticket) : null;
    if (!ownerId) {
      rejectUpgrade(request, socket, 401, "viewer_ticket_invalid_or_expired");
      return;
    }

    socketServer.handleUpgrade(request, socket, head, (webSocket) => {
      socketServer.emit("connection", webSocket, request);
      if (requestUrl.pathname === WEBRTC_SOCKET_PATH) {
        bridgeWebRtcViewer(webSocket, ownerId, host, port);
      } else {
        bridgeViewer(webSocket, ownerId, host, port);
      }
    });
  });
}
