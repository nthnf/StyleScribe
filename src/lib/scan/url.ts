import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export function canonicalizeUrl(rawUrl: string, baseUrl: string) {
  try {
    const url = new URL(rawUrl, baseUrl);

    if (!["http:", "https:"].includes(url.protocol)) return null;

    url.hash = "";

    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "referrer",
      "fbclid",
      "gclid",
    ];

    for (const param of trackingParams) url.searchParams.delete(param);

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    url.hostname = url.hostname.toLowerCase();

    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;

  return false;
}

function isPrivateIpv6(hostname: string) {
  const value = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:");
}

function isPrivateAddress(hostname: string) {
  if (isIP(hostname) === 4) return isPrivateIpv4(hostname);
  if (isIP(hostname.replace(/^\[|\]$/g, "")) === 6) return isPrivateIpv6(hostname);

  return false;
}

export function isSafePublicUrl(urlString: string) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();

    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (hostname === "localhost" || hostname.endsWith(".localhost")) return false;
    if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
    if (hostname === "0.0.0.0" || hostname === "::1" || hostname === "[::1]") return false;
    if (isPrivateAddress(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function assertSafePublicUrlResolved(urlString: string) {
  if (!isSafePublicUrl(urlString)) return false;

  try {
    const url = new URL(urlString);
    const records = await lookup(url.hostname, { all: true, verbatim: true });

    return records.length > 0 && records.every((record) => !isPrivateAddress(record.address));
  } catch {
    return false;
  }
}

export function getDesignDedupeKey(urlString: string) {
  const url = new URL(urlString);

  url.search = "";
  url.hash = "";

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return `${url.origin}${url.pathname}`;
}

export function scoreDesignUrl(urlString: string, rootUrl: string) {
  const url = new URL(urlString);
  const root = new URL(rootUrl);

  const path = url.pathname.toLowerCase();
  const segments = path.split("/").filter(Boolean);

  let score = 0;

  if (path === "/") score += 100;
  if (url.origin === root.origin) score += 30;
  else score -= 1000;

  for (const keyword of [
    "pricing",
    "features",
    "product",
    "products",
    "solutions",
    "customers",
    "case-studies",
    "about",
    "contact",
    "blog",
    "docs",
    "showcase",
    "templates",
    "examples",
  ]) {
    if (path.includes(keyword)) score += 25;
  }

  for (const keyword of [
    "login",
    "signin",
    "sign-in",
    "signup",
    "sign-up",
    "register",
    "auth",
    "account",
    "dashboard",
    "admin",
    "checkout",
    "cart",
    "billing",
    "privacy",
    "terms",
    "cookie",
    "legal",
    "security",
    "api",
    "assets",
    "_next",
  ]) {
    if (path.includes(keyword)) score -= 60;
  }

  if (segments.length === 1) score += 20;
  if (segments.length === 2) score += 5;
  if (segments.length >= 3) score -= segments.length * 8;

  if (/\.(png|jpg|jpeg|gif|webp|svg|pdf|zip|css|js|json|xml)$/i.test(path)) {
    score -= 500;
  }

  if (url.search) score -= 10;

  return score;
}

export function scoreAnchorText(text: string) {
  const value = text.toLowerCase().trim();
  let score = 0;

  for (const keyword of [
    "pricing",
    "features",
    "product",
    "products",
    "solutions",
    "customers",
    "about",
    "contact",
    "docs",
    "blog",
  ]) {
    if (value.includes(keyword)) score += 20;
  }

  for (const keyword of ["login", "sign in", "sign up", "privacy", "terms", "cookie", "careers"]) {
    if (value.includes(keyword)) score -= 40;
  }

  return score;
}
