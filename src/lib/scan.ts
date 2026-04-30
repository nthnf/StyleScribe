import { crawlDesignPages, extractHtmlFacts, LIMITS } from "./scan/crawl";
import { parseCssFacts } from "./scan/css";
import { assertSafePublicUrlResolved, isSafePublicUrl, scoreAnchorText } from "./scan/url";
import type { DesignEvidence } from "./scan/types";

function takeTopMajorColors(
  items: Array<{ value: string; count: number; properties: string[]; selectors: string[] }>,
  limit = 12,
) {
  return [...items]
    .sort((a, b) => b.count - a.count || b.properties.length - a.properties.length || b.selectors.length - a.selectors.length)
    .filter((item, index, array) => item.count > 1 || index < limit || array.length <= limit)
    .slice(0, limit);
}

function extractClassTokens(selector: string) {
  return Array.from(new Set((selector.match(/\.([A-Za-z0-9_-]+)/g) || []).map((token) => token.slice(1))));
}

function countSelectorUsage(selectors: string[], classAttributes: string[]) {
  let total = 0;

  for (const selector of selectors) {
    const tokens = extractClassTokens(selector);
    if (tokens.length === 0) continue;

    const selectorMatches = classAttributes.filter((classValue) => {
      const classTokens = new Set(classValue.split(/\s+/).filter(Boolean));
      return tokens.every((token) => classTokens.has(token));
    }).length;

    total += selectorMatches;
  }

  return total;
}

function requestTimeout(deadlineAt?: number) {
  if (!deadlineAt) return LIMITS.requestTimeoutMs;

  return Math.max(1_000, Math.min(LIMITS.requestTimeoutMs, deadlineAt - Date.now() - 500));
}

async function fetchCssLimited(url: string, maxBytes: number, deadlineAt?: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout(deadlineAt));

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.includes("text/css") && !contentType.includes("text/plain")) return "";

    const reader = response.body?.getReader();
    if (!reader) return "";

    const chunks: Uint8Array[] = [];
    let bytesRead = 0;

    while (bytesRead < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;

      const remaining = maxBytes - bytesRead;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      bytesRead += chunk.byteLength;

      if (value.byteLength > remaining) {
        await reader.cancel();
        break;
      }
    }

    return Buffer.concat(chunks).toString("utf8");
  } finally {
    clearTimeout(timeout);
  }
}

export { LIMITS } from "./scan/crawl";
export type { DesignEvidence } from "./scan/types";

export async function extractDesignEvidence(startUrl: string, onProgress?: (progress: number) => void, options: { deadlineAt?: number } = {}) {
  const extractionStartedAt = Date.now();

  console.info("[design-pipeline] extracting: crawl start", { sourceUrl: startUrl });
  const pages = await crawlDesignPages(startUrl, { deadlineAt: options.deadlineAt });
  console.info("[design-pipeline] extracting: crawl done", {
    sourceUrl: startUrl,
    pages: pages.length,
    durationMs: Date.now() - extractionStartedAt,
  });
  const aggregate = {
    colors: new Map<string, { value: string; count: number; properties: Set<string>; selectors: Set<string> }>(),
    fonts: new Map<string, { family: string; count: number; selectors: Set<string> }>(),
    fontSizes: new Map<string, { value: string; count: number; selectors: Set<string> }>(),
    spacing: new Map<string, { value: string; count: number; properties: Set<string> }>(),
    radii: new Map<string, { value: string; count: number; selectors: Set<string> }>(),
    shadows: new Map<string, { value: string; count: number; selectors: Set<string> }>(),
  };

  let cssBytesRead = 0;
  let htmlBytesRead = 0;
  const pagesScanned: string[] = [];
  const pageDetails: DesignEvidence["pages"] = [];
  const componentButtons: Array<Record<string, string>> = [];
  const componentCards: Array<Record<string, string>> = [];
  const componentInputs: Array<Record<string, string>> = [];

  function assertWithinDeadline() {
    if (options.deadlineAt && Date.now() >= options.deadlineAt) throw new Error("Request exceeded 60 second limit.");
  }

  function ingestParsedCss(parsed: ReturnType<typeof parseCssFacts>, classAttributes: string[]) {
    for (const color of parsed.colors) {
      const entry = aggregate.colors.get(color.value) ?? {
        value: color.value,
        count: 0,
        properties: new Set<string>(),
        selectors: new Set<string>(),
      };
      const usageCount = countSelectorUsage(color.selectors, classAttributes);
      entry.count += usageCount > 0 ? usageCount : 1;
      color.properties.forEach((prop) => entry.properties.add(prop));
      color.selectors.forEach((selector) => entry.selectors.add(selector));
      aggregate.colors.set(color.value, entry);
    }

    for (const font of parsed.fonts) {
      const entry = aggregate.fonts.get(font.family) ?? { family: font.family, count: 0, selectors: new Set<string>() };
      entry.count += 1;
      font.selectors.forEach((selector) => entry.selectors.add(selector));
      aggregate.fonts.set(font.family, entry);
    }

    for (const size of parsed.fontSizes) {
      const entry = aggregate.fontSizes.get(size.value) ?? { value: size.value, count: 0, selectors: new Set<string>() };
      entry.count += 1;
      size.selectors.forEach((selector) => entry.selectors.add(selector));
      aggregate.fontSizes.set(size.value, entry);
    }

    for (const space of parsed.spacing) {
      const entry = aggregate.spacing.get(space.value) ?? { value: space.value, count: 0, properties: new Set<string>() };
      entry.count += 1;
      space.properties.forEach((prop) => entry.properties.add(prop));
      aggregate.spacing.set(space.value, entry);
    }

    for (const radius of parsed.radii) {
      const entry = aggregate.radii.get(radius.value) ?? { value: radius.value, count: 0, selectors: new Set<string>() };
      entry.count += 1;
      radius.selectors.forEach((selector) => entry.selectors.add(selector));
      aggregate.radii.set(radius.value, entry);
    }

    for (const shadow of parsed.shadows) {
      const entry = aggregate.shadows.get(shadow.value) ?? { value: shadow.value, count: 0, selectors: new Set<string>() };
      entry.count += 1;
      shadow.selectors.forEach((selector) => entry.selectors.add(selector));
      aggregate.shadows.set(shadow.value, entry);
    }
  }

  for (const page of pages) {
    assertWithinDeadline();
    onProgress?.(20 + Math.min(15, pagesScanned.length * 3));
    const pageStartedAt = Date.now();
    console.info("[design-pipeline] extracting: page start", {
      sourceUrl: startUrl,
      pageUrl: page.url,
      pageIndex: pagesScanned.length + 1,
      totalPages: pages.length,
    });
    const facts = extractHtmlFacts(page.html, page.url);
    htmlBytesRead += Buffer.byteLength(page.html, "utf8");
    pagesScanned.push(page.url);
    console.info("[design-pipeline] extracting: html facts done", {
      sourceUrl: startUrl,
      pageUrl: page.url,
      stylesheets: facts.stylesheets.length,
      inlineStyles: facts.inlineStyles.length,
      classAttributes: facts.classAttributes.length,
      durationMs: Date.now() - pageStartedAt,
    });

    pageDetails.push({
      url: page.url,
      title: facts.title,
      metaDescription: facts.metaDescription,
      buttons: facts.buttons,
      headings: facts.headings,
      classAttributes: facts.classAttributes,
      links: facts.links.map((link) => ({ ...link, score: scoreAnchorText(link.text) })),
    });

    componentButtons.push(...facts.buttons);
    componentInputs.push(...facts.inputs);
    componentCards.push(
      ...facts.classNames.filter((className) => /card|panel|tile|surface/i.test(className)).map((className) => ({ className })),
    );

    for (const inlineStyle of facts.inlineStyles) {
      if (cssBytesRead >= LIMITS.maxCssBytesTotal) break;

      try {
        const remainingCssBytes = LIMITS.maxCssBytesTotal - cssBytesRead;
        const cssChunk = Buffer.from(inlineStyle, "utf8").subarray(0, remainingCssBytes).toString("utf8");
        if (!cssChunk.trim()) continue;

        cssBytesRead += Buffer.byteLength(cssChunk, "utf8");
        ingestParsedCss(parseCssFacts(cssChunk), facts.classAttributes);
      } catch {
        continue;
      }
    }

    const stylesheetUrls = facts.stylesheets.slice(0, LIMITS.maxCssFilesPerPage).filter(isSafePublicUrl);
    const cssChunks = await Promise.all(stylesheetUrls.map(async (cssUrl) => {
      if (cssBytesRead >= LIMITS.maxCssBytesTotal) return null;
      if (!(await assertSafePublicUrlResolved(cssUrl))) return null;

      try {
        const cssStartedAt = Date.now();
        console.info("[design-pipeline] extracting: css fetch start", {
          sourceUrl: startUrl,
          pageUrl: page.url,
          cssUrl,
        });
        const remainingCssBytes = Math.max(0, Math.floor((LIMITS.maxCssBytesTotal - cssBytesRead) / Math.max(1, stylesheetUrls.length)));
        const cssChunk = await fetchCssLimited(cssUrl, remainingCssBytes, options.deadlineAt);
        if (!cssChunk) {
          console.info("[design-pipeline] extracting: css fetch empty", {
            sourceUrl: startUrl,
            pageUrl: page.url,
            cssUrl,
            durationMs: Date.now() - cssStartedAt,
          });
          return null;
        }

        console.info("[design-pipeline] extracting: css fetch done", {
          sourceUrl: startUrl,
          pageUrl: page.url,
          cssUrl,
          bytes: Buffer.byteLength(cssChunk, "utf8"),
          durationMs: Date.now() - cssStartedAt,
        });

        return { cssUrl, cssChunk };
      } catch {
        console.info("[design-pipeline] extracting: css fetch failed", {
          sourceUrl: startUrl,
          pageUrl: page.url,
          cssUrl,
        });
        return null;
      }
    }));

    for (const item of cssChunks) {
      if (!item || cssBytesRead >= LIMITS.maxCssBytesTotal) continue;
      const remainingCssBytes = LIMITS.maxCssBytesTotal - cssBytesRead;
      const cssChunk = Buffer.from(item.cssChunk, "utf8").subarray(0, remainingCssBytes).toString("utf8");
      try {
        cssBytesRead += Buffer.byteLength(cssChunk, "utf8");
        ingestParsedCss(parseCssFacts(cssChunk), facts.classAttributes);
      } catch {
        continue;
      }
    }
    console.info("[design-pipeline] extracting: page done", {
      sourceUrl: startUrl,
      pageUrl: page.url,
      durationMs: Date.now() - pageStartedAt,
    });
  }

  console.info("[design-pipeline] extracting: done", {
    sourceUrl: startUrl,
    pagesScanned: pagesScanned.length,
    colorsFound: aggregate.colors.size,
    fontsFound: aggregate.fonts.size,
    cssBytesRead,
    htmlBytesRead,
    durationMs: Date.now() - extractionStartedAt,
  });

  return {
    sourceUrl: startUrl,
    pagesScanned,
    cssBytesRead,
    htmlBytesRead,
    colors: takeTopMajorColors(Array.from(aggregate.colors.values()).map((item) => ({
      value: item.value,
      count: item.count,
      properties: Array.from(item.properties),
      selectors: Array.from(item.selectors),
    }))),
    fonts: Array.from(aggregate.fonts.values()).map((item) => ({ family: item.family, count: item.count, selectors: Array.from(item.selectors) })),
    fontSizes: Array.from(aggregate.fontSizes.values()).map((item) => ({ value: item.value, count: item.count, selectors: Array.from(item.selectors) })),
    spacing: Array.from(aggregate.spacing.values()).map((item) => ({ value: item.value, count: item.count, properties: Array.from(item.properties) })),
    radii: Array.from(aggregate.radii.values()).map((item) => ({ value: item.value, count: item.count, selectors: Array.from(item.selectors) })),
    shadows: Array.from(aggregate.shadows.values()).map((item) => ({ value: item.value, count: item.count, selectors: Array.from(item.selectors) })),
    components: {
      buttons: componentButtons,
      cards: componentCards,
      inputs: componentInputs,
    },
    pages: pageDetails,
  } satisfies DesignEvidence;
}
