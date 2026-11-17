import type { Request, RequestHandler } from "express";
import {
  BROWSER_SESSION_COOKIE,
  passwordFingerprint,
} from "../lib/authSession";

function normalizedHost(value: string): string {
  try {
    return new URL(`http://${value}`).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export function isSameOriginRequest(req: Request): boolean {
  const origin = req.get("origin");
  if (req.get("sec-fetch-site") === "cross-site") {
    return false;
  }

  if (!origin) return true;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const forwardedHost = req
      .get("x-forwarded-host")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    const requestHost = normalizedHost(forwardedHost || req.get("host") || "");
    const configuredHosts = [
      ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
      process.env.REPLIT_DEV_DOMAIN,
    ]
      .filter((host): host is string => Boolean(host))
      .map(normalizedHost);

    return (
      originHost === requestHost ||
      configuredHosts.some((host) => originHost === host)
    );
  } catch {
    return false;
  }
}

export const requireBrowserOwner: RequestHandler = (req, res, next) => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }

  const sessionValue = req.signedCookies?.[BROWSER_SESSION_COOKIE];
  const [expiresAtText, sessionPasswordFingerprint, extraValue] =
    typeof sessionValue === "string" ? sessionValue.split(".") : [];
  const sessionExpiresAt = Number(expiresAtText);
  const currentPassword = process.env.BROWSER_OWNER_PASSWORD;
  if (
    extraValue !== undefined ||
    !Number.isSafeInteger(sessionExpiresAt) ||
    sessionExpiresAt <= Date.now() ||
    !currentPassword ||
    currentPassword.length < 12 ||
    sessionPasswordFingerprint !== passwordFingerprint(currentPassword)
  ) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const allowedEmail = process.env.BROWSER_OWNER_EMAIL?.trim().toLowerCase();
  if (!allowedEmail) {
    req.log.error("Browser owner account is not configured.");
    res.status(503).json({ error: "Browser owner account is not configured." });
    return;
  }

  res.locals.browserOwnerId = allowedEmail;
  next();
};
