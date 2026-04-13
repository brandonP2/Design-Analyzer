import { FirecrawlClient, type BrandingProfile } from "@mendable/firecrawl-js";

export type { BrandingProfile };

export interface ExtractResult {
  html: string;
  screenshotUrl: string;
  branding: BrandingProfile | null;
}

export async function extractWebsite(url: string): Promise<ExtractResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const client = new FirecrawlClient({ apiKey });

  const result = await client.scrape(url, {
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
