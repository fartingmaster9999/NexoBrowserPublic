import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

function normalizedHost(value: string): string {
  try {
    return new URL(`http://${value}`).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export const requireBrowserOwner: RequestHandler = async (req, res, next) => {
  const origin = req.get("origin");
  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Cross-origin requests are not allowed." });
    return;
  }

  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const forwardedHost = req
        .get("x-forwarded-host")
        ?.split(",")[0]
        ?.trim()
        .toLowerCase();
      const requestHost = normalizedHost(
        forwardedHost || req.get("host") || "",
      );
      const configuredHosts = [
        ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
        process.env.REPLIT_DEV_DOMAIN,
      ]
        .filter((host): host is string => Boolean(host))
        .map(normalizedHost);

      if (
        originHost !== requestHost &&
        !configuredHosts.some((host) => originHost === host)
      ) {
        res.status(403).json({ error: "Cross-origin requests are not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Invalid request origin." });
      return;
    }
  }

  const { userId } = getAuth(req);

  if (!userId) {
    res.status(401).json({ error: "Sign in is required." });
    return;
  }

  const allowedEmail = process.env.BROWSER_OWNER_EMAIL?.trim().toLowerCase();
  if (!allowedEmail) {
    req.log.error("Browser owner account is not configured.");
    res.status(503).json({ error: "Browser owner account is not configured." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.primaryEmailAddress?.emailAddress
      ?.trim()
      .toLowerCase();

    if (!primaryEmail || primaryEmail !== allowedEmail) {
      res.status(403).json({ error: "This account is not authorized." });
      return;
    }

    res.locals.browserOwnerId = userId;
    next();
  } catch (error) {
    req.log.error({ err: error }, "Could not verify the browser owner.");
    res.status(503).json({ error: "Could not verify the browser owner." });
  }
};
