import { readFile } from "node:fs/promises";
import path from "node:path";
import { lint } from "@google/design.md/linter";
import OpenAI from "openai";
import { extractDesignEvidence, LIMITS, type DesignEvidence } from "./scan";
import { generateVisualArgs, type DesignPreviewModel } from "./design-preview";

type LintFinding = {
  severity: string;
  ruleId?: string;
  message: string;
  path?: string;
  line?: number;
  suggestion?: string;
};

export type GenerateResponse = {
  designMd: string;
  lint: {
    ok: boolean;
    summary: { errors: number; warnings: number; info: number };
    findings: LintFinding[];
  };
  repairAttempts: Array<{ attempt: number; errors: number; warnings: number }>;
  evidenceSummary: {
    pagesScanned: string[];
    colorsFound: number;
    fontsFound: number;
    cssBytesRead: number;
  };
  evidence: DesignEvidence;
  previewModel?: DesignPreviewModel;
};

async function loadPrompt(name: string) {
  return readFile(path.join(process.cwd(), "prompts", name), "utf8");
}

function buildEvidenceSummary(evidence: DesignEvidence) {
  return {
    sourceUrl: evidence.sourceUrl,
    pagesScanned: evidence.pagesScanned,
    cssBytesRead: evidence.cssBytesRead,
    htmlBytesRead: evidence.htmlBytesRead,
    colors: evidence.colors.slice(0, 12),
    fonts: evidence.fonts.slice(0, 8),
    fontSizes: evidence.fontSizes.slice(0, 8),
    spacing: evidence.spacing.slice(0, 10),
    radii: evidence.radii.slice(0, 8),
    shadows: evidence.shadows.slice(0, 8),
    components: evidence.components,
    pages: evidence.pages.slice(0, 5).map((page) => ({
      url: page.url,
      title: page.title,
      metaDescription: page.metaDescription,
      headings: page.headings.slice(0, 10),
      buttons: page.buttons.slice(0, 10),
    })),
  };
}

function takeTopByCount<T extends { count: number }>(items: T[], limit: number) {
  return [...items]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function isLikelySizeValue(value: string) {
  return /^(?:\d+(?:\.\d+)?(?:px|rem|em|%)?|\d+(?:\.\d+)?(?:px|rem|em|%)?\s+\d)/i.test(value);
}

function isCssVariableReference(value: string) {
  return /^var\(--/i.test(value.trim());
}

function isBrandSignal(item: { properties?: string[]; selectors?: string[] }) {
  const text = [...(item.properties ?? []), ...(item.selectors ?? [])].join(" ").toLowerCase();
  return /(brand|accent|primary|cta|button|link|focus|active|hover|selected|filled)/.test(text);
}

function isNeutralColor(value: string) {
  const normalized = value.replace(/^#/, "").toLowerCase();
  return ["000", "000000", "fff", "ffffff", "ededed", "d4d4d4", "e5e5e5", "707070", "525252"].includes(normalized);
}

function hexToRgb(value: string) {
  const raw = value.replace(/^#/, "").trim();
  const hex = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;

  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;

  const int = Number.parseInt(hex, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255] as const;
}

function isNeutralRgb(rgb: readonly [number, number, number]) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const avg = (r + g + b) / 3;

  return avg <= 28 || avg >= 227 || spread <= 18;
}

export function buildPromptEvidence(evidence: DesignEvidence) {
  const summary = buildEvidenceSummary(evidence);

  const enrichedColors = summary.colors
    .map((item) => {
      const rgb = hexToRgb(item.value);
      if (!rgb) return null;

      const neutral = isNeutralColor(item.value) || isNeutralRgb(rgb);
      const brand = isBrandSignal(item);

      return {
        value: item.value,
        rgb: Array.from(rgb),
        count: item.count,
        properties: item.properties.slice(0, 2),
        selectors: item.selectors.slice(0, 2),
        neutral,
        kind: brand && !neutral ? ("brand-accent" as const) : neutral ? ("neutral" as const) : ("accent" as const),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const brandAccent = [...enrichedColors]
    .filter((item) => item.kind === "brand-accent")
    .sort((a, b) => b.count - a.count || b.selectors.length - a.selectors.length)[0];

  const colorfulColors = enrichedColors
    .filter((item) => item.kind !== "neutral")
    .sort((a, b) => b.count - a.count || (a.kind === "brand-accent" ? 1 : 0) - (b.kind === "brand-accent" ? 1 : 0));

  const neutralColors = enrichedColors
    .filter((item) => item.kind === "neutral")
    .sort((a, b) => b.count - a.count);

  const selectedColors: typeof enrichedColors = [];
  const seen = new Set<string>();

  const push = (item: (typeof enrichedColors)[number]) => {
    if (seen.has(item.value) || selectedColors.length >= 16) return;
    seen.add(item.value);
    selectedColors.push(item);
  };

  if (brandAccent) push(brandAccent);

  for (const item of colorfulColors) {
    if (selectedColors.length >= 8) break;
    push(item);
  }

  for (const item of neutralColors) {
    if (selectedColors.length >= 16) break;
    push(item);
  }

  for (const item of colorfulColors) {
    if (selectedColors.length >= 16) break;
    push(item);
  }

  const concreteFonts = takeTopByCount(
    summary.fonts.filter((item) => !isCssVariableReference(item.family)),
    4,
  );
  const selectedFonts = concreteFonts.length > 0 ? concreteFonts : takeTopByCount(summary.fonts, 2);

  return {
    ...summary,
    colors: selectedColors,
    fonts: selectedFonts.map((item) => ({
      family: item.family,
      count: item.count,
      selectors: item.selectors.slice(0, 3),
    })),
    fontSizes: takeTopByCount(
      summary.fontSizes.filter((item) => isLikelySizeValue(item.value)),
      3,
    ).map((item) => ({
      value: item.value,
      count: item.count,
      selectors: item.selectors.slice(0, 3),
    })),
    spacing: takeTopByCount(summary.spacing, 5).map((item) => ({
      value: item.value,
      count: item.count,
      properties: item.properties.slice(0, 3),
    })),
    radii: takeTopByCount(summary.radii, 4).map((item) => ({
      value: item.value,
      count: item.count,
      selectors: item.selectors.slice(0, 3),
    })),
    shadows: takeTopByCount(summary.shadows, 3).map((item) => ({
      value: item.value,
      count: item.count,
      selectors: item.selectors.slice(0, 3),
    })),
    pages: summary.pages.map((page) => ({
      ...page,
      headings: page.headings.slice(0, 5),
      buttons: page.buttons.slice(0, 5),
    })),
  };
}

export async function buildGenerationMessages(evidence: DesignEvidence) {
  const formatPrompt = await loadPrompt("design-md-format.md");
  const generationPrompt = await loadPrompt("generate-design.md");

  return {
    system: [formatPrompt, generationPrompt],
    user: JSON.stringify(buildPromptEvidence(evidence)),
  };
}

async function callOpenAI(instructions: string, input: string, temperature = 0.2) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const client = new OpenAI({ apiKey: key });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
    const response = await Promise.race([
      client.responses.create({
        model,
        instructions,
        input,
        temperature,
        max_output_tokens: 2048,
        service_tier: "flex",
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("OpenAI timeout")), 120_000);
      }),
    ]);

    const content = response.output_text ?? "";
    if (!content.trim()) throw new Error("OpenAI returned empty content");
    return content;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function compactLintFindings(findings: LintFinding[]) {
  return findings.slice(0, 20).map((finding) => ({
    severity: finding.severity,
    ruleId: finding.ruleId ?? "unknown",
    message: finding.message,
    path: finding.path,
    line: finding.line,
    suggestion: finding.suggestion,
  }));
}

function normalizeDesignMdOutput(content: string) {
  let normalized = content.trim();

  const fenced = normalized.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
  if (fenced?.[1]) normalized = fenced[1].trim();

  const lines = normalized.split("\n");
  if (lines[0]?.trim() !== "---") return normalized;

  const closingIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingIndex !== -1) return normalized;

  const firstBodyIndex = lines.findIndex((line, index) => index > 0 && /^#{1,6}\s/.test(line));
  if (firstBodyIndex === -1) return normalized;

  return [...lines.slice(0, firstBodyIndex), "---", "", ...lines.slice(firstBodyIndex)].join("\n").trim();
}

async function generateInitialDesignMd(evidence: DesignEvidence) {
  const { system, user } = await buildGenerationMessages(evidence);

  const content = await callOpenAI([system[0], system[1]].join("\n\n"), user, 0.2);

  if (!content.trim()) throw new Error("OpenAI returned empty content");
  return normalizeDesignMdOutput(content);
}

async function repairDesignMd(designMd: string, findings: LintFinding[], attempt: number) {
  const repairPrompt = await loadPrompt("repair-design.md");

  const content = await callOpenAI(repairPrompt, JSON.stringify({ attempt, findings, designMd }), 0);

  if (!content.trim()) throw new Error("OpenAI returned empty content");
  return normalizeDesignMdOutput(content);
}

function normalizeLintReport(report: ReturnType<typeof lint>) {
  const summary = report.summary as unknown as { errors: number; warnings: number; info?: number; infos?: number };

  return {
    ok: summary.errors === 0,
    summary: {
      errors: summary.errors,
      warnings: summary.warnings,
      info: summary.info ?? summary.infos ?? 0,
    },
    findings: (report.findings || []) as LintFinding[],
  };
}

export function verifyDesignMd(designMd: string) {
  return normalizeLintReport(lint(designMd));
}

export async function runDesignPipeline(
  sourceUrl: string,
  onStage?: (status: "crawling" | "extracting" | "generating" | "validating", progress: number) => void,
): Promise<GenerateResponse> {
  const validateStartedAt = Date.now();

  onStage?.("crawling", 10);
  onStage?.("extracting", 20);
  const evidence = await extractDesignEvidence(sourceUrl, (progress) => onStage?.("extracting", progress));
  onStage?.("generating", 35);
  let designMd = await generateInitialDesignMd(evidence);
  onStage?.("validating", 80);
  console.info("[design-pipeline] validating: lint start", { sourceUrl });
  let lintReport = verifyDesignMd(designMd);
  console.info("[design-pipeline] validating: lint done", {
    sourceUrl,
    errors: lintReport.summary.errors,
    warnings: lintReport.summary.warnings,
    durationMs: Date.now() - validateStartedAt,
  });
  const repairAttempts: Array<{ attempt: number; errors: number; warnings: number }> = [];

  for (let attempt = 1; attempt <= LIMITS.maxRepairAttempts; attempt++) {
    if (lintReport.summary.errors === 0) break;

    console.info("[design-pipeline] validating: repair start", {
      sourceUrl,
      attempt,
      errors: lintReport.summary.errors,
      warnings: lintReport.summary.warnings,
    });
    designMd = await repairDesignMd(designMd, compactLintFindings(lintReport.findings), attempt);
    console.info("[design-pipeline] validating: repair done", {
      sourceUrl,
      attempt,
      durationMs: Date.now() - validateStartedAt,
    });
    console.info("[design-pipeline] validating: repair lint start", { sourceUrl, attempt });
    lintReport = normalizeLintReport(lint(designMd));
    console.info("[design-pipeline] validating: repair lint done", {
      sourceUrl,
      attempt,
      errors: lintReport.summary.errors,
      warnings: lintReport.summary.warnings,
      durationMs: Date.now() - validateStartedAt,
    });
    onStage?.("validating", 80 + attempt * 5);
    repairAttempts.push({
      attempt,
      errors: lintReport.summary.errors,
      warnings: lintReport.summary.warnings,
    });
  }

  console.info("[design-pipeline] validating: visual preview start", { sourceUrl });
  const previewModel = await generateVisualArgs(designMd);
  console.info("[design-pipeline] validating: visual preview done", {
    sourceUrl,
    durationMs: Date.now() - validateStartedAt,
  });

  return {
    designMd,
    lint: lintReport,
    repairAttempts,
    evidenceSummary: {
      pagesScanned: evidence.pagesScanned,
      colorsFound: evidence.colors.length,
      fontsFound: evidence.fonts.length,
      cssBytesRead: evidence.cssBytesRead,
    },
    evidence,
    previewModel,
  };
}
