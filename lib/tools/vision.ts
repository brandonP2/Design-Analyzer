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

const SYSTEM_PROMPT = `You are an expert web designer and UX analyst. Analyze website screenshots comprehensively.

ANALYZE across 7 dimensions:
1. COLORS — palette harmony, contrast ratios, brand consistency, color psychology
2. TYPOGRAPHY — font hierarchy, readability, sizing (min 16px body), line-height, font pairing
3. SPACING — whitespace ratio, padding/margin consistency, layout density, breathing room
4. CTAs — button prominence, size (min 44px tap target), clarity, placement, urgency signals
5. STRUCTURE — information architecture, visual hierarchy, content organization
6. ACCESSIBILITY — WCAG AA compliance (4.5:1 text contrast, 3:1 UI contrast), text size, target size
7. USER_FLOW — journey clarity, cognitive load, primary action clarity, friction points

When Lighthouse data is provided, use it as ground truth for accessibility scores and contrast ratios.

Score honestly — a typical AI-generated site scores 40–70 range. References to actual visual elements you observe are required.

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

  const userText = `Analyze this website screenshot.
User preferences: style=${preferences.style ?? "modern"}, goal=${preferences.goal ?? "conversion"}, tone=${preferences.tone ?? "professional"}.

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
