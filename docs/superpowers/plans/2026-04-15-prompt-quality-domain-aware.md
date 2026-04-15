# Prompt Quality — Domain-Aware Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated redesign prompts domain-specific and structurally deep by injecting a site-type playbook (chosen by the user) into the LLM context and hardening the system prompt to require structural changes over surface polish.

**Architecture:** A new `data/domain-playbooks.ts` file defines playbooks for 6 site types and a `getDomainBlock()` helper that formats the active playbook as a prompt injection. A `siteType` dropdown is added to the UI preferences panel; the value threads through the API schema to `prompt.ts`, where both `buildUserInput` and `buildClaudeUserInput` inject the domain block, and both system prompts are updated to require structural CHANGE items.

**Tech Stack:** TypeScript, Next.js App Router, React, Zod, `@anthropic-ai/sdk`, `npx tsx` for test scripts.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `data/domain-playbooks.ts` | Create | `SiteType` type, `DomainPlaybook` interface, `DOMAIN_PLAYBOOKS` record, `getDomainBlock()` helper |
| `scripts/test-domain-playbooks.ts` | Create | Unit tests for `getDomainBlock()` |
| `lib/tools/prompt.ts` | Modify | Import `getDomainBlock`, add `siteType` to preferences, inject domain block, harden system prompts |
| `app/api/analyze/route.ts` | Modify | Add `siteType` to Zod schema, thread through to `generatePrompt` |
| `app/page.tsx` | Modify | Add `siteType` state + dropdown UI + pass in fetch body |

---

## Task 1: Create domain-playbooks.ts with getDomainBlock

**Files:**
- Create: `data/domain-playbooks.ts`
- Create: `scripts/test-domain-playbooks.ts`

- [ ] **Step 1: Write `data/domain-playbooks.ts`**

```typescript
export type SiteType = "ecommerce" | "saas" | "portfolio" | "blog" | "agency" | "other";

export interface DomainPlaybook {
  priorities: string[];
  required_sections: string[];
}

export const DOMAIN_PLAYBOOKS: Record<SiteType, DomainPlaybook> = {
  ecommerce: {
    priorities: [
      "Product card redesign — image quality, price hierarchy, add-to-cart prominence",
      "Trust signals — reviews count, star ratings, security badges near checkout",
      "Urgency/scarcity — stock levels, limited-time offers above the fold",
      "Cart & checkout flow — reduce steps, surface a progress indicator",
      "Social proof — testimonials, UGC photos, purchase counts",
    ],
    required_sections: ["product cards", "cart CTA", "trust badges", "social proof"],
  },
  saas: {
    priorities: [
      "Hero value prop — specific outcome ('Ship 10x faster'), not feature description",
      "Pricing table — feature comparison grid, recommended tier highlighted",
      "Social proof — customer logos, case study metrics, G2/Capterra ratings",
      "Feature section — benefit-led copy, not feature-led",
      "Trial/demo CTA — low friction, visible in nav",
    ],
    required_sections: ["hero", "pricing", "social proof", "primary CTA"],
  },
  portfolio: {
    priorities: [
      "Case study depth — problem → solution → outcome structure per project",
      "Work grid — visual hierarchy, project type labels, hover previews",
      "About section — personality + credibility (clients, results, years)",
      "Contact/hire CTA — clear next step above the fold and at page bottom",
    ],
    required_sections: ["work showcase", "case study structure", "contact CTA"],
  },
  blog: {
    priorities: [
      "Reading experience — max 70ch line length, 18px+ body, 1.7 line-height",
      "Content discovery — related posts, category filtering, search",
      "Newsletter/subscription CTA — inline and sticky, value-proposition-led",
      "Author credibility — bio, photo, credentials near article top",
    ],
    required_sections: ["article layout", "newsletter CTA", "content discovery"],
  },
  agency: {
    priorities: [
      "Services clarity — what you do, for whom, and what outcome they get",
      "Portfolio proof — outcomes and metrics, not just visuals",
      "Pricing/process transparency — reduce uncertainty for prospects",
      "Lead generation form — short, above the fold, with clear CTA",
    ],
    required_sections: ["services section", "portfolio", "contact/lead form"],
  },
  other: {
    priorities: [
      "Clear value proposition — what this is and who it's for in one sentence",
      "Primary CTA prominence — highest-contrast element on the page",
      "Content hierarchy — H1 → H2 → body rhythm enforced throughout",
      "Trust signals — credentials, social proof, or guarantees visible above fold",
    ],
    required_sections: ["hero", "primary CTA"],
  },
};

export function getDomainBlock(siteType: SiteType | undefined): string {
  const type: SiteType = siteType ?? "other";
  const playbook = DOMAIN_PLAYBOOKS[type];
  const priorityLines = playbook.priorities.map(p => `- ${p}`).join("\n");
  const requiredLine = `REQUIRED IN OUTPUT: ${playbook.required_sections.join(", ")}`;
  return `\nSITE TYPE: ${type}\nDOMAIN PRIORITIES:\n${priorityLines}\n${requiredLine}\n`;
}
```

- [ ] **Step 2: Write `scripts/test-domain-playbooks.ts`**

```typescript
import assert from "node:assert/strict";
import { getDomainBlock, DOMAIN_PLAYBOOKS } from "../data/domain-playbooks";
import type { SiteType } from "../data/domain-playbooks";

// Test 1: ecommerce block contains expected content
{
  const block = getDomainBlock("ecommerce");
  assert.ok(block.includes("SITE TYPE: ecommerce"), "ecommerce: should include site type header");
  assert.ok(block.includes("DOMAIN PRIORITIES:"), "ecommerce: should include priorities header");
  assert.ok(block.includes("Product card redesign"), "ecommerce: should include product card priority");
  assert.ok(block.includes("REQUIRED IN OUTPUT:"), "ecommerce: should include required sections");
  assert.ok(block.includes("product cards"), "ecommerce: should require product cards");
  console.log("✓ ecommerce block has expected content");
}

// Test 2: saas block contains expected content
{
  const block = getDomainBlock("saas");
  assert.ok(block.includes("SITE TYPE: saas"), "saas: correct site type");
  assert.ok(block.includes("pricing"), "saas: required sections include pricing");
  console.log("✓ saas block has expected content");
}

// Test 3: undefined siteType falls back to "other"
{
  const block = getDomainBlock(undefined);
  assert.ok(block.includes("SITE TYPE: other"), "undefined: should fall back to 'other'");
  assert.ok(block.includes("Clear value proposition"), "other: should include value prop priority");
  console.log("✓ undefined siteType falls back to 'other'");
}

// Test 4: all site types have at least 3 priorities and 1 required section
{
  const types: SiteType[] = ["ecommerce", "saas", "portfolio", "blog", "agency", "other"];
  for (const t of types) {
    const p = DOMAIN_PLAYBOOKS[t];
    assert.ok(p.priorities.length >= 3, `${t}: should have at least 3 priorities`);
    assert.ok(p.required_sections.length >= 1, `${t}: should have at least 1 required section`);
  }
  console.log("✓ all site types have sufficient priorities and required sections");
}

// Test 5: getDomainBlock output is non-empty for every site type
{
  const types: SiteType[] = ["ecommerce", "saas", "portfolio", "blog", "agency", "other"];
  for (const t of types) {
    const block = getDomainBlock(t);
    assert.ok(block.length > 50, `${t}: block should be non-trivially long`);
  }
  console.log("✓ getDomainBlock returns non-empty blocks for all types");
}

console.log("\n✓ all domain-playbooks tests passed");
```

- [ ] **Step 3: Run the tests**

```bash
npx tsx scripts/test-domain-playbooks.ts
```

Expected output:
```
✓ ecommerce block has expected content
✓ saas block has expected content
✓ undefined siteType falls back to 'other'
✓ all site types have sufficient priorities and required sections
✓ getDomainBlock returns non-empty blocks for all types

✓ all domain-playbooks tests passed
```

- [ ] **Step 4: Commit**

```bash
git add data/domain-playbooks.ts scripts/test-domain-playbooks.ts
git commit -m "feat(domain-playbooks): add site type playbooks and getDomainBlock helper"
```

---

## Task 2: Update prompt.ts — inject domain block and harden system prompts

**Files:**
- Modify: `lib/tools/prompt.ts`

- [ ] **Step 1: Add the import at the top of `lib/tools/prompt.ts`**

After the existing imports (line 8, after `import type { BrandingProfile } from "./extract";`), add:

```typescript
import { getDomainBlock, type SiteType } from "../../data/domain-playbooks";
```

- [ ] **Step 2: Update `buildSystemPrompt()` — harden the CHANGE rule**

In `buildSystemPrompt()` (around line 221), find rule 4:
```
4. CHANGE items should have 5-8 entries, not fewer. Cover all weak categories.
```

Replace with:
```
4. CHANGE items must have 5–8 entries. Cover all weak categories. Every item must address structure, hierarchy, content, or conversion — requiring a section rebuild or content rewrite. Animations and visual polish are allowed but cannot exceed 1–2 items out of the total.
5. The DOMAIN PRIORITIES block lists the most impactful structural improvements for this site type. Every section in REQUIRED IN OUTPUT must appear in either a CHANGE item or a COMPONENTS TO UPGRADE entry.
```

Renumber the existing rules 5-7 to 6-8.

- [ ] **Step 3: Update `buildClaudeSystemPrompt()` — harden the CHANGE rule**

In `buildClaudeSystemPrompt()` (around line 247), find rule 4:
```
4. CHANGE items should have 5–8 entries. Cover all weak-scoring categories.
```

Replace with:
```
4. CHANGE items must have 5–8 entries. Cover all weak-scoring categories. Every item must address structure, hierarchy, content, or conversion — a section rebuild or content rewrite. Animations and visual polish are allowed but cannot exceed 1–2 items.
5. The DOMAIN PRIORITIES block lists the most impactful structural improvements for this site type. Every section in REQUIRED IN OUTPUT must appear in either a CHANGE item or a COMPONENTS TO UPGRADE entry.
```

Renumber the existing rules 5-6 to 6-7.

- [ ] **Step 4: Update `buildUserInput` — add siteType param and inject domain block**

Change the function signature from:
```typescript
function buildUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  designSystem: string | null,
  markdown: string,
  branding: BrandingProfile | null
): string {
```

To:
```typescript
function buildUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string; siteType?: SiteType },
  designSystem: string | null,
  markdown: string,
  branding: BrandingProfile | null
): string {
```

Then after the line `const brandingBlock = buildBrandingBlock(branding);` (around line 325), add:
```typescript
const domainBlock = getDomainBlock(preferences.siteType);
```

Then in the return array, add `domainBlock` after `contrastLine` and before `brandingBlock`:
```typescript
return [
  `URL: ${url}`,
  `Page: ${page_summary}`,
  `Score: ${scores.overall}/100 | Style: ${style} | Goal: ${goal} | Tone: ${tone}`,
  contrastLine,
  domainBlock,
  brandingBlock,
  markdownSection,
  keepList.length ? `${keep.length > 0 ? "PRESERVE (user wants to keep)" : "STRONG (score ≥75)"}: ${keepList.join(", ")}` : "",
  weakList.length ? `WEAK (needs work): ${weakList.join(", ")}` : "",
  dsBlock,
  "PRIORITY FIXES:",
  priorityFixes,
  "",
  "ALL CATEGORY SUGGESTIONS:",
  categorySuggestions,
  compsBlock,
]
  .filter((l) => l !== undefined && l !== "")
  .join("\n")
  .trim();
```

- [ ] **Step 5: Update `buildClaudeUserInput` — add siteType param and inject domain block**

Change the function signature from:
```typescript
function buildClaudeUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  designSystem: string | null,
  markdown: string,
  branding: BrandingProfile | null
): string {
```

To:
```typescript
function buildClaudeUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string; siteType?: SiteType },
  designSystem: string | null,
  markdown: string,
  branding: BrandingProfile | null
): string {
```

Then after the line `const brandingBlock = buildBrandingBlock(branding);` (around line 396), add:
```typescript
const domainBlock = getDomainBlock(preferences.siteType);
```

Then in the return array, add `domainBlock` after `contrastLine` and before `brandingBlock`:
```typescript
return [
  `URL: ${url}`,
  `Page: ${page_summary}`,
  `Score: ${scores.overall}/100 | Style: ${style} | Goal: ${goal} | Tone: ${tone}`,
  contrastLine,
  domainBlock,
  brandingBlock,
  markdownSection,
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
```

- [ ] **Step 6: Update `generatePrompt` — add siteType to preferences type**

Change the `preferences` parameter type in `generatePrompt` (around line 434):
```typescript
export async function generatePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string; siteType?: SiteType } = {},
  markdown: string = "",
  branding: BrandingProfile | null = null,
  links: string[] = []
): Promise<PromptResult>
```

And update `generateClaudePrompt` signature (around line 474):
```typescript
async function generateClaudePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string; siteType?: SiteType },
  markdown: string,
  branding: BrandingProfile | null,
  links: string[],
  client: Anthropic
): Promise<string>
```

- [ ] **Step 7: Type-check**

```bash
timeout 30 npx tsc --noEmit
```

Expected: no errors. If errors appear, check that import path `../../data/domain-playbooks` is correct relative to `lib/tools/prompt.ts`.

- [ ] **Step 8: Commit**

```bash
git add lib/tools/prompt.ts
git commit -m "feat(prompt): inject domain playbook block, harden CHANGE item rules"
```

---

## Task 3: Update route.ts — add siteType to API schema

**Files:**
- Modify: `app/api/analyze/route.ts`

- [ ] **Step 1: Add siteType to the Zod preferences schema**

In `app/api/analyze/route.ts`, find the preferences object inside `RequestSchema` (around line 12). Add `siteType` after `platform`:

```typescript
const RequestSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048),
  preferences: z
    .object({
      style: z.enum(["modern", "minimal", "bold", "playful"]).default("modern"),
      goal: z.enum(["conversion", "branding", "ux", "clean"]).default("conversion"),
      tone: z.enum(["professional", "playful", "serious"]).default("professional"),
      keep: z.array(z.string().min(1).max(64)).max(10).default([]),
      platform: z.enum(["lovable", "bolt", "claude"]).default("lovable"),
      siteType: z.enum(["ecommerce", "saas", "portfolio", "blog", "agency", "other"]).default("other"),
    })
    .optional()
    .default({ style: "modern", goal: "conversion", tone: "professional", keep: [], platform: "lovable", siteType: "other" }),
});
```

- [ ] **Step 2: Type-check**

```bash
timeout 30 npx tsc --noEmit
```

Expected: no errors. `preferences.siteType` will automatically flow through to `generatePrompt` since the route already passes the full `preferences` object.

- [ ] **Step 3: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat(route): add siteType to API schema"
```

---

## Task 4: Update page.tsx — add site type dropdown

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Add the SITE_TYPE_OPTIONS constant**

After the `KEEP_OPTIONS` constant (around line 68), add:

```typescript
const SITE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "other",     label: "Other / General" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "saas",      label: "SaaS / App" },
  { value: "portfolio", label: "Portfolio" },
  { value: "blog",      label: "Blog" },
  { value: "agency",    label: "Agency" },
];
```

- [ ] **Step 2: Add `siteType` state to the `Home` component**

In the `Home` component (around line 448), add after the `platform` state:

```typescript
const [siteType, setSiteType] = useState("other");
```

- [ ] **Step 3: Add siteType to the `reset` function**

In `reset()` (around line 526), add:
```typescript
setSiteType("other");
```

- [ ] **Step 4: Pass siteType in the fetch body**

In the `analyze` function (around line 472), update the preferences object in the fetch body:

```typescript
body: JSON.stringify({
  url: trimmed,
  preferences: {
    style: "modern",
    goal: "conversion",
    tone: "professional",
    keep,
    platform,
    siteType,
  },
}),
```

- [ ] **Step 5: Add the site type dropdown to the UI**

In the preferences section (around line 630, after the platform toggle `</div></div>`), add a new section:

```tsx
{/* ── Site type ───────────────────────────────────────────── */}
<div className="space-y-2 pt-1">
  <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
    Site type
  </p>
  <select
    value={siteType}
    onChange={e => setSiteType(e.target.value)}
    className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 focus:border-gray-300 transition-all"
  >
    {SITE_TYPE_OPTIONS.map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</div>
```

- [ ] **Step 6: Type-check**

```bash
timeout 30 npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat(ui): add site type dropdown to preferences panel"
```

---

## Task 5: Smoke test end-to-end

**Files:** none (manual verification)

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Run an e-commerce analysis**

Open `http://localhost:3000`, enter a real e-commerce URL (e.g. `https://clevrblends.com`), select "E-commerce" in the site type dropdown, click Analyze.

- [ ] **Step 3: Verify the domain block appears in the generated prompt**

Check the output prompt for at least one of: "product cards", "trust signals", "social proof", "checkout". These come from the domain playbook priorities being honoured by the LLM.

- [ ] **Step 4: Verify CHANGE items are structural**

Confirm that the CHANGE section contains at least 3 items that describe section rebuilds or content rewrites (not only animations).

- [ ] **Step 5: Commit final smoke-test confirmation (if any last-minute fixes were made)**

```bash
git add -p
git commit -m "fix: <describe any fix found during smoke test>"
```

If no fixes needed, skip this step.
