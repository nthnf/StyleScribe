import { NextResponse } from "next/server";
import { getRequestState } from "@/lib/request-store";

type Params = { params: Promise<{ requestId: string }> };

export async function GET(_: Request, { params }: Params) {
  const { requestId } = await params;
  const state = getRequestState(requestId);

  if (!state) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json(state);
}
