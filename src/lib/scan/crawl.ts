import * as cheerio from "cheerio";
import { extractHtmlFacts } from "./html";
import { canonicalizeUrl, getDesignDedupeKey, isSafePublicUrl, scoreAnchorText, scoreDesignUrl } from "./url";
import type { CandidateLink } from "./types";

export const LIMITS = {
  maxPages: 5,
  maxDepth: 1,
  maxLinksPerPage: 40,
  maxCssFilesPerPage: 6,
  maxCssBytesTotal: 750_000,
  maxHtmlBytesPerPage: 250_000,
  requestTimeoutMs: 8_000,
  maxRepairAttempts: 3,
} as const;

export class CrawlError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CrawlError";
    this.status = status;
  }
}

export class UnsafeUrlError extends Error {
  constructor(message = "Only public HTTP(S) URLs can be scanned.") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class AuthGatedError extends Error {
  constructor(message = "This page appears to require authentication.") {
    super(message);
    this.name = "AuthGatedError";
  }
}

const LOW_VALUE_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/account",
  "/dashboard",
  "/admin",
  "/cart",
  "/checkout",
  "/privacy",
  "/terms",
  "/cookie",
  "/api",
  "/assets",
];

function isLikelyAuthPage(html: string) {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ").toLowerCase();
  const hasPasswordInput = $("input[type='password']").length > 0;
  const authIndicators = ["password", "sign in", "log in", "two-factor", "forgot password", "session expired"];
  const indicatorCount = authIndicators.filter((indicator) => bodyText.includes(indicator)).length;

  return hasPasswordInput || indicatorCount >= 2;
}

function isLikelyEmptyAppShell(html: string) {
  const facts = extractHtmlFacts(html, "https://example.com");

  return (
    facts.headings.length === 0 &&
    facts.buttons.length === 0 &&
    facts.links.length === 0 &&
    !facts.metaDescription
  );
}

async function fetchHtmlLimited(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIMITS.requestTimeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new CrawlError(`Fetch failed: ${response.status} ${response.statusText}`, response.status);

    const text = await response.text();
    const buffer = Buffer.from(text, "utf8");
    return {
      text: buffer.subarray(0, LIMITS.maxHtmlBytesPerPage).toString("utf8"),
      bytes: buffer.length,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractCandidateLinks(html: string, pageUrl: string, rootUrl: string) {
  const $ = cheerio.load(html);
  const candidates = new Map<string, CandidateLink>();

  $("a[href]")
    .slice(0, LIMITS.maxLinksPerPage * 2)
    .each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().replace(/\s+/g, " ");
      const canonical = canonicalizeUrl(href, pageUrl);
      if (!canonical) return;
      if (!isSafePublicUrl(canonical)) return;

      const url = new URL(canonical);
      const root = new URL(rootUrl);
      if (url.origin !== root.origin) return;

      const path = url.pathname.toLowerCase();
      if (LOW_VALUE_PATHS.some((blocked) => path.includes(blocked.replace(/^\//, "")))) return;

      const score = scoreDesignUrl(canonical, rootUrl) + scoreAnchorText(text);
      const dedupeKey = getDesignDedupeKey(canonical);
      const existing = candidates.get(dedupeKey);
      if (!existing || score > existing.score) candidates.set(dedupeKey, { url: canonical, text, score });
    });

  return Array.from(candidates.values()).sort((a, b) => b.score - a.score);
}

export async function crawlDesignPages(startUrl: string) {
  const canonicalStart = canonicalizeUrl(startUrl, startUrl);
  if (!canonicalStart) throw new Error("Invalid start URL.");
  if (!isSafePublicUrl(canonicalStart)) throw new UnsafeUrlError();

  const visited = new Set<string>();
  const queued = new Set<string>([getDesignDedupeKey(canonicalStart)]);
  const queue = [{ url: canonicalStart, depth: 0, score: 999 }];

  const pages: Array<{ url: string; html: string }> = [];

  while (queue.length > 0 && pages.length < LIMITS.maxPages) {
    queue.sort((a, b) => b.score - a.score);
    const current = queue.shift()!;
    const key = getDesignDedupeKey(current.url);
    if (visited.has(key)) continue;
    visited.add(key);

    if (!isSafePublicUrl(current.url)) continue;

    const { text: html } = await fetchHtmlLimited(current.url);

    if (isLikelyAuthPage(html)) {
      if (pages.length === 0) throw new AuthGatedError();
      continue;
    }

    if (pages.length === 0 && isLikelyEmptyAppShell(html)) throw new AuthGatedError("This page looks like a protected app shell.");

    pages.push({ url: current.url, html });

    if (current.depth >= LIMITS.maxDepth) continue;

    const candidates = extractCandidateLinks(html, current.url, startUrl).slice(0, LIMITS.maxLinksPerPage);
    for (const candidate of candidates) {
      const candidateKey = getDesignDedupeKey(candidate.url);
      if (visited.has(candidateKey) || queued.has(candidateKey)) continue;
      queued.add(candidateKey);
      queue.push({ url: candidate.url, depth: current.depth + 1, score: candidate.score });
    }
  }

  return pages;
}

export { extractHtmlFacts };
