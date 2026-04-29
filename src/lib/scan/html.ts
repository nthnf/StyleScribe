import * as cheerio from "cheerio";
import { canonicalizeUrl } from "./url";

export function extractHtmlFacts(html: string, baseUrl: string) {
  const $ = cheerio.load(html);

  const stylesheets = $('link[rel="stylesheet"]')
    .map((_, el) => {
      const href = $(el).attr("href");
      if (!href) return null;
      return canonicalizeUrl(href, baseUrl);
    })
    .get()
    .filter((href): href is string => Boolean(href));

  const inlineStyles = $("style")
    .map((_, el) => $(el).html() || "")
    .get();

  const buttons = $("button, a, input[type='button'], input[type='submit']")
    .slice(0, 30)
    .map((_, el) => ({
      tag: el.tagName,
      text: $(el).text().trim().slice(0, 80),
      className: $(el).attr("class") || "",
      href: $(el).attr("href") || "",
    }))
    .get();

  const links = $("a")
    .slice(0, 80)
    .map((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().replace(/\s+/g, " ").slice(0, 80);
      return { href, text };
    })
    .get();

  const inputs = $("input, textarea, select")
    .slice(0, 30)
    .map((_, el) => ({
      tag: el.tagName,
      type: $(el).attr("type") || "",
      placeholder: $(el).attr("placeholder") || "",
      className: $(el).attr("class") || "",
    }))
    .get();

  const headings = $("h1, h2, h3, h4, h5, h6")
    .slice(0, 40)
    .map((_, el) => $(el).text().trim().replace(/\s+/g, " ").slice(0, 120))
    .get();

  const classAttributes = $(`[class]`)
    .slice(0, 400)
    .map((_, el) => ($(el).attr("class") || "").trim())
    .get()
    .filter(Boolean);

  return {
    title: $("title").text().trim(),
    metaDescription: $('meta[name="description"]').attr("content") || "",
    stylesheets,
    inlineStyles,
    buttons,
    links,
    inputs,
    headings,
    classAttributes,
    classNames: Array.from(
      new Set(
        $("[class]")
          .slice(0, 150)
          .map((_, el) => ($(el).attr("class") || "").trim())
          .get()
          .filter(Boolean),
      ),
    ),
  };
}
