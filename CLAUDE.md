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

## Next.js Version Note

This project uses Next.js 16. Read `node_modules/next/dist/docs/` before writing code — APIs and conventions may differ from older versions. Heed deprecation notices.
