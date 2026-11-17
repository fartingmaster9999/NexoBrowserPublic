import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  BROWSER_SESSION_COOKIE,
  BROWSER_SESSION_DURATION_MS,
  browserSessionCookieOptions,
  passwordFingerprint,
} from "../lib/authSession";
import {
  isSameOriginRequest,
  requireBrowserOwner,
} from "../middlewares/requireBrowserOwner";

const router: IRouter = Router();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function passwordsMatch(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

function isRateLimited(key: string, now: number): boolean {
  for (const [attemptKey, attempt] of loginAttempts) {
    if (attempt.resetAt <= now) loginAttempts.delete(attemptKey);
  }

  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { count: 0, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(key: string, now: number): void {
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return;
  }
  attempt.count += 1;
}

router.post("/auth/login", (req, res): void => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }

  const now = Date.now();
  const rateLimitKey = req.ip || "unknown";
  if (isRateLimited(rateLimitKey, now)) {
    res.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }

  const allowedEmail = process.env.BROWSER_OWNER_EMAIL?.trim().toLowerCase();
  const expectedPassword = process.env.BROWSER_OWNER_PASSWORD;
  if (!allowedEmail || !expectedPassword || expectedPassword.length < 12) {
    req.log.error("The private browser owner login is not configured.");
    res.status(503).json({ error: "Sign-in is not configured yet." });
    return;
  }

  const body = req.body as { email?: unknown; password?: unknown } | undefined;
  const email = typeof body?.email === "string" && body.email.length <= 254
    ? body.email.trim().toLowerCase()
    : "";
  const password = typeof body?.password === "string" && body.password.length <= 1024
    ? body.password
    : "";
  const emailMatches = email === allowedEmail;
  const passwordMatches = passwordsMatch(password, expectedPassword);

  if (!emailMatches || !passwordMatches) {
    recordFailedAttempt(rateLimitKey, now);
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  loginAttempts.delete(rateLimitKey);
  const expiresAt = Date.now() + BROWSER_SESSION_DURATION_MS;
  const sessionValue = `${expiresAt}.${passwordFingerprint(expectedPassword)}`;
  res.cookie(BROWSER_SESSION_COOKIE, sessionValue, {
    ...browserSessionCookieOptions(req),
    signed: true,
  });
  res.json({ authenticated: true });
});

router.get("/auth/session", requireBrowserOwner, (_req, res): void => {
  res.json({ authenticated: true });
});

router.post("/auth/logout", (req, res): void => {
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }

  const { maxAge: _maxAge, ...options } = browserSessionCookieOptions(req);
  res.clearCookie(BROWSER_SESSION_COOKIE, options);
  res.sendStatus(204);
});

export default router;
