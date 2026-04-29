import { NextResponse } from "next/server";
import { createRequest, runRequestPipeline } from "@/lib/request-store";
import { canonicalizeUrl, isSafePublicUrl } from "@/lib/scan/url";
import { checkDailyIpLimit, getClientIp } from "@/lib/rate-limit";

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

  const state = await createRequest(canonicalUrl);
  void runRequestPipeline(state.id);

  return NextResponse.json({ requestId: state.id, status: state.status });
}
