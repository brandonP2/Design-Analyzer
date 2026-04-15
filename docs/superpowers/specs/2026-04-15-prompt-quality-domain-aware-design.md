# Prompt Quality — Domain-Aware Generation

**Date:** 2026-04-15
**Status:** Approved

---

## Problem

Generated redesign prompts are too generic. CHANGE items suggest surface-level tweaks (scroll animations, minor polish) instead of structural improvements. The system treats all sites the same regardless of type — an e-commerce store and a SaaS landing page get identical advice framing.

Two root causes:
1. No domain awareness — the prompt LLM doesn't know what type of site it's analyzing or what that site type needs to improve.
2. Weak CHANGE item requirements — the system prompt doesn't enforce structural depth.

---

## Solution

**Approach B + system prompt hardening:**

1. Add a `classify.ts` tool that detects site type and key elements from the scraped content.
2. Load a domain playbook for the detected site type and inject it into the prompt context.
3. Harden both system prompts to require structural/content/conversion changes and prevent animations-only outputs.

---

## Architecture

The pipeline gets one new step inserted between vision and prompt:

```
extract → lighthouse → vision → [NEW: classify] → prompt
```

`classify` is a fast Haiku call (~200 tokens in/out). It runs sequentially after vision (needs `page_summary`) and adds ~1–2s latency. It never blocks the pipeline — it falls back to `{ siteType: "other", ... }` on any error.

---

## New File: `lib/tools/classify.ts`

### Types

```typescript
export type SiteType = "ecommerce" | "saas" | "portfolio" | "blog" | "agency" | "other";

export interface PageClassification {
  siteType: SiteType;
  keyElements: string[];  // e.g. ["product cards", "cart", "reviews"]
  primaryGoal: string;    // e.g. "sell products"
}
```

### Exported function

```typescript
export async function classifyPage(
  pageSummary: string,
  markdown: string
): Promise<PageClassification>
```

- Uses `claude-haiku-4-5-20251001` with `max_tokens: 256`
- Sends `page_summary + markdown.slice(0, 1500)` as user input
- Returns parsed JSON matching `PageClassification`
- On any error (parse failure, API error, timeout): returns `{ siteType: "other", keyElements: [], primaryGoal: "improve design" }` — never throws

---

## New File: `data/domain-playbooks.ts`

Maps each `SiteType` to a `DomainPlaybook`:

```typescript
interface DomainPlaybook {
  priorities: string[];       // high-impact structural improvements for this site type
  required_sections: string[]; // sections that MUST appear in CHANGE or COMPONENTS
}
```

### Playbooks (initial set)

**ecommerce:**
- priorities: product card redesign (image, price hierarchy, add-to-cart), trust signals (reviews, badges, security near checkout), urgency/scarcity (stock levels, limited-time offers), cart & checkout flow (reduce steps, progress indicator), social proof (testimonials, UGC photos, purchase counts)
- required_sections: product cards, cart CTA, trust badges, social proof

**saas:**
- priorities: hero value prop (specific outcome not feature description), pricing table (comparison, recommended tier), social proof (logos, case study metrics, ratings), feature section (benefit-led copy), trial/demo CTA (in nav, low friction)
- required_sections: hero, pricing, social proof, primary CTA

**portfolio:**
- priorities: case study depth (problem→solution→outcome), work grid (visual hierarchy, project type labels), about section (personality + credibility), contact/hire CTA (clear next step)
- required_sections: work showcase, case study structure, contact CTA

**blog:**
- priorities: reading experience (line length, font size, spacing), content discovery (related posts, categories), newsletter/subscription CTA, author credibility section
- required_sections: article layout, newsletter CTA, content discovery

**agency:**
- priorities: services clarity (what you do and for whom), portfolio proof (outcomes not just visuals), pricing/process transparency, lead generation form
- required_sections: services section, portfolio, contact/lead form

**other:**
- priorities: clear value proposition, primary CTA prominence, content hierarchy, trust signals
- required_sections: hero, primary CTA

---

## Changes to `lib/tools/prompt.ts`

### 1. `generatePrompt` signature

Add `classification: PageClassification` parameter:

```typescript
export async function generatePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  markdown: string,
  branding: BrandingProfile | null,
  links: string[],
  classification: PageClassification  // NEW
): Promise<PromptResult>
```

### 2. `buildUserInput` and `buildClaudeUserInput`

Both receive `classification: PageClassification` and inject a `domainBlock`:

```
SITE TYPE: ecommerce
PRIMARY GOAL: sell products
KEY ELEMENTS: product cards, cart, reviews
DOMAIN PRIORITIES:
- Product card redesign — image quality, price hierarchy, add-to-cart prominence
- Trust signals — reviews count, star ratings, security badges near checkout
- Urgency/scarcity — stock levels, limited-time offers above the fold
- Cart and checkout flow — reduce steps, surface progress indicator
- Social proof — testimonials, purchase counts, UGC photos
```

The `domainBlock` is inserted after the scores block, before PRIORITY FIXES. `required_sections` are appended to the block as: `REQUIRED IN OUTPUT: product cards, cart CTA, trust badges, social proof` — the system prompt instructs the LLM that each of these must appear in either a CHANGE item or a COMPONENTS TO UPGRADE entry.

### 3. System prompt hardening

Both `buildSystemPrompt()` and `buildClaudeSystemPrompt()` receive an updated CHANGE rule:

> "CHANGE items must include structural, content, and conversion improvements — things that require rebuilding a section or rewriting content. Animations and visual polish are allowed but cannot represent more than 1–2 items. Every prompt must have at least 3 items that address structure, hierarchy, content, or conversion."

---

## Changes to `app/api/analyze/route.ts`

1. Import `classifyPage` from `lib/tools/classify`
2. After `analyzeWithVision` completes, call `classifyPage(visionResult.page_summary, extractResult.markdown)`
3. Pass `classification` to `generatePrompt`
4. Reuse the existing `prompt` progress step message — no new SSE step needed (classify is fast and internal)

---

## Acceptance Criteria

- [ ] `classifyPage` returns the correct `siteType` for an e-commerce URL test
- [ ] The domain playbook block appears in the Haiku/Sonnet context (visible in debug logs)
- [ ] Generated CHANGE items for an e-commerce site include at least one of: product cards, trust signals, social proof, cart flow
- [ ] Generated CHANGE items include ≥3 structural/content changes (not just animations)
- [ ] `classifyPage` error does not break the pipeline — falls back to `other` silently
- [ ] TypeScript builds without errors (`npx tsc --noEmit`)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `lib/tools/classify.ts` | Create |
| `data/domain-playbooks.ts` | Create |
| `lib/tools/prompt.ts` | Modify — add classification param, domain block, system prompt hardening |
| `app/api/analyze/route.ts` | Modify — call classify, thread classification through |
| `lib/tools/index.ts` | Modify — re-export from classify.ts |
