import { notFound } from "next/navigation";
import { getRequestResult, getRequestState } from "@/lib/request-store";
import { ResultView } from "@/components/result-view";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

type ResultPageProps = {
  params: Promise<{ requestId: string }>;
};

export default async function ResultPage({ params }: ResultPageProps) {
  const { requestId } = await params;
  const state = await getRequestState(requestId);

  if (!state) {
    notFound();
  }

  if (state.status === "error") {
    const label = state.error?.match(/HTTP\s+\d+/i)?.[0] ?? "Scan blocked";

    return (
      <main className="min-h-screen bg-[#f7f7f3] px-5 py-8 text-[#17171c] sm:px-8 lg:px-12">
        <section className="mx-auto max-w-4xl space-y-6 rounded-[2rem] border border-red-200 bg-white p-6 shadow-[0_24px_80px_rgba(23,23,28,0.08)]">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-red-600">Style Scribe</p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em]">{label}</h1>
          <p className="text-[#616161]">{state.sourceUrl}</p>
          <p className="rounded-2xl bg-red-50 p-4 text-sm leading-7 text-red-700">
            {state.error || "This site could not be crawled."}
          </p>
          <p className="text-sm text-[#93939f]">Try a public marketing page or another site.</p>
        </section>
      </main>
    );
  }

  const result = await getRequestResult(requestId);

  if (!result) {
    return (
      <main className="min-h-screen bg-[#f7f7f3] px-5 py-8 text-[#17171c] sm:px-8 lg:px-12">
        <section className="mx-auto max-w-4xl space-y-6 rounded-[2rem] border border-[#e5e7eb] bg-white p-6 shadow-[0_24px_80px_rgba(23,23,28,0.08)]">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-[#616161]">Style Scribe</p>
          <h1 className="text-4xl font-semibold tracking-[-0.04em]">Result processing</h1>
          <p className="text-[#616161]">{state.sourceUrl}</p>
          <div className="rounded-2xl bg-[#f7f7f3] p-4">
            <div className="flex items-center justify-between text-sm text-[#616161]">
              <span>{state.status}</span>
              <span>{state.progress}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white">
              <div className="h-2 rounded-full bg-[#17171c]" style={{ width: `${state.progress}%` }} />
            </div>
          </div>
          <p className="text-sm text-[#93939f]">Reload when done. Request {state.id.slice(0, 8)}</p>
        </section>
      </main>
    );
  }

  return (
    <ResultView
      designMd={result.rawDesignMd}
      designSystem={result.previewModel}
      requestId={state.id}
      sourceUrl={state.sourceUrl}
      status={state.status}
      error={state.error}
    />
  );
}
