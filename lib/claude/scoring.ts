import { getAnthropicClient } from './client'
import { ScoreDetails } from '@/types'
import { SiteScrapedData } from '@/lib/scraper/site-scraper'

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

IMPORTANTE PARA EL SCORING:
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
  "problems": ["<problema concreto 1>", "<problema concreto 2>", "<problema concreto 3>", "<problema concreto 4>"],
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
    max_tokens: 1024,
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
    if (!match) throw new Error(`Claude no devolvió JSON válido. Respuesta: ${text.slice(0, 200)}`)
    try {
      parsed = JSON.parse(match[0])
    } catch (e2) {
      throw new Error(`JSON malformado de Claude: ${(e2 as Error).message}. Fragmento: ${match[0].slice(0, 200)}`)
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
