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

**User-provided site type + domain playbooks + system prompt hardening:**

1. Add a `siteType` field to the UI preferences panel — the user selects their site type before running the analysis.
2. Thread `siteType` through the API schema and into the prompt generation step.
3. Load a domain playbook for the selected site type and inject it into the Haiku/Sonnet context.
4. Harden both system prompts to require structural/content/conversion changes.

No LLM classification step needed. The user knows their site better than any classifier, and this eliminates an extra API call entirely.

---

## Architecture

No pipeline changes. `siteType` flows through preferences like `platform` already does:

```
extract → lighthouse → vision → prompt
                                  ↑
                     siteType from UI preferences (user-provided)
```

---

## Type

```typescript
export type SiteType = "ecommerce" | "saas" | "portfolio" | "blog" | "agency" | "other";
```

---

## New File: `data/domain-playbooks.ts`

Maps each `SiteType` to a `DomainPlaybook`:

```typescript
interface DomainPlaybook {
  priorities: string[];        // high-impact structural improvements for this site type
  required_sections: string[]; // must appear in either a CHANGE item or COMPONENTS TO UPGRADE entry
}

export const DOMAIN_PLAYBOOKS: Record<SiteType, DomainPlaybook> = { ... }
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

## Changes to `app/page.tsx`

Add a "Site type" dropdown to the existing preferences panel (alongside style/goal/tone/platform/keep):

```
What type of website is this?
[ E-commerce ▾ ]   (options: E-commerce, SaaS, Portfolio, Blog, Agency, Other)
```

- Defaults to "other"
- Label: "Site type" — no explanation needed, it's self-evident
- Value sent in the `preferences.siteType` field of the POST body

---

## Changes to `app/api/analyze/route.ts`

Add `siteType` to the Zod preferences schema:

```typescript
siteType: z.enum(["ecommerce", "saas", "portfolio", "blog", "agency", "other"]).default("other"),
```

Pass it through to `generatePrompt` via `preferences`.

---

## Changes to `lib/tools/prompt.ts`

### 1. `generatePrompt` preferences type

```typescript
preferences: {
  style?: string;
  goal?: string;
  tone?: string;
  keep?: string[];
  platform?: string;
  siteType?: SiteType;  // NEW
}
```

### 2. `buildUserInput` and `buildClaudeUserInput`

Both look up the playbook for `preferences.siteType` (defaulting to `"other"`) and inject a `domainBlock` after the scores block, before PRIORITY FIXES:

```
SITE TYPE: ecommerce
DOMAIN PRIORITIES:
- Product card redesign — image quality, price hierarchy, add-to-cart prominence
- Trust signals — reviews count, star ratings, security badges near checkout
- Urgency/scarcity — stock levels, limited-time offers above the fold
- Cart and checkout flow — reduce steps, surface progress indicator
- Social proof — testimonials, purchase counts, UGC photos
REQUIRED IN OUTPUT: product cards, cart CTA, trust badges, social proof
```

The system prompt instructs the LLM that each `required_sections` entry must appear in either a CHANGE item or a COMPONENTS TO UPGRADE entry.

### 3. System prompt hardening

Both `buildSystemPrompt()` and `buildClaudeSystemPrompt()` get the CHANGE rule updated:

> "CHANGE items must include structural, content, and conversion improvements — things that require rebuilding a section or rewriting content. Animations and visual polish are allowed but cannot represent more than 1–2 items. Every prompt must have at least 3 items that address structure, hierarchy, content, or conversion."

---

## Acceptance Criteria

- [ ] "Site type" dropdown appears in the preferences panel with 6 options, defaulting to "Other"
- [ ] `siteType` is validated in the API schema and threads through to `generatePrompt`
- [ ] The domain playbook block appears in the LLM context for a non-"other" site type
- [ ] Generated CHANGE items for an e-commerce analysis include at least one of: product cards, trust signals, social proof, cart flow
- [ ] Generated CHANGE items include ≥3 structural/content changes (not just animations)
- [ ] TypeScript builds without errors (`npx tsc --noEmit`)

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `data/domain-playbooks.ts` | Create |
| `app/page.tsx` | Modify — add siteType dropdown to preferences panel |
| `app/api/analyze/route.ts` | Modify — add siteType to Zod schema, thread through |
| `lib/tools/prompt.ts` | Modify — add siteType to preferences, domain block, system prompt hardening |
