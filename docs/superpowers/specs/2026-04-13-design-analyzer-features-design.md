# Design Analyzer AI — Feature Design Spec
**Date:** 2026-04-13
**Status:** Approved
**Agents:** 3 sequential (data layer → analysis layer → output layer)

---

## Overview

Three new features shipped across three sequential Claude agents. Each agent owns one layer of the existing pipeline:

```
Agent 1: extract.ts  →  Agent 2: vision.ts  →  Agent 3: prompt.ts
(Data Layer)             (Analysis Layer)         (Output Layer)
```

Dependencies are linear: Agent 1's branding data feeds Agent 2's scoring context, and Agent 2's keep-aware findings feed Agent 3's prompt generation.

---

## Agent 1 — Data Layer: Firecrawl Upgrade + "What to Keep" UI

### Firecrawl upgrade (`lib/tools/extract.ts`)

**Current state:** requests only `rawHtml` + `screenshot`.

**Change:** add `branding` to the formats array.

The `branding` format returns a `BrandingProfile` object with:
- `colors` — primary, secondary, accent, background, textPrimary, textSecondary
- `fonts` — array of font family names
- `typography` — fontFamilies (primary, heading, code), fontSizes (H1–H3, body), fontWeights
- `spacing` — baseUnit (px), borderRadius
- `components` — buttonPrimary, buttonSecondary styles
- `colorScheme` — "light" | "dark"
- `logo` — URL

**Interface changes:**
```typescript
// ExtractResult gains:
branding: BrandingProfile | null  // null if Firecrawl couldn't extract it
```

**Note:** Screenshot URLs expire after 24h (corrects ARCHITECTURE.md which said 7 days).

### "What to keep" UI step (`app/page.tsx`)

A collapsible preferences panel shown between URL input and "Start Analysis". Checkboxes show generic labels — no pre-fetch required, Firecrawl API key stays server-side. The `branding` extraction runs during the main analysis and enriches the analysis and prompt generation internally.

**UI structure:**
```
What do you want to keep from your current design?
(leave unchecked = open to changes)

[ ] Typography — keep your current fonts and type scale
[ ] Color palette — keep your current colors
[ ] Spacing rhythm — keep your current spacing system
[ ] Overall structure — don't change the layout
[ ] Custom: [text input]
```

Checked items become a `keep: string[]` array. Example: `["typography", "colors", "custom: keep the hero image position"]`.

Note: branding values detected by Firecrawl appear in the analysis results for reference, so the user can see what was found and use that information on subsequent analyses.

### API schema change (`app/api/analyze/route.ts`)

Add `keep` to the Zod request body schema:
```typescript
keep: z.array(z.string()).optional().default([])
```

Thread `keep` through to `analyzeWithVision()` and `generatePrompt()`.

### Acceptance criteria
- [ ] `ExtractResult.branding` is populated for a real URL test
- [ ] Branding data is visible in the analysis results (user can see what was detected)
- [ ] `keep` array reaches `vision.ts` and `prompt.ts` via preferences
- [ ] Analysis still completes if `branding` is null

---

## Agent 2 — Analysis Layer: Scoring Rebalance (Human vs Machine)

### Problem

Current `vision.ts` system prompt defines 7 categories but provides no rubrics for what each score level means. Claude anchors on the most legible signals (WCAG violations, font sizes) because they're checkable from a screenshot. The result: sites can score well by passing technical checks while looking generic, or get penalized for intentional aesthetic choices.

### Fix: per-category scoring rubrics

Replace the current open-ended scoring instruction with a reference table. Each category defines thresholds on two axes: technical (measurable) and aesthetic (human quality signal). Score = intersection of both.

**Colors**
- `25` — contrast failures present AND palette feels random or default
- `50` — contrast passes technically, palette is generic (default blues/grays, no color story)
- `75` — contrast passes, palette is intentional and consistent, but lacks personality
- `100` — 7:1+ body text contrast, 4.5:1+ all UI elements, 60/30/10 distribution (dominant/secondary/accent), max 5 palette colors, clear HSL relationship between colors, not random hex picks

**Typography**
- `25` — default system font or illegible sizes, no hierarchy
- `50` — legible, consistent, but forgettable — looks like every AI-generated site
- `75` — clear hierarchy, good scale, feels considered
- `100` — modular scale (1.25× or 1.333× ratio between steps), H1 40–56px, H2 28–36px, body 16–18px, line-height 1.5–1.65 body, letter-spacing −0.02em to −0.04em on headings, max 2 font families with clear semantic roles

**Spacing**
- `25` — inconsistent, cramped, no visual rhythm
- `50` — readable but spacing values appear arbitrary
- `75` — consistent, comfortable, feels intentional
- `100` — all values are multiples of an 8px base unit, section padding 56–96px vertical, visible whitespace-to-content ratio above 40%, no orphaned elements

**CTAs**
- `25` — CTAs invisible or indistinguishable from body text
- `50` — CTAs present and readable but not compelling
- `75` — prominent, clear action text, reasonable size
- `100` — min 44px tap target, >3:1 contrast against background, single dominant CTA per viewport, verb+noun button text, hover state present

**Structure**
- `25` — no clear hierarchy, elements compete for attention
- `50` — hierarchy exists but reading flow is unclear
- `75` — clear hierarchy, logical flow
- `100` — F-pattern or Z-pattern reading flow confirmed visually, max 3 hierarchy levels visible at once, primary action reachable in 1 scroll

**Accessibility**
- `25` — multiple WCAG failures
- `50` — some failures, basic readability maintained
- `75` — mostly passes, minor issues
- `100` — Lighthouse score 100, zero contrast failures, all interactive elements 44px+, focus indicators visible

**User Flow**
- `25` — purpose of the site unclear in first viewport
- `50` — purpose clear but conversion path is confusing
- `75` — clear purpose and reasonable path
- `100` — primary conversion path ≤2 clicks from hero, no dead ends, nav ≤7 items (Miller's Law), purpose communicated in first viewport without scrolling

### "What to keep" integration

If `keep` includes a category, add to the scoring instruction:
> "The user wants to preserve [category]. Do not penalize it. Assess what it does well and note any improvements they could make without changing the core system."

### Acceptance criteria
- [ ] Scoring rubrics present in system prompt
- [ ] Sites with good aesthetics but minor WCAG issues no longer score below 50
- [ ] Sites with all WCAG passes but generic design no longer score above 75
- [ ] `keep` categories are noted in findings, not penalized

---

## Agent 3 — Output Layer: Claude-Specific Prompt Mode

### Platform selector UI (`app/page.tsx`)

Add a toggle to the analysis form:
```
Build platform:  [ Lovable ]  [ Bolt ]  [ Claude ]
```

Default: `Lovable`. Adds `platform: "lovable" | "bolt" | "claude"` to the request body and preferences.

### Prompt branching (`lib/tools/prompt.ts`)

`generatePrompt()` routes to `generateClaudePrompt()` when `platform === "claude"`. Same inputs (vision result, Lighthouse data, branding, keep preferences, HTML structure). Different system prompt and output structure.

**Claude prompt output — 5 sections:**

**1. KEEP**
Same as Lovable prompt but explicitly references the user's `keep` array.

**2. DESIGN SYSTEM**
Same color palette + typography scale as now.

**3. CHANGE**
Same priority-ordered list, but instructions are written as Claude conversation turns:
- Instead of: `"change #333 to #1a1a1a"`
- Write: `"Ask Claude: 'Audit all text colors in the codebase and enforce minimum 7:1 contrast against the background. Current palette: [values]. Suggest replacements that stay within the brand hue family.'"`

**4. COMPONENTS TO UPGRADE**
Same component list from `components.json`, but each entry includes the skill invocation:
- `"For the Hero section: ask Claude to search 21st.dev for [component name] and implement it. Or run /design-html with the spec below."`

**5. SKILLS APPENDIX** (new, always last)

Generated dynamically based on which categories scored below 75:

```
--- IF YOU HAVE THESE CLAUDE SKILLS INSTALLED ---
These skills will improve the quality of this build session:

- /ui-ux-pro-max  → [included if colors or typography < 75]
                    Run before starting DESIGN SYSTEM changes.
                    Use it to select the color palette and type scale.

- /design-html    → [included if cta or structure < 75]  
                    Run for each COMPONENT TO UPGRADE item.
                    Generates production-quality HTML/CSS for the component.

- /design-shotgun → [included if structure < 75]
                    Run before committing to layout changes.
                    Generates 3 layout variants to compare.

- /design-review  → [always included]
                    Run after all changes are applied to validate the result.
                    Catches visual inconsistencies and spacing issues.

These are enhancements — the prompt works without them.
---
```

Skill inclusion logic:
| Score category < 75 | Skills added |
|---|---|
| colors | `/ui-ux-pro-max` |
| typography | `/ui-ux-pro-max` |
| cta | `/design-html` |
| structure | `/design-html`, `/design-shotgun` |
| spacing | `/design-html` |
| any | `/design-review` (always) |

### What stays unchanged
- Lovable and Bolt output paths are untouched
- Haiku model, same token budget (3500 max)
- All existing `components.json` and `prompt-example.md` data still used
- SSE streaming, error handling, progress steps — unchanged

### Acceptance criteria
- [ ] Platform toggle visible in UI, defaults to Lovable
- [ ] Claude prompt has all 5 sections including SKILLS APPENDIX
- [ ] Skills appendix is dynamic — only includes relevant skills based on scores
- [ ] Lovable/Bolt prompts are identical to pre-Agent-3 output
- [ ] `/design-review` always present in Claude mode

---

## Data Flow (post all 3 agents)

```
User input: { url, keep[], style, goal, tone, platform }
    │
    ▼
extract.ts → { html, screenshotUrl, branding }
    │
    ├── branding pre-populates "what to keep" UI (Agent 1)
    │
    ▼
vision.ts → scores + findings
    │
    ├── rubric-based scoring (Agent 2)
    ├── keep categories not penalized (Agent 2)
    │
    ▼
prompt.ts → prompt text
    │
    ├── Lovable/Bolt: existing format (unchanged)
    └── Claude: 5-section brief + dynamic SKILLS APPENDIX (Agent 3)
```

---

## Files Changed Per Agent

**Agent 1**
- `lib/tools/extract.ts` — add branding format
- `app/api/analyze/route.ts` — add keep to Zod schema, thread through
- `app/page.tsx` — add "what to keep" UI step + platform toggle stub

**Agent 2**
- `lib/tools/vision.ts` — replace scoring instruction with rubric table, add keep integration

**Agent 3**
- `lib/tools/prompt.ts` — add `generateClaudePrompt()` branch, skills appendix logic
- `app/page.tsx` — activate platform toggle (stub from Agent 1 becomes functional)

---

## Out of Scope

- History/comparison feature (ARCHITECTURE.md §🔴 item 2)
- Mobile analysis (ARCHITECTURE.md §🟡 item 6)
- Lighthouse in production (ARCHITECTURE.md §🔴 item 1)
- Any new API routes or external service integrations beyond Firecrawl branding format
