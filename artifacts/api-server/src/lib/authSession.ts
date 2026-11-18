import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const BROWSER_SESSION_COOKIE = "private_browser_session";
export const BROWSER_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;
const ACCESS_TOKEN_VERSION = "v1";

export function passwordFingerprint(password: string): string {
  return createHash("sha256").update(password).digest("hex").slice(0, 24);
}

export function createBrowserAccessToken(
  ownerId: string,
  secret: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      ownerId,
      expiresAt: now + BROWSER_SESSION_DURATION_MS,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(`${ACCESS_TOKEN_VERSION}.${payload}`)
    .digest("base64url");
  return `${ACCESS_TOKEN_VERSION}.${payload}.${signature}`;
}

export function verifyBrowserAccessToken(
  token: string,
  secret: string,
  now = Date.now(),
): string | null {
  const [version, payload, signature, extra] = token.split(".");
  if (
    version !== ACCESS_TOKEN_VERSION ||
    !payload ||
    !signature ||
    extra !== undefined
  ) {
    return null;
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${version}.${payload}`)
    .digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (
    actualSignature.length !== expectedSignature.length ||
    !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (
      typeof value !== "object" ||
      value === null ||
      !("ownerId" in value) ||
      typeof value.ownerId !== "string" ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt <= now
    ) {
      return null;
    }
    return value.ownerId;
  } catch {
    return null;
  }
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
