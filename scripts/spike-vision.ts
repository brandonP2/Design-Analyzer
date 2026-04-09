/**
 * Spike C — Claude Vision: análisis de diseño en 7 categorías
 *
 * Envía el screenshot de una URL a claude-sonnet-4-5 con el system prompt
 * del PRD (sección 3) y devuelve un JSON estructurado con findings.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/spike-vision.ts [screenshot-url]
 *
 * Si no se pasa URL de screenshot, usa el screenshot de Firecrawl del Spike B
 * (example.com) para validar el pipeline.
 */

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Defaults: screenshot real obtenido en el Spike B
// ---------------------------------------------------------------------------
const DEFAULT_SCREENSHOT =
  "https://storage.googleapis.com/firecrawl-scrape-media/screenshot-7e586b08-501f-42ec-9a17-05598810c8d1.png?GoogleAccessId=scrape-bucket-accessor%40firecrawl.iam.gserviceaccount.com&Expires=1776281617&Signature=ITMZaIhZKyAV%2BjrZAhC3mTMf86eWFZYlGCXqtLvdYhPAnUdu0cjooarlCeiVdOyHzVOAUo1Ly8tYfBmdMc79n0FnyZJp5tVagbUXCWUEx5Nt%2F2t1UXLz1AxHzh0i5DVtQB9re9Hlr7KCroRv3e1zvIRGViFQH%2BM7DspTDtFwyj7KggbFdUPcjZQFkmIhHSa3ImgEBbE4qE6%2FqgQfn15ANqbtLRd3FRTl7Wu6AF4JiuwbBHUge7z7JkmsnidFXvClAChP2yCH2947yGQuaz3mzG%2F5r5LOTxirARn%2FhLPLxu2Yj9gyTII3fJL4OPNLG6EHm2FpaIgBYBGI%2FYaPJqAWYg%3D%3D";

const screenshotUrl = process.argv[2] ?? DEFAULT_SCREENSHOT;

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("❌  Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// System prompt (PRD sección 3, adaptado para output JSON puro)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert web designer and UX analyst. Your role is to analyze website screenshots comprehensively.

ANALYZE the screenshot across these 7 design dimensions:

1. COLORS — Color psychology, palette harmony, contrast ratios, brand consistency
2. TYPOGRAPHY — Font hierarchy, readability, sizing, line-height, font pairing
3. SPACING — Whitespace ratio, padding/margin consistency, breathing room, layout density
4. CTAs — Button prominence, size, clarity, placement, urgency signals
5. STRUCTURE — Information architecture, visual hierarchy, content organization, flow
6. ACCESSIBILITY — Contrast compliance (WCAG AA = 4.5:1 text, 3:1 UI), text size, interactive targets
7. USER_FLOW — Journey clarity, cognitive load, primary action clarity, friction points

EVALUATE each dimension and produce a JSON object. Be specific about issues — mention actual visual elements you see, not generic advice.

OUTPUT FORMAT — respond with ONLY valid JSON, no markdown fences, no preamble:
{
  "page_summary": "brief description of what the page is and its apparent purpose",
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
    "colors": {
      "issues": ["specific issue with actual colors observed"],
      "suggestions": ["specific fix with values"]
    },
    "typography": {
      "issues": [],
      "suggestions": []
    },
    "spacing": {
      "issues": [],
      "suggestions": []
    },
    "cta": {
      "issues": [],
      "suggestions": []
    },
    "structure": {
      "issues": [],
      "suggestions": []
    },
    "accessibility": {
      "issues": [],
      "suggestions": []
    },
    "user_flow": {
      "issues": [],
      "suggestions": []
    }
  },
  "improvements_ranked": [
    {
      "priority": 1,
      "category": "cta|colors|typography|spacing|structure|accessibility|user_flow",
      "issue": "what is wrong",
      "impact": "high|medium|low",
      "effort": "low|medium|high",
      "fix": "specific actionable fix with values"
    }
  ],
  "summary": "2-3 sentence overall verdict with the score and top 2 priorities"
}

CONSTRAINTS:
- Score honestly — a real production site rarely scores above 80 in all categories
- Reference actual visual elements you observe (colors, layout patterns, text sizes)
- Prioritize accessibility and contrast issues above aesthetic ones
- improvements_ranked: list top 5, ordered by impact/effort ratio (high impact + low effort first)`;

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------
const USER_MESSAGE = `Analyze this website screenshot.
User preferences: style=modern, goal=conversion, tone=professional.
Return only the JSON object as specified.`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`\n🎨  Spike C — Claude Vision Design Analysis`);
  console.log(`    Screenshot: ${screenshotUrl.slice(0, 80)}...`);
  console.log(`    Model     : claude-sonnet-4-5\n`);

  const client = new Anthropic({ apiKey });

  // Verify the screenshot URL is reachable before sending to Claude
  try {
    const probe = await fetch(screenshotUrl, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
    });
    if (!probe.ok) {
      console.error(`❌  Screenshot URL returned HTTP ${probe.status}. The signed URL may have expired.`);
      console.error("    Run spike-firecrawl.ts again to get a fresh URL.");
      process.exit(1);
    }
    console.log(`✅  Screenshot URL reachable (HTTP ${probe.status})\n`);
  } catch {
    console.error("❌  Screenshot URL unreachable. Check the URL or your network.");
    process.exit(1);
  }

  console.log("⏳  Sending to Claude Vision...\n");

  const start = Date.now();

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "url",
              url: screenshotUrl,
            },
          },
          {
            type: "text",
            text: USER_MESSAGE,
          },
        ],
      },
    ],
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // ---------------------------------------------------------------------------
  // Parse response
  // ---------------------------------------------------------------------------
  const rawText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Strip markdown fences Claude sometimes adds despite instructions
  const cleaned = rawText
    .replace(/^```(?:json)?[\r\n]+/, "")
    .replace(/[\r\n]+```\s*$/, "")
    .trim();

  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(cleaned);
  } catch {
    console.error("❌  Claude did not return valid JSON. Raw response:\n");
    console.log(rawText);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // Print results
  // ---------------------------------------------------------------------------
  const scores = analysis.scores as Record<string, number>;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Page: ${analysis.page_summary}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");

  console.log("  SCORES");
  const scoreEmoji = (n: number) => (n >= 80 ? "🟢" : n >= 55 ? "🟡" : "🔴");
  for (const [cat, val] of Object.entries(scores)) {
    const bar = "█".repeat(Math.round(val / 10)) + "░".repeat(10 - Math.round(val / 10));
    console.log(`  ${scoreEmoji(val)} ${cat.padEnd(14)} ${bar}  ${val}/100`);
  }

  console.log("");
  console.log("  TOP IMPROVEMENTS");
  const ranked = analysis.improvements_ranked as Array<{
    priority: number;
    category: string;
    issue: string;
    impact: string;
    effort: string;
    fix: string;
  }>;
  for (const item of ranked) {
    console.log(`  ${item.priority}. [${item.impact} impact / ${item.effort} effort] ${item.issue}`);
    console.log(`     → ${item.fix}`);
  }

  console.log("");
  console.log("  SUMMARY");
  console.log(`  ${analysis.summary}`);
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Tokens: ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`);
  console.log(`  Time  : ${elapsed}s`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  console.log("  FULL JSON OUTPUT\n");
  console.log(JSON.stringify(analysis, null, 2));
}

main().catch((err) => {
  console.error("❌ ", err instanceof Error ? err.message : err);
  process.exit(1);
});
