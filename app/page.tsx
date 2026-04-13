"use client";

import { useState, useRef } from "react";
import type { BrandingProfile } from "@/lib/tools/extract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DesignScores {
  colors: number;
  typography: number;
  spacing: number;
  cta: number;
  structure: number;
  accessibility: number;
  user_flow: number;
  overall: number;
}

interface DesignFinding {
  issues: string[];
  suggestions: string[];
}

interface RankedImprovement {
  priority: number;
  category: string;
  issue: string;
  impact: "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  fix: string;
}

interface AnalysisResult {
  url: string;
  screenshotUrl: string;
  analysis: {
    page_summary: string;
    scores: DesignScores;
    findings: Record<string, DesignFinding>;
    improvements_ranked: RankedImprovement[];
    summary: string;
  };
  prompt: string;
  branding: BrandingProfile | null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; step: string; message: string }
  | { kind: "done"; result: AnalysisResult }
  | { kind: "error"; message: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = ["extracting", "lighthouse", "vision", "prompt", "done"] as const;
const STEP_PROGRESS: Record<string, number> = {
  extracting: 15,
  lighthouse: 38,
  vision: 68,
  prompt: 88,
  done: 100,
};

const KEEP_OPTIONS: { id: string; label: string; description: string }[] = [
  { id: "typography", label: "Typography", description: "Keep your current fonts and type scale" },
  { id: "colors",     label: "Color palette", description: "Keep your current colors" },
  { id: "spacing",    label: "Spacing rhythm", description: "Keep your current spacing system" },
  { id: "structure",  label: "Overall structure", description: "Don't change the layout" },
];

const CATEGORIES: { key: keyof Omit<DesignScores, "overall">; label: string }[] = [
  { key: "colors",        label: "Colors" },
  { key: "typography",    label: "Typography" },
  { key: "spacing",       label: "Spacing" },
  { key: "cta",           label: "CTAs" },
  { key: "structure",     label: "Structure" },
  { key: "accessibility", label: "Accessibility" },
  { key: "user_flow",     label: "User Flow" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(n: number) {
  if (n >= 80) return { dot: "bg-emerald-400", text: "text-emerald-600", ring: "#34d399" };
  if (n >= 55) return { dot: "bg-amber-400",   text: "text-amber-500",   ring: "#fbbf24" };
  return           { dot: "bg-red-400",         text: "text-red-500",     ring: "#f87171" };
}

function impactColor(impact: string) {
  if (impact === "high")   return "text-red-500";
  if (impact === "medium") return "text-amber-500";
  return "text-gray-400";
}

// ---------------------------------------------------------------------------
// ScoreRing — thin SVG ring, minimal aesthetic
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const strokeWidth = 3;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const c = scoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          stroke={c.ring}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className={`text-2xl font-semibold tracking-tight ${c.text}`}>{score}</span>
        <span className="text-[10px] text-gray-400 mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BrowserFrame — minimal macOS-style chrome around the screenshot
// ---------------------------------------------------------------------------

function BrowserFrame({ url, screenshotUrl }: { url: string; screenshotUrl: string }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex gap-1.5 flex-shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
        </div>
        <div className="flex-1 mx-2 h-5 bg-white rounded-md border border-gray-200 flex items-center px-2 min-w-0">
          <span className="text-[10px] text-gray-400 truncate">{url}</span>
        </div>
      </div>
      {/* Screenshot */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={screenshotUrl}
        alt="Website screenshot"
        className="w-full object-cover object-top block"
        style={{ maxHeight: 260 }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CategoryCard — color dot + score, expandable
// ---------------------------------------------------------------------------

function CategoryCard({
  label,
  score,
  finding,
}: {
  label: string;
  score: number;
  finding: DesignFinding;
}) {
  const [open, setOpen] = useState(false);
  const c = scoreColor(score);
  const hasContent = finding.issues.length > 0 || finding.suggestions.length > 0;

  return (
    <div
      className={`bg-gray-50 border border-gray-100 rounded-xl px-4 py-3.5 transition-all duration-200 ${
        hasContent ? "cursor-pointer hover:bg-white hover:border-gray-200 hover:shadow-[0_1px_6px_rgba(0,0,0,0.05)]" : ""
      }`}
      onClick={() => hasContent && setOpen((o) => !o)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.dot}`} />
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold tabular-nums ${c.text}`}>{score}</span>
          {hasContent && (
            <span className="text-gray-300 text-xs">{open ? "▴" : "▾"}</span>
          )}
        </div>
      </div>

      {open && hasContent && (
        <div className="mt-3 pt-3 border-t border-gray-50 space-y-2.5 text-xs text-gray-600">
          {finding.issues.length > 0 && (
            <ul className="space-y-1.5">
              {finding.issues.map((issue, i) => (
                <li key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-red-400 flex-shrink-0 mt-px">✕</span>
                  <span>{issue}</span>
                </li>
              ))}
            </ul>
          )}
          {finding.suggestions.length > 0 && (
            <ul className="space-y-1.5">
              {finding.suggestions.map((s, i) => (
                <li key={i} className="flex gap-2 leading-relaxed">
                  <span className="text-emerald-500 flex-shrink-0 mt-px">→</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptBox — monospace, subtle copy button revealed on hover
// ---------------------------------------------------------------------------

function PromptBox({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative rounded-xl border border-gray-100 bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div>
          <p className="text-xs font-semibold text-gray-700 tracking-wide uppercase">
            Lovable / Bolt Prompt
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">Ready to paste</p>
        </div>
        {/* Copy button: always legible but visually quiet; becomes solid on hover */}
        <button
          onClick={copy}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150 ${
            copied
              ? "bg-emerald-500 text-white"
              : "text-gray-400 hover:text-gray-700 hover:bg-white hover:border hover:border-gray-200 border border-transparent"
          }`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Prompt text */}
      <textarea
        readOnly
        value={prompt}
        rows={14}
        style={{ fontFamily: "var(--font-geist-mono), 'SF Mono', monospace" }}
        className="w-full px-4 py-3.5 text-[11.5px] leading-relaxed text-gray-600 bg-transparent resize-none focus:outline-none"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ProgressBar — 1px top bar + minimal step text
// ---------------------------------------------------------------------------

function ProgressBar({ phase }: { phase: Phase }) {
  if (phase.kind === "idle" || phase.kind === "error") return null;

  const pct =
    phase.kind === "done"
      ? 100
      : STEP_PROGRESS[phase.step] ?? 10;

  const message = phase.kind === "done" ? "Analysis complete" : phase.message;

  return (
    <>
      {/* 1px bar fixed at top of viewport */}
      <div className="fixed top-0 left-0 right-0 h-px bg-gray-100 z-50">
        <div
          className="h-full bg-gray-900 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Step text */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {phase.kind === "loading" && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-gray-500" />
          </span>
        )}
        <span className="text-xs text-gray-400 tracking-wide">{message}</span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function Results({ result, platform }: { result: AnalysisResult; platform: "lovable" | "bolt" | "claude" }) {
  const { analysis, screenshotUrl, url, prompt } = result;
  const { scores, findings, improvements_ranked, summary, page_summary } = analysis;

  return (
    <div className="space-y-8 mt-10">

      {/* Screenshot */}
      <div className="animate-fade-up">
        <BrowserFrame url={url} screenshotUrl={screenshotUrl} />
        {result.branding?.colors && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">
              Detected Design System
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(result.branding.colors)
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
            {result.branding.fonts && result.branding.fonts.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Fonts: {result.branding.fonts.map(f => f.family).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Score + summary strip */}
      <div className="animate-fade-up-delay-1 flex items-start gap-6 bg-gray-50 border border-gray-100 rounded-xl px-6 py-5">
        <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
          <ScoreRing score={scores.overall} />
          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-medium">Overall</span>
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium mb-1.5">
            {page_summary}
          </p>
          <p className="text-sm text-gray-600 leading-relaxed">{summary}</p>
        </div>
      </div>

      {/* Category grid */}
      <div className="animate-fade-up-delay-2">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Categories <span className="font-normal text-gray-300">— tap to expand</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CATEGORIES.map(({ key, label }) => (
            <CategoryCard
              key={key}
              label={label}
              score={scores[key] ?? 0}
              finding={findings[key] ?? { issues: [], suggestions: [] }}
            />
          ))}
        </div>
      </div>

      {/* Priority improvements */}
      <div className="animate-fade-up-delay-3">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
          Priority improvements
        </p>
        <div className="space-y-px">
          {improvements_ranked.map((imp) => (
            <div
              key={imp.priority}
              className="flex gap-4 bg-gray-50 border border-gray-100 px-4 py-3.5 first:rounded-t-xl last:rounded-b-xl hover:bg-white hover:border-gray-200 transition-colors"
            >
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold flex items-center justify-center mt-0.5">
                {imp.priority}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-700 font-medium leading-snug">{imp.issue}</span>
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${impactColor(imp.impact)}`}>
                    {imp.impact}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  <span className="text-emerald-500 mr-1">→</span>
                  {imp.fix}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Prompt */}
      <div className="animate-fade-up-delay-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-3">
          {platform === "claude" ? "Claude Build Brief" : `${platform.charAt(0).toUpperCase() + platform.slice(1)} Prompt`}
        </p>
        <PromptBox prompt={prompt} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const [keep, setKeep] = useState<string[]>([]);
  const [platform, setPlatform] = useState<"lovable" | "bolt" | "claude">("lovable");
  const [customKeep, setCustomKeep] = useState("");

  function toggleKeep(id: string) {
    setKeep(prev => prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]);
  }

  const analyze = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setPhase({ kind: "loading", step: "extracting", message: "Starting…" });

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          preferences: {
            style: "modern",
            goal: "conversion",
            tone: "professional",
            keep,
            platform,
          },
        }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({ error: "Request failed" }));
        setPhase({ kind: "error", message: err.error ?? "Request failed" });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let event: { type: string; step?: string; message?: string; data?: AnalysisResult };
            try { event = JSON.parse(line.slice(6)); } catch { continue; }

            if (event.type === "progress" && event.step) {
              setPhase({ kind: "loading", step: event.step, message: event.message ?? "" });
            } else if (event.type === "result" && event.data) {
              setPhase({ kind: "done", result: event.data });
            } else if (event.type === "error") {
              setPhase({ kind: "error", message: event.message ?? "Unknown error" });
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setPhase({ kind: "error", message: (err as Error).message ?? "Network error" });
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase({ kind: "idle" });
    setUrl("");
    setKeep([]);
    setPlatform("lovable");
    setCustomKeep("");
  };

  const isLoading = phase.kind === "loading";

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <ProgressBar phase={phase} />

      <div className="max-w-2xl mx-auto px-5 pt-16 pb-24">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-[22px] font-semibold text-gray-900 tracking-tight">
            Design Analyzer
          </h1>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            Objective scores, findings, and a Lovable-ready prompt for any AI-built site.
          </p>
        </div>

        {/* Input */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !isLoading && analyze()}
              placeholder="https://your-site.lovable.app"
              disabled={isLoading}
              className="flex-1 h-10 px-3.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-gray-300 focus:border-gray-300 disabled:opacity-50 transition-all"
            />
            {phase.kind === "done" ? (
              <button
                onClick={reset}
                className="h-10 px-4 rounded-lg text-sm font-medium text-gray-500 border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
            ) : (
              <button
                onClick={analyze}
                disabled={isLoading || !url.trim()}
                className="h-10 px-5 rounded-lg text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? "Analyzing…" : "Analyze"}
              </button>
            )}
          </div>

          {phase.kind === "idle" && (
            <>
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
                  value={customKeep}
                  onChange={e => setCustomKeep(e.target.value)}
                  placeholder="Custom: e.g. keep the hero image position"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
                  onBlur={() => {
                    const val = customKeep.trim();
                    setKeep(prev => {
                      const without = prev.filter(k => !k.startsWith("custom:"));
                      return val ? [...without, `custom: ${val}`] : without;
                    });
                  }}
                />
              </div>

              {/* ── Platform toggle ─────────────────────────────────────────── */}
              <div className="space-y-2 pt-1">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Build platform
                </p>
                <div className="flex gap-2" role="group" aria-label="Build platform">
                  {(["lovable", "bolt", "claude"] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      aria-pressed={platform === p}
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
            </>
          )}
        </div>

        {/* Error */}
        {phase.kind === "error" && (
          <div className="mt-5 px-4 py-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600 leading-relaxed">
            <span className="font-semibold">Error — </span>
            {phase.message}
          </div>
        )}

        {/* Results */}
        {phase.kind === "done" && <Results result={phase.result} platform={platform} />}
      </div>
    </div>
  );
}
