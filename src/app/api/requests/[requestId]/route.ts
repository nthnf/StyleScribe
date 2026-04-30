import { NextResponse } from "next/server";
import { getRequestState } from "@/lib/request-store";

type Params = { params: Promise<{ requestId: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 5;

export async function GET(_request: Request, { params }: Params) {
  const { requestId } = await params;
  const state = await getRequestState(requestId);

  if (!state) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  return NextResponse.json(state);
}
