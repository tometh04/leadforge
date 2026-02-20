import { getAnthropicClient } from './client'
import { ScoreDetails } from '@/types'
import { SiteScrapedData } from '@/lib/scraper/site-scraper'

// Condensed Web Interface Guidelines for scoring — rules observable from scraped HTML
// Based on Vercel Web Interface Guidelines, filtered to what's auditable from HTML/CSS
const WEB_INTERFACE_GUIDELINES = `
GUÍA DE AUDITORÍA WEB (usá estas reglas al evaluar diseño, responsive, SEO y modernidad):

Accesibilidad:
- Todas las <img> deben tener alt descriptivo
- Cada <input>/<select>/<textarea> debe tener <label> asociado (for/id o envolvente)
- Usar <button> para acciones, NO <div onClick> ni <a href="#">
- Jerarquía de headings correcta: un solo <h1>, luego <h2>/<h3> sin saltear niveles
- Botones con solo ícono deben tener aria-label
- No usar user-scalable=no en viewport (bloquea zoom)

Focus states:
- No usar outline:none/outline:0 sin reemplazo visible
- Elementos interactivos deben tener :focus-visible distinguible
- Tab order lógico (sin tabindex positivos arbitrarios)

Imágenes y performance:
- <img> debe tener width y height explícitos (previene layout shift / CLS)
- Imágenes debajo del fold: loading="lazy"
- Usar <link rel="preconnect"> para dominios de fuentes/CDN externas
- Precargar fuentes críticas con <link rel="preload"> y font-display:swap
- Evitar transition:all — transicionar propiedades específicas

Touch e interacción móvil:
- Hit targets mínimos de 44px en móvil (botones, links)
- Inputs con font-size >= 16px (evita auto-zoom en iOS)
- No deshabilitar zoom ni pinch (user-scalable=no, maximum-scale=1)
- Preferir touch-action:manipulation en botones/links

Formularios:
- Inputs deben usar type correcto (email, tel, url, search, number)
- Usar autocomplete en campos de nombre, email, dirección
- Labels clickeables asociados al input
- No bloquear paste en campos de contraseña (onPaste preventDefault)

SEO y meta:
- <meta name="viewport"> correctamente configurado
- <meta name="description"> con contenido relevante
- Title descriptivo y único
- <meta name="theme-color"> para personalizar navegador móvil
- color-scheme: light/dark si soporta temas

Layout y responsive:
- Usar flex/grid para layouts, no floats ni tables para estructura
- Respetar safe areas en móviles (env(safe-area-inset-*))
- Contenido no debe desbordarse horizontalmente (overflow-x)
- Texto legible sin zoom en móvil (>= 14px base)

Navegación y estado:
- Links deben ser <a> con href válido (no <div> ni <span> clickeable)
- Estados hover visibles en botones y links
- Contenido con overflow debe tener truncation o scroll apropiado

Animaciones:
- Respetar prefers-reduced-motion (no animaciones agresivas sin media query)
- Duraciones razonables (150-500ms), sin animaciones infinitas decorativas

Tipografía:
- Comillas tipográficas (" ") y apóstrofos correctos (')
- Puntos suspensivos (…) en vez de tres puntos (...)
- font-variant-numeric: tabular-nums en precios/tablas

Anti-patrones graves (penalizar fuerte):
- <div>/<span> con onClick como botón — inaccesible
- Imágenes sin width/height — layout shift
- Inputs sin label — formularios inaccesibles
- user-scalable=no o maximum-scale=1 — bloquea accesibilidad
- outline:none global sin :focus-visible alternativo
- <a href="#"> como botón — semántica incorrecta
- onPaste preventDefault — bloquea paste de contraseñas
- transition:all — performance y accesibilidad
- Botones con solo ícono sin aria-label — inaccesibles
`.trim()

/** Intenta reparar JSON truncado cerrando strings, arrays y objetos abiertos */
function repairTruncatedJson(text: string): Record<string, unknown> | null {
  let s = text.trim()
  // Quitar markdown fences si las hay
  s = s.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  // Asegurarse de que empieza con {
  const start = s.indexOf('{')
  if (start === -1) return null
  s = s.slice(start)

  // Cerrar string abierto: contar comillas (ignorando escaped)
  const unescapedQuotes = s.match(/(?<!\\)"/g)
  if (unescapedQuotes && unescapedQuotes.length % 2 !== 0) {
    s += '"'
  }

  // Eliminar trailing comma antes de cerrar
  s = s.replace(/,\s*$/, '')

  // Cerrar brackets/braces abiertos
  const stack: string[] = []
  let inString = false
  let escaped = false
  for (const ch of s) {
    if (escaped) { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{' || ch === '[') stack.push(ch)
    if (ch === '}' && stack.length && stack[stack.length - 1] === '{') stack.pop()
    if (ch === ']' && stack.length && stack[stack.length - 1] === '[') stack.pop()
  }

  // Close remaining open brackets in reverse order
  while (stack.length) {
    const open = stack.pop()
    s += open === '{' ? '}' : ']'
  }

  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function analyzeWebsite(
  url: string,
  scraped: SiteScrapedData
): Promise<{ score: number; details: ScoreDetails }> {
  const anthropic = getAnthropicClient()

  const siteTypeDescriptions: Record<string, string> = {
    full_website: 'Sitio web completo con múltiples páginas y secciones',
    landing: 'Landing page minimalista con poco contenido',
    link_in_bio: 'Página de tipo link-in-bio (bio.link, linktree, etc.) — NO es un sitio web real',
    menu_only: 'Enlace a carta/menú en Google Drive o similar — NO es un sitio web real',
    social_redirect: 'Redirección a red social — NO es un sitio web real',
    error: 'No se pudo cargar el sitio',
  }

  const prompt = `Sos un experto en diseño web y marketing digital para negocios locales. Analizá este sitio web en profundidad.

URL: ${url}
Tipo detectado: ${siteTypeDescriptions[scraped.siteType] ?? scraped.siteType}
Título: ${scraped.title}
Descripción meta: ${scraped.description || 'No tiene'}
Cargó correctamente: ${scraped.loadedSuccessfully ? 'Sí' : 'No'}
Imágenes encontradas: ${scraped.imageUrls.length}
Tiene logo propio: ${scraped.logoUrl ? 'Sí' : 'No'}
Links internos: ${scraped.links.filter(l => { try { return new URL(l).hostname === new URL(url).hostname } catch { return false } }).length}
Redes sociales vinculadas: ${scraped.socialLinks.map(s => s.platform).join(', ') || 'Ninguna'}

Texto visible real del sitio (lo que ve el usuario):
---
${scraped.visibleText.slice(0, 2000)}
---

HTML del sitio (estructura técnica):
---
${scraped.htmlSnippet.slice(0, 2000).replace(/`/g, "'").replace(/\$/g, '')}
---

${WEB_INTERFACE_GUIDELINES}

IMPORTANTE PARA EL SCORING:
- Usá las reglas de la guía de auditoría web para evaluar diseño, responsive, SEO y modernidad. Mencioná violaciones específicas en "problems".
- Si el tipo es "link_in_bio", "menu_only" o "social_redirect", el score máximo es 3/10 — no son sitios web reales
- Si el sitio cargó con error, el score máximo es 2/10
- Sé muy crítico con el diseño visual — si no hay imágenes propias del negocio, penalizá fuerte
- Un sitio con solo logo + 2 botones NO merece más de 4/10 en diseño
- Un landing page minimalista sin secciones no merece más de 4/10 en total

Evaluá en escala 1-10 según estos criterios:
- Diseño visual/estética y profesionalismo (20%)
- Responsive/mobile-friendly (20%)
- Velocidad de carga percibida (15%)
- Claridad del mensaje y copy (15%)
- Presencia de CTAs efectivos (10%)
- SEO básico: title, meta description, headings (10%)
- HTTPS y seguridad (5%)
- Antigüedad/modernidad del diseño (5%)

Respondé ÚNICAMENTE con JSON válido:
{
  "score": <número 1-10, promedio ponderado, sé realista y crítico>,
  "summary": "<2-3 oraciones en español describiendo honestamente el estado del sitio>",
  "problems": ["<problema concreto 1>", "<problema concreto 2>", ...],
IMPORTANTE: Máximo 4 problems (frases cortas de ~10 palabras). Summary máximo 2 oraciones cortas. No incluir explicaciones largas.
  "criteria_scores": {
    "design": <1-10>,
    "responsive": <1-10>,
    "speed": <1-10>,
    "copy": <1-10>,
    "cta": <1-10>,
    "seo": <1-10>,
    "https": <1-10>,
    "modernity": <1-10>
  },
  "is_franchise": <true/false>,
  "site_type_detected": "${scraped.siteType}"
}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extraer JSON robusto: buscar el primer { ... } completo aunque haya texto antes/después
  let parsed: Record<string, unknown>
  try {
    const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    // Intentar parse directo primero
    parsed = JSON.parse(stripped)
  } catch {
    // Fallback: extraer el bloque JSON con regex (busca el objeto más externo)
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) {
      // Si no hay ni "{", intentar reparar JSON truncado (sin cierre)
      const openMatch = text.match(/\{[\s\S]*/)
      if (!openMatch) throw new Error(`Claude no devolvió JSON válido. Respuesta: ${text.slice(0, 200)}`)
      const repaired = repairTruncatedJson(openMatch[0])
      if (repaired) {
        parsed = repaired
      } else {
        throw new Error(`Claude no devolvió JSON válido. Respuesta: ${text.slice(0, 200)}`)
      }
    } else {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        // Si el JSON tiene { y } pero sigue malformado, intentar reparar (truncación dentro de un string/array)
        const repaired = repairTruncatedJson(match[0]) ?? repairTruncatedJson(text.slice(text.indexOf('{')))
        if (repaired) {
          parsed = repaired
        } else {
          throw new Error(`JSON malformado de Claude. Fragmento: ${match[0].slice(0, 200)}`)
        }
      }
    }
  }

  // Extraer criteria_scores con fallback a valores por defecto
  const cs = (parsed.criteria_scores as Record<string, number> | undefined) ?? {}
  const safeNum = (v: unknown, fallback = 5) => (typeof v === 'number' && v >= 1 && v <= 10) ? Math.round(v) : fallback

  const details: ScoreDetails = {
    design: safeNum(cs.design),
    responsive: safeNum(cs.responsive),
    speed: safeNum(cs.speed),
    copy: safeNum(cs.copy),
    cta: safeNum(cs.cta),
    seo: safeNum(cs.seo),
    https: safeNum(cs.https),
    modernity: safeNum(cs.modernity),
    problems: Array.isArray(parsed.problems) ? (parsed.problems as string[]) : [],
    summary: typeof parsed.summary === 'string' ? parsed.summary : 'Análisis completado.',
  }

  const rawScore = typeof parsed.score === 'number' ? parsed.score : 5
  return {
    score: Math.min(10, Math.max(1, Math.round(rawScore))),
    details,
  }
}

// Filtro rápido para descartar franquicias en el scraper
export async function quickLeadFilter(
  businessName: string,
  website: string,
  category: string
): Promise<{ viable: boolean; reason: string }> {
  const anthropic = getAnthropicClient()

  const prompt = `Evaluá si este negocio local es un buen candidato para ofrecerle un nuevo sitio web profesional.

Negocio: ${businessName}
Rubro: ${category}
Website: ${website}

Respondé ÚNICAMENTE con JSON:
{
  "viable": <true/false>,
  "reason": "<1 oración>"
}

Descartá (false) si es franquicia o cadena grande reconocida (Starbucks, McDonald's, Havanna, Mostaza, Freddo, Rapipago, bancos, supermercados de cadena, farmacias de cadena como Farmacity, etc.)
Viable (true) si es negocio local independiente.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return { viable: parsed.viable, reason: parsed.reason }
  } catch {
    return { viable: true, reason: 'No evaluado' }
  }
}
