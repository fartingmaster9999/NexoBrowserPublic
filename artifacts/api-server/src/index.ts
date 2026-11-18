import app from "./app";
import { createServer } from "node:http";
import { logger } from "./lib/logger";
import { attachBrowserWebSocket } from "./lib/browserBroker";
import { attachVncWebSocket } from "./lib/localVnc";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
attachBrowserWebSocket(server);
attachVncWebSocket(server);

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});

server.listen(port, process.env.HOST || "0.0.0.0", () => {
  logger.info({ port, host: process.env.HOST || "0.0.0.0" }, "Server listening");
});
