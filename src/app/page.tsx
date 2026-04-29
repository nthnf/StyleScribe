"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";

const steps = [
  "Queue site",
  "Crawl sample pages",
  "Extract design evidence",
  "Generate DESIGN.md",
  "Validate result",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"queued" | "crawling" | "extracting" | "generating" | "validating" | "done" | "error" | "idle">("idle");

  useEffect(() => {
    function resetRestoredPage() {
      setIsRunning(false);
      setActiveStep(0);
      setRequestId(null);
      setStatus("idle");
    }

    window.addEventListener("pageshow", resetRestoredPage);

    return () => window.removeEventListener("pageshow", resetRestoredPage);
  }, []);

  useEffect(() => {
    if (!requestId || !isRunning) return;

    let cancelled = false;

    async function pollStatus() {
      try {
        const response = await fetch(`/api/requests/${requestId}`, { cache: "no-store" });

        if (!response.ok) {
          if (response.status === 404) {
            setError("Request not found. Please try again.");
            setIsRunning(false);
          }

          return;
        }

        const data = (await response.json()) as { status?: typeof status; error?: string; progress?: number };
        if (cancelled) return;

        const nextStatus = data.status ?? "idle";
        setStatus(nextStatus);

        const stepIndexMap: Record<string, number> = {
          idle: 0,
          queued: 0,
          crawling: 1,
          extracting: 2,
          generating: 3,
          validating: 4,
          done: 5,
          error: 0,
        };

        setActiveStep(stepIndexMap[nextStatus] ?? 0);

        if (nextStatus === "done") {
          setIsRunning(false);
          window.location.assign(`/result/${requestId}`);
        }

        if (nextStatus === "error") {
          setError(data.error ?? "Pipeline failed.");
          setIsRunning(false);
        }
      } catch {
        // ignore transient polling errors
      }
    }

    void pollStatus();
    const interval = window.setInterval(pollStatus, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [requestId, isRunning, status]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!url.trim()) return;

    setError("");
    setIsRunning(true);
    setActiveStep(0);
    setStatus("queued");

    const response = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: url.trim() }),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;

      setError(data?.error ?? "Failed to create request.");
      setIsRunning(false);
      return;
    }

    const data = (await response.json()) as { requestId: string };

    window.sessionStorage.setItem("style-scribe:last-url", url.trim());
    setRequestId(data.requestId);
  }

  return (
    <main className="min-h-screen bg-[#f7f7f3] px-4 py-6 text-[#17171c] sm:px-8 sm:py-8 lg:px-12">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center gap-10">
        <div className="max-w-3xl space-y-5">
          <p className="font-mono text-xs uppercase tracking-[0.35em] text-[#616161]">
            Style Scribe
          </p>
          <h1 className="text-3xl font-semibold tracking-[-0.05em] text-balance sm:text-7xl">
            Turn public website into validated DESIGN.md.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-[#616161] sm:text-lg sm:leading-8">
            Paste public URL. App samples design pages, extracts compact evidence,
            generates tokens, then checks output before showing raw and visual views.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-[#e5e7eb] bg-white p-3 shadow-[0_24px_80px_rgba(23,23,28,0.08)] sm:p-3"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="website-url">
              Website URL
            </label>
            <input
              id="website-url"
              type="url"
              required
              disabled={isRunning}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              className="min-h-14 flex-1 rounded-[1.25rem] border border-transparent bg-[#f4f4ef] px-4 text-base outline-none transition focus:border-[#17171c] disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
            />
            <button
              type="submit"
              disabled={isRunning}
              className="min-h-14 rounded-[1.25rem] bg-[#17171c] px-7 text-sm font-semibold text-white transition hover:bg-[#003c33] disabled:cursor-not-allowed disabled:opacity-60 sm:px-7"
            >
              Generate
            </button>
          </div>
        </form>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        {status !== "idle" ? (
        <div className="px-0 py-2 sm:px-1 sm:py-3">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-0">
          {steps.map((step, index) => {
            const state = activeStep > index ? "done" : activeStep === index ? "active" : "next";
            const isDone = state === "done";
            const isActive = isRunning && state === "active";

            return (
              <div
                key={step}
                className="relative flex flex-1 items-center gap-3 text-left sm:flex-col sm:items-center sm:text-center"
              >
                {index < steps.length - 1 ? (
                  <span
                    className={`absolute left-1/2 top-7 hidden h-[3px] w-full rounded-full transition sm:block ${
                      activeStep > index ? "bg-[#003c33]" : "bg-[#e5e7eb]"
                    }`}
                  />
                ) : null}
                <div
                  className={`relative z-10 flex size-14 items-center justify-center rounded-full border transition duration-500 ${
                    isDone
                      ? "scale-95 border-[#003c33] bg-[#003c33] text-white"
                      : isActive
                        ? "scale-110 border-[#17171c] bg-white text-[#17171c] shadow-[0_0_0_10px_rgba(23,23,28,0.06),0_18px_50px_rgba(23,23,28,0.14)]"
                        : "border-[#e5e7eb] bg-[#f7f7f3] text-[#93939f]"
                  }`}
                >
                  {isActive ? (
                    <span className="absolute size-20 animate-ping rounded-full bg-[#17171c]/10" />
                  ) : null}
                  {isDone ? (
                    <span className="size-3 rounded-full bg-white" />
                  ) : (
                    <span className="font-mono text-xs font-semibold">0{index + 1}</span>
                  )}
                </div>
                <p
                  className={`max-w-28 text-xs font-medium leading-5 transition sm:max-w-32 ${
                    isDone
                      ? "text-[#003c33]"
                      : isActive
                        ? "text-[#17171c]"
                        : "text-[#93939f]"
                  }`}
                >
                  {step}
                </p>
              </div>
            );
          })}
          </div>
        </div>
        ) : null}

        <footer className="flex flex-col gap-4 border-t border-[#e5e7eb] pt-6 text-[#93939f] sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-only.webp"
              alt="Style Scribe icon"
              width={56}
              height={56}
              className="size-14"
            />
            <Image
              src="/text-logo.webp"
              alt="Style Scribe"
              width={202}
              height={40}
              className="h-7 w-auto opacity-75 sm:h-8"
            />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.2em]">
            Copyright (c) 2026 Nathan Farrel
          </p>
        </footer>
      </section>
    </main>
  );
}
