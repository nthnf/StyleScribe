import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

export type DesignPreviewModel = {
  name: string;
  description?: string;
  colors: Array<{ name: string; value: string }>;
  typography: Array<{
    name: string;
    fontFamily?: string;
    fontSize?: string;
    fontWeight?: string;
    lineHeight?: string;
    letterSpacing?: string;
  }>;
  spacing: Array<{ name: string; value: string }>;
  rounded: Array<{ name: string; value: string }>;
  dos: string[];
  donts: string[];
};

const VisualArgsSchema = z.object({
  name: z.string(),
  description: z.string(),
  colors: z.array(z.object({ name: z.string(), value: z.string() })),
  typography: z.array(
    z.object({
      name: z.string(),
      fontFamily: z.string(),
      fontSize: z.string(),
      fontWeight: z.string(),
      lineHeight: z.string(),
      letterSpacing: z.string(),
    }),
  ),
  spacing: z.array(z.object({ name: z.string(), value: z.string() })),
  rounded: z.array(z.object({ name: z.string(), value: z.string() })),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
});

function debugVisualPreview(...args: unknown[]) {
  if (process.env.DEBUG_VISUAL_PREVIEW === "1") console.log(...args);
}

function dimensionToPx(value?: string) {
  const raw = value?.trim();
  if (!raw) return "";

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return raw;

  if (raw.endsWith("rem") || raw.endsWith("em")) return `${Number((parsed * 16).toFixed(2))}px`;
  if (raw.endsWith("px")) return `${Number(parsed.toFixed(2))}px`;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return `${Number(parsed.toFixed(2))}px`;

  return raw;
}

function dimensionNumber(value?: string) {
  const px = dimensionToPx(value);
  const parsed = Number.parseFloat(px);

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePreviewModel(model: DesignPreviewModel): DesignPreviewModel {
  return {
    ...model,
    typography: model.typography
      .map((item) => ({
        ...item,
        fontSize: dimensionToPx(item.fontSize),
        letterSpacing: item.letterSpacing ? dimensionToPx(item.letterSpacing) : "",
      }))
      .sort((a, b) => dimensionNumber(b.fontSize) - dimensionNumber(a.fontSize)),
    spacing: model.spacing
      .map((item) => ({ ...item, value: dimensionToPx(item.value) }))
      .sort((a, b) => dimensionNumber(a.value) - dimensionNumber(b.value)),
    rounded: model.rounded.map((item) => ({ ...item, value: dimensionToPx(item.value) })),
  };
}

function extractPreviewFrontmatter(markdown: string) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return "";
  }

  return match[1];
}

function parsePreviewFrontmatter(markdown: string): DesignPreviewModel {
  const frontmatter = extractPreviewFrontmatter(markdown);

  if (!frontmatter) {
    return normalizePreviewModel({ name: "DESIGN.md", colors: [], typography: [], spacing: [], rounded: [], dos: [], donts: [] });
  }

  const lines = frontmatter.split("\n");
  const system: DesignPreviewModel = {
    name: "DESIGN.md",
    description: "",
    colors: [],
    typography: [],
    spacing: [],
    rounded: [],
    dos: [],
    donts: [],
  };
  let section = "";
  let currentType: DesignPreviewModel["typography"][number] | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (!line.startsWith(" ") && trimmed.endsWith(":")) {
      section = trimmed.slice(0, -1);
      currentType = null;
      continue;
    }

    if (!line.startsWith(" ")) {
      const [key, ...valueParts] = trimmed.split(":");
      const value = valueParts.join(":").trim().replace(/^"|"$/g, "");

      if (key === "name") system.name = value;
      if (key === "description") system.description = value;
      continue;
    }

    if (section === "colors") {
      const [name, ...valueParts] = trimmed.split(":");
      const value = valueParts.join(":").trim().replace(/^"|"$/g, "");

      if (name && value.startsWith("#")) system.colors.push({ name, value });
    }

    if (section === "spacing") {
      const [name, ...valueParts] = trimmed.split(":");
      const value = valueParts.join(":").trim().replace(/^"|"$/g, "");

      if (name && value) system.spacing.push({ name, value });
    }

    if (section === "rounded") {
      const [name, ...valueParts] = trimmed.split(":");
      const value = valueParts.join(":").trim().replace(/^"|"$/g, "");

      if (name && value) system.rounded.push({ name, value });
    }

    if (section === "typography") {
      if (line.startsWith("  ") && !line.startsWith("    ") && trimmed.endsWith(":")) {
        currentType = { name: trimmed.slice(0, -1) };
        system.typography.push(currentType);
        continue;
      }

      if (currentType && line.startsWith("    ")) {
        const [key, ...valueParts] = trimmed.split(":");
        const value = valueParts.join(":").trim().replace(/^"|"$/g, "");

        if (key === "fontFamily") currentType.fontFamily = value;
        if (key === "fontSize") currentType.fontSize = value;
        if (key === "fontWeight") currentType.fontWeight = value;
        if (key === "lineHeight") currentType.lineHeight = value;
        if (key === "letterSpacing") currentType.letterSpacing = value;
      }
    }
  }

  return normalizePreviewModel(system);
}

export async function generateVisualArgs(markdown: string): Promise<DesignPreviewModel> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    debugVisualPreview("[visual-preview:nano] skipped: OPENAI_API_KEY missing");
    return parsePreviewFrontmatter(markdown);
  }

  const client = new OpenAI({ apiKey: key });
  const model = process.env.OPENAI_VISUAL_MODEL ?? "gpt-5.4-nano";

  try {
    debugVisualPreview("[visual-preview:nano] request", { model, markdownLength: markdown.length });

    const completion = await client.chat.completions.parse({
      model,
      messages: [
        {
          role: "system",
          content:
            "Convert the complete DESIGN.md file into compact visual args JSON for the app preview. Read the whole document, including YAML front matter and Markdown guidance. Extract colors, typography, spacing, rounded values, and concise `dos` and `donts` arrays when supported by the document. Use px as the base unit for fontSize, spacing, rounded, and letterSpacing. Convert rem/em to px using 16px = 1rem. Sort typography from largest fontSize to smallest. Sort spacing from smallest px value to largest. Keep spacing values consistent: do not mix rem and px. All schema fields are required; use empty strings for unavailable optional typography text fields. Return only data that matches the schema.",
        },
        { role: "user", content: markdown },
      ],
      response_format: zodResponseFormat(VisualArgsSchema, "visual_args"),
      temperature: 0,
      max_completion_tokens: 1200,
    });

    const parsed = completion.choices[0]?.message?.parsed;
    if (!parsed) {
      debugVisualPreview("[visual-preview:nano] skipped: no parsed output");
      return parsePreviewFrontmatter(markdown);
    }

    debugVisualPreview("[visual-preview:nano]", JSON.stringify(parsed, null, 2));

    return normalizePreviewModel({
      name: parsed.name,
      description: parsed.description ?? "",
      colors: parsed.colors,
      typography: parsed.typography,
      spacing: parsed.spacing,
      rounded: parsed.rounded,
      dos: parsed.dos,
      donts: parsed.donts,
    });
  } catch (error) {
    debugVisualPreview(
      "[visual-preview:nano] failed:",
      error instanceof Error ? error.message : String(error),
    );
    return parsePreviewFrontmatter(markdown);
  }
}
