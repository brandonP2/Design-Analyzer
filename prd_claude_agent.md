# PRD: Claude Design Analysis Agent
## Documento de Requisitos Técnicos del Agente IA

---

## 1. OVERVIEW

**Nombre**: Claude Design Analysis Agent
**Propósito**: Agente autónomo que analiza websites, genera mockups mejorados y crea prompts optimizados.

**Entrada**: URL de website
**Salida**: {analysis, mockup_images, optimized_prompt}

**Patrón**: Agentic loop (Claude decide qué hacer paso a paso)

---

## 2. AGENT ARCHITECTURE

### Componentes principales

```
┌─────────────────────────────────────────┐
│   CLAUDE AGENT (Agentic Loop)           │
├─────────────────────────────────────────┤
│ System Prompt: Design Expert            │
│ Tools: [5 tools]                        │
│ Model: Claude Opus 4.6                  │
│ Max tokens: 4096                        │
└────────────────────┬────────────────────┘
         │
         ├─ Tool 1: extract_website
         ├─ Tool 2: analyze_design
         ├─ Tool 3: generate_mockup
         ├─ Tool 4: render_mockup
         └─ Tool 5: generate_prompt
```

### Flow
```
1. User Input → Agent starts
2. Agent thinks: "I need to extract first"
3. Claude calls Tool 1 (extract_website)
4. Receives result → thinks: "Now analyze"
5. Claude calls Tool 2 (analyze_design)
6. Receives result → thinks: "Generate mockup"
7. Claude calls Tool 3 (generate_mockup)
8. Receives result → thinks: "Render it"
9. Claude calls Tool 4 (render_mockup)
10. Receives result → thinks: "Generate prompt"
11. Claude calls Tool 5 (generate_prompt)
12. Receives result → "Done"
```

---

## 3. SYSTEM PROMPT

The agent's "brain" is defined by system prompt:

```
You are an expert web designer and UX analyst. Your role is to:

1. ANALYZE: Examine website design comprehensively
   - Color psychology, contrast, accessibility
   - Typography hierarchy, readability, font pairing
   - Spacing, layout consistency, responsive design
   - CTA prominence, button sizing, interaction patterns
   - Information architecture, user flow, cognitive load
   - WCAG accessibility compliance

2. EVALUATE: Rate design on 0-100 scale for each category
   - Be specific about issues
   - Prioritize improvements by impact/effort ratio
   - Explain WHY something is weak

3. GENERATE: Create improved mockup
   - Maintain original structure (no major refactors)
   - Fix critical issues first (accessibility, contrast)
   - Improve aesthetics (colors, spacing, hierarchy)
   - Ensure mobile responsiveness
   - Accessibility-first approach

4. CREATE PROMPT: Write detailed, actionable prompt for Lovable/Bolt
   - Include specific color values, sizes, spacing
   - Explain rationale for changes
   - Reference the mockup
   - Ready to copy-paste into Lovable

CONSTRAINTS:
- Don't add new sections (preserve structure)
- Always validate WCAG AA compliance
- Prioritize accessibility over aesthetics
- Keep mockup realistic (CSS only, no JS changes)
- Be concise but specific in feedback
- Rank improvements by effort/impact ratio

USER PREFERENCES CONTEXT:
{user_style} (modern, minimal, bold, playful)
{user_goal} (conversion, brand, ux, clean)
{user_tone} (professional, playful, serious)

Start by extracting the website.
```

---

## 4. TOOLS SPECIFICATION

### TOOL 1: extract_website

**Purpose**: Get HTML, CSS, and visual of website

**Input**:
```json
{
  "url": "https://example.com"
}
```

**Output**:
```json
{
  "html": "<!DOCTYPE html>...",
  "css": "body { ... }",
  "screenshot_actual": "https://storage.url/screenshot.png",
  "detected_colors": ["#FF5733", "#3C3D3D", "#FFFFFF"],
  "detected_fonts": ["Inter", "Poppins"],
  "mobile_viewport": true,
  "page_size_bytes": 245000,
  "status": "success"
}
```

**Execution**: Call Firecrawl API
```javascript
async function extractWebsite(url) {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` },
    body: JSON.stringify({
      url,
      formats: ["html", "markdown", "screenshot"],
      includeMetadata: true
    })
  });
  return await response.json();
}
```

**Timing**: ~5 seconds

---

### TOOL 2: analyze_design

**Purpose**: Analyze design across 7 dimensions

**Input**:
```json
{
  "html": "<!DOCTYPE html>...",
  "screenshot_url": "https://...",
  "user_preferences": {
    "style": "modern",
    "goal": "conversion",
    "tone": "professional"
  }
}
```

**Output**:
```json
{
  "scores": {
    "colors": 45,
    "typography": 60,
    "spacing": 55,
    "cta": 30,
    "structure": 65,
    "accessibility": 40,
    "overall": 49
  },
  "analysis": {
    "colors": {
      "current": ["#333333", "#FF5733", ...],
      "contrast_ratio": "3.2:1 (below WCAG AA)",
      "issues": [
        "Text contrast too low (3.2:1 vs 4.5:1 required)",
        "Color palette lacks vibrancy for conversion goal"
      ],
      "suggestions": [
        "Increase contrast to 7:1 for better readability",
        "Primary color: change #333333 to #1a1a1a"
      ]
    },
    "typography": {
      "current_fonts": ["Inter", "Poppins"],
      "hierarchy": "weak (h1=24px, h2=18px, body=14px)",
      "issues": ["Body text too small for accessibility"],
      "suggestions": ["Body: 14px → 16px", "Increase line-height to 1.6"]
    },
    "spacing": {
      "whitespace_ratio": "15% (low)",
      "issues": ["Cramped layout", "Not enough breathing room"],
      "suggestions": ["Increase padding 20%", "Add margin between sections"]
    },
    "cta": {
      "current_size": "40px x 12px (small)",
      "issues": ["CTA button too small", "Low click-ability"],
      "suggestions": ["Button: 40x12 → 56x16", "Increase padding inside button"]
    },
    "structure": {
      "hierarchy": "good",
      "issues": [],
      "suggestions": ["Consider adding secondary CTA"]
    },
    "accessibility": {
      "wcag_level": "below AA",
      "issues": [
        "No alt text on images",
        "Color contrast fails WCAG AA",
        "Form labels missing"
      ],
      "suggestions": ["Add alt text to all images", "Increase color contrast"]
    },
    "flow": {
      "issues": ["User journey unclear", "Too many calls-to-action"],
      "suggestions": ["Highlight primary CTA", "Remove secondary CTAs"]
    }
  },
  "improvements_ranked": [
    {
      "priority": 1,
      "issue": "CTA buttons too small (40x12px)",
      "impact": "high",
      "effort": "low",
      "suggestion": "Increase to 56x16px, improve padding"
    },
    {
      "priority": 2,
      "issue": "Color contrast fails WCAG (3.2:1)",
      "impact": "high",
      "effort": "low",
      "suggestion": "Change text #333 to #1a1a1a (improves to 8:1)"
    },
    {
      "priority": 3,
      "issue": "Typography hierarchy weak",
      "impact": "medium",
      "effort": "low",
      "suggestion": "Body: 14px → 16px, line-height: 1.4 → 1.6"
    },
    {
      "priority": 4,
      "issue": "Whitespace insufficient",
      "impact": "medium",
      "effort": "medium",
      "suggestion": "Increase section padding 20%"
    }
  ],
  "summary": "Your design is clean but needs stronger CTAs and better color contrast. Accessibility is below WCAG AA standard. Quick wins: increase button sizes and improve text contrast. Overall: 49/100."
}
```

**Execution**: Claude internally analyzes

**Timing**: ~3 seconds

---

### TOOL 3: generate_mockup

**Purpose**: Generate improved HTML/CSS based on analysis

**Input**:
```json
{
  "original_html": "<!DOCTYPE html>...",
  "original_css": "body { ... }",
  "analysis_findings": {
    "colors": { "issues": [...], "suggestions": [...] },
    "cta": { "issues": [...], "suggestions": [...] }
  },
  "improvements_to_apply": [
    "CTA buttons 40x12 → 56x16",
    "Color #333333 → #1a1a1a",
    "Body 14px → 16px"
  ]
}
```

**Output**:
```json
{
  "improved_html": "<!DOCTYPE html>...",
  "improved_css": "body { color: #1a1a1a; font-size: 16px; } .cta { width: 56px; height: 16px; }",
  "changes_applied": [
    "CTA buttons: 40x12 → 56x16 (60% larger, better clickability)",
    "Text color: #333333 → #1a1a1a (contrast: 3.2:1 → 8:1, WCAG AA compliant)",
    "Body font: 14px → 16px (better readability)",
    "Line height: 1.4 → 1.6 (improved spacing)",
    "Padding: +20% (more whitespace)"
  ],
  "status": "generated"
}
```

**Execution**: Claude generates improved HTML/CSS internally

**Timing**: ~4 seconds

---

### TOOL 4: render_mockup

**Purpose**: Convert improved HTML/CSS to screenshots (desktop + mobile)

**Input**:
```json
{
  "html": "<!DOCTYPE html>...",
  "css": "body { ... }",
  "viewports": ["1280x1024", "375x812"]
}
```

**Output**:
```json
{
  "mockup_desktop": "https://storage.url/mockup_desktop_1280.png",
  "mockup_mobile": "https://storage.url/mockup_mobile_375.png",
  "render_time_seconds": 7.3,
  "status": "rendered",
  "dimensions": {
    "desktop": { "width": 1280, "height": 2048 },
    "mobile": { "width": 375, "height": 2840 }
  }
}
```

**Execution**: Use Playwright
```javascript
async function renderMockup(html, css) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${css}</style>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width" />
    </head>
    <body>${html}</body>
    </html>
  `;
  
  await page.setContent(fullHTML);
  
  // Desktop
  const desktopBuffer = await page.screenshot({ fullPage: true });
  const desktopUrl = await uploadImage(desktopBuffer);
  
  // Mobile
  await page.setViewportSize({ width: 375, height: 812 });
  const mobileBuffer = await page.screenshot({ fullPage: true });
  const mobileUrl = await uploadImage(mobileBuffer);
  
  await browser.close();
  
  return { mockup_desktop: desktopUrl, mockup_mobile: mobileUrl };
}
```

**Timing**: ~7-10 seconds

---

### TOOL 5: generate_prompt

**Purpose**: Create detailed, optimized prompt for Lovable/Bolt

**Input**:
```json
{
  "analysis": { "scores": {...}, "analysis": {...} },
  "changes_applied": [...],
  "mockup_urls": { "desktop": "...", "mobile": "..." },
  "user_preferences": { "style": "modern", "goal": "conversion" },
  "target_platform": "lovable" | "bolt" | "cursor"
}
```

**Output**:
```json
{
  "prompt": "You are redesigning a professional website. Current design analysis (49/100) shows:\n\nKey issues to fix:\n1. CTA buttons too small (40x12px → 56x16px)\n2. Text contrast too low (3.2:1 → 8:1 WCAG AA)\n3. Body font too small (14px → 16px)\n\nSpecific changes:\n- Primary text color: #333333 → #1a1a1a\n- CTA button: width 40px → 56px, height 12px → 16px\n- Body font-size: 14px → 16px\n- Line-height: 1.4 → 1.6\n- Section padding: +20% whitespace\n\nDesign context:\n- Style: Modern\n- Goal: Conversion optimization\n- Tone: Professional\n- Keep structure (no major layout changes)\n\nReferences:\n- See mockup at [url] for visual guide\n- Accessibility: Must be WCAG AA compliant\n- Mobile first: Ensure responsive (375px - 1920px)\n\nDelivery:\n- Clean, semantic HTML\n- No inline styles (CSS only)\n- Maintain performance\n- Test on mobile",
  "prompt_for_lovable": "...",
  "prompt_for_bolt": "...",
  "prompt_for_cursor": "...",
  "estimated_quality": "high",
  "includes": [
    "Specific color values (#1a1a1a)",
    "Exact measurements (56x16px)",
    "Spacing ratios (1.6 line-height)",
    "Accessibility requirements (WCAG AA)",
    "Reference to mockup"
  ]
}
```

**Execution**: Claude generates detailed prompt

**Timing**: ~2 seconds

---

## 5. AGENTIC LOOP IMPLEMENTATION

```typescript
async function runAgent(url: string, userPrefs: UserPreferences) {
  const messages: Message[] = [
    {
      role: "user",
      content: `Analyze and improve ${url}. 
      Style: ${userPrefs.style}
      Goal: ${userPrefs.goal}
      Tone: ${userPrefs.tone}
      
      Extract → Analyze → Generate mockup → Render → Create prompt`
    }
  ];

  const tools = [
    { name: "extract_website", ... },
    { name: "analyze_design", ... },
    { name: "generate_mockup", ... },
    { name: "render_mockup", ... },
    { name: "generate_prompt", ... }
  ];

  while (true) {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages
    });

    // Check stop reason
    if (response.stop_reason === "end_turn") {
      // Agent finished
      const finalText = response.content.find(b => b.type === "text")?.text;
      return { success: true, final_message: finalText };
    }

    // Execute tools
    const toolResults = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result)
        });
      }
    }

    // Add to message history
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }
}
```

---

## 6. CONSTRAINTS & LIMITS

### Input constraints
- **Max URL length**: 2048 chars
- **Max HTML size**: 5MB
- **Timeout**: 60 seconds per analysis
- **Rate limit**: 10 análisis/min per user

### Output constraints
- **Analysis JSON**: Max 50KB
- **Mockup images**: Max 2MB each (desktop + mobile)
- **Prompt length**: Max 3000 chars
- **Total response**: Max 10MB

### Processing constraints
- **Extract time**: Max 10s
- **Analysis time**: Max 5s
- **Mockup generation**: Max 5s
- **Render time**: Max 15s (target <10s)
- **Prompt generation**: Max 5s
- **Total timeout**: 60s

---

## 7. ERROR HANDLING

### Possible failures & recovery

| Error | Cause | Recovery |
|-------|-------|----------|
| URL unreachable | DNS, timeout, blocked | Return error message, suggest checking URL |
| HTML too large | >5MB page | Truncate, extract main content only |
| Render timeout | Playwright hangs | Kill browser, use cached mockup or text description |
| CSS invalid | Generated CSS has syntax errors | Fall back to original CSS, log error |
| Claude rate limited | API quota exceeded | Queue request, retry in 30s |
| Firecrawl fails | API down, quota | Return error, suggest retry |

### Logging
- Log all tool calls + results
- Log errors with context (URL, step, duration)
- Do NOT log HTML (privacy)
- Retention: 30 days

---

## 8. QUALITY METRICS

### Agent performance
- **Completion rate**: 95%+ (analyses complete successfully)
- **Analysis accuracy**: Human review validates 80%+ scores
- **Mockup quality**: User satisfaction 4/5+ stars
- **Prompt usefulness**: User regenerates in Lovable successfully

### Latency
- **Total time**: <30s (target <25s)
  - Extract: 5s
  - Analyze: 3s
  - Gen mockup: 4s
  - Render: 10s
  - Gen prompt: 2s
  - Overhead: 1s
- **P95 latency**: <40s
- **P99 latency**: <60s

### Cost per analysis
- Firecrawl: $0.20
- Claude (analyze): $0.03
- Claude (mockup): $0.05
- Claude (prompt): $0.01
- Playwright: $0.10
- **Total**: $0.39 per analysis

---

## 9. TESTING STRATEGY

### Unit tests
- [ ] Tool 1 (extract): Test with 10 live URLs
- [ ] Tool 2 (analyze): Validate scores match heuristics
- [ ] Tool 3 (mockup): CSS generation produces valid CSS
- [ ] Tool 4 (render): Screenshots generate without errors
- [ ] Tool 5 (prompt): Prompt is coherent & actionable

### Integration tests
- [ ] Full agent loop: 50 URLs end-to-end
- [ ] Different styles/goals: Test 5 combinations
- [ ] Edge cases: Large HTML, slow pages, JS-heavy sites
- [ ] Error paths: Invalid URLs, timeouts, API failures

### Quality assurance
- [ ] 20 expert designers review outputs (NPS)
- [ ] Recreate mockup improvements in Lovable (validation)
- [ ] Benchmark against ChatGPT generic prompt
- [ ] User testing: 30 beta users, gather feedback

---

## 10. DEPLOYMENT & MONITORING

### Deployment
- Serverless (Vercel): Auto-scaling
- Environment variables: API keys encrypted
- Secrets: Firecrawl API, Claude API key
- Database: Supabase (backup daily)

### Monitoring
- Uptime: Checkly or similar (99.5% target)
- Errors: Sentry (all errors logged)
- Latency: Datadog or Vercel analytics
- Cost: Track API spend vs revenue
- User analytics: Posthog (feature usage)

### Alerting
- Error rate >5%: Page on-call
- Latency P95 >60s: Alert
- Cost spike >$100/day: Alert
- API quota reached: Alert

---

## 11. FUTURE ENHANCEMENTS

### Phase 2
- [ ] Video feedback (agent records explanation)
- [ ] A/B test suggestions (3 design variations)
- [ ] Interactive before/after slider
- [ ] Conversion optimization (not just aesthetics)

### Phase 3
- [ ] Lovable API integration (regenerate directly)
- [ ] Team collaboration (multiple analysts)
- [ ] Custom design systems (agency branding)
- [ ] Performance optimization analysis

---

## 12. OPEN QUESTIONS

1. **Mockup rendering**: Is CSS-only generation reliable enough? Test with 100+ URLs.
2. **Analysis depth**: Are 7 categories enough? Should we add more?
3. **Prompt formats**: Do separate prompts for Lovable/Bolt matter? A/B test.
4. **False positives**: How often does analysis disagree with human experts?
5. **Scaling**: Can render 5 URLs concurrently or sequential?

---

**Version**: 1.0
**Status**: Ready for Engineering
**Approved**: [Date]

