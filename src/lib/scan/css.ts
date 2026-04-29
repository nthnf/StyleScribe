import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { formatHex, parse as parseColor } from "culori";

const DESIGN_PROPS = new Set([
  "color",
  "background",
  "background-color",
  "border-color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "gap",
  "row-gap",
  "column-gap",
  "border-radius",
  "box-shadow",
]);

export function toHexColor(value: string) {
  const parsed = parseColor(value);
  return parsed ? formatHex(parsed) : null;
}

export function resolveCssVar(value: string, vars: Map<string, string>) {
  return value.replace(/var\((--[^),\s]+)(?:,[^)]+)?\)/g, (_, name) => {
    return vars.get(name) || `var(${name})`;
  });
}

function normalizeFontFamily(value: string) {
  return value
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .filter((part) => !/^var\(--/i.test(part))
    .filter((part) => !/^(ui-sans-serif|ui-serif|ui-monospace|system-ui|sans-serif|serif|monospace|inherit|initial|unset)$/i.test(part));
}

export function extractColorsFromValue(value: string) {
  const colors: string[] = [];
  const parsed = valueParser(value);

  parsed.walk((node) => {
    if (node.type === "word" && node.value.startsWith("#")) colors.push(node.value);

    if (node.type === "function") {
      const fn = node.value.toLowerCase();
      if (["rgb", "rgba", "hsl", "hsla", "oklch", "lab", "color"].includes(fn)) {
        colors.push(valueParser.stringify(node));
      }
    }
  });

  return colors;
}

export function parseCssFacts(css: string, selectors: string[] = [], limits = { maxColors: 24 }) {
  const root = postcss.parse(css);
  const vars = new Map<string, string>();
  const colors = new Map<string, { value: string; count: number; properties: Set<string>; selectors: Set<string> }>();
  const fonts: Array<{ family: string; selectors: string[] }> = [];
  const fontSizes: Array<{ value: string; selectors: string[] }> = [];
  const spacing: Array<{ value: string; properties: string[] }> = [];
  const radii: Array<{ value: string; selectors: string[] }> = [];
  const shadows: Array<{ value: string; selectors: string[] }> = [];

  root.walkDecls((decl) => {
    if (decl.prop.startsWith("--")) vars.set(decl.prop, decl.value);
  });

  root.walkRules((rule) => {
    const ruleSelectors = rule.selector ? [rule.selector] : selectors;
    rule.walkDecls((decl) => {
      const value = resolveCssVar(decl.value, vars);
      if (!DESIGN_PROPS.has(decl.prop)) return;

      if (["color", "background", "background-color", "border-color"].includes(decl.prop)) {
        for (const extracted of extractColorsFromValue(value)) {
          const normalized = toHexColor(extracted);
          if (!normalized) continue;

          const entry = colors.get(normalized) ?? {
            value: normalized,
            count: 0,
            properties: new Set<string>(),
            selectors: new Set<string>(),
          };

          entry.count += 1;
          entry.properties.add(decl.prop);
          for (const selector of ruleSelectors) entry.selectors.add(selector);
          colors.set(normalized, entry);
        }
      }

      if (decl.prop === "font-family") {
        const normalized = normalizeFontFamily(value);
        const family = normalized.length > 0 ? normalized.join(",") : value.replace(/['"]/g, "");
        fonts.push({ family, selectors: ruleSelectors });
      }
      if (decl.prop === "font-size") fontSizes.push({ value, selectors: ruleSelectors });
      if (decl.prop.startsWith("padding") || decl.prop.startsWith("margin") || decl.prop.includes("gap")) {
        spacing.push({ value, properties: [decl.prop] });
      }
      if (decl.prop === "border-radius") radii.push({ value, selectors: ruleSelectors });
      if (decl.prop === "box-shadow") shadows.push({ value, selectors: ruleSelectors });
    });
  });

  return {
    colors: Array.from(colors.values())
      .sort((a, b) => b.count - a.count || b.properties.size - a.properties.size || b.selectors.size - a.selectors.size)
      .slice(0, limits.maxColors)
      .map((item) => ({
        value: item.value,
        properties: Array.from(item.properties),
        selectors: Array.from(item.selectors),
      })),
    fonts,
    fontSizes,
    spacing,
    radii,
    shadows,
  };
}
