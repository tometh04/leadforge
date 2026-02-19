import { getAnthropicClient } from './client'

export interface SiteContent {
  tagline: string
  hero_description: string
  services: { name: string; description: string }[]
  primary_color: string
  secondary_color: string
  cta_text: string
  about_text: string
  unique_selling_points: string[]
  faq: { question: string; answer: string }[]
  testimonial_style: string
  quote_cta: string
  real_images: string[] // URLs de imágenes reales del negocio (fotos, no iconos)
  gallery_images: string[] // Fotos para la galería (excluye hero y about)
  logo_url: string | null
}

export interface ScrapedBusinessData {
  visibleText?: string
  imageUrls?: string[]
  logoUrl?: string | null
  socialLinks?: { platform: string; url: string }[]
  siteType?: string
  googlePhotoUrl?: string | null
}

export async function generateSiteContent(
  businessName: string,
  category: string,
  address: string,
  phone: string,
  scraped?: ScrapedBusinessData,
  googleRating?: number | null,
  googleReviewCount?: number | null
): Promise<SiteContent> {
  const anthropic = getAnthropicClient()

  // Construir contexto enriquecido con datos reales si los tenemos
  const safeText = scraped?.visibleText?.slice(0, 1500).replace(/`/g, "'").replace(/\$/g, '') ?? 'No disponible'

  const realDataContext = scraped ? `
Datos reales extraídos del sitio web actual:
- Texto visible actual: ${safeText}
- Tiene logo propio: ${scraped.logoUrl ? 'Sí — ' + scraped.logoUrl : 'No'}
- Imágenes disponibles: ${scraped.imageUrls?.length ?? 0}
- Tipo de web actual: ${scraped.siteType ?? 'desconocido'}
- Redes sociales: ${scraped.socialLinks?.map(s => `${s.platform}: ${s.url}`).join(', ') || 'No detectadas'}

IMPORTANTE: Usá SOLO el texto real del negocio para inferir servicios y propuesta de valor. NO inventes servicios que no estén respaldados por el texto real. Si no hay datos suficientes, usá solo el rubro como guía general.
` : ''

  const googleContext = googleRating || googleReviewCount ? `
Datos de Google Maps:
- Rating: ${googleRating ? googleRating.toFixed(1) + ' estrellas' : 'No disponible'}
- Cantidad de reseñas: ${googleReviewCount ?? 'No disponible'}
` : ''

  const prompt = `Sos un experto en marketing y diseño web para negocios locales en Argentina.

Generá el contenido para el sitio web de este negocio:
- Nombre: ${businessName}
- Rubro: ${category}
- Dirección: ${address}
- Teléfono: ${phone}
${realDataContext}${googleContext}

REGLAS IMPORTANTES:
- NO inventes servicios — si no hay datos reales, usá solo el rubro como guía general y sé honesto.
- Los USPs deben basarse en información real del negocio, no en frases genéricas.
- El testimonio debe sonar como una reseña real de Google, sin inventar nombres (usá "Cliente verificado").
- La frase de cierre (quote_cta) debe ser persuasiva y personalizada al negocio, no genérica.
- Las FAQ deben ser preguntas que un cliente real haría sobre este tipo de negocio.

DIRECTRICES DE DISEÑO (aplicar al contenido generado):
- Elegí colores BOLD y con personalidad — nada de paletas genéricas (#1a1a2e azul oscuro genérico).
  Colores dominantes con acentos contrastantes. Que el primary_color refleje la identidad del rubro.
- El tagline debe ser memorable y con carácter — no frases genéricas de IA.
- La hero_description debe tener tono editorial, como una revista, no como un folleto corporativo.
- Los USPs deben ser concretos y con punch, no genéricos ("Atención personalizada" está prohibido).
- El testimonial_style debe sonar auténtico, coloquial argentino, no pulido.
- El quote_cta debe ser una frase que se recuerde, con personalidad propia del negocio.
- Evitar estética genérica de IA: sin clichés, sin frases vacías, sin colores predecibles.
- Pensar en composición visual: el contenido debe funcionar con layouts asimétricos y espaciado generoso.

Respondé ÚNICAMENTE con JSON válido, sin texto antes ni después:
{
  "tagline": "<eslogan corto y atractivo, máximo 8 palabras, basado en lo que realmente ofrece>",
  "hero_description": "<descripción real del negocio en 2 oraciones, basada en el contenido real extraído>",
  "services": [
    { "name": "<servicio real 1 detectado>", "description": "<descripción breve basada en el texto real>" },
    { "name": "<servicio real 2>", "description": "<descripción breve>" },
    { "name": "<servicio real 3>", "description": "<descripción breve>" }
  ],
  "primary_color": "<color hex principal, acorde al rubro y branding actual si lo detectaste>",
  "secondary_color": "<color hex secundario complementario>",
  "cta_text": "<texto del botón de llamada a la acción, acorde al rubro>",
  "about_text": "<párrafo sobre el negocio, 3-4 oraciones, basado en información real extraída>",
  "unique_selling_points": [
    "<USP 1: diferencial concreto basado en el texto real, máx 10 palabras>",
    "<USP 2: otro diferencial real>",
    "<USP 3: otro diferencial real>"
  ],
  "faq": [
    { "question": "<pregunta frecuente relevante al rubro>", "answer": "<respuesta útil y concisa, 2-3 oraciones>" },
    { "question": "<otra pregunta>", "answer": "<respuesta>" },
    { "question": "<otra pregunta>", "answer": "<respuesta>" }
  ],
  "testimonial_style": "<texto tipo reseña de Google realista, 2-3 oraciones, como si lo escribiera un cliente satisfecho real. No inventar nombre.>",
  "quote_cta": "<frase de cierre persuasiva personalizada al negocio, máx 15 palabras. Ej: 'Tu próximo proyecto merece las mejores manos'>"
}`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  let parsed: SiteContent
  try {
    const stripped = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    parsed = JSON.parse(stripped) as SiteContent
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error(`Claude no devolvió JSON para el sitio. Respuesta: ${text.slice(0, 200)}`)
    parsed = JSON.parse(match[0]) as SiteContent
  }

  // Fallbacks para campos críticos
  if (!parsed.tagline) parsed.tagline = businessName
  if (!parsed.hero_description) parsed.hero_description = `${businessName} — ${category} en ${address}`
  if (!Array.isArray(parsed.services) || parsed.services.length === 0) {
    parsed.services = [{ name: category, description: `Servicios profesionales de ${category}` }]
  }
  if (!parsed.primary_color || !parsed.primary_color.startsWith('#')) parsed.primary_color = '#1a1a2e'
  if (!parsed.secondary_color || !parsed.secondary_color.startsWith('#')) parsed.secondary_color = '#16213e'
  if (!parsed.cta_text) parsed.cta_text = 'Contactanos'
  if (!parsed.about_text) parsed.about_text = `${businessName} es un negocio de ${category} ubicado en ${address}.`
  if (!Array.isArray(parsed.unique_selling_points) || parsed.unique_selling_points.length === 0) {
    parsed.unique_selling_points = [`Especialistas en ${category}`, 'Atención personalizada', 'Ubicación accesible']
  }
  if (!Array.isArray(parsed.faq) || parsed.faq.length === 0) {
    parsed.faq = [
      { question: `¿Qué servicios ofrece ${businessName}?`, answer: `Ofrecemos servicios profesionales de ${category}. Contactanos para más detalles.` },
      { question: '¿Cómo puedo contactarlos?', answer: 'Podés escribirnos por WhatsApp o llamarnos por teléfono. Te respondemos en minutos.' },
    ]
  }
  if (!parsed.testimonial_style) parsed.testimonial_style = `Excelente atención y muy profesionales. Recomiendo totalmente sus servicios de ${category}.`
  if (!parsed.quote_cta) parsed.quote_cta = `Tu negocio merece la mejor presencia online`

  // ── Selección inteligente de imágenes ──
  // Google photo = foto real del local (Google Street View o del negocio en Maps)
  // imageUrls ya vienen filtradas por el scraper (mínimo 200px, sin íconos)

  const logoUrl = scraped?.logoUrl ?? null

  const allCandidates: string[] = []

  // 1. Google photo primero — es la mejor foto real del negocio
  if (scraped?.googlePhotoUrl) allCandidates.push(scraped.googlePhotoUrl)

  // 2. Fotos del sitio — ya filtradas por el scraper (no logos, no iconos)
  // Excluir también el logo_url explícitamente para que no aparezca como foto
  if (scraped?.imageUrls) {
    for (const url of scraped.imageUrls) {
      if (!allCandidates.includes(url) && url !== logoUrl) {
        allCandidates.push(url)
      }
    }
  }

  // Para hero y about usamos las primeras 3 fotos (hero + about-main + about-sub)
  const realImages = allCandidates.slice(0, 3)

  // Para galería: fotos a partir de la 4ta (no repetir hero ni about)
  // Mínimo 3 para mostrar galería, máximo 6
  const galleryImages = allCandidates.slice(3, 9)

  return {
    ...parsed,
    real_images: realImages.filter(Boolean),
    gallery_images: galleryImages.filter(Boolean),
    logo_url: scraped?.logoUrl ?? null,
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}
