# Firecrawl Usage Improvements

Analysis of how `@mendable/firecrawl-js` SDK v4.18.1 is currently used in `lib/tools/extract.ts` and the full pipeline, compared against Firecrawl's actual capabilities.

---

## What We Currently Do

```ts
client.scrape(url, {
  formats: ["rawHtml", "screenshot", "branding"],
})
```

From this we use:
- `rawHtml` → parsed with regex in `prompt.ts:extractHtmlStructure()` to pull headings, CTAs, nav links
- `screenshot` → viewport-only screenshot URL passed to Claude Vision
- `branding` → colors and font families (only in Claude platform mode; **Lovable/Bolt path never receives branding**)

---

## Issues Found

### 1. Viewport-Only Screenshot (Highest Impact)

**Current:** `formats: ["screenshot"]` captures only the visible viewport (~1200×800px).

**Problem:** Claude Vision only analyzes above-the-fold content. Hero, features section, social proof, pricing, and footer are invisible. Scores for `structure`, `user_flow`, `spacing`, and `cta` are based on incomplete visual data — every section below the fold is missed.

**Fix:** Replace `"screenshot"` with `"fullPageScreenshot"` (or request both). Firecrawl stitches the full page height into a single image.

```ts
formats: ["rawHtml", "fullPageScreenshot", "branding"],
// then: result.fullPageScreenshot ?? result.screenshot
```

---

### 2. Branding Data Not Passed to Lovable/Bolt Path

**Current:** `buildUserInput()` in `prompt.ts` (used for Lovable and Bolt platforms) receives no `branding` parameter. Only `buildClaudeUserInput()` gets branding.

**Problem:** The Lovable/Bolt prompt — the primary use case — is generated without any detected brand colors or fonts. Claude Haiku must infer a palette from scratch rather than building on the actual extracted brand.

**File:** `lib/tools/prompt.ts:281` (`buildUserInput` signature) and `prompt.ts:457` (call site).

**Fix:** Add `branding: BrandingProfile | null` to `buildUserInput`, pass it at the call site in `generatePrompt`, and add the same `brandingBlock` already present in `buildClaudeUserInput`.

---

### 3. BrandingProfile Underutilized (Even in Claude Mode)

**Current:** Only these fields are used from `BrandingProfile`:
```
branding.colors.primary
branding.colors.background
branding.colors.textPrimary
branding.fonts[].family
```

**Problem:** Firecrawl's `branding` format also returns:
- `colors.secondary`, `colors.accent`, `colors.border`, `colors.textSecondary`
- `fonts[].weights`, `fonts[].sizes` (actual rendered font sizes)
- `typography` object: modular scale ratios, line heights, letter spacing
- `spacing` tokens: base unit, section padding values

These are exact design tokens extracted from computed CSS — precisely what the prompt LLM needs to build an accurate DESIGN SYSTEM section. Currently the prompt LLM guesses these values from the screenshot.

**Fix:** Expand `brandingBlock` in `buildClaudeUserInput` (and the new `buildUserInput`) to include the full color palette, font weights/sizes, and typography scale from `BrandingProfile`.

---

### 4. rawHtml Parsed with Fragile Regex Instead of Markdown

**Current:** `extractHtmlStructure()` in `prompt.ts` uses regex to extract headings, CTAs (only those with class names containing "btn/cta/button/primary"), and nav links from raw HTML.

**Problems:**
- Misses CTAs that don't have those class names (e.g., Tailwind utility classes like `class="bg-blue-600 px-6 py-3 text-white"`)
- Misses content in shadow DOM or dynamically rendered sections
- Passes noisy rawHtml to the pipeline even though only the regex extracts are used in the prompt

**Fix:** Add `"markdown"` to the `formats` array. Firecrawl's markdown output is clean, LLM-optimized text that already contains all headings, link text, and button labels without regex. Replace `extractHtmlStructure(html)` with direct markdown content in `buildUserInput`.

```ts
formats: ["markdown", "fullPageScreenshot", "branding"],
// result.markdown is clean, structured, ~5-10x smaller than rawHtml
```

---

### 5. No `onlyMainContent` Filter

**Current:** Scrapes the full DOM including `<head>`, cookie banners, chat widgets, analytics scripts, third-party embeds.

**Problem:** `rawHtml` returned to the pipeline contains significant noise. Even the regex parser in `extractHtmlStructure` must wade through irrelevant markup.

**Fix:** Add `onlyMainContent: true` to the scrape options. Firecrawl strips boilerplate and focuses on the page's primary content area — reduces token usage and noise in the LLM context.

```ts
client.scrape(url, {
  formats: ["markdown", "fullPageScreenshot", "branding"],
  onlyMainContent: true,
})
```

---

### 6. No `waitFor` for JS-Rendered SPAs

**Current:** Scrape fires immediately with no wait time.

**Problem:** Many modern sites (React, Next.js, Vue) lazy-load content after the initial render. Firecrawl may capture the loading state or skeleton UI rather than the actual content, leading to incomplete screenshots and missing text.

**Fix:** Add a `waitFor` option (e.g., 1500ms) to allow JS-rendered content to settle before capture. Could be made configurable per-request.

```ts
client.scrape(url, {
  formats: ["markdown", "fullPageScreenshot", "branding"],
  onlyMainContent: true,
  waitFor: 1500,
})
```

---

### 7. No Result Caching by URL

**Current:** Every `POST /api/analyze` call triggers a fresh Firecrawl scrape — even for the same URL analyzed seconds apart.

**Problem:** Wastes credits, adds 3-5 seconds of latency, and makes the experience slow during any "re-run with different preferences" workflow.

**Fix:** Cache the `ExtractResult` keyed by URL in a short-lived in-memory store (or Redis/KV on Vercel) with a TTL of 5-10 minutes. Firecrawl SDK also supports `maxAge` (milliseconds) to reuse server-side cached content.

```ts
client.scrape(url, {
  formats: [...],
  maxAge: 300_000, // 5 min — use Firecrawl's own cache
})
```

---

### 8. No Handling for Cookie Consent Walls

**Current:** No interaction with the page before scraping.

**Problem:** Many EU/GDPR sites show a cookie consent modal that blocks the main content. Firecrawl will capture the blurred/overlaid UI, not the actual design. Screenshots will show the consent wall instead of the site.

**Fix:** Use Firecrawl's `actions` option (JS execution pre-scrape) to dismiss common cookie consent patterns, or use the `interact` API to click "Accept" before capturing the screenshot.

```ts
client.scrape(url, {
  formats: ["markdown", "fullPageScreenshot", "branding"],
  actions: [
    { type: "click", selector: "[id*='accept'], [class*='accept-all'], button[data-cookiebanner]" },
    { type: "wait", milliseconds: 500 },
  ],
})
```

---

### 9. `links` Format Not Used for Nav Analysis

**Current:** Nav links are extracted via regex on rawHtml — brittle and limited.

**Fix:** Adding `"links"` to formats gives a clean array of all `{ href, text }` pairs on the page. Could replace the nav-regex in `extractHtmlStructure` and also provide richer data for scoring `user_flow` (number of nav items, dead-end detection).

---

### 10. No Retry on Transient Failures

**Current:** If Firecrawl returns `null` for rawHtml and screenshot, the route throws immediately.

**Problem:** Firecrawl occasionally returns empty results on first attempt due to cold-start or network hiccups. The user sees an error when a single retry would succeed.

**Fix:** Wrap the scrape in a simple retry (1-2 attempts, 1-2s backoff) before throwing.

---

## Priority Order

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | Full-page screenshot (`fullPageScreenshot`) | Very High — fixes blind analysis of 80%+ of page content | Low — 1 line change |
| 2 | Pass branding to Lovable/Bolt `buildUserInput` | High — primary use case missing brand data | Low — 3 line change |
| 3 | Use `markdown` format, drop rawHtml regex | High — more reliable content extraction | Low-Medium |
| 4 | Expand `BrandingProfile` utilization | High — exact design tokens replace LLM guessing | Medium |
| 5 | Add `onlyMainContent: true` | Medium — less noise in LLM context | Low — 1 line |
| 6 | Add `waitFor` for SPA rendering | Medium — fixes blank screenshots on JS-heavy sites | Low — 1 line |
| 7 | URL-level result caching | Medium — UX + cost saving | Medium |
| 8 | Cookie consent wall handling | Medium — affects EU/GDPR sites significantly | Medium |
| 9 | Use `links` format for nav extraction | Low — marginal improvement over regex | Low |
| 10 | Retry on transient failures | Low — resilience improvement | Low |

---

## Files to Modify

- `lib/tools/extract.ts` — items 1, 3, 4, 5, 6, 7, 8, 9, 10
- `lib/tools/prompt.ts` — items 2, 3, 4, 9 (update `buildUserInput` signature + `extractHtmlStructure`)
