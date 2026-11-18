import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

const API_ORIGIN_KEY = "nexo_browser_api_origin";
const ACCESS_TOKEN_KEY = "nexo_browser_access_token";

function getConfiguredOrigin(): string {
  const fromBuild = import.meta.env.VITE_BROWSER_API_ORIGIN?.trim();
  if (fromBuild) return fromBuild.replace(/\/+$/, "");
  try {
    return window.localStorage.getItem(API_ORIGIN_KEY)?.replace(/\/+$/, "") ?? "";
  } catch {
    return "";
  }
}

export function initializeBrowserApi(): void {
  setBaseUrl(getConfiguredOrigin() || null);
  setAuthTokenGetter(() => {
    try {
      return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  });
}

export function isBrowserApiConfigured(): boolean {
  return import.meta.env.DEV || Boolean(getConfiguredOrigin());
}

export function getBrowserApiOrigin(): string {
  return getConfiguredOrigin();
}

export function browserApiUrl(path: string): string {
  return `${getConfiguredOrigin()}${path}`;
}

export function setBrowserApiOrigin(value: string): void {
  const candidate = value.trim();
  const normalizedCandidate = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `https://${candidate}`;
  const parsed = new URL(normalizedCandidate);
  if (
    (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && parsed.hostname === "localhost")) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Enter the tunnel’s base URL, such as https://example.trycloudflare.com.");
  }
  window.localStorage.setItem(API_ORIGIN_KEY, parsed.origin);
}

export function saveBrowserAccessToken(token: string): void {
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function getBrowserAccessToken(): string | null {
  try {
    return window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearBrowserAccessToken(): void {
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function createBrowserSocketUrl(
  socketPath: string,
  ticket: string,
): string {
  const baseOrigin = getConfiguredOrigin() || window.location.origin;
  const url = new URL(socketPath, baseOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("ticket", ticket);
  return url.toString();
}

export function browserAccessTokenExists(): boolean {
  return Boolean(getBrowserAccessToken());
}

initializeBrowserApi();
