# Design Analyzer AI — Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Firecrawl branding extraction, "what to keep" preferences, human-aesthetic scoring rubrics, and a Claude-specific prompt mode with dynamic skills appendix.

**Architecture:** Three sequential agents each own one pipeline layer: Agent 1 enriches the data from Firecrawl and adds user keep/platform preferences; Agent 2 rewrites the Vision scoring prompt with explicit per-category rubrics; Agent 3 adds a Claude-specific prompt branch with a dynamic skills appendix. Each agent's output is a working, deployable state.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, `@mendable/firecrawl-js` 4.18.1 (BrandingProfile already typed in SDK), `@anthropic-ai/sdk`, Zod v4, `tsx` for running test scripts.

**Spec:** `docs/superpowers/specs/2026-04-13-design-analyzer-features-design.md`

---

## File Map

| File | Agent | Change |
|------|-------|--------|
| `lib/tools/extract.ts` | 1 | Add `branding` format, extend `ExtractResult` |
| `app/api/analyze/route.ts` | 1 | Add `keep`, `platform` to Zod schema; thread branding through |
| `app/page.tsx` | 1 | Add "what to keep" UI + platform toggle stub |
| `lib/tools/vision.ts` | 2 | Rewrite system prompt with rubrics; add keep integration |
| `lib/tools/prompt.ts` | 3 | Add `selectSkillsForScores()`, `generateClaudePrompt()`, skills appendix |
| `app/page.tsx` | 3 | Activate platform toggle (wire to API) |
| `scripts/test-skills-logic.ts` | 3 | Unit tests for pure skills-selection function |

---

# AGENT 1 — Data Layer

## Task 1: Extend `ExtractResult` and add branding format to `extract.ts`

**Files:**
- Modify: `lib/tools/extract.ts`

The SDK already exports `BrandingProfile`. Import it and add it to the result type.

- [ ] **Step 1: Read the current file to confirm baseline**

```bash
cat lib/tools/extract.ts
```

Expected: shows `formats: ["rawHtml", "screenshot"]` and `ExtractResult` with `html` + `screenshotUrl` only.

- [ ] **Step 2: Replace the file with the updated version**

Full replacement of `lib/tools/extract.ts`:

```typescript
import { FirecrawlClient, type BrandingProfile } from "@mendable/firecrawl-js";

export type { BrandingProfile };

export interface ExtractResult {
  html: string;
  screenshotUrl: string;
  branding: BrandingProfile | null;
}

export async function extractWebsite(url: string): Promise<ExtractResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is not set");

  const client = new FirecrawlClient({ apiKey });

  const result = await client.scrape(url, {
    formats: ["rawHtml", "screenshot", "branding"],
  });

  if (!result?.rawHtml && !result?.screenshot) {
    throw new Error("Firecrawl returned an empty result");
  }

  return {
    html: result.rawHtml ?? "",
    screenshotUrl: result.screenshot ?? "",
    branding: result.branding ?? null,
  };
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors. If `result.branding` errors, check SDK exports with `grep -n "branding" node_modules/@mendable/firecrawl-js/dist/index.d.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/tools/extract.ts
git commit -m "feat(extract): add Firecrawl branding format to ExtractResult"
```

---

## Task 2: Update the API route — Zod schema, branding threading, keep + platform

**Files:**
- Modify: `app/api/analyze/route.ts`

Add `keep` and `platform` to `RequestSchema.preferences`. Thread `branding` from `extractResult` through to `analyzeWithVision` and `generatePrompt`.

- [ ] **Step 1: Update the `RequestSchema` preferences block**

Find this block in `app/api/analyze/route.ts`:

```typescript
  preferences: z
    .object({
      style: z.enum(["modern", "minimal", "bold", "playful"]).default("modern"),
      goal: z.enum(["conversion", "branding", "ux", "clean"]).default("conversion"),
      tone: z.enum(["professional", "playful", "serious"]).default("professional"),
    })
    .optional()
    .default({ style: "modern", goal: "conversion", tone: "professional" }),
```

Replace with:

```typescript
  preferences: z
    .object({
      style: z.enum(["modern", "minimal", "bold", "playful"]).default("modern"),
      goal: z.enum(["conversion", "branding", "ux", "clean"]).default("conversion"),
      tone: z.enum(["professional", "playful", "serious"]).default("professional"),
      keep: z.array(z.string()).optional().default([]),
      platform: z.enum(["lovable", "bolt", "claude"]).optional().default("lovable"),
    })
    .optional()
    .default({ style: "modern", goal: "conversion", tone: "professional", keep: [], platform: "lovable" }),
```

- [ ] **Step 2: Thread branding through to `analyzeWithVision` and `generatePrompt`**

Find this call in the stream `start` function:

```typescript
        const visionResult = await analyzeWithVision(
          extractResult.screenshotUrl,
          lighthouseResult,
          preferences
        );
```

Replace with:

```typescript
        const visionResult = await analyzeWithVision(
          extractResult.screenshotUrl,
          lighthouseResult,
          preferences,
          extractResult.branding
        );
```

Find this call:

```typescript
        const promptResult = await generatePrompt(url, visionResult, lighthouseResult, preferences, extractResult.html);
```

Replace with:

```typescript
        const promptResult = await generatePrompt(
          url,
          visionResult,
          lighthouseResult,
          preferences,
          extractResult.html,
          extractResult.branding
        );
```

Also add `branding` to the result event payload. Find:

```typescript
          data: {
            url,
            screenshotUrl: extractResult.screenshotUrl,
            lighthouse: lighthouseResult,
            analysis: visionResult,
            prompt: promptResult.prompt,
          },
```

Replace with:

```typescript
          data: {
            url,
            screenshotUrl: extractResult.screenshotUrl,
            lighthouse: lighthouseResult,
            analysis: visionResult,
            prompt: promptResult.prompt,
            branding: extractResult.branding,
          },
```

- [ ] **Step 3: Update function signatures in `vision.ts` and `prompt.ts` to accept new params (minimal stubs — full implementation in Agent 2 and 3)**

In `lib/tools/vision.ts`, update the `analyzeWithVision` signature:

```typescript
import type { BrandingProfile } from "./extract";

export async function analyzeWithVision(
  screenshotUrl: string,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string } = {},
  branding: BrandingProfile | null = null
): Promise<VisionResult> {
```

The function body is unchanged for now — the new params are accepted but not yet used. Agent 2 implements the keep logic.

In `lib/tools/prompt.ts`, update the `generatePrompt` signature:

```typescript
import type { BrandingProfile } from "./extract";

export async function generatePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string } = {},
  html: string = "",
  branding: BrandingProfile | null = null
): Promise<PromptResult> {
```

The function body is unchanged for now. Agent 3 implements the Claude branch.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts lib/tools/vision.ts lib/tools/prompt.ts
git commit -m "feat(route): add keep, platform, branding to API schema and thread through pipeline"
```

---

## Task 3: Add "What to Keep" UI + platform toggle stub to `app/page.tsx`

**Files:**
- Modify: `app/page.tsx`

Add two new pieces of state and a preferences panel that appears between the URL input and the submit button. The platform toggle is a stub here — it sends the value but the prompt output won't change until Agent 3.

- [ ] **Step 1: Add new state variables**

Find the existing state declarations near the top of the component (after the `useState` for `phase`). Add:

```typescript
const [keep, setKeep] = useState<string[]>([]);
const [platform, setPlatform] = useState<"lovable" | "bolt" | "claude">("lovable");
```

- [ ] **Step 2: Add `KEEP_OPTIONS` constant near the top of the file (with other constants)**

```typescript
const KEEP_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: "typography", label: "Typography", description: "Keep your current fonts and type scale" },
  { id: "colors",     label: "Color palette", description: "Keep your current colors" },
  { id: "spacing",    label: "Spacing rhythm", description: "Keep your current spacing system" },
  { id: "structure",  label: "Overall structure", description: "Don't change the layout" },
];
```

- [ ] **Step 3: Add `toggleKeep` helper inside the component**

```typescript
function toggleKeep(id: string) {
  setKeep(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
}
```

- [ ] **Step 4: Add the preferences panel JSX**

Find the URL input section in the idle phase render. It currently ends with the submit button. Add the preferences panel between the input and button. The exact location depends on the JSX structure — look for the `<form>` or `<div>` containing the URL `<input>` and `<button>`. Insert before the submit button:

```tsx
{/* ── What to keep ───────────────────────────────────────────── */}
<div className="space-y-3 pt-2">
  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
    What do you want to keep?
  </p>
  <div className="grid grid-cols-2 gap-2">
    {KEEP_OPTIONS.map(opt => (
      <label
        key={opt.id}
        className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
          keep.includes(opt.id)
            ? "border-gray-400 bg-gray-50"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        <input
          type="checkbox"
          checked={keep.includes(opt.id)}
          onChange={() => toggleKeep(opt.id)}
          className="mt-0.5 accent-gray-700"
        />
        <span className="text-sm">
          <span className="font-medium text-gray-800">{opt.label}</span>
          <span className="block text-gray-500 text-xs">{opt.description}</span>
        </span>
      </label>
    ))}
  </div>
  {/* Custom keep field */}
  <input
    type="text"
    placeholder="Custom: e.g. keep the hero image position"
    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
    onBlur={e => {
      const val = e.target.value.trim();
      if (val && !keep.includes(`custom: ${val}`)) {
        setKeep(prev => [...prev.filter(k => !k.startsWith("custom:")), `custom: ${val}`]);
      }
    }}
  />
</div>

{/* ── Platform toggle ─────────────────────────────────────────── */}
<div className="space-y-2 pt-1">
  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
    Build platform
  </p>
  <div className="flex gap-2">
    {(["lovable", "bolt", "claude"] as const).map(p => (
      <button
        key={p}
        type="button"
        onClick={() => setPlatform(p)}
        className={`flex-1 py-2 px-3 text-sm rounded-lg border transition-colors capitalize ${
          platform === p
            ? "border-gray-700 bg-gray-700 text-white"
            : "border-gray-200 text-gray-600 hover:border-gray-400"
        }`}
      >
        {p}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Include `keep` and `platform` in the fetch body**

Find where the fetch to `/api/analyze` is called. It currently sends `{ url, preferences: { style, goal, tone } }` or similar. Update the preferences object to include the new fields:

```typescript
body: JSON.stringify({
  url,
  preferences: {
    style: "modern",
    goal: "conversion",
    tone: "professional",
    keep,
    platform,
  },
}),
```

- [ ] **Step 6: Add `branding` to `AnalysisResult` interface**

Find the `AnalysisResult` interface at the top of the file and add the branding field:

```typescript
import type { BrandingProfile } from "@/lib/tools/extract";

interface AnalysisResult {
  url: string;
  screenshotUrl: string;
  analysis: { ... };  // unchanged
  prompt: string;
  branding: BrandingProfile | null;  // add this
}
```

- [ ] **Step 7: Type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: zero errors. The app should work identically to before — the new UI fields are sent but have no effect yet.

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): add what-to-keep checkboxes and platform toggle"
```

---

# AGENT 2 — Analysis Layer

## Task 4: Rewrite `vision.ts` system prompt with per-category rubrics and keep integration

**Files:**
- Modify: `lib/tools/vision.ts`

Replace the open-ended scoring instruction with an explicit rubric table. Add keep-category instructions when the user has checked items to preserve.

- [ ] **Step 1: Replace `SYSTEM_PROMPT` constant**

Find `const SYSTEM_PROMPT = \`...\`` in `lib/tools/vision.ts` and replace the entire constant:

```typescript
const SYSTEM_PROMPT = `You are an expert web designer and UX analyst. Analyze website screenshots with both technical precision and aesthetic judgement.

ANALYZE across 7 dimensions using the rubrics below. Each rubric has two axes: technical (measurable from the screenshot) and aesthetic (human quality signal). The score is the intersection of both — a site cannot score above 75 by technical compliance alone if it looks generic, nor can it score above 50 if it fails technical requirements.

## SCORING RUBRICS

### COLORS
- 25: contrast failures visible AND palette looks random or default (e.g. out-of-the-box Tailwind blues)
- 50: contrast passes technically, but palette is generic — no color story, looks like every AI-generated site
- 75: contrast passes, palette is intentional and consistent, but lacks personality
- 100: 7:1+ contrast on body text, 4.5:1+ on all UI elements, follows 60/30/10 distribution (dominant/secondary/accent), max 5 palette colors, colors have a clear HSL relationship (not random hex picks), color-scheme feels deliberate

### TYPOGRAPHY
- 25: default system font or illegible sizes, no visual hierarchy
- 50: legible and consistent, but forgettable — looks like every AI-generated site
- 75: clear hierarchy, good scale, feels considered
- 100: follows a modular scale (1.25× or 1.333× ratio between steps), H1 40–56px, H2 28–36px, body 16–18px, line-height 1.5–1.65 for body, letter-spacing −0.02em to −0.04em on headings, max 2 font families with a clear semantic role each

### SPACING
- 25: inconsistent, cramped, no visual rhythm
- 50: readable but spacing values appear arbitrary
- 75: consistent, comfortable, feels intentional
- 100: all spacing values are multiples of an 8px base unit, section padding 56–96px vertical, visible whitespace-to-content ratio above 40%, no orphaned elements

### CTAs
- 25: CTAs invisible or indistinguishable from body text
- 50: CTAs present and readable but not compelling
- 75: prominent, clear action text, reasonable size
- 100: min 44px tap target, >3:1 contrast against its background, single dominant CTA per viewport, button text is verb+noun, hover state visually distinguishable

### STRUCTURE
- 25: no clear hierarchy, elements compete for attention
- 50: hierarchy exists but reading flow is unclear or inconsistent
- 75: clear hierarchy, logical flow
- 100: F-pattern or Z-pattern reading flow confirmed visually, max 3 hierarchy levels visible at once, primary action reachable within 1 scroll from top

### ACCESSIBILITY
- 25: multiple WCAG AA failures visible
- 50: some failures, basic readability maintained
- 75: mostly passes, minor issues only
- 100: Lighthouse accessibility score 100, zero contrast failures, all interactive elements ≥44px, focus indicators visible

### USER_FLOW
- 25: page purpose unclear in the first viewport
- 50: purpose clear but conversion path confusing
- 75: clear purpose and reasonable path to action
- 100: primary conversion path requires ≤2 clicks from hero, no dead ends, nav has ≤7 items, page communicates its purpose in first viewport without scrolling

When Lighthouse data is provided, use it as ground truth for accessibility scores and contrast ratios. For all other categories, derive scores from what you observe visually.

Score honestly. Reference specific visual elements you observe (actual colors, font names if visible, button labels, section names).

OUTPUT — respond with ONLY valid JSON, no markdown fences:
{
  "page_summary": "brief description of page purpose",
  "scores": {
    "colors": 0-100,
    "typography": 0-100,
    "spacing": 0-100,
    "cta": 0-100,
    "structure": 0-100,
    "accessibility": 0-100,
    "user_flow": 0-100,
    "overall": 0-100
  },
  "findings": {
    "colors": { "issues": [], "suggestions": [] },
    "typography": { "issues": [], "suggestions": [] },
    "spacing": { "issues": [], "suggestions": [] },
    "cta": { "issues": [], "suggestions": [] },
    "structure": { "issues": [], "suggestions": [] },
    "accessibility": { "issues": [], "suggestions": [] },
    "user_flow": { "issues": [], "suggestions": [] }
  },
  "improvements_ranked": [
    {
      "priority": 1,
      "category": "accessibility",
      "issue": "specific issue observed",
      "impact": "high",
      "effort": "low",
      "fix": "specific fix with values (e.g. change #aaa to #767676 for 4.6:1 ratio)"
    }
  ],
  "summary": "2-3 sentence verdict with overall score and top 2 priorities"
}

improvements_ranked: top 5, ordered by impact/effort ratio (high impact + low effort first).`;
```

- [ ] **Step 2: Add keep instructions to `userText` in `analyzeWithVision`**

Find the `userText` variable:

```typescript
  const userText = `Analyze this website screenshot.
User preferences: style=${preferences.style ?? "modern"}, goal=${preferences.goal ?? "conversion"}, tone=${preferences.tone ?? "professional"}.

${lighthouseSummary}

Return only the JSON object as specified. Reference specific visual elements you observe.`;
```

Replace with:

```typescript
  const keep = preferences.keep ?? [];
  const keepInstruction = keep.length > 0
    ? `\nUSER PRESERVATION REQUESTS: The user wants to keep the following — do NOT penalize these categories. Instead, note what works well and suggest improvements within the existing system:\n${keep.map(k => `- ${k}`).join("\n")}`
    : "";

  const userText = `Analyze this website screenshot.
User preferences: style=${preferences.style ?? "modern"}, goal=${preferences.goal ?? "conversion"}, tone=${preferences.tone ?? "professional"}.
${keepInstruction}

${lighthouseSummary}

Return only the JSON object as specified. Reference specific visual elements you observe.`;
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Smoke test — run a real analysis and verify scoring feels balanced**

```bash
npm run dev
# In another terminal, send a test request:
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://stripe.com","preferences":{"style":"modern","goal":"conversion","tone":"professional","keep":[],"platform":"lovable"}}' \
  --no-buffer 2>/dev/null | head -20
```

Expected: SSE stream with progress events, then a result event with scores. Stripe should score 80+ across most categories (it is a well-designed site). If it scores below 60 overall, the rubrics may be too strict — check the vision model output for reasoning.

- [ ] **Step 5: Commit**

```bash
git add lib/tools/vision.ts
git commit -m "feat(vision): rewrite scoring with per-category human+technical rubrics and keep integration"
```

---

# AGENT 3 — Output Layer

## Task 5: Add `selectSkillsForScores()` pure function + unit test

**Files:**
- Modify: `lib/tools/prompt.ts` (add exported function)
- Create: `scripts/test-skills-logic.ts`

This is the deterministic core of the skills appendix. Test it before wiring anything else.

- [ ] **Step 1: Add `selectSkillsForScores` to `lib/tools/prompt.ts`**

Add this exported function near the top of the file (after the imports, before `extractHtmlStructure`):

```typescript
export interface SkillSuggestion {
  name: string;
  trigger: string;
  use: string;
}

// Pure function — no side effects, fully testable
export function selectSkillsForScores(scores: DesignScore): SkillSuggestion[] {
  const skills: SkillSuggestion[] = [];

  if ((scores.colors ?? 100) < 75 || (scores.typography ?? 100) < 75) {
    skills.push({
      name: "/ui-ux-pro-max",
      trigger: "Run before starting DESIGN SYSTEM changes.",
      use: "Use it to select the color palette and type scale.",
    });
  }

  if (
    (scores.cta ?? 100) < 75 ||
    (scores.structure ?? 100) < 75 ||
    (scores.spacing ?? 100) < 75
  ) {
    skills.push({
      name: "/design-html",
      trigger: "Run for each COMPONENT TO UPGRADE item.",
      use: "Generates production-quality HTML/CSS for the component.",
    });
  }

  if ((scores.structure ?? 100) < 75) {
    skills.push({
      name: "/design-shotgun",
      trigger: "Run before committing to layout changes.",
      use: "Generates 3 layout variants to compare.",
    });
  }

  // Always include design-review
  skills.push({
    name: "/design-review",
    trigger: "Run after all changes are applied to validate the result.",
    use: "Catches visual inconsistencies and spacing issues.",
  });

  return skills;
}
```

- [ ] **Step 2: Write the test file**

Create `scripts/test-skills-logic.ts`:

```typescript
import assert from "node:assert/strict";
import { selectSkillsForScores } from "../lib/tools/prompt";
import type { DesignScore } from "../lib/tools/vision";

const highScores: DesignScore = {
  colors: 80, typography: 80, spacing: 80, cta: 80,
  structure: 80, accessibility: 80, user_flow: 80, overall: 80,
};

// Test 1: all high scores → only design-review
{
  const skills = selectSkillsForScores(highScores);
  assert.equal(skills.length, 1, "high scores: should only include design-review");
  assert.equal(skills[0].name, "/design-review");
  console.log("✓ high scores → only /design-review");
}

// Test 2: low colors → ui-ux-pro-max included
{
  const skills = selectSkillsForScores({ ...highScores, colors: 60 });
  assert.ok(skills.some(s => s.name === "/ui-ux-pro-max"), "low colors: should include /ui-ux-pro-max");
  assert.ok(skills.some(s => s.name === "/design-review"), "low colors: should always include /design-review");
  console.log("✓ low colors → /ui-ux-pro-max + /design-review");
}

// Test 3: low typography → ui-ux-pro-max included
{
  const skills = selectSkillsForScores({ ...highScores, typography: 50 });
  assert.ok(skills.some(s => s.name === "/ui-ux-pro-max"), "low typography: should include /ui-ux-pro-max");
  console.log("✓ low typography → /ui-ux-pro-max");
}

// Test 4: low structure → design-shotgun AND design-html included
{
  const skills = selectSkillsForScores({ ...highScores, structure: 55 });
  assert.ok(skills.some(s => s.name === "/design-shotgun"), "low structure: should include /design-shotgun");
  assert.ok(skills.some(s => s.name === "/design-html"), "low structure: should include /design-html");
  console.log("✓ low structure → /design-shotgun + /design-html");
}

// Test 5: low CTA but high structure → design-html but NOT design-shotgun
{
  const skills = selectSkillsForScores({ ...highScores, cta: 50 });
  assert.ok(skills.some(s => s.name === "/design-html"), "low cta: should include /design-html");
  assert.ok(!skills.some(s => s.name === "/design-shotgun"), "low cta, high structure: should NOT include /design-shotgun");
  console.log("✓ low CTA → /design-html but not /design-shotgun");
}

// Test 6: design-review always present, no duplicates
{
  const skills = selectSkillsForScores({ ...highScores, colors: 50, structure: 50, cta: 50 });
  const reviewCount = skills.filter(s => s.name === "/design-review").length;
  assert.equal(reviewCount, 1, "design-review should appear exactly once");
  console.log("✓ /design-review appears exactly once regardless of scores");
}

console.log("\n✓ all skills logic tests passed");
```

- [ ] **Step 3: Run the test (it will fail because selectSkillsForScores isn't exported yet)**

```bash
npx tsx scripts/test-skills-logic.ts
```

Expected: error — `selectSkillsForScores is not exported` or similar. This confirms the test is live.

- [ ] **Step 4: Verify the function is exported and re-run**

```bash
grep "export function selectSkillsForScores" lib/tools/prompt.ts
```

Expected: line found. Then:

```bash
npx tsx scripts/test-skills-logic.ts
```

Expected:
```
✓ high scores → only /design-review
✓ low colors → /ui-ux-pro-max + /design-review
✓ low typography → /ui-ux-pro-max
✓ low structure → /design-shotgun + /design-html
✓ low CTA → /design-html but not /design-shotgun
✓ /design-review appears exactly once regardless of scores

✓ all skills logic tests passed
```

- [ ] **Step 5: Commit**

```bash
git add lib/tools/prompt.ts scripts/test-skills-logic.ts
git commit -m "feat(prompt): add selectSkillsForScores with unit tests"
```

---

## Task 6: Add `buildSkillsAppendix()` and `generateClaudePrompt()` to `prompt.ts`

**Files:**
- Modify: `lib/tools/prompt.ts`

- [ ] **Step 1: Add `buildSkillsAppendix()` after `selectSkillsForScores()`**

```typescript
function buildSkillsAppendix(scores: DesignScore): string {
  const skills = selectSkillsForScores(scores);
  const lines = skills
    .map(s => `- ${s.name}  → ${s.trigger}\n  ${s.use}`)
    .join("\n");
  return `--- IF YOU HAVE THESE CLAUDE SKILLS INSTALLED ---
These skills will improve the quality of this build session:

${lines}

These are enhancements — the prompt works without them.
---`;
}
```

- [ ] **Step 2: Add `buildClaudeSystemPrompt()` function**

Add after `buildSystemPrompt()`:

```typescript
function buildClaudeSystemPrompt(): string {
  const example = getPromptExample();
  return `You are an expert design-to-code translator working with Claude (AI coding assistant).

Given a structured design analysis, write a precise build session brief that a developer can paste into a Claude conversation to improve their website.

## Rules

1. Be SPECIFIC — reference actual content from the page (headlines, button text, section names).
2. Include exact CSS values: #hex colors, px sizes, font-weights, border-radius, shadows, spacing.
3. Structure the output with these sections in order:
   - **KEEP**: what's already working well (specific, with values)
   - **DESIGN SYSTEM**: complete color palette (primary, hover, background, surface, text, accent, border) + typography scale (H1–H3, body, small with size/weight/line-height/tracking)
   - **CHANGE**: numbered list ordered by priority. Each item must be phrased as an exact message for the developer to send to Claude. Format each item as: "[impact/effort] Tell Claude: '[exact instruction with CSS values and context]'"
   - **COMPONENTS TO UPGRADE**: for each component, write: "For [section name]: tell Claude to search 21st.dev for [component name] and implement it. If you have /design-html, run: /design-html [brief component spec]"
   - Do NOT write a SKILLS section — it will be appended automatically.
4. CHANGE items should have 5–8 entries. Cover all weak-scoring categories.
5. DESIGN SYSTEM: extract colors from what's observed + what needs to change. Build a coherent palette.
6. Output ONLY the prompt text — no preamble, no markdown fences, no explanation.

## Example of an excellent Claude-mode CHANGE item

[high/low] Tell Claude: "Audit every text element in the codebase and enforce a minimum 7:1 contrast ratio. Current background is #1A1A1A. Replace any gray text lighter than #767676 with #E0E0E0. Show me a list of every file you changed."

## Reference example (Lovable format — adapt the CHANGE section to Claude turns):

${example}`;
}
```

- [ ] **Step 3: Add `buildClaudeUserInput()` function**

Add after `buildUserInput()`:

```typescript
function buildClaudeUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  designSystem: string | null,
  html: string,
  branding: BrandingProfile | null
): string {
  const { scores, findings, improvements_ranked, page_summary } = vision;
  const style = preferences.style ?? "modern";
  const goal = preferences.goal ?? "conversion";
  const tone = preferences.tone ?? "professional";
  const keep = preferences.keep ?? [];

  const keepList = keep.length > 0
    ? keep
    : Object.entries(scores)
        .filter(([k, v]) => k !== "overall" && v >= 75)
        .map(([k]) => CATEGORY_LABELS[k] ?? k);

  const weakList = Object.entries(scores)
    .filter(([k, v]) => k !== "overall" && v < 75)
    .sort(([, a], [, b]) => a - b)
    .map(([k, v]) => `${CATEGORY_LABELS[k] ?? k}: ${v}/100`);

  const priorityFixes = improvements_ranked
    .map((imp, i) => `${i + 1}. [${imp.impact}/${imp.effort}] ${imp.issue} → ${imp.fix}`)
    .join("\n");

  const categorySuggestions = Object.entries(findings)
    .filter(([, f]) => f.suggestions.length > 0)
    .map(([k, f]) => `${CATEGORY_LABELS[k] ?? k}: ${f.suggestions.slice(0, 3).join("; ")}`)
    .join("\n");

  const contrastLine = lighthouseData
    ? `Lighthouse contrast: ${lighthouseData.colorContrast.score === 1 ? "PASS" : lighthouseData.colorContrast.score === 0 ? `FAIL (${lighthouseData.colorContrast.failingItems.length} elements)` : "unknown"}`
    : "";

  const brandingBlock = branding?.colors
    ? `\nDETECTED BRANDING:\nColors: primary=${branding.colors.primary ?? "unknown"}, background=${branding.colors.background ?? "unknown"}, text=${branding.colors.textPrimary ?? "unknown"}\nFonts: ${branding.fonts?.map(f => f.family).join(", ") ?? "unknown"}\n`
    : "";

  const dsBlock = designSystem ? `\nDESIGN SYSTEM RECOMMENDATION:\n${designSystem}\n` : "";

  const htmlBlock = extractHtmlStructure(html);
  const htmlSection = htmlBlock ? `\nPAGE CONTENT (from HTML):\n${htmlBlock}\n` : "";

  const comps = matchComponents(scores);
  const compsBlock = comps.length > 0
    ? `\nCOMPONENTS TO SUGGEST (from 21st.dev):\n` +
      comps.map(c => `- ${c.nombre} [${c.categoria}]: ${c.problema_que_resuelve}`).join("\n") + "\n"
    : "";

  return [
    `URL: ${url}`,
    `Page: ${page_summary}`,
    `Score: ${scores.overall}/100 | Style: ${style} | Goal: ${goal} | Tone: ${tone}`,
    contrastLine,
    brandingBlock,
    htmlSection,
    keepList.length ? `PRESERVE (user wants to keep): ${keepList.join(", ")}` : "",
    weakList.length ? `WEAK (needs work): ${weakList.join(", ")}` : "",
    dsBlock,
    "PRIORITY FIXES:",
    priorityFixes,
    "",
    "ALL CATEGORY SUGGESTIONS:",
    categorySuggestions,
    compsBlock,
  ]
    .filter(l => l !== undefined && l !== "")
    .join("\n")
    .trim();
}
```

- [ ] **Step 4: Add `generateClaudePrompt()` function**

Add after `generatePrompt()`:

```typescript
async function generateClaudePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  html: string,
  branding: BrandingProfile | null,
  client: Anthropic
): Promise<string> {
  const designSystem = runDesignSystem(visionResult.page_summary);
  const userText = buildClaudeUserInput(
    url, visionResult, lighthouseData, preferences, designSystem, html, branding
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3500,
    system: buildClaudeSystemPrompt(),
    messages: [{ role: "user", content: userText }],
  });

  const basePrompt = response.content
    .filter(b => b.type === "text")
    .map(b => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  const appendix = buildSkillsAppendix(visionResult.scores);
  return `${basePrompt}\n\n${appendix}`;
}
```

- [ ] **Step 5: Update `generatePrompt()` to route to Claude branch**

Find the `generatePrompt()` function body. Find where `client` is created:

```typescript
  const client = new Anthropic({ apiKey });
```

Add the routing logic right after:

```typescript
  if (preferences.platform === "claude") {
    const prompt = await generateClaudePrompt(
      url, visionResult, lighthouseData, preferences, html, branding, client
    );
    return { prompt };
  }
```

The rest of the function remains unchanged (Lovable/Bolt path).

- [ ] **Step 6: Update `generatePrompt` signature to accept branding**

The signature stub was added in Task 2. Confirm `branding: BrandingProfile | null = null` is in the signature. If not, add it now.

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 8: Re-run skills tests to confirm nothing broke**

```bash
npx tsx scripts/test-skills-logic.ts
```

Expected: all 6 tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/tools/prompt.ts
git commit -m "feat(prompt): add generateClaudePrompt with skills appendix"
```

---

## Task 7: Activate platform toggle in `app/page.tsx` and display branding in results

**Files:**
- Modify: `app/page.tsx`

The platform state is already wired to the API (Task 3). This task activates the label change and shows detected branding in the results view.

- [ ] **Step 1: Update the "building prompt" progress message**

Find the progress step message for `"prompt"`:

```typescript
        const promptResult = await generatePrompt(...)
```

The SSE message is set in the route (`"Building your optimized Lovable/Bolt prompt…"`). Update `route.ts` to use the platform value:

```typescript
        send({
          type: "progress",
          step: "prompt",
          message: preferences.platform === "claude"
            ? "Building your Claude build session brief…"
            : `Building your optimized ${preferences.platform === "bolt" ? "Bolt" : "Lovable"} prompt…`,
        });
```

- [ ] **Step 2: Update the PromptBox label in `app/page.tsx`**

Find the heading or label above the `PromptBox` component (the textarea with the prompt). It likely says something like "Your Prompt" or "Optimized Prompt". Make it platform-aware. Look for the label near the `PromptBox` render in the `done` phase:

```tsx
// Find the existing label (it may be a <h2>, <p>, or <span>)
// Replace with:
<p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
  {phase.kind === "done" && /* need access to the platform value here */}
</p>
```

Since `platform` state is in scope, update the label:

```tsx
<p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
  {platform === "claude" ? "Claude Build Brief" : `${platform.charAt(0).toUpperCase() + platform.slice(1)} Prompt`}
</p>
```

- [ ] **Step 3: Show detected branding in results**

In the `done` phase results section, add a small branding info block. Find where `screenshotUrl` or `analysis` are rendered in the done phase, and add after the screenshot section:

```tsx
{phase.result.branding?.colors && (
  <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
    <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">
      Detected Design System
    </p>
    <div className="flex flex-wrap gap-2">
      {Object.entries(phase.result.branding.colors)
        .filter(([, v]) => v && v.startsWith("#"))
        .slice(0, 6)
        .map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-full border border-gray-300 inline-block"
              style={{ backgroundColor: v as string }}
            />
            <span className="text-xs text-gray-500">{k}: {v}</span>
          </div>
        ))}
    </div>
    {phase.result.branding.fonts && phase.result.branding.fonts.length > 0 && (
      <p className="text-xs text-gray-500 mt-1">
        Fonts: {phase.result.branding.fonts.map(f => f.family).join(", ")}
      </p>
    )}
  </div>
)}
```

Note: `phase.result` requires the `AnalysisResult` type to include `branding`. This was added in Task 3 Step 6. Confirm it's there.

- [ ] **Step 4: Type-check and build**

```bash
npx tsc --noEmit
npm run build
```

Expected: zero errors and successful build.

- [ ] **Step 5: End-to-end smoke test**

```bash
npm run dev
```

Open `http://localhost:3000`. Test the full flow:
1. Enter a URL, check "Typography" in what-to-keep, select "Claude" platform → run analysis
2. Verify the prompt output contains "KEEP", "DESIGN SYSTEM", "CHANGE", "COMPONENTS TO UPGRADE", and "--- IF YOU HAVE THESE CLAUDE SKILLS INSTALLED ---"
3. Verify CHANGE items are phrased as "Tell Claude: '...'"
4. Select "Lovable" platform → run again → verify prompt format is the original format (no skills appendix, no "Tell Claude")
5. If branding was detected, verify the color swatches appear in the results

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/api/analyze/route.ts
git commit -m "feat(ui): activate platform toggle, show detected branding in results"
```

---

## Final: Type-check, build, and tag completion

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2: Production build**

```bash
npm run build
```

Expected: successful build, no type or lint errors.

- [ ] **Step 3: Run all unit tests**

```bash
npx tsx scripts/test-skills-logic.ts
```

Expected: 6 tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final type-check and build verification — all 3 agents complete"
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for full review pipeline, or individual reviews above.
