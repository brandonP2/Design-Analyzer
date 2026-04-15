# Design Analyzer AI

> Paste a URL, get an AI-generated redesign prompt ready to paste into Lovable, Bolt, or Claude.

## Overview

Design Analyzer AI scrapes any public website, scores its design across 7 categories (colors, typography, spacing, CTAs, structure, accessibility, user flow), and produces a specific, actionable redesign prompt — complete with exact hex values, CSS properties, and component suggestions from 21st.dev. It targets developers who want to improve an existing site without doing the design analysis themselves.

## Architecture

```
Browser → POST /api/analyze (SSE stream)
              │
              ├── extractWebsite()   ← Firecrawl: full-page screenshot + markdown + branding tokens
              ├── runLighthouse()    ← Headless Chrome: contrast ratios, a11y violations  (parallel)
              │
              ├── analyzeWithVision()  ← Claude Vision (Sonnet): scores + findings per category
              │
              └── generatePrompt()    ← Claude Haiku: final redesign prompt
                      ├── Lovable / Bolt → structured paste-and-go prompt
                      └── Claude         → build-session brief + skills appendix
```

**Key files:**

| Path | Role |
|------|------|
| `app/api/analyze/route.ts` | SSE endpoint — orchestrates the pipeline, streams progress events |
| `lib/tools/extract.ts` | Firecrawl scrape — full-page screenshot, clean markdown, brand tokens |
| `lib/tools/lighthouse.ts` | Lighthouse runner — accessibility score, contrast failures |
| `lib/tools/vision.ts` | Claude Vision analysis — 7-category scoring with per-rubric anchors |
| `lib/tools/prompt.ts` | Prompt generation — `buildUserInput`, `buildClaudeUserInput`, `selectSkillsForScores` |
| `data/components.json` | 21st.dev component catalogue used for component suggestions |
| `data/prompt-example.md` | Few-shot example injected into the Haiku system prompt |

## Setup

```bash
npm install

# Required environment variables
FIRECRAWL_API_KEY=...       # mendable/firecrawl-js — scraping + screenshots
ANTHROPIC_API_KEY=...       # Claude Vision (Sonnet) + prompt generation (Haiku)
# Optional — Lighthouse runs via the local binary; no extra key needed

npm run dev     # localhost:3000
npm run build   # production build
npm run start   # serve production build
```

> Lighthouse requires Chrome/Chromium to be installed. On Vercel, it is available by default.

## API Reference

### `POST /api/analyze`

Streams Server-Sent Events. Each event is `data: <JSON>\n\n`.

**Request body:**
```json
{
  "url": "https://example.com",
  "preferences": {
    "style":    "modern" | "minimal" | "bold" | "playful",
    "goal":     "conversion" | "branding" | "ux" | "clean",
    "tone":     "professional" | "playful" | "serious",
    "keep":     ["Colors", "Typography"],   // max 10 items, preserve from redesign
    "platform": "lovable" | "bolt" | "claude"
  }
}
```

**Event types:**

| `type` | Payload | When |
|--------|---------|------|
| `progress` | `{ step, message }` | After each pipeline stage |
| `result` | `{ url, screenshotUrl, lighthouse, analysis, prompt, branding }` | On success |
| `error` | `{ message }` | On failure |

**`result.analysis` shape** — `VisionResult`:
```ts
{
  page_summary: string
  scores: { colors, typography, spacing, cta, structure, accessibility, user_flow, overall }  // 0–100
  findings: Record<category, { issues: string[], suggestions: string[] }>
  improvements_ranked: Array<{ priority, category, issue, impact, effort, fix }>
  summary: string
}
```

### Exported utility — `selectSkillsForScores(scores: DesignScore): SkillSuggestion[]`

Pure function. Maps score thresholds to recommended Claude skills (`/ui-ux-pro-max`, `/design-html`, etc.). Used to build the skills appendix in Claude-mode prompts. Safe to unit-test in isolation.

## Decision Log

- **Approach B (text prompt, no HTML mockup)** — Generating an HTML/CSS mockup via Playwright was scrapped early. The value is in the specificity of the text prompt, not a rendered preview that would require hosting and increase latency significantly.
- **Firecrawl `branding` format over manual CSS parsing** — SDK 4.18.1 exports `BrandingProfile` with computed colors, fonts, typography scale, and spacing tokens from a single scrape call. Avoids fragile CSS regex and reduces pipeline steps.
- **Per-category scoring rubrics (25/50/75/100)** — An open-ended scoring prompt caused Claude to anchor on WCAG metrics only. Rubrics enforce both technical and aesthetic axes; a site cannot score above 75 on compliance alone if it looks generic.
- **`keep[]` sanitized at every injection site** — User-controlled strings injected into Claude prompts. Each function that interpolates `keep[]` applies `.replace(/[\r\n]/g, " ")` independently rather than trusting upstream mutation.
- **`fullPage: true` screenshot** — Viewport-only screenshots mean Claude Vision sees only the hero. Full-page capture exposes features, pricing, footer, and social proof — the sections most likely to need redesign work.
- **`markdown` format replaces `rawHtml` + regex** — Firecrawl's markdown output is clean, LLM-optimised, ~5–10× smaller than rawHtml, and captures CTAs with Tailwind utility classes that the old `class="btn"` regex missed entirely.
- **Claude platform mode** — Output changes from a paste-and-forget prompt to a conversation brief with skill invocations. The skills appendix is code-generated from score thresholds after the LLM call, not LLM-generated, keeping it deterministic.
