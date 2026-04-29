import { NextResponse } from "next/server";
import { getRequestState } from "@/lib/request-store";

type Params = { params: Promise<{ requestId: string }> };

const longPollTimeoutMs = 25_000;
const longPollIntervalMs = 1_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: Request, { params }: Params) {
  const { requestId } = await params;
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? 0);
  const startedAt = Date.now();

  while (Date.now() - startedAt < longPollTimeoutMs) {
    const state = await getRequestState(requestId);

    if (!state) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (!since || state.updatedAt > since || state.status === "done" || state.status === "error") {
      return NextResponse.json(state);
    }

    await sleep(longPollIntervalMs);
  }

  const state = await getRequestState(requestId);

  if (!state) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json(state);
}
