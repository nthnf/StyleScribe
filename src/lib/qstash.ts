import { Client, Receiver } from "@upstash/qstash";

const qstash = new Client();
const receiver = new Receiver();

export async function enqueueRequestPipeline(requestId: string, origin: string) {
  await qstash.publishJSON({
    url: `${origin}/api/qstash/requests`,
    body: { requestId },
    retries: 0,
    timeout: 60,
    deduplicationId: requestId,
  });
}

export async function verifyQStashRequest(request: Request, body: string) {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;

  return receiver.verify({
    signature,
    body,
    url: request.url,
    upstashRegion: request.headers.get("upstash-region") ?? undefined,
  });
}
