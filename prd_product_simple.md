# PRD: Design Analyzer AI
## Producto & Funcionalidades

---

## 1. RESUMEN EJECUTIVO

**Nombre**: Design Analyzer AI

**Qué es**: Herramienta que analiza websites creadas con IA builders (Lovable, Bolt, Cursor) y genera:
1. Análisis detallado del diseño
2. Mockups visuales mejorados
3. Prompts optimizados para regenerar el sitio

**Para quién**: Freelancers, agencias y educadores que usan herramientas IA design

**Cómo funciona**: User sube URL → agente analiza → muestra análisis + mockup mejorado → si le gusta, genera prompt optimizado

---

## 2. EL PROBLEMA

**Usuario**: Freelancer que hizo un sitio en Lovable
**Problema**: "Se ve bien pero no estoy seguro si es profesional"
- ¿Cómo valido que está bien diseñado?
- ¿Qué debería mejorar?
- ¿Cuántas veces debo regenerar?
- No tiene presupuesto para diseñador

**Solución**: Una herramienta que en 20 segundos le da feedback detallado + opciones de mejora visuales

---

## 3. PRINCIPALES CARACTERÍSTICAS

### Feature 1: Website Analysis (Análisis detallado)

**Qué hace**: Cuando el user sube una URL, el agente analiza el diseño en 7 categorías

**Las 7 categorías**:
1. **Colors** - Paleta de colores, contraste, accesibilidad WCAG
2. **Typography** - Fonts, tamaño, jerarquía, legibilidad
3. **Spacing & Layout** - Espaciado, padding, márgenes, responsividad
4. **CTAs & Interactions** - Tamaño de botones, prominencia, claridad
5. **Structure & Hierarchy** - Organización de elementos, flujo visual
6. **Accessibility** - Cumple WCAG, alt text, contraste, navegabilidad
7. **User Flow** - Viaje del usuario, claridad de navegación

**Qué entrega**:
- Score 0-100 para cada categoría
- Feedback específico (qué está mal, por qué)
- Sugerencias de mejora (qué hacer)
- Mejoras priorizadas (por impacto/dificultad)

**Ejemplo de output**:
```
Colors: 45/100
- Problema: Contraste muy bajo (3.2:1, necesita 4.5:1 para WCAG AA)
- Sugerencia: Cambiar texto gris #333 a negro #1a1a1a

CTAs: 30/100
- Problema: Botones muy pequeños (40x12px)
- Sugerencia: Aumentar a 56x16px para mejor clickabilidad

Overall Score: 49/100
- Fortalezas: Estructura clara, navegación simple
- Debilidades: Contraste bajo, botones pequeños, espaciado apretado
```

---

### Feature 2: Visual Mockup (Imagen de cómo se vería mejorado)

**Qué hace**: Genera una visualización de cómo se vería el sitio CON las mejoras aplicadas

**Entrega**:
- Screenshot desktop (versión mejorada)
- Screenshot móvil (versión mejorada)
- Comparación antes/después lado a lado

**Por ejemplo**:
- Antes: Botón pequeño gris oscuro
- Después: Botón grande verde vibrante (mejor clickeable)

**El user puede ver**:
- Cómo se vería el sitio mejorado
- Si le gusta el resultado
- Exactamente qué cambia

**Tiempo de generación**: ~10 segundos (sé que no quieres detalles pero es para saber qué esperar)

---

### Feature 3: Optimized Prompt (Prompt listo para copiar-pegar)

**Qué hace**: Si al user le gusta el mockup, el agente genera un prompt detallado que puede copiar y pegar directamente en Lovable/Bolt

**El prompt incluye**:
- Cambios específicos (qué cambió y por qué)
- Valores exactos (colores hexadecimales, tamaños en píxeles, espaciado)
- Instrucciones claras (qué hacer, qué no cambiar)
- Contexto (estilo, objetivo, audiencia)

**Ejemplo**:
```
Rediseña este website con estos cambios específicos:

COLORES:
- Texto principal: cambiar de #333333 a #1a1a1a 
  (mejora contraste: 3.2:1 → 8:1, WCAG AA compliant)
- Accent color: cambiar de #FF9999 a #FF5733
  (más vibrante para calls-to-action)

TIPOGRAFÍA:
- Body text: 14px → 16px
- Line height: 1.4 → 1.6 (mejor legibilidad)

BOTONES:
- CTA buttons: 40x12px → 56x16px (60% más grande)
- Padding inside: 8px → 12px
- Border-radius: 4px → 8px

ESPACIADO:
- Sección padding: +20% más whitespace
- Margin entre elementos: aumentar 10%

MANTÉN:
- La estructura general (no añadas secciones)
- La navegación igual
- Las imágenes en su lugar

OBJETIVO: Conversión
ESTILO: Moderno y profesional
```

**Variantes por plataforma**:
- Prompt para Lovable
- Prompt para Bolt
- Prompt para Cursor
(El user elige cuál usa)

---

### Feature 4: History & Comparison (Histórico de análisis)

**Qué hace**: Guarda todos los análisis que hace el user y permite comparar versiones

**Funcionalidades**:
- Ver todos los análisis previos
- Comparar análisis anterior vs nuevo (mejoró el score?)
- Ver mockup de versión anterior
- Descargar reportes en PDF

**Uso típico**:
1. User sube URL v1 → análisis score 49/100
2. Regenera en Lovable según sugerencias
3. Sube URL v2 → análisis score 72/100
4. Compara v1 vs v2 → ve que mejoró

---

### Feature 5: Preferences (Personalización)

**Qué hace**: El user puede decir sus preferencias y el agente personaliza el feedback y mockup

**Preferencias disponibles**:
- **Estilo**: Moderno, Minimalista, Audaz, Playful
- **Objetivo**: Conversión, Branding, UX, Clean
- **Tono**: Profesional, Playful, Serio

**Cómo afecta**:
- Las sugerencias se personalizan (si quieres "minimalista" no te sugiere colores flashy)
- El mockup se genera según el estilo (no es lo mismo moderno que audaz)
- El prompt refleja el objetivo (si es conversión, enfatiza CTAs)

---

## 4. CÓMO FUNCIONA (User Journey)

### Paso 1: User sube URL
```
User va a Design Analyzer
Click "Analizar sitio"
Pega URL: https://miportfolio.com
Selecciona preferencias (estilo: minimalista, objetivo: conversión)
Click "Comenzar análisis"
```

### Paso 2: Agente analiza (20 segundos)
```
Backend:
- Extrae HTML + CSS + screenshot del sitio
- Analiza 7 dimensiones de diseño
- Identifica problemas
- Genera mejoras priorizadas
```

### Paso 3: User ve análisis + mockup
```
Frontend muestra:
┌─────────────────────────────────┐
│ ANÁLISIS                         │
├─────────────────────────────────┤
│ Colors: 45/100                  │
│ Typography: 60/100              │
│ Spacing: 55/100                 │
│ CTAs: 30/100 ⚠️                 │
│ Structure: 65/100               │
│ Accessibility: 40/100           │
│ User Flow: 55/100               │
│ OVERALL: 49/100                 │
├─────────────────────────────────┤
│ FEEDBACK DETALLADO:             │
│ - CTA buttons muy pequeños      │
│ - Contraste de color bajo       │
│ - Espaciado apretado            │
├─────────────────────────────────┤
│ MEJORAS PRIORIZADAS:            │
│ 1. Aumentar botones (fácil)     │
│ 2. Mejorar contraste (fácil)    │
│ 3. Añadir espaciado (medio)     │
└─────────────────────────────────┘

[Screenshots: Before/After]
```

### Paso 4: User decide
```
Opción A: "No me gusta" → Logout o hacer otro análisis
Opción B: "Me gusta" → Click "Generar Prompt"
```

### Paso 5: Si le gusta, obtiene prompt
```
Frontend muestra:
┌─────────────────────────────────┐
│ PROMPT OPTIMIZADO               │
├─────────────────────────────────┤
│ "Rediseña este sitio con estos  │
│ cambios específicos...           │
│ - CTA buttons 56x16px           │
│ - Color #1a1a1a                 │
│ - Espaciado +20%                │
│ - Keep structure"                │
├─────────────────────────────────┤
│ [Botón: COPIAR]                 │
│ [Botón: DESCARGAR]              │
└─────────────────────────────────┘
```

### Paso 6: User va a Lovable
```
User abre Lovable/Bolt
Abre su sitio
Pega el prompt en el "regenerate prompt"
Click "Regenerate"
Obtiene sitio mejorado
```

---

## 5. TIPOS DE USUARIOS

### Tipo 1: Freelancer (solo)
- Hace sitios en Lovable
- Necesita validar que se ve bien
- No tiene presupuesto para diseñador
- Usa app: 1 análisis cada nueva versión

**Cómo le ayuda**: "Sé si debo mejorar antes de entregar"

---

### Tipo 2: Agency (equipo)
- Hace múltiples sitios en Lovable
- Necesita QA antes de entregar a cliente
- Quiere mantener estándar de calidad
- Usa app: 2-5 análisis por proyecto

**Cómo le ayuda**: "Controlo la calidad de todos los proyectos"

---

### Tipo 3: Educador (bootcamp)
- Enseña web design con Lovable
- Estudiantes necesitan feedback
- Quiere enseñar a validar diseño
- Usa app: Cada estudiante hace 2-3 análisis por proyecto

**Cómo le ayuda**: "Enseño a estudiantes cómo saber si su diseño es profesional"

---

## 6. DIFERENCIAS CON ALTERNATIVAS

### vs ChatGPT gratis
```
ChatGPT: "Te doy tips genéricos de diseño"
Design Analyzer: "Te muestro VISUALMENTE cómo se vería mejorado + prompt específico"
```

### vs Fiverr/Designer
```
Designer: Caro ($500+), lento (1-2 semanas)
Design Analyzer: Barato ($0-25/mes), instantáneo (20 segundos)
```

### vs Lighthouse/WAVE
```
Lighthouse: Mide performance, no diseño
Design Analyzer: Diseño, estructura, flujo (específicamente para IA builders)
```

### vs Manual feedback
```
Manual: Subjetivo, lento, caro
Design Analyzer: Objetivo, rápido, barato
```

---

## 7. PLAN TÉCNICO (Solo nombres, sin detalles)

**Frontend**:
- Interface para subir URL
- Mostrar análisis (scores, feedback)
- Mostrar mockup (antes/después)
- CTA para generar prompt
- Copiar/descargar opciones

**Backend**:
- Agente Claude (5 tools)
- API para manejar requests
- Almacenar análisis

**Integraciones externas**:
- Firecrawl (extraer sitio)
- Claude API (análisis + mockup + prompt)
- Playwright (renderizar mockup)

---

## 8. PLAN FUTURO (Post-MVP)

**Phase 2**:
- Histórico de análisis (guardar, comparar)
- Exportar reportes en PDF
- Team collaboration (múltiples users en mismo análisis)

**Phase 3**:
- A/B testing (generar 3 variantes diferentes)
- Video feedback (agente explica en video)
- Integration con Lovable (regenerar directo, sin copiar-pegar)

**Phase 4**:
- Análisis de conversión (no solo estética)
- Custom design systems (para agencias)
- White-label (vender a otras empresas)

---

## 9. PREGUNTAS CLAVE (Sin responder, para validar)

1. ¿El mockup visual realmente ayuda? ¿O el user prefiere solo feedback + prompt?
2. ¿7 categorías de análisis son suficientes o necesita más?
3. ¿Qué plataforma (Lovable/Bolt/Cursor) es más importante soportar?
4. ¿El user prefiere análisis superficial (10s) vs análisis profundo (30s)?
5. ¿Necesita guardar histórico o con un análisis es suficiente?

---

**Este es tu producto. Simple, directo, sin ruido técnico.**

