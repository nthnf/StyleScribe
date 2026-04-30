import { NextResponse } from "next/server";
import { verifyQStashRequest } from "@/lib/qstash";
import { runRequestPipeline } from "@/lib/request-store";

export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!(await verifyQStashRequest(request, rawBody))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (JSON.parse(rawBody || "null") || null) as { requestId?: string } | null;
  const requestId = body?.requestId;

  if (!requestId) {
    return NextResponse.json({ error: "requestId is required." }, { status: 400 });
  }

  await runRequestPipeline(requestId);

  return NextResponse.json({ ok: true });
}
