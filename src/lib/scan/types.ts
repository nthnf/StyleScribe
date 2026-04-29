export type DesignEvidence = {
  sourceUrl: string;
  pagesScanned: string[];
  cssBytesRead: number;
  htmlBytesRead: number;
  colors: Array<{ value: string; count: number; properties: string[]; selectors: string[] }>;
  fonts: Array<{ family: string; count: number; selectors: string[] }>;
  fontSizes: Array<{ value: string; count: number; selectors: string[] }>;
  spacing: Array<{ value: string; count: number; properties: string[] }>;
  radii: Array<{ value: string; count: number; selectors: string[] }>;
  shadows: Array<{ value: string; count: number; selectors: string[] }>;
  components: {
    buttons: Array<Record<string, string>>;
    cards: Array<Record<string, string>>;
    inputs: Array<Record<string, string>>;
  };
  pages: Array<{
    url: string;
    title: string;
    metaDescription: string;
    buttons: Array<Record<string, string>>;
    headings: string[];
    classAttributes: string[];
    links: Array<{ text: string; href: string; score: number }>;
  }>;
};

export type CandidateLink = { url: string; text: string; score: number };
