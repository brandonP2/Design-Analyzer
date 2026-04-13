import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { DesignScore, VisionResult } from "./vision";
import type { LighthouseResult } from "./lighthouse";
import type { BrandingProfile } from "./extract";

export interface PromptResult {
  prompt: string;
}

// ---------------------------------------------------------------------------
// extractHtmlStructure — pull headings, CTAs, and nav links from raw HTML
// ---------------------------------------------------------------------------

function extractHtmlStructure(html: string): string {
  if (!html) return "";

  const headings: string[] = [];
  const ctas: string[] = [];
  const navLinks: string[] = [];

  // Headings (h1-h3)
  const hRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = hRe.exec(html)) !== null) {
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text) headings.push(`H${m[1]}: ${text}`);
  }

  // Buttons and CTA-like links
  const btnRe = /<(?:button|a)[^>]*class="[^"]*(?:btn|cta|button|primary)[^"]*"[^>]*>([\s\S]*?)<\/(?:button|a)>/gi;
  while ((m = btnRe.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, "").trim();
    if (text && text.length < 60) ctas.push(text);
  }

  // Nav links
  const navRe = /<nav[^>]*>([\s\S]*?)<\/nav>/gi;
  while ((m = navRe.exec(html)) !== null) {
    const linkRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
    let lm: RegExpExecArray | null;
    while ((lm = linkRe.exec(m[1])) !== null) {
      const text = lm[1].replace(/<[^>]+>/g, "").trim();
      if (text && text.length < 40) navLinks.push(text);
    }
  }

  const parts: string[] = [];
  if (headings.length) parts.push(`Headings: ${headings.slice(0, 8).join(" | ")}`);
  if (ctas.length) parts.push(`CTAs: ${[...new Set(ctas)].slice(0, 5).join(" | ")}`);
  if (navLinks.length) parts.push(`Nav: ${[...new Set(navLinks)].slice(0, 8).join(" | ")}`);

  return parts.join("\n");
}

interface ComponentEntry {
  nombre: string;
  popularidad: number;
  categoria: string;
  estilo_visual: string;
  problema_que_resuelve: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  colors: "Colors",
  typography: "Typography",
  spacing: "Spacing & Layout",
  cta: "CTAs & Buttons",
  structure: "Structure",
  accessibility: "Accessibility",
  user_flow: "User Flow",
};

// ---------------------------------------------------------------------------
// components.json — lazy load once
// ---------------------------------------------------------------------------

let _components: ComponentEntry[] | null = null;
function getComponents(): ComponentEntry[] {
  if (!_components) {
    const raw = readFileSync(join(process.cwd(), "data/components.json"), "utf-8");
    _components = JSON.parse(raw).components as ComponentEntry[];
  }
  return _components;
}

let _promptExample: string | null = null;
function getPromptExample(): string {
  if (!_promptExample) {
    _promptExample = readFileSync(join(process.cwd(), "data/prompt-example.md"), "utf-8");
  }
  return _promptExample;
}

// ---------------------------------------------------------------------------
// matchComponents — top 5 popular components from weak-score categories
// ---------------------------------------------------------------------------

const SCORE_TO_CATEGORY: Record<string, string[]> = {
  cta:           ["Calls to Action", "Botones"],
  structure:     ["Heroes", "Features"],
  colors:        ["Backgrounds"],
  typography:    ["Textos", "Heroes"],
  user_flow:     ["Navegación", "Heroes"],
  spacing:       ["Features", "Heroes"],
  accessibility: ["Botones", "Navegación"],
};

function matchComponents(scores: DesignScore): ComponentEntry[] {
  const components = getComponents();
  const relevantCategories = new Set<string>();

  for (const [key, categories] of Object.entries(SCORE_TO_CATEGORY)) {
    if ((scores[key as keyof DesignScore] ?? 100) < 75) {
      categories.forEach(c => relevantCategories.add(c));
    }
  }

  return components
    .filter(c => relevantCategories.has(c.categoria))
    .sort((a, b) => b.popularidad - a.popularidad)
    .slice(0, 7);
}

// ---------------------------------------------------------------------------
// runDesignSystem — call ui-ux-pro-max CLI, return markdown or null on failure
// ---------------------------------------------------------------------------

const DESIGN_SYSTEM_SCRIPT =
  "/Users/mws/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/2.5.0/src/ui-ux-pro-max/scripts/search.py";

function runDesignSystem(pageSummary: string): string | null {
  try {
    const keywords = pageSummary
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .slice(0, 6)
      .join(" ");

    const output = execFileSync(
      "python3",
      [DESIGN_SYSTEM_SCRIPT, keywords, "--design-system", "-f", "markdown"],
      { timeout: 8_000, encoding: "utf-8" }
    );
    return output.trim();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// System prompt for Haiku
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  const example = getPromptExample();
  return `You are an expert design-to-code translator for Lovable and Bolt (AI website builders).

Given a structured design analysis with scores, findings, page content, and component suggestions, write a precise, actionable redesign prompt that a human can paste directly into Lovable/Bolt.

## Rules

1. Be SPECIFIC — reference actual content from the page (headlines, button text, section names). Never say "improve the headline"; say "change 'Welcome to Our Platform' to 'Ship 10x Faster With AI-Powered Workflows'".
2. Include exact CSS values: #hex colors, px sizes, font-weights, border-radius, shadows, spacing.
3. Structure the output with these sections in order:
   - **KEEP**: what's already working well (be specific about what and why)
   - **DESIGN SYSTEM**: complete color palette (primary, hover, background, surface, text, accent, border) + typography scale (H1-H3, body, small with size/weight/line-height/tracking)
   - **CHANGE**: numbered list ordered by priority. Each item: [impact/effort] + specific issue + specific fix with CSS values
   - **COMPONENTS TO UPGRADE**: for each, name the target section, the component name from 21st.dev, and WHY it solves the specific problem observed
   - **CONSTRAINTS**: WCAG AA, mobile responsive, performance notes
4. CHANGE items should have 5-8 entries, not fewer. Cover all weak categories.
5. COMPONENTS TO UPGRADE: only include components from the provided list that would make a meaningful visual difference. Explain the before→after for each.
6. DESIGN SYSTEM: extract colors from what you observe + what needs to change. Build a coherent palette, don't just list random hex values.
7. Output ONLY the prompt text — no preamble, no markdown fences, no explanation.

## Example of an excellent prompt

${example}`;
}

// ---------------------------------------------------------------------------
// Build a lean input for Haiku (~600-700 tokens with new blocks)
// ---------------------------------------------------------------------------

function buildUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string },
  designSystem: string | null,
  html: string
): string {
  const { scores, findings, improvements_ranked, page_summary } = vision;
  const style = preferences.style ?? "modern";
  const goal = preferences.goal ?? "conversion";
  const tone = preferences.tone ?? "professional";

  const keepList = Object.entries(scores)
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

  const dsBlock = designSystem
    ? `\nDESIGN SYSTEM RECOMMENDATION:\n${designSystem}\n`
    : "";

  const htmlBlock = extractHtmlStructure(html);
  const htmlSection = htmlBlock
    ? `\nPAGE CONTENT (from HTML):\n${htmlBlock}\n`
    : "";

  const comps = matchComponents(scores);
  const compsBlock = comps.length > 0
    ? `\nCOMPONENTS TO SUGGEST (from 21st.dev, sorted by popularity):\n` +
      comps.map(c =>
        `- ${c.nombre} [${c.categoria}, pop:${c.popularidad}]: ${c.problema_que_resuelve}`
      ).join("\n") + "\n"
    : "";

  return [
    `URL: ${url}`,
    `Page: ${page_summary}`,
    `Score: ${scores.overall}/100 | Style: ${style} | Goal: ${goal} | Tone: ${tone}`,
    contrastLine,
    htmlSection,
    keepList.length ? `STRONG (score ≥75): ${keepList.join(", ")}` : "",
    weakList.length ? `WEAK (needs work): ${weakList.join(", ")}` : "",
    dsBlock,
    "PRIORITY FIXES:",
    priorityFixes,
    "",
    "ALL CATEGORY SUGGESTIONS:",
    categorySuggestions,
    compsBlock,
  ]
    .filter((l) => l !== undefined)
    .join("\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Main — async, uses Haiku for fast text generation
// ---------------------------------------------------------------------------

export async function generatePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string } = {},
  html: string = "",
  branding: BrandingProfile | null = null
): Promise<PromptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  const designSystem = runDesignSystem(visionResult.page_summary);
  const userText = buildUserInput(url, visionResult, lighthouseData, preferences, designSystem, html);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3500,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userText }],
  });

  const prompt = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim();

  return { prompt };
}
