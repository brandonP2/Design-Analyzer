import { readFileSync } from "fs";
import { join } from "path";
import { execFileSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { TextBlock } from "@anthropic-ai/sdk/resources/messages";
import type { DesignScore, VisionResult } from "./vision";
import type { LighthouseResult } from "./lighthouse";
import type { BrandingProfile } from "./extract";

export interface PromptResult {
  prompt: string;
}

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

// ---------------------------------------------------------------------------
// buildBrandingBlock — format detected branding into a prompt section
// ---------------------------------------------------------------------------

function buildBrandingBlock(branding: BrandingProfile | null): string {
  if (!branding?.colors) return "";

  const colorParts = [
    branding.colors.primary && `primary=${branding.colors.primary}`,
    branding.colors.secondary && `secondary=${branding.colors.secondary}`,
    branding.colors.accent && `accent=${branding.colors.accent}`,
    branding.colors.background && `background=${branding.colors.background}`,
    branding.colors.textPrimary && `text=${branding.colors.textPrimary}`,
    branding.colors.textSecondary && `textSecondary=${branding.colors.textSecondary}`,
    branding.colors.link && `link=${branding.colors.link}`,
  ].filter(Boolean).join(", ");

  const fontParts = branding.fonts?.map(f => f.family).join(", ") ?? "unknown";

  const typo = branding.typography;
  const typoParts = typo ? [
    typo.fontSizes?.h1 && `h1=${typo.fontSizes.h1}`,
    typo.fontSizes?.h2 && `h2=${typo.fontSizes.h2}`,
    typo.fontSizes?.body && `body=${typo.fontSizes.body}`,
    typo.fontWeights?.regular !== undefined && `weight-regular=${typo.fontWeights.regular}`,
    typo.fontWeights?.bold !== undefined && `weight-bold=${typo.fontWeights.bold}`,
    typo.lineHeights?.body !== undefined && `lineHeight=${typo.lineHeights.body}`,
  ].filter(Boolean).join(", ") : "";

  const spacingParts = branding.spacing ? [
    branding.spacing.baseUnit !== undefined && `baseUnit=${branding.spacing.baseUnit}`,
    branding.spacing.borderRadius && `borderRadius=${branding.spacing.borderRadius}`,
    branding.spacing.gridGutter !== undefined && `gutter=${branding.spacing.gridGutter}`,
  ].filter(Boolean).join(", ") : "";

  const lines = [
    `Colors: ${colorParts}`,
    `Fonts: ${fontParts}`,
    typoParts && `Typography: ${typoParts}`,
    spacingParts && `Spacing: ${spacingParts}`,
  ].filter(Boolean).join("\n");

  return `\nDETECTED BRANDING:\n${lines}\n`;
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

// ---------------------------------------------------------------------------
// Build a lean input for Haiku (~600-700 tokens with new blocks)
// ---------------------------------------------------------------------------

function buildUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  designSystem: string | null,
  markdown: string,
  branding: BrandingProfile | null
): string {
  const { scores, findings, improvements_ranked, page_summary } = vision;
  const style = preferences.style ?? "modern";
  const goal = preferences.goal ?? "conversion";
  const tone = preferences.tone ?? "professional";

  const keep = (preferences.keep ?? []).map(k => k.replace(/[\r\n]/g, " "));
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

  const dsBlock = designSystem
    ? `\nDESIGN SYSTEM RECOMMENDATION:\n${designSystem}\n`
    : "";

  const markdownSection = markdown ? `\nPAGE CONTENT:\n${markdown.slice(0, 3000)}\n` : "";

  const brandingBlock = buildBrandingBlock(branding);

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
}

function buildClaudeUserInput(
  url: string,
  vision: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  designSystem: string | null,
  markdown: string,
  branding: BrandingProfile | null
): string {
  const { scores, findings, improvements_ranked, page_summary } = vision;
  const style = preferences.style ?? "modern";
  const goal = preferences.goal ?? "conversion";
  const tone = preferences.tone ?? "professional";
  const keep = (preferences.keep ?? []).map(k => k.replace(/[\r\n]/g, " "));

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

  const brandingBlock = buildBrandingBlock(branding);

  const dsBlock = designSystem ? `\nDESIGN SYSTEM RECOMMENDATION:\n${designSystem}\n` : "";

  const markdownSection = markdown ? `\nPAGE CONTENT:\n${markdown.slice(0, 3000)}\n` : "";

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
}

// ---------------------------------------------------------------------------
// Main — async, uses Haiku for fast text generation
// ---------------------------------------------------------------------------

export async function generatePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string } = {},
  markdown: string = "",
  branding: BrandingProfile | null = null,
  links: string[] = []
): Promise<PromptResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });

  if (preferences.platform === "claude") {
    const prompt = await generateClaudePrompt(
      url, visionResult, lighthouseData, preferences, markdown, branding, links, client
    );
    return { prompt };
  }

  const designSystem = runDesignSystem(visionResult.page_summary);
  const userText = buildUserInput(url, visionResult, lighthouseData, preferences, designSystem, markdown, branding);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3500,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userText }],
  });

  const prompt = response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  return { prompt };
}

async function generateClaudePrompt(
  url: string,
  visionResult: VisionResult,
  lighthouseData: LighthouseResult | null,
  preferences: { style?: string; goal?: string; tone?: string; keep?: string[]; platform?: string },
  markdown: string,
  branding: BrandingProfile | null,
  links: string[],
  client: Anthropic
): Promise<string> {
  const designSystem = runDesignSystem(visionResult.page_summary);
  const userText = buildClaudeUserInput(
    url, visionResult, lighthouseData, preferences, designSystem, markdown, branding
  );

  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 3500,
    system: buildClaudeSystemPrompt(),
    messages: [{ role: "user", content: userText }],
  });

  const basePrompt = response.content
    .filter((b): b is TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();

  const appendix = buildSkillsAppendix(visionResult.scores);
  return `${basePrompt}\n\n${appendix}`;
}
