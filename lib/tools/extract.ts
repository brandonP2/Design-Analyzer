import { FirecrawlClient } from "@mendable/firecrawl-js";

export interface ExtractResult {
  html: string;
  screenshotUrl: string;
}

export async function extractWebsite(url: string): Promise<ExtractResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const client = new FirecrawlClient({ apiKey });

  // FirecrawlClient.scrape returns data directly (no success wrapper)
  const result = await client.scrape(url, {
    formats: ["rawHtml", "screenshot"],
  });

  if (!result?.rawHtml && !result?.screenshot) {
    throw new Error("Firecrawl returned an empty result");
  }

  return {
    html: result.rawHtml ?? "",
    screenshotUrl: result.screenshot ?? "",
  };
}
