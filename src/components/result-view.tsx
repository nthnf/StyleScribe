"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  Home,
  Moon,
  PenLine,
  Search,
  Sun,
  Tag,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useState } from "react";
import type { DesignPreviewModel } from "@/lib/design-preview";

export type DesignSystem = DesignPreviewModel;

type ResultViewProps = {
  designMd: string;
  designSystem: DesignSystem;
  requestId: string;
  sourceUrl: string;
  status: string;
  error?: string;
};

const previewText =
  "Every letter tells a story worth reading, and every typeface gives that story a new voice.";
const paletteDescriptions = [
  "CTAs, active states, links, focus rings, interactive highlights",
  "Darker tone for hover states and stronger emphasis",
  "Secondary accents, status markers, and supporting highlights",
  "Muted text, placeholders, timestamps, disabled states",
  "Page background and quiet surfaces",
  "Cards, panels, modal surfaces",
  "Headings, body text, primary labels",
  "Descriptions, metadata, secondary labels",
  "Card borders, dividers, input borders",
  "Published status, confirmations, positive indicators",
  "Pending states, caution banners",
  "Destructive actions, validation errors",
];
const navIcons = [
  { name: "home", Icon: Home },
  { name: "search", Icon: Search },
  { name: "user", Icon: User },
];
const utilityIcons = [
  { name: "moon", Icon: Moon },
  { name: "sun", Icon: Sun },
  { name: "tag", Icon: Tag },
  { name: "trash", Icon: Trash2 },
];

function labelize(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTextColor(hex: string) {
  const raw = hex.replace("#", "");
  const normalized = raw.length === 3 ? raw.replace(/(.)/g, "$1$1") : raw;
  const value = Number.parseInt(normalized, 16);

  if (Number.isNaN(value)) return "#ffffff";

  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;

  return luminance > 0.62 ? "#17171c" : "#ffffff";
}

function findColor(
  designSystem: DesignSystem,
  names: string[],
  fallback: string,
) {
  const color = designSystem.colors.find((item) => {
    const name = item.name.toLowerCase();

    return names.some((target) => name === target || name.includes(target));
  });

  return color?.value ?? fallback;
}

function normalizePreview(designSystem: DesignSystem) {
  const primary = findColor(
    designSystem,
    ["primary", "accent", "brand", "action"],
    "#17171c",
  );
  const surface = findColor(
    designSystem,
    ["surface", "canvas", "background", "neutral"],
    "#ffffff",
  );
  const text = findColor(
    designSystem,
    ["ink", "text", "foreground", "on-surface", "primary"],
    "#17171c",
  );
  const muted = findColor(
    designSystem,
    ["muted", "secondary", "slate", "gray"],
    "#616161",
  );
  const border = findColor(
    designSystem,
    ["border", "hairline", "rule"],
    "#e5e7eb",
  );
  const colors =
    designSystem.colors.length > 0
      ? designSystem.colors
      : [{ name: "primary", value: primary }];
  const typography =
    designSystem.typography.length > 0
      ? designSystem.typography
      : [
          {
            name: "body",
            fontFamily: "system-ui",
            fontSize: "16px",
            fontWeight: "400",
          },
        ];
  const spacing =
    designSystem.spacing.length > 0
      ? designSystem.spacing
      : [{ name: "base", value: "16px" }];
  const rounded =
    designSystem.rounded.length > 0
      ? designSystem.rounded
      : [{ name: "md", value: "12px" }];

  return {
    primary,
    surface,
    text,
    muted,
    border,
    colors,
    typography,
    spacing,
    rounded,
    dos: designSystem.dos,
    donts: designSystem.donts,
  };
}

function getSwatches(hex: string) {
  const raw = hex.replace("#", "");
  const normalized = raw.length === 3 ? raw.replace(/(.)/g, "$1$1") : raw;
  const value = Number.parseInt(normalized, 16);

  if (Number.isNaN(value)) return [hex];

  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return Array.from({ length: 10 }, (_, index) => {
    const mix = index / 9;
    const target = index < 5 ? 0 : 255;
    const amount = index < 5 ? (5 - index) / 6 : (index - 4) / 6;
    const nextRed = Math.round(red * (1 - amount) + target * amount);
    const nextGreen = Math.round(green * (1 - amount) + target * amount);
    const nextBlue = Math.round(blue * (1 - amount) + target * amount);
    const adjusted =
      mix === 0.5 ? [red, green, blue] : [nextRed, nextGreen, nextBlue];

    return `rgb(${adjusted[0]}, ${adjusted[1]}, ${adjusted[2]})`;
  });
}

function sizeToNumber(size?: string, fallback = 16) {
  const parsed = Number.parseFloat(size ?? "");

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function ResultView({
  designMd,
  designSystem,
  requestId,
  sourceUrl,
  status,
  error,
}: ResultViewProps) {
  const [view, setView] = useState<"raw" | "visual">("visual");
  const [copied, setCopied] = useState(false);
  const preview = normalizePreview(designSystem);
  const dos = preview.dos ?? [];
  const donts = preview.donts ?? [];
  const previewShell = {
    panel: "rgba(23, 23, 28, 0.04)",
    border: preview.border,
    text: preview.text,
    muted: preview.muted,
  };
  async function copyDesignMd() {
    await navigator.clipboard.writeText(designMd);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <main className="min-h-screen bg-[#f7f7f3] px-4 py-6 text-[#17171c] sm:px-8 sm:py-8 lg:px-12">
      <section className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-5">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-2 font-mono text-xs uppercase tracking-[0.25em] text-[#616161] transition hover:text-[#17171c]"
            >
              <ArrowLeft size={14} strokeWidth={2} /> Back
            </button>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-6xl">
              {designSystem.name} DESIGN.md
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-[#616161]">
              {designSystem.description ||
                "Raw DESIGN.md with generated visual preview."}
            </p>
            <p className="font-mono text-xs text-[#93939f]">
              Request {requestId.slice(0, 8)} · {sourceUrl}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={copyDesignMd}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[1.25rem] border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#17171c] transition hover:bg-[#f4f4ef] sm:w-auto"
            >
              {copied ? (
                <Check size={16} strokeWidth={2} />
              ) : (
                <Copy size={16} strokeWidth={2} />
              )}
              {copied ? "Copied" : "Copy DESIGN.md"}
            </button>
            <div className="flex w-full rounded-[1.5rem] border border-[#e5e7eb] bg-white p-1 sm:w-auto">
              {(["visual", "raw"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition sm:flex-none ${
                    view === mode
                      ? "bg-[#17171c] text-white"
                      : "text-[#616161] hover:text-[#17171c]"
                  }`}
                >
                  {labelize(mode)}
                </button>
              ))}
            </div>
          </div>
        </header>

        {status === "error" && error ? (
          <section className="rounded-[1.5rem] border border-red-200 bg-red-50 p-4 text-red-800">
            <div className="text-xs uppercase tracking-[0.3em] text-red-500">
              {error.match(/HTTP\s+\d+/i)?.[0] ?? "Blocked"}
            </div>
            <p className="mt-2 text-sm leading-7">{error}</p>
          </section>
        ) : null}

        {view === "raw" ? (
          <pre className="raw-result-scroll max-h-[78vh] min-h-[60vh] overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words rounded-[2rem] border border-[#e5e7eb] bg-white p-4 font-mono text-sm leading-7 text-[#17171c] shadow-[0_24px_80px_rgba(23,23,28,0.08)] sm:max-h-[86vh] sm:min-h-[72vh] sm:p-6">
            {designMd}
          </pre>
        ) : (
          <div
            className="space-y-6 rounded-[2rem] border p-3 shadow-[0_24px_80px_rgba(23,23,28,0.08)] sm:space-y-8 sm:p-6"
            style={{
              backgroundColor: "#fafaf8",
              borderColor: previewShell.border,
              color: previewShell.text,
            }}
          >
            <section
              className="rounded-[1.25rem] p-2 sm:p-3"
              style={{ backgroundColor: "#fafaf8" }}
            >
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[240px_1fr_1fr_1fr] lg:grid-rows-3">
                <div className="grid h-full grid-cols-2 gap-2 lg:row-span-3 lg:grid-cols-1 lg:grid-rows-4">
                  {preview.colors.slice(0, 4).map((color) => (
                    <button
                      key={color.name}
                      type="button"
                      onClick={() => navigator.clipboard.writeText(color.value)}
                      className="flex h-full w-full flex-col overflow-hidden rounded-xl text-left"
                    >
                      <div
                        className="flex-1 p-4"
                        style={{
                          backgroundColor: color.value,
                          color: getTextColor(color.value),
                        }}
                      >
                        <div className="flex justify-between gap-3 text-xs font-bold">
                          <span>{labelize(color.name)}</span>
                          <span className="font-mono opacity-70">
                            {color.value}
                          </span>
                        </div>
                      </div>
                      <div className="flex h-6 shrink-0">
                        {getSwatches(color.value).map((swatch, index) => (
                          <span
                            key={`${color.name}-${index}`}
                            className="flex-1"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </div>
                    </button>
                  ))}
                </div>

                {preview.typography.slice(0, 3).map((type) => (
                  <div
                    key={type.name}
                    className="rounded-xl p-3 sm:p-4"
                    style={{ backgroundColor: "#f5f5f3" }}
                  >
                    <span
                      className="text-[11px]"
                      style={{ color: previewShell.muted }}
                    >
                      {labelize(type.name)}
                    </span>
                    <div className="flex min-h-20 items-center justify-center sm:min-h-24">
                      <span
                        className="text-4xl sm:text-6xl"
                        style={{
                          fontFamily: type.fontFamily,
                          fontWeight: type.fontWeight,
                          letterSpacing: type.letterSpacing,
                        }}
                      >
                        Aa
                      </span>
                    </div>
                  </div>
                ))}

                <div
                  className="rounded-xl p-4 sm:p-5"
                  style={{ backgroundColor: "#f5f5f3" }}
                >
                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold sm:gap-3">
                    <button
                      className="rounded-md px-4 py-2"
                      style={{
                        backgroundColor: preview.primary,
                        color: getTextColor(preview.primary),
                      }}
                    >
                      Primary
                    </button>
                    <button
                      className="rounded-md px-4 py-2"
                      style={{ color: preview.primary }}
                    >
                      Secondary
                    </button>
                    <button
                      className="rounded-md px-4 py-2"
                      style={{
                        backgroundColor: preview.primary,
                        color: getTextColor(preview.primary),
                        filter: "invert(1)",
                      }}
                    >
                      Inverted
                    </button>
                    <button
                      className="rounded-md border px-4 py-2"
                      style={{
                        borderColor: preview.primary,
                        color: preview.primary,
                      }}
                    >
                      Outlined
                    </button>
                  </div>
                </div>

                <div
                  className="rounded-xl p-4 sm:p-5"
                  style={{ backgroundColor: "#f5f5f3" }}
                >
                  <div
                    className="flex items-center gap-3 rounded-lg px-4 py-3"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.55)",
                      color: previewShell.muted,
                    }}
                  >
                    <Search size={18} strokeWidth={1.8} />
                    <span className="text-sm">Search</span>
                  </div>
                </div>

                <div
                  className="rounded-xl p-4 sm:p-6"
                  style={{ backgroundColor: "#f5f5f3" }}
                >
                  <div className="space-y-2">
                    {["100%", "100%", "82%", "100%", "88%"].map(
                      (width, index) => (
                        <div
                          key={`${width}-${index}`}
                          className="h-[3px] rounded-full"
                          style={{
                            width,
                            backgroundColor: preview.primary,
                            opacity: index > 2 ? 0.35 : 1,
                          }}
                        />
                      ),
                    )}
                  </div>
                </div>

                <div
                  className="flex items-center justify-center rounded-xl p-4 sm:p-5"
                  style={{ backgroundColor: "#f5f5f3" }}
                >
                  <div className="flex flex-wrap gap-3">
                    {navIcons.map(({ name, Icon }, index) => (
                      <div
                        key={name}
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={
                          index === 0
                            ? {
                                backgroundColor: preview.primary,
                                color: getTextColor(preview.primary),
                              }
                            : { color: preview.primary }
                        }
                      >
                        <Icon size={16} strokeWidth={2} />
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="flex items-center justify-center rounded-xl p-4 sm:p-5"
                  style={{ backgroundColor: "#f5f5f3" }}
                >
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: preview.primary }}
                    >
                      <PenLine size={14} strokeWidth={2} />
                    </button>
                    <button
                      className="inline-flex items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white"
                      style={{ backgroundColor: preview.primary }}
                    >
                      <PenLine size={12} strokeWidth={2} /> Label
                    </button>
                  </div>
                </div>

                <div
                  className="flex items-center justify-center rounded-xl p-4 sm:p-5"
                  style={{ backgroundColor: "#f5f5f3" }}
                >
                  <div className="flex flex-wrap gap-2">
                    {utilityIcons.map(({ name, Icon }, index) => (
                      <button
                        key={name}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white"
                        style={{
                          backgroundColor:
                            index === 3 ? "#dc2626" : preview.primary,
                        }}
                      >
                        <Icon size={14} strokeWidth={2} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2
                className="font-mono text-sm font-semibold uppercase tracking-[0.25em]"
                style={{ color: previewShell.muted }}
              >
                Color Palette
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                {preview.colors.slice(0, 12).map((color, index) => (
                  <button
                    key={color.name}
                    type="button"
                    onClick={() => navigator.clipboard.writeText(color.value)}
                    className="min-h-28 rounded-lg p-4 text-left transition hover:scale-[1.02] sm:min-h-32"
                    style={{
                      backgroundColor: color.value,
                      color: getTextColor(color.value),
                    }}
                  >
                    <div className="text-sm font-semibold">
                      {labelize(color.name)}
                    </div>
                    <div className="mt-1 font-mono text-xs opacity-80">
                      {color.value}
                    </div>
                    <div className="mt-2 text-[11px] leading-4 opacity-65">
                      {paletteDescriptions[index] ??
                        "Design token extracted from source evidence"}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              {preview.typography.slice(0, 8).map((type, index) => {
                const fontSize = Math.min(
                  sizeToNumber(type.fontSize, 18),
                  index < 2 ? 64 : 36,
                );

                return (
                  <div
                    key={type.name}
                    className="overflow-hidden rounded-lg p-4 sm:p-5"
                    style={{
                      backgroundColor: "#f4f4f5",
                      color: "#111113",
                    }}
                  >
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <span className="rounded bg-white px-2 py-1 text-xs font-bold">
                        {labelize(type.name)}
                      </span>
                      <span className="font-mono text-xs text-[#9c9ca3]">
                        {type.fontFamily} · {type.fontSize} · {type.fontWeight}
                      </span>
                    </div>
                    <p
                      className="truncate font-semibold tracking-[-0.04em]"
                      style={{
                        fontFamily: type.fontFamily,
                        fontSize,
                        lineHeight: type.lineHeight ?? 1.15,
                        letterSpacing: type.letterSpacing,
                      }}
                    >
                      {previewText}
                    </p>
                  </div>
                );
              })}
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide">
                  Spacing
                </h2>
                <span
                  className="rounded bg-white px-2 py-1 font-mono text-xs"
                  style={{ color: preview.primary }}
                >
                  Base: {preview.spacing[0]?.value}
                </span>
              </div>
              <div
                className="rounded-xl p-5 sm:p-7"
                style={{
                  backgroundColor: "#f4f4f5",
                  color: "#111113",
                }}
              >
                <div className="flex flex-wrap items-end gap-5 sm:gap-7">
                  {preview.spacing.slice(0, 12).map((space) => (
                    <div
                      key={space.name}
                      className="flex flex-col items-center gap-2 sm:gap-3"
                    >
                      <div className="flex items-center">
                        <span className="h-4 w-px bg-current opacity-60" />
                        <span
                          className="h-px bg-current opacity-60"
                          style={{ width: space.value }}
                        />
                        <span className="h-4 w-px bg-current opacity-60" />
                      </div>
                      <span className="font-mono text-xs text-[#9c9ca3]">
                        {space.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-6 sm:space-y-8">
              <h2 className="text-lg font-semibold uppercase tracking-wide">
                Components
              </h2>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Buttons</h3>
                <div
                  className="rounded-xl p-4 sm:p-6"
                  style={{ backgroundColor: "#f4f4f5", color: "#111113" }}
                >
                  <div className="flex flex-wrap gap-3 sm:gap-4">
                    <button
                      className="rounded-md px-5 py-3 text-sm font-bold text-white sm:px-8"
                      style={{ backgroundColor: preview.primary }}
                    >
                      Default
                    </button>
                    <button
                      className="rounded-md px-5 py-3 text-sm font-bold text-white brightness-90 sm:px-8"
                      style={{ backgroundColor: preview.primary }}
                    >
                      Hover
                    </button>
                    <button
                      className="rounded-md border px-5 py-3 text-sm font-bold sm:px-8"
                      style={{
                        borderColor: preview.border,
                        color: preview.primary,
                      }}
                    >
                      Default
                    </button>
                    <button
                      className="rounded-md border px-5 py-3 text-sm font-bold sm:px-8"
                      style={{
                        borderColor: preview.border,
                        color: preview.primary,
                      }}
                    >
                      Hover
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Cards</h3>
                <div
                  className="rounded-xl p-4 sm:p-8"
                  style={{ backgroundColor: "#f4f4f5", color: "#111113" }}
                >
                  <div
                    className="max-w-xs rounded-xl border bg-white p-5 sm:p-6"
                    style={{ borderColor: preview.border }}
                  >
                    <p className="font-semibold">Card Title</p>
                    <p
                      className="mt-2 text-sm font-semibold"
                      style={{ color: preview.primary }}
                    >
                      Sample body text for the card component.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Inputs</h3>
                <div
                  className="rounded-xl p-4 sm:p-8"
                  style={{ backgroundColor: "#f4f4f5", color: "#111113" }}
                >
                  <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                    <label
                      className="space-y-2 text-sm font-semibold"
                      style={{ color: preview.primary }}
                    >
                      Email
                      <input
                        className="block w-full rounded-md border bg-white px-3 py-3 font-normal text-[#111113] sm:px-4"
                        style={{ borderColor: preview.border }}
                        placeholder="you@example.com"
                      />
                    </label>
                    <label className="space-y-2 text-sm font-semibold text-red-500">
                      Email (error)
                      <input
                        className="block w-full rounded-md border bg-white px-3 py-3 font-normal text-[#111113] sm:px-4"
                        style={{ borderColor: "#ef4444" }}
                        placeholder="you@example.com"
                      />
                      <span className="block text-xs">
                        Please enter a valid email
                      </span>
                    </label>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-sm font-semibold">Elevation & Depth</h3>
                <div
                  className="rounded-xl p-5 sm:p-10"
                  style={{ backgroundColor: "#f4f4f5", color: "#111113" }}
                >
                  <div className="flex flex-wrap justify-center gap-5 text-center text-xs font-semibold text-[#9c9ca3] sm:gap-8">
                    {["Card", "Primary Button", "Focus State"].map(
                      (item, index) => (
                        <div key={item} className="space-y-3 sm:space-y-4">
                          <p>{item}</p>
                          <div
                            className="h-24 w-24 rounded-xl bg-white sm:h-28 sm:w-28"
                            style={{
                              boxShadow:
                                index === 0
                                  ? "0 12px 32px rgba(0,0,0,0.08)"
                                  : index === 1
                                    ? `0 8px 24px ${preview.primary}55`
                                    : `0 0 0 4px ${preview.primary}22`,
                            }}
                          />
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-lg font-semibold uppercase tracking-wide">
                Do&apos;s &amp; Don&apos;ts
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4 text-emerald-500 sm:p-5">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <Check size={18} strokeWidth={2} /> Do
                  </h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-emerald-400/80 sm:space-y-3">
                    {(dos.length
                      ? dos
                      : [
                          "Use the strongest observed accent color.",
                          "Keep spacing and typography consistent.",
                        ]
                    ).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-red-500 sm:p-5">
                  <h3 className="flex items-center gap-2 font-semibold">
                    <X size={18} strokeWidth={2} /> Don&apos;t
                  </h3>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-red-400/80 sm:space-y-3">
                    {(donts.length
                      ? donts
                      : [
                          "Invent unsupported brand claims.",
                          "Mix unrelated radii or shadow styles.",
                        ]
                    ).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
