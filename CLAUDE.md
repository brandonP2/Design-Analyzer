# Design Analyzer AI - Project Guidelines

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
```

## Project Overview

Herramienta serverless para analizar sitios web y generar prompts de rediseño para plataformas como Lovable.

## Tech Stack

- Frontend/Backend: Next.js (App Router), TypeScript, React.
- Styling: Tailwind CSS, shadcn/ui.
- Deploy: Vercel Pro.
- AI: `@anthropic-ai/sdk`, validation with `zod`.

## Core Architecture (Approach B - DO NOT DEVIATE)

- **No HTML/CSS Mockups:** Do not attempt to generate or render visual HTML/CSS mockups (no Playwright). The value is in the text prompt.
- **Data Flow:**
  1. Parallel execution: Firecrawl (extract HTML/screenshot) + Google Lighthouse via Browserless.io (objective metrics).
  2. Claude Vision (Opus/Sonnet 3.5): Analyzes screenshot + Lighthouse JSON to generate findings.
  3. Claude LLM: Generates the optimized redesign prompt for Lovable.
- **Objective Metrics First:** Always rely on Lighthouse for contrast ratios, font sizes, and accessibility scores.

## Coding Standards

- Use strict TypeScript.
- Keep the 5-tool boundaries strict. One file per tool.
- Never write API keys in code; always use environment variables.

## Key Decisions (V2 Features — 2026-04-13)

| Decision | Rationale |
|----------|-----------|
| Use Firecrawl `branding` format instead of manual CSS parsing | SDK 4.18.1 already exports `BrandingProfile` — returns colors, fonts, typography, spacing from a single scrape call. See `docs/superpowers/specs/2026-04-13-design-analyzer-features-design.md` |
| Per-category scoring rubrics (25/50/75/100) in vision.ts | Old prompt was open-ended, Claude anchored on WCAG metrics only. Rubrics enforce both technical + aesthetic axes — a site can't score >75 on compliance alone if it looks generic |
| `keep[]` array lets users preserve design elements | Passed to vision.ts (scoring doesn't penalize kept categories) and prompt.ts (KEEP section references preserved items) |
| Claude-specific prompt mode (`platform: "claude"`) | Output changes from paste-and-forget to a Claude conversation brief with skill invocations. Dynamic skills appendix based on score thresholds |
| `selectSkillsForScores()` is a pure, exported function | Deterministic mapping from scores → skills list. Appendix is code-generated after LLM output, not LLM-generated |
| Zod validates `keep` items with `.min(1).max(64).max(10)` + newline sanitization in vision.ts | Prevents prompt injection via `keep` array (user-controlled input injected into Claude prompt) |
| `keep[]` must be sanitized at every LLM injection point, not just once | vision.ts sanitizes for its own prompt, but `preferences.keep` is the raw array — buildUserInput and buildClaudeUserInput each apply `.replace(/[\r\n]/g, " ")` independently |
| Use `TextBlock` type guard from SDK, not `as` casts | `(b): b is TextBlock => b.type === "text"` replaces `b as { type: "text"; text: string }` — two instances in prompt.ts |
| Branding UI card must gate on filtered results, not just `branding.colors` existing | Firecrawl returns non-hex values (rgb, CSS vars); filter to `#`-prefixed, only render card if filtered entries > 0 or fonts > 0 |

## Patterns

- **Subagent-driven development** works well for this repo: dispatch one implementer per plan task, then run spec compliance + code quality reviews as separate agents. Two-stage review caught 5 real bugs (keep sanitization gap, unsafe SDK cast, empty branding card, stale PromptBox header, keep[] dropped in Lovable path) that would have shipped otherwise.
- **Sanitize user input at every injection site** — don't assume upstream code mutated the original array. Each function that interpolates `keep[]` into a prompt must sanitize independently.

## Firecrawl Improvements

See `firecrawl-improvements.md` — 10 prioritized improvements to Firecrawl usage, covering full-page screenshots, branding data gaps, markdown format, caching, and more.

## Next.js Version Note

This project uses Next.js 16. Read `node_modules/next/dist/docs/` before writing code — APIs and conventions may differ from older versions. Heed deprecation notices.
