import { FirecrawlClient, type BrandingProfile } from "@mendable/firecrawl-js";

export type { BrandingProfile };

export interface ExtractResult {
  html: string;
  screenshotUrl: string;
  /** null when Firecrawl cannot extract branding (CSP-blocked pages, network errors, unsupported page type). */
  branding: BrandingProfile | null;
}

export async function extractWebsite(url: string): Promise<ExtractResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const client = new FirecrawlClient({ apiKey });

  const result = await client.scrape(url, {
    // NOTE: "branding" adds ~1-3 s latency per scrape. When branding is null,
    // fall back to Lighthouse data for colors/fonts (see CLAUDE.md: Objective Metrics First).
    formats: ["rawHtml", "screenshot", "branding"],
  });

  if (!result?.rawHtml && !result?.screenshot) {
    throw new Error("Firecrawl returned an empty result");
  }

  return {
    html: result.rawHtml ?? "",
    screenshotUrl: result.screenshot ?? "",
    branding: result.branding ?? null,
  };
}
