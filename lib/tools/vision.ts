import Anthropic from "@anthropic-ai/sdk";
import type { LighthouseResult } from "./lighthouse";
import type { BrandingProfile } from "./extract";

export interface DesignScore {
  colors: number;
  typography: number;
  spacing: number;
  cta: number;
  structure: number;
  accessibility: number;
  user_flow: number;
  overall: number;
}

export interface DesignFinding {
  issues: string[];
  suggestions: string[];
}

export interface RankedImprovement {
  priority: number;
  category: string;
  issue: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  fix: string;
}

export interface VisionResult {
  page_summary: string;
  scores: DesignScore;
  findings: Record<string, DesignFinding>;
  improvements_ranked: RankedImprovement[];
  summary: string;
}

// ---------------------------------------------------------------------------
// System prompt (PRD §3 — Design Expert)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function analyzeWithVision(
  screenshotUrl: string,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string } = {},
  branding: BrandingProfile | null = null
): Promise<VisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  // Compact one-liner — keeps lighthouse context under ~35 tokens
  const lighthouseSummary = lighthouseData
    ? `LIGHTHOUSE: score=${lighthouseData.accessibilityScore}/100 | violations=${lighthouseData.violations.length}${lighthouseData.violations.length ? ` [${lighthouseData.violations.map((v) => v.id).join(", ")}]` : ""} | contrast:${lighthouseData.colorContrast.score === 1 ? " PASS" : lighthouseData.colorContrast.score === 0 ? ` FAIL (${lighthouseData.colorContrast.failingItems.length} elements)` : " unknown"}`
    : "LIGHTHOUSE: unavailable — infer accessibility from the screenshot.";

  const keep = preferences.keep ?? [];
  const keepInstruction = keep.length > 0
    ? `\nUSER PRESERVATION REQUESTS: The user wants to keep the following — do NOT penalize these categories. Instead, note what works well and suggest improvements within the existing system:\n${keep.map(k => `- ${k}`).join("\n")}`
    : "";

  const userText = `Analyze this website screenshot.
User preferences: style=${preferences.style ?? "modern"}, goal=${preferences.goal ?? "conversion"}, tone=${preferences.tone ?? "professional"}.
${keepInstruction}

${lighthouseSummary}

Return only the JSON object as specified. Reference specific visual elements you observe.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: screenshotUrl },
          },
          {
            type: "text",
            text: userText,
          },
        ],
      },
    ],
  });

  const rawText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Strip accidental markdown fences if Claude adds them despite instructions
  const cleaned = rawText
    .replace(/^```(?:json)?[\r\n]+/, "")
    .replace(/[\r\n]+```\s*$/, "")
    .trim();

  try {
    return JSON.parse(cleaned) as VisionResult;
  } catch {
    throw new Error(
      `Vision response was truncated (${response.usage.output_tokens} tokens). ` +
      `Increase max_tokens or simplify the system prompt.`
    );
  }
}
