import { FirecrawlClient, type BrandingProfile } from "@mendable/firecrawl-js";

export type { BrandingProfile };

export interface ExtractResult {
  markdown: string;
  screenshotUrl: string;
  /** null when Firecrawl cannot extract branding (CSP-blocked pages, network errors, unsupported page type). */
  branding: BrandingProfile | null;
  links: string[];
}

export async function extractWebsite(url: string): Promise<ExtractResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const client = new FirecrawlClient({ apiKey });

  const scrapeOptions = {
    // NOTE: "branding" adds ~1-3 s latency per scrape. When branding is null,
    // fall back to Lighthouse data for colors/fonts (see CLAUDE.md: Objective Metrics First).
    formats: [{ type: 'screenshot' as const, fullPage: true }, "markdown" as const, "links" as const, "branding" as const],
    onlyMainContent: true,
    waitFor: 1500,
    maxAge: 300_000,
    actions: [
      // Dismiss cookie banners silently — optional chaining means no error if element absent
      { type: 'executeJavascript' as const, script: "document.querySelector(\"[id*='accept'], [class*='accept-all'], [data-cookiebanner] button\")?.click();" },
      { type: 'wait' as const, milliseconds: 500 },
    ],
  };

  let result;
  try {
    result = await client.scrape(url, scrapeOptions);
  } catch (err) {
    await new Promise(r => setTimeout(r, 2000));
    result = await client.scrape(url, scrapeOptions);
  }

  if (!result?.screenshot && !result?.markdown) {
    throw new Error("Firecrawl returned an empty result");
  }

  return {
    markdown: result.markdown ?? "",
    screenshotUrl: result.screenshot ?? "",
    branding: result.branding ?? null,
    links: result.links ?? [],
  };
}
