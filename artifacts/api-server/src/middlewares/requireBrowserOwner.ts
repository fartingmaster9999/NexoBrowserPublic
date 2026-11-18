import type { Request, RequestHandler } from "express";
import {
  BROWSER_SESSION_COOKIE,
  passwordFingerprint,
  verifyBrowserAccessToken,
} from "../lib/authSession";

function configuredFrontendOrigin(): string | null {
  const value = process.env.BROWSER_FRONTEND_ORIGIN?.trim();
  if (!value) return null;
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function normalizedHost(value: string): string {
  try {
    return new URL(`http://${value}`).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export function isSameOriginRequest(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true;

  try {
    const parsedOrigin = new URL(origin);
    const frontendOrigin = configuredFrontendOrigin();
    if (frontendOrigin && parsedOrigin.origin.toLowerCase() === frontendOrigin) {
      return true;
    }
    if (req.get("sec-fetch-site") === "cross-site") return false;

    const originHost = parsedOrigin.host.toLowerCase();
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

  const authorization = req.get("authorization");
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const currentPassword = process.env.BROWSER_OWNER_PASSWORD;
  const allowedEmail = process.env.BROWSER_OWNER_EMAIL?.trim().toLowerCase();
  const tokenOwner =
    bearerToken && process.env.SESSION_SECRET
      ? verifyBrowserAccessToken(bearerToken, process.env.SESSION_SECRET)
      : null;

  if (tokenOwner && allowedEmail && tokenOwner === allowedEmail) {
    res.locals.browserOwnerId = allowedEmail;
    next();
    return;
  }

  const sessionValue = req.signedCookies?.[BROWSER_SESSION_COOKIE];
  const [expiresAtText, sessionPasswordFingerprint, extraValue] =
    typeof sessionValue === "string" ? sessionValue.split(".") : [];
  const sessionExpiresAt = Number(expiresAtText);
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

  if (!allowedEmail) {
    req.log.error("Browser owner account is not configured.");
    res.status(503).json({ error: "Browser owner account is not configured." });
    return;
  }

  res.locals.browserOwnerId = allowedEmail;
  next();
};
