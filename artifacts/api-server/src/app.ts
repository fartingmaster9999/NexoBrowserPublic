import express, { type Express } from "express";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required to sign browser sessions.");
}

app.set("trust proxy", 1);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const browserFrontendOrigin = process.env.BROWSER_FRONTEND_ORIGIN?.trim();
app.use(
  cors({
    credentials: true,
    origin: browserFrontendOrigin
      ? (origin, callback) => {
          if (!origin || origin === browserFrontendOrigin) {
            callback(null, true);
          } else {
            callback(null, false);
          }
        }
      : true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(sessionSecret));

app.use("/api", router);

const webRoot = [
  resolve(process.cwd(), "artifacts/remote-browser/dist/public"),
  resolve(process.cwd(), "../remote-browser/dist/public"),
].find(existsSync);

if (!webRoot && process.env.NODE_ENV === "production") {
  throw new Error(
    "The browser website build is missing; build the web artifact before starting the API server.",
  );
}

if (webRoot) {
  app.use(express.static(webRoot));
  app.use((req, res, next) => {
    if (req.path === "/api" || req.path.startsWith("/api/")) {
      next();
      return;
    }

    res.sendFile(join(webRoot, "index.html"), (error) => {
      if (error) next(error);
    });
  });
}

export default app;
