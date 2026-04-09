# Design Analyzer AI — Arquitectura y Hoja de Ruta

## Qué hace este proyecto

Design Analyzer AI toma la URL de cualquier sitio web construido con herramientas de IA (Lovable, Bolt, Cursor) y produce tres cosas:

1. **Análisis objetivo** — puntuaciones de 0–100 en 7 dimensiones de diseño
2. **Hallazgos técnicos** — problemas concretos con valores específicos (`#hex`, `px`, ratios)
3. **Prompt listo para pegar** — instrucciones CSS-only formateadas para Lovable o Bolt

El flujo completo tarda ~35–50 segundos y cuesta ~$0.01–0.03 por análisis.

---

## Arquitectura general (Approach B)

```
Usuario
  │
  │  POST /api/analyze { url, preferences }
  ▼
Next.js Route (SSE stream)
  │
  ├─── Promise.all ──────────────────────────────────┐
  │                                                   │
  │  Firecrawl API                          Lighthouse CLI
  │  → rawHtml                              → accessibilityScore
  │  → screenshotUrl (GCS signed URL)       → violations[]
  │                                         → colorContrast
  │                                                   │
  └───────────────────────────────────────────────────┘
  │
  │  Claude Vision (claude-sonnet-4-5, 2500 tokens)
  │  → scores por categoría
  │  → findings con issues + suggestions
  │  → improvements_ranked por impact/effort
  │
  │  Claude Haiku (claude-haiku-4-5, 1000 tokens)
  │  → prompt Lovable/Bolt estructurado
  │
  ▼
Frontend (SSE consumer)
  → Barra de progreso 1px
  → Browser frame con screenshot
  → ScoreRing SVG
  → 7 CategoryCards expandibles
  → PromptBox con Copy
```

### Por qué Approach B (no Approach A)

La arquitectura original contemplaba generar mockups HTML/CSS con Playwright para mostrar un antes/después visual. Se descartó por dos razones:

- **Latencia**: renderizar con Playwright añade 10–15s y requiere un servidor con Chrome headless
- **Valor real**: las pruebas mostraron que el valor diferencial está en el prompt accionable, no en el mockup. El usuario final va a volver a Lovable a regenerar — el prompt es lo que necesita

---

## Stack técnico

| Capa | Tecnología | Por qué |
|---|---|---|
| Framework | Next.js 16, App Router | SSE nativo, serverless en Vercel |
| Lenguaje | TypeScript strict | Seguridad de tipos en los contratos entre tools |
| Estilos | Tailwind CSS v4 | Sin bundle extra, purge automático |
| Fuente | Inter (next/font/google) | Legibilidad en pantallas de alta densidad |
| Extracción web | Firecrawl SDK | HTML + screenshot en una sola llamada |
| Auditoría | Lighthouse CLI + Chrome local | Métricas objetivas WCAG sin API de pago |
| IA principal | Claude Sonnet 4.5 | Balance latencia/calidad para análisis visual |
| IA texto | Claude Haiku 4.5 | 5–8× más rápido que Sonnet para generar texto estructurado |
| Validación | Zod v4 | Parsing del body del request con mensajes tipados |

---

## Los 5 tools (`lib/tools/`)

### Tool 1 — `extract.ts` (Firecrawl)

Responsabilidad única: dado una URL, devolver HTML crudo y una URL de screenshot.

```typescript
// Input
url: string

// Output
{ html: string, screenshotUrl: string }
```

**Cómo funciona**: llama a `FirecrawlClient.scrape()` con `formats: ["rawHtml", "screenshot"]`. Firecrawl lanza un browser headless en su infraestructura, renderiza la página con JavaScript y devuelve una URL firmada de Google Cloud Storage (válida por ~7 días).

**Gotcha descubierto en desarrollo**: `screenshot@fullPage` devuelve HTTP 400 con esta versión del SDK. Solo `"screenshot"` (viewport estándar ~1280×800) funciona.

---

### Tool 2 — `lighthouse.ts` (Lighthouse CLI)

Responsabilidad única: auditar accesibilidad de una URL y devolver violaciones lean.

```typescript
// Output
{
  accessibilityScore: number,           // 0–100
  violations: { id, score, description }[], // solo campos que Claude necesita
  colorContrast: { score, failingItems[] }
}
```

**Cómo funciona**: lanza el binario `node_modules/.bin/lighthouse` como proceso hijo con `execFile`, escribe el resultado a un archivo temporal en `/tmp`, lo parsea y lo borra. Solo audita la categoría `accessibility` (flag `--only-categories`) para no perder tiempo en performance/SEO.

**Timeouts**: dos capas de protección:
1. `execFileAsync timeout: 18_000` — mata el proceso si Chrome se cuelga
2. `Promise.race` en la route con 20s — garantiza que el pipeline no espera más de 20s por Lighthouse aunque el proceso no muera

**Por qué local y no Browserless**: el plan gratuito de Browserless no tiene el endpoint `/lighthouse` habilitado. Con Chrome local el resultado es idéntico y sin coste por llamada.

---

### Tool 3 — `vision.ts` (Claude Sonnet)

Responsabilidad única: analizar el screenshot + datos de Lighthouse y devolver un JSON estructurado.

**Modelo**: `claude-sonnet-4-5` — el único confirmado disponible en esta cuenta que soporta vision (URL de imagen como input)

**Input al modelo**:
- Una imagen (la URL firmada de GCS, Claude la descarga directamente)
- Texto con preferencias del usuario y resumen de Lighthouse en formato compacto (~35 tokens)

**Output** (JSON estricto, ~2100 tokens):
```json
{
  "page_summary": "...",
  "scores": { "colors": 45, "typography": 55, ... },
  "findings": {
    "colors": { "issues": [...], "suggestions": [...] },
    ...
  },
  "improvements_ranked": [
    { "priority": 1, "issue": "...", "impact": "high", "effort": "low", "fix": "..." }
  ],
  "summary": "..."
}
```

**Decisiones de ingeniería**:
- `max_tokens: 2500` — la respuesta pesa ~2100 tokens en páginas simples; páginas complejas pueden ser más
- Strip de markdown fences: Claude a veces añade ` ```json ``` ` aunque el system prompt lo prohíbe. Se limpia con regex antes de parsear
- Error tipado: si el JSON está truncado, el mensaje de error indica cuántos tokens se produjeron

---

### Tool 4 — `annotate.ts` (stub)

Reservado para la fase de anotación visual: marcar sobre el screenshot qué elementos tienen problemas de contraste, tamaño de target, etc. No implementado.

---

### Tool 5 — `prompt.ts` (Claude Haiku)

Responsabilidad única: convertir el JSON de findings en un prompt natural y accionable para Lovable.

**Modelo**: `claude-haiku-4-5-20251001` — responde en 3–5s, suficiente para generar texto estructurado

**Input construido** (~300 tokens): score global, top 5 improvements, sugerencias por categoría (2 por categoría), preferencias del usuario

**Output**: prompt en texto plano, sin markdown, con secciones KEEP / CHANGE / CONSTRAINTS y valores CSS específicos (`#hex`, `px`, `ratio`)

**Por qué Haiku y no un formatter puro**: un formatter determinístico produce texto correcto pero rígido. Haiku puede variar el registro según el tono preferido (professional/playful/serious), reordenar prioridades de forma natural y conectar los cambios con el razonamiento visual.

---

## La route `/api/analyze`

### SSE (Server-Sent Events)

Se eligió SSE sobre WebSockets porque:
- No requiere infraestructura adicional (funciona en Vercel serverless)
- Es unidireccional (servidor → cliente), que es exactamente lo que necesitamos
- La API de Next.js lo soporta nativamente con `ReadableStream`

**Estructura de eventos**:
```
data: {"type":"progress","step":"extracting","message":"..."}

data: {"type":"progress","step":"lighthouse","message":"..."}

data: {"type":"progress","step":"vision","message":"..."}

data: {"type":"progress","step":"prompt","message":"..."}

data: {"type":"progress","step":"done","message":"..."}

data: {"type":"result","data":{...}}

data: {"type":"error","message":"..."}
```

**Heartbeat crítico**: el primer `send()` se ejecuta **antes de cualquier `await`**. Esto es lo que establece la conexión SSE en Vercel antes de que empiece el trabajo asíncrono. Sin este heartbeat, Vercel podría timeout la conexión mientras Firecrawl y Lighthouse trabajan.

### Paralelismo

```typescript
const [extractResult, lighthouseResult] = await Promise.all([
  extractWebsite(url),
  lighthouseWithTimeout(url),  // con Promise.race de 20s
]);
```

Firecrawl tarda ~5s y Lighthouse ~15s. Al correrlos en paralelo se ahorra 5s frente a ejecución secuencial.

### Error handling

`friendlyError()` hace pattern matching sobre el mensaje de error raw y devuelve mensajes comprensibles:

| Error API | Mensaje usuario |
|---|---|
| `model_not_found` | "The AI model is temporarily unavailable…" |
| `rate_limit` / `429` | "Too many requests…" |
| `401` / `api key` | "API authentication error…" |
| `firecrawl` | "Could not capture a screenshot…" |
| `timeout` | "The analysis timed out…" |

---

## El frontend (`app/page.tsx`)

### Máquina de estados

```typescript
type Phase =
  | { kind: "idle" }
  | { kind: "loading"; step: string; message: string }
  | { kind: "done"; result: AnalysisResult }
  | { kind: "error"; message: string };
```

Un solo estado discriminado en lugar de múltiples `useState` separados. Cada transición es explícita y segura en tipos.

### SSE consumer

El parser de SSE en el cliente maneja chunks partidos correctamente con un buffer acumulativo:

```typescript
buffer += decoder.decode(value, { stream: true });
const blocks = buffer.split("\n\n");
buffer = blocks.pop() ?? ""; // guarda evento incompleto
```

Un solo `reader.read()` puede devolver múltiples eventos o la mitad de uno. Sin buffer, el `JSON.parse` fallaría en chunks partidos.

### Componentes principales

| Componente | Función |
|---|---|
| `ProgressBar` | Barra de 1px fija en el top del viewport. Avanza: 15% → 38% → 68% → 88% → 100% |
| `BrowserFrame` | Marco macOS minimalista (3 dots + URL bar) alrededor del screenshot |
| `ScoreRing` | SVG con `strokeDashoffset` dinámico, `strokeWidth: 3`, animación CSS 700ms |
| `CategoryCard` | Card expandible con dot de color (verde/naranja/rojo) según score |
| `PromptBox` | Textarea monoespaciada con botón Copy que confirma visualmente |

---

## Variables de entorno requeridas

```bash
FIRECRAWL_API_KEY=fc-...       # firecrawl.dev
ANTHROPIC_API_KEY=sk-ant-...   # console.anthropic.com
```

Opcionales:
```bash
CHROME_PATH=/ruta/a/chrome     # si Chrome no está en la ruta macOS por defecto
```

---

## Mejoras posibles

### 🔴 Alta prioridad (impacto directo en producto)

**1. Lighthouse en producción (Vercel)**
Actualmente Lighthouse solo funciona en local porque necesita Chrome. En Vercel no hay Chrome disponible. Opciones:
- Pagar Browserless Pro (~$50/mes) que sí tiene el endpoint `/lighthouse`
- Usar la [PageSpeed Insights API de Google](https://developers.google.com/speed/docs/insights/v5/get-started) con una API key (gratuita hasta 25k req/día), que corre Lighthouse en los servidores de Google
- Cambiar a `@playwright/test` con `chromium` via `puppeteer-core` + la capa `@sparticuz/chromium` optimizada para AWS Lambda/Vercel

**2. Caché de análisis por URL**
El mismo usuario (o diferentes) pueden analizar la misma URL repetidamente. Guardar el resultado en Supabase con `url + timestamp` como clave permite:
- Devolver resultados cached en <1s si la URL ya fue analizada en las últimas 24h
- Construir un historial de análisis por usuario
- Calcular tendencias de mejora (antes/después de aplicar el prompt)

**3. Análisis de URLs privadas / staging**
Actualmente Firecrawl solo puede acceder a URLs públicas. Para URLs de staging con auth:
- Integrar el endpoint de Firecrawl con `headers` custom (Bearer tokens)
- Permitir al usuario subir directamente un screenshot en lugar de una URL
- Integrar con la API de Lovable (cuando esté disponible) para obtener el preview directamente

**4. Reintento automático con backoff**
Si Claude falla por rate limit, la route devuelve error inmediatamente. Mejor: reintentar 2 veces con exponential backoff antes de fallar hacia el usuario.

---

### 🟡 Mejoras de calidad

**5. Prompt más rico con contexto HTML**
Actualmente Vision solo recibe el screenshot y el resumen de Lighthouse. Pasar también:
- Los colores detectados por Firecrawl (`metadata.ogImage`, CSS computed colors)
- Las fuentes detectadas (tag `<link rel="stylesheet">`, Google Fonts)
- El título y meta description (contexto del propósito del sitio)

Esto permitiría a Claude identificar inconsistencias entre la intención del sitio y su diseño actual.

**6. Análisis mobile separado**
Firecrawl soporta un User-Agent de mobile. Hacer dos capturas (desktop + mobile) y analizar la responsividad como una 8va categoría: detectar si el layout se rompe, si los tap targets son suficientemente grandes, si el texto es legible sin zoom.

**7. Score histórico / trending**
Si se guarda el historial en base de datos, mostrar un gráfico simple de cómo ha cambiado el score global con el tiempo. Un "antes y después" visual de las iteraciones de diseño.

**8. Validación del prompt generado**
Después de que el usuario aplica el prompt en Lovable y vuelve con la nueva URL, permitir un "re-análisis de validación" que compare los scores anteriores y posteriores y confirme qué mejoras se lograron.

---

### 🟢 Mejoras de escala

**9. Cola de trabajos para análisis concurrentes**
En producción con múltiples usuarios simultáneos, las llamadas a Claude pueden generar rate limits. Implementar una cola simple con:
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv) para persistir el estado de la cola
- Un worker que procese de a N análisis en paralelo (N = rate limit de tu plan Anthropic)
- Feedback en tiempo real al usuario sobre su posición en la cola

**10. Webhook / callback en lugar de SSE para análisis largos**
Para páginas muy pesadas donde el análisis pueda superar 60s incluso optimizado, cambiar el modelo de SSE a:
1. El cliente hace POST → recibe un `jobId` inmediatamente
2. El análisis corre en background (Vercel Background Functions o una queue)
3. El cliente hace polling o recibe un webhook cuando está listo

**11. Multi-idioma en el prompt generado**
El prompt actual sale siempre en inglés. Detectar el idioma del sitio analizado y generar el prompt en el mismo idioma, ya que Lovable y Bolt procesan instrucciones en español igual de bien.

**12. API pública**
Exponer `/api/analyze` como una API documentada con autenticación por API key, para que agencias y freelancers puedan integrarlo en sus propios flujos (CI/CD de diseño, Slack bots, etc.).

---

### 🔵 Funcionalidades futuras (fase 2+)

**13. Generación de mockup CSS**
La idea original descartada de Approach A: dado el HTML original y los findings, pedir a Claude que genere los cambios CSS específicos, renderizarlos con Playwright, y mostrar un slider antes/después. Requiere Chrome en producción (ver punto 1).

**14. Integración directa con Lovable API**
Si Lovable expone una API para enviar prompts programáticamente, el flujo completo sería:
`URL → Análisis → Prompt → Lovable API → URL de la versión mejorada → Re-análisis automático`

**15. Análisis de conversión (A/B)**
Generar 3 variantes de prompt con diferentes estilos (minimal, bold, colorful) y permitir al usuario ver 3 sugerencias de mejora distintas y elegir la que prefiere antes de ir a Lovable.

**16. Plugin para Figma**
Analizar un frame de Figma en lugar de una URL web. Usar la API de Figma para exportar el frame como imagen y pasarlo directamente a Claude Vision, cerrando el ciclo de diseño antes del desarrollo.
