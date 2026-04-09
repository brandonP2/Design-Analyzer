/**
 * Spike A — Lighthouse local (no external API)
 *
 * Runs the lighthouse CLI via child_process (avoids ESM/CJS import issues),
 * captures JSON output, and prints accessibility violations + color-contrast.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/spike-lighthouse.ts [url]
 *
 * Requires: Google Chrome at the default macOS path.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const execFileAsync = promisify(execFile);
const TEST_URL = process.argv[2] ?? "https://clever-kelpie-60c3b6.lovable.app";

const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Output to a temp file so we can parse the JSON cleanly
const OUTPUT_PATH = join(tmpdir(), `lhr-${Date.now()}.json`);

async function main() {
  console.log(`\n🔍  Running Lighthouse on: ${TEST_URL}\n`);

  try {
    await execFileAsync(
      "node_modules/.bin/lighthouse",
      [
        TEST_URL,
        "--output=json",
        `--output-path=${OUTPUT_PATH}`,
        "--only-categories=accessibility",
        "--chrome-flags=--headless --no-sandbox --disable-gpu",
        // Give SPAs extra time to hydrate before auditing
        "--max-wait-for-load=15000",
        "--quiet",
      ],
      {
        env: { ...process.env, CHROME_PATH },
        timeout: 90_000,
      }
    );
  } catch (err) {
    // Lighthouse exits non-zero even on success when there are violations;
    // only bail if the output file wasn't written.
    const { existsSync } = await import("fs");
    if (!existsSync(OUTPUT_PATH)) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`❌  Lighthouse failed: ${msg}`);
      process.exit(1);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lhr = JSON.parse(require("fs").readFileSync(OUTPUT_PATH, "utf-8"));
  unlinkSync(OUTPUT_PATH);

  const accessibility = lhr.categories?.accessibility;
  const audits: Record<string, any> = lhr.audits ?? {};

  // ---------------------------------------------------------------------------
  // Score summary
  // ---------------------------------------------------------------------------

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Accessibility score : ${Math.round((accessibility?.score ?? 0) * 100)} / 100`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ---------------------------------------------------------------------------
  // Violations = failed audits that have concrete items
  // ---------------------------------------------------------------------------

  const auditRefs: { id: string }[] = accessibility?.auditRefs ?? [];
  const violations = auditRefs
    .map(({ id }) => audits[id])
    .filter(
      (a) =>
        a &&
        a.score !== null &&
        a.score !== undefined &&
        a.score < 1 &&
        a.details?.items?.length > 0
    )
    .map((a) => ({
      id: a.id,
      title: a.title,
      score: a.score,
      itemCount: a.details?.items?.length ?? 0,
      items: (a.details?.items ?? []).slice(0, 5).map((item: any) => {
        const node = item.node ?? {};
        return {
          snippet: node.snippet ?? item.snippet ?? item.nodeLabel,
          contrastRatio: node.contrastRatio ?? item.contrastRatio,
          explanation: node.explanation ?? item.failureSummary,
        };
      }),
    }));

  console.log(`  Violations found: ${violations.length}\n`);

  if (violations.length === 0) {
    console.log("  ✅  No accessibility violations detected.");
  } else {
    console.log("  ── Violations JSON ──────────────────────────────────\n");
    console.log(JSON.stringify(violations, null, 2));
  }

  // ---------------------------------------------------------------------------
  // color-contrast audit in full
  // ---------------------------------------------------------------------------

  const contrastAudit = audits["color-contrast"];
  if (contrastAudit) {
    const contrastItems = (contrastAudit.details?.items ?? []).map((item: any) => ({
      snippet: item.node?.snippet,
      contrastRatio: item.node?.contrastRatio,
      explanation: item.node?.explanation,
    }));

    console.log("\n  ── color-contrast audit ─────────────────────────────\n");
    console.log(
      JSON.stringify(
        {
          score: contrastAudit.score,
          title: contrastAudit.title,
          itemCount: contrastItems.length,
          items: contrastItems,
        },
        null,
        2
      )
    );
  }
}

main().catch((err) => {
  console.error("❌ ", err instanceof Error ? err.message : err);
  process.exit(1);
});
