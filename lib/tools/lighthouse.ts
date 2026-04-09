import { execFile } from "child_process";
import { promisify } from "util";
import { unlinkSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);

export interface LighthouseResult {
  accessibilityScore: number;
  // Lean shape — only what Claude Vision needs (keeps prompt tokens low)
  violations: Array<{
    id: string;
    score: number;
    description: string;
  }>;
  colorContrast: {
    score: number | null;
    failingItems: Array<{
      snippet?: string;
      contrastRatio?: number;
      explanation?: string;
    }>;
  };
}

// Resolve the lighthouse binary relative to this file's location,
// then fall back to a global install.
const LIGHTHOUSE_BIN = join(process.cwd(), "node_modules/.bin/lighthouse");

const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function runLighthouse(url: string): Promise<LighthouseResult | null> {
  const outputPath = join(tmpdir(), `lhr-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

  try {
    await execFileAsync(
      LIGHTHOUSE_BIN,
      [
        url,
        "--output=json",
        `--output-path=${outputPath}`,
        "--only-categories=accessibility",
        "--chrome-flags=--headless --no-sandbox --disable-gpu",
        "--max-wait-for-load=15000",
        "--quiet",
      ],
      {
        env: { ...process.env, CHROME_PATH },
        timeout: 18_000, // hard cap — route adds a 20s Promise.race on top
      }
    );
  } catch {
    // Lighthouse exits non-zero when violations are found — only fail if
    // no output file was written.
    if (!existsSync(outputPath)) return null;
  }

  if (!existsSync(outputPath)) return null;

  let lhr: Record<string, unknown>;
  try {
    lhr = JSON.parse(readFileSync(outputPath, "utf-8"));
  } finally {
    try { unlinkSync(outputPath); } catch { /* ignore */ }
  }

  const accessibility = (lhr.categories as Record<string, { score: number; auditRefs: { id: string }[] }>)
    ?.accessibility;
  const audits = (lhr.audits ?? {}) as Record<string, {
    id: string;
    description: string;
    score: number | null;
    details?: { items?: Record<string, unknown>[] };
  }>;

  const auditRefs = accessibility?.auditRefs ?? [];

  // Lean shape: only id, score, description — enough for Claude Vision context
  const violations = auditRefs
    .map(({ id }) => audits[id])
    .filter(
      (a) =>
        a &&
        a.score !== null &&
        a.score !== undefined &&
        a.score < 1 &&
        (a.details?.items?.length ?? 0) > 0
    )
    .map((a) => ({
      id: a.id,
      score: a.score as number,
      description: (a.description ?? "").split(".")[0], // first sentence only
    }));

  const contrastAudit = audits["color-contrast"];
  const colorContrast = {
    score: contrastAudit?.score ?? null,
    failingItems: (contrastAudit?.details?.items ?? []).map((item) => {
      const node = item.node as Record<string, unknown> | undefined;
      return {
        snippet: node?.snippet as string | undefined,
        contrastRatio: node?.contrastRatio as number | undefined,
        explanation: node?.explanation as string | undefined,
      };
    }),
  };

  return {
    accessibilityScore: Math.round((accessibility?.score ?? 0) * 100),
    violations,
    colorContrast,
  };
}
