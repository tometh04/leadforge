import { getAnthropicClient } from './client'

export interface SiteContent {
  tagline: string
  hero_description: string
  services: { name: string; description: string }[]
  primary_color: string
  secondary_color: string
  cta_text: string
  about_text: string
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
  scraped?: ScrapedBusinessData
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

IMPORTANTE: Usá el texto real del negocio para inferir sus servicios y propuesta de valor. No inventes cosas que no estén respaldadas por el texto real.
` : ''

  const prompt = `Sos un experto en marketing y diseño web para negocios locales en Argentina.

Generá el contenido para el sitio web de este negocio:
- Nombre: ${businessName}
- Rubro: ${category}
- Dirección: ${address}
- Teléfono: ${phone}
${realDataContext}

Respondé ÚNICAMENTE con JSON válido, sin texto antes ni después:
{
  "tagline": "<eslogan corto y atractivo, máximo 8 palabras, basado en lo que realmente ofrece el negocio>",
  "hero_description": "<descripción real del negocio en 2 oraciones, basada en el contenido real extraído>",
  "services": [
    { "name": "<servicio real 1 detectado>", "description": "<descripción breve basada en el texto real>" },
    { "name": "<servicio real 2>", "description": "<descripción breve>" },
    { "name": "<servicio real 3>", "description": "<descripción breve>" },
    { "name": "<servicio real 4>", "description": "<descripción breve>" }
  ],
  "primary_color": "<color hex principal, acorde al rubro y branding actual si lo detectaste>",
  "secondary_color": "<color hex secundario complementario>",
  "cta_text": "<texto del botón de llamada a la acción, acorde al rubro>",
  "about_text": "<párrafo sobre el negocio, 3-4 oraciones, basado en información real extraída>"
}`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
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
