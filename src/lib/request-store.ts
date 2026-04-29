import type { DesignPreviewModel } from "./design-preview";
import { runDesignPipeline } from "./design-engine";
import { AuthGatedError, CrawlError, UnsafeUrlError } from "./scan/crawl";
import { Redis } from "@upstash/redis";

export type RequestState = {
  id: string;
  status: "queued" | "crawling" | "extracting" | "generating" | "validating" | "done" | "error";
  createdAt: number;
  updatedAt: number;
  sourceUrl: string;
  progress: number;
  stage: string;
  rawDesignMd?: string;
  previewModel?: DesignPreviewModel;
  lint?: {
    ok: boolean;
    summary: { errors: number; warnings: number; info: number };
    findings: Array<{
      severity: string;
      ruleId?: string;
      message: string;
      path?: string;
      line?: number;
      suggestion?: string;
    }>;
  };
  repairAttempts?: Array<{ attempt: number; errors: number; warnings: number }>;
  evidenceSummary?: {
    pagesScanned: string[];
    colorsFound: number;
    fontsFound: number;
    cssBytesRead: number;
  };
  error?: string;
};

const globalStore = globalThis as typeof globalThis & {
  __styleScribeRequests?: Map<string, RequestState>;
};

const requests = globalStore.__styleScribeRequests ?? new Map<string, RequestState>();
globalStore.__styleScribeRequests = requests;
const requestRedis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null;
const requestKey = (id: string) => `style-scribe:request:${id}`;
const requestTtlSeconds = 60 * 60 * 24;

async function persistRequestState(state: RequestState) {
  if (!requestRedis) return;

  try {
    await requestRedis.set(requestKey(state.id), JSON.stringify(state), { ex: requestTtlSeconds });
  } catch {
    // best effort; local in-memory store still keeps same-instance requests alive
  }
}

async function loadRequestState(id: string) {
  const cached = requests.get(id);
  if (!requestRedis) return cached;

  try {
    const raw = await requestRedis.get<string | RequestState>(requestKey(id));
    if (!raw) return cached;

    const parsed = typeof raw === "string" ? (JSON.parse(raw) as RequestState) : raw;
    requests.set(id, parsed);
    return parsed;
  } catch {
    return cached;
  }
}

export async function getRequestState(id: string) {
  return loadRequestState(id);
}

export function updateRequestState(id: string, patch: Partial<RequestState>) {
  const current = requests.get(id);
  if (!current) return;

  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  } satisfies RequestState;

  requests.set(id, next);
  void persistRequestState(next);
}

export async function createRequest(sourceUrl: string) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const state: RequestState = {
    id,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    sourceUrl,
    progress: 0,
    stage: "queued",
  };

  requests.set(id, state);
  await persistRequestState(state);

  return state;
}

export async function runRequestPipeline(id: string) {
  const state = requests.get(id);
  if (!state) return;

  function describeCrawlStatus(status: number) {
    if (status === 401 || status === 403) return "This page is protected or blocked. Try a public marketing page instead.";
    if (status === 404) return "This page could not be found. Check the URL and try again.";
    if (status === 408 || status === 504) return "This site took too long to respond. Try again later or use a different page.";
    if (status === 429) return "This site rate-limited the scan. Try again later or use a different page.";
    if (status >= 500) return "This site is having trouble responding right now. Try again later.";
    if (status >= 300 && status < 400) return "This page redirects in a way the scanner could not follow. Try the final public URL instead.";

    return "This page could not be scanned. Try a public marketing page instead.";
  }

  function normalizePipelineError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    if (error instanceof CrawlError) {
      return describeCrawlStatus(error.status);
    }

    if (error instanceof AuthGatedError) {
      return "This page appears to require authentication. Try scanning a public marketing page instead.";
    }

    if (error instanceof UnsafeUrlError) {
      return "Only public HTTP(S) URLs can be scanned. Local, private, and internal network URLs are blocked.";
    }

    if (lower.includes("aborterror") || lower.includes("operation was aborted") || lower.includes("timed out")) {
      return "This site appears blocked, protected, or too slow to crawl right now.";
    }

    return message || "Pipeline failed.";
  }

  try {
    const result = await runDesignPipeline(state.sourceUrl, (status, progress) => {
      updateRequestState(id, { status, stage: status, progress });
    });

    updateRequestState(id, {
      status: "done",
      stage: "done",
      progress: 100,
      rawDesignMd: result.designMd,
      previewModel: result.previewModel,
      lint: result.lint,
      repairAttempts: result.repairAttempts,
      evidenceSummary: result.evidenceSummary,
    });
  } catch (error) {
    updateRequestState(id, {
      status: "error",
      stage: "error",
      progress: 100,
      error: normalizePipelineError(error),
    });
  }
}
