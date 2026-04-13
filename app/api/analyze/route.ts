import { z } from "zod";
import { extractWebsite } from "@/lib/tools/extract";
import { runLighthouse } from "@/lib/tools/lighthouse";
import { analyzeWithVision } from "@/lib/tools/vision";
import { generatePrompt } from "@/lib/tools/prompt";

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const RequestSchema = z.object({
  url: z.string().url("Must be a valid URL").max(2048),
  preferences: z
    .object({
      style: z.enum(["modern", "minimal", "bold", "playful"]).default("modern"),
      goal: z.enum(["conversion", "branding", "ux", "clean"]).default("conversion"),
      tone: z.enum(["professional", "playful", "serious"]).default("professional"),
      keep: z.array(z.string().min(1).max(64)).max(10).default([]),
      platform: z.enum(["lovable", "bolt", "claude"]).default("lovable"),
    })
    .optional()
    .default({ style: "modern", goal: "conversion", tone: "professional", keep: [], platform: "lovable" }),
});

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

type ProgressStep = "extracting" | "lighthouse" | "vision" | "prompt" | "done";

interface ProgressEvent {
  type: "progress";
  step: ProgressStep;
  message: string;
}

interface ResultEvent {
  type: "result";
  data: unknown;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

type SSEPayload = ProgressEvent | ResultEvent | ErrorEvent;

function sseChunk(payload: SSEPayload): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

// ---------------------------------------------------------------------------
// Translate raw API / network errors into user-facing messages
// ---------------------------------------------------------------------------

function friendlyError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("model_not_found") || r.includes("model not found"))
    return "The AI model is temporarily unavailable. Please try again in a moment.";
  if (r.includes("rate_limit") || r.includes("rate limit") || r.includes("429"))
    return "Too many requests. Please wait a few seconds and try again.";
  if (r.includes("401") || r.includes("authentication") || r.includes("api key"))
    return "API authentication error. Please check your API key configuration.";
  if (r.includes("screenshot") || r.includes("firecrawl"))
    return "Could not capture a screenshot for this URL. Make sure the site is publicly accessible.";
  if (r.includes("timeout") || r.includes("timed out"))
    return "The analysis timed out. Try again — complex pages can occasionally take longer.";
  if (r.includes("enotfound") || r.includes("econnrefused") || r.includes("network"))
    return "Network error. Check your internet connection and try again.";
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// POST /api/analyze
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.issues[0]?.message ?? "Invalid request" }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  const { url, preferences } = parsed.data;

  // 20s wall-clock cap for Lighthouse — resolves null if Chrome is slow
  const lighthouseWithTimeout = (u: string): Promise<Awaited<ReturnType<typeof runLighthouse>>> =>
    Promise.race([
      runLighthouse(u).catch((err) => {
        console.error("[lighthouse] error:", err instanceof Error ? err.message : err);
        return null;
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
    ]);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: SSEPayload) => controller.enqueue(sseChunk(payload));

      // ── Heartbeat at t=0 — fires before any await ─────────────────────────
      // This sends the first SSE bytes immediately, establishing the connection
      // and preventing Vercel from timing out while Firecrawl/Lighthouse run.
      send({
        type: "progress",
        step: "extracting",
        message: "Capturing screenshot and extracting HTML…",
      });

      try {
        // ── Step 1: Firecrawl + Lighthouse in parallel ───────────────────────
        const [extractResult, lighthouseResult] = await Promise.all([
          extractWebsite(url),
          lighthouseWithTimeout(url),
        ]);

        send({
          type: "progress",
          step: "lighthouse",
          message: lighthouseResult
            ? `Accessibility audit: ${lighthouseResult.accessibilityScore}/100 — ${lighthouseResult.violations.length} violation(s) found.`
            : "Accessibility audit skipped — continuing with visual analysis.",
        });

        if (!extractResult.screenshotUrl) {
          throw new Error("Could not capture a screenshot for this URL.");
        }

        // ── Step 2: Claude Vision ─────────────────────────────────────────────
        send({
          type: "progress",
          step: "vision",
          message: "Analyzing design across 7 categories with Claude Vision…",
        });

        const visionResult = await analyzeWithVision(
          extractResult.screenshotUrl,
          lighthouseResult,
          preferences,
          extractResult.branding
        );

        // ── Step 3: Generate prompt ───────────────────────────────────────────
        send({
          type: "progress",
          step: "prompt",
          message: preferences.platform === "claude"
            ? "Building your Claude build session brief…"
            : `Building your optimized ${preferences.platform === "bolt" ? "Bolt" : "Lovable"} prompt…`,
        });

        const promptResult = await generatePrompt(
          url,
          visionResult,
          lighthouseResult,
          preferences,
          extractResult.html,
          extractResult.branding
        );

        // ── Done ──────────────────────────────────────────────────────────────
        send({ type: "progress", step: "done", message: "Analysis complete." });

        send({
          type: "result",
          data: {
            url,
            screenshotUrl: extractResult.screenshotUrl,
            lighthouse: lighthouseResult,
            analysis: visionResult,
            prompt: promptResult.prompt,
            branding: extractResult.branding,
          },
        });
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        console.error("[analyze]", raw);
        send({ type: "error", message: friendlyError(raw) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
