import { NextResponse } from "next/server";
import { createRequest, runRequestPipeline, updateRequestState } from "@/lib/request-store";
import { enqueueRequestPipeline } from "@/lib/qstash";
import { canonicalizeUrl, isSafePublicUrl } from "@/lib/scan/url";
import { checkDailyIpLimit, getClientIp } from "@/lib/rate-limit";

export const maxDuration = 10;

function isLocalOrigin(origin: string) {
  const hostname = new URL(origin).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  const sourceUrl = body?.url?.trim();

  if (!sourceUrl) {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  const canonicalUrl = canonicalizeUrl(sourceUrl, sourceUrl);

  if (!canonicalUrl || !isSafePublicUrl(canonicalUrl)) {
    return NextResponse.json({ error: "Only public HTTP(S) URLs can be scanned." }, { status: 400 });
  }

  const ip = getClientIp(request);
  if (!ip) {
    return NextResponse.json({ error: "Unable to determine client IP." }, { status: 400 });
  }

  try {
    const limit = await checkDailyIpLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Daily request limit reached." }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: "Rate limit unavailable." }, { status: 503 });
  }

  const state = await createRequest(canonicalUrl, ip);
  if (state.status === "queued" && Date.now() - state.createdAt < 5_000) {
    try {
      const origin = new URL(request.url).origin;
      if (isLocalOrigin(origin)) {
        void runRequestPipeline(state.id);
      } else {
        await enqueueRequestPipeline(state.id, origin);
      }
    } catch (error) {
      await updateRequestState(state.id, {
        status: "error",
        stage: "error",
        progress: 100,
        error: error instanceof Error ? error.message : "Failed to enqueue request.",
      });
    }
  }

  return NextResponse.json({ requestId: state.id, status: state.status });
}
