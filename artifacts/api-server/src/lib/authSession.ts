import { createHash } from "node:crypto";
import type { Request } from "express";

export const BROWSER_SESSION_COOKIE = "private_browser_session";
export const BROWSER_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

export function passwordFingerprint(password: string): string {
  return createHash("sha256").update(password).digest("hex").slice(0, 24);
}

export function browserSessionCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: req.secure || process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: BROWSER_SESSION_DURATION_MS,
  };
}
