/**
 * Spike B — Firecrawl: HTML + screenshot extraction
 *
 * Validates that we receive:
 *   1. A screenshot URL we can pass to Claude Vision
 *   2. Raw HTML for Lighthouse analysis
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/spike-firecrawl.ts [url]
 */

import { FirecrawlClient } from "@mendable/firecrawl-js";

const TEST_URL = process.argv[2] ?? "https://example.com";

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

const apiKey = process.env.FIRECRAWL_API_KEY;

if (!apiKey) {
  console.error(
    "\n❌  Missing FIRECRAWL_API_KEY.\n" +
      "    Add it to .env.local and run:\n" +
      "    npx tsx --env-file=.env.local scripts/spike-firecrawl.ts\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n🔍  Extracting via Firecrawl: ${TEST_URL}\n`);

  const client = new FirecrawlClient({ apiKey });

  const result = await client.scrape(TEST_URL, {
    formats: ["rawHtml", "screenshot"],
  });

  // FirecrawlClient.scrape returns data directly (no success wrapper)
  if (!result || (!result.rawHtml && !result.screenshot)) {
    console.error("❌  Firecrawl returned empty result:", JSON.stringify(result));
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Screenshot
  // ---------------------------------------------------------------------------

  const screenshotUrl: string | undefined = result.screenshot;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  SCREENSHOT");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (screenshotUrl) {
    console.log(`  ✅  URL   : ${screenshotUrl}`);
    console.log(`  Type     : ${screenshotUrl.startsWith("data:") ? "base64 data URI" : "hosted URL"}`);

    // Validate it's a real image URL or a non-empty data URI
    if (screenshotUrl.startsWith("data:image/")) {
      const sizeKb = Math.round(screenshotUrl.length * 0.75 / 1024);
      console.log(`  Size     : ~${sizeKb} KB (base64)`);
    } else {
      // Probe hosted URL
      try {
        const probe = await fetch(screenshotUrl, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
        console.log(`  HTTP     : ${probe.status}`);
        console.log(`  MIME     : ${probe.headers.get("content-type") ?? "unknown"}`);
        const len = probe.headers.get("content-length");
        if (len) console.log(`  Size     : ${Math.round(Number(len) / 1024)} KB`);
      } catch {
        console.log("  (Could not probe URL — may require auth or have CORS restrictions)");
      }
    }
  } else {
    console.log("  ⚠️  No screenshot returned.");
  }

  // ---------------------------------------------------------------------------
  // HTML summary
  // ---------------------------------------------------------------------------

  const html: string | undefined = result.rawHtml;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  HTML");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (html) {
    const sizeKb = Math.round(Buffer.byteLength(html, "utf-8") / 1024);
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i);
    const tagCount = (html.match(/<[a-z][a-z0-9]*/gi) ?? []).length;
    const hasCSS = /<link[^>]+stylesheet/i.test(html) || /<style[\s>]/i.test(html);

    console.log(`  ✅  Size      : ${sizeKb} KB`);
    console.log(`  Title        : ${titleMatch?.[1]?.trim() ?? "(none)"}`);
    console.log(`  Meta desc    : ${metaDesc?.[1]?.trim().slice(0, 80) ?? "(none)"}`);
    console.log(`  HTML tags    : ${tagCount}`);
    console.log(`  Has CSS      : ${hasCSS}`);

    // Print first 300 chars of body content as sanity check
    const bodyContent = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    console.log(`\n  Body preview : "${bodyContent}..."`);
  } else {
    console.log("  ⚠️  No HTML returned.");
  }

  // ---------------------------------------------------------------------------
  // Verdict
  // ---------------------------------------------------------------------------

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  const ready = !!(screenshotUrl && html);
  console.log(`  Ready for Claude Vision pipeline: ${ready ? "✅  YES" : "❌  NO"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main().catch((err) => {
  console.error("❌ ", err instanceof Error ? err.message : err);
  process.exit(1);
});
