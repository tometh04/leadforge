// ============================================================
// Map LeadForge's SiteGenerationParams → ScrapedWebsiteData
// ============================================================
// LeadForge's scraper produces raw text, not structured arrays.
// We map direct fields and push raw text into customInstructions
// so the model extracts content during generation.
// ============================================================

import type { SiteGenerationParams } from '../site-generator'
import type {
  ScrapedWebsiteData,
  ScrapedImage,
  GalleryItem,
  Stat,
  ContactInfo,
  SocialLinks,
} from './types'

/** Industry-specific default primary color (hex) when no detected color is available. */
const INDUSTRY_DEFAULT_COLORS: Record<string, string> = {
  restaurant: '#8B4513',
  cafe: '#6F4E37',
  dental_clinic: '#2563EB',
  medical: '#0284C7',
  gym: '#EA580C',
  fitness: '#DC2626',
  saas: '#7C3AED',
  tech: '#6366F1',
  ecommerce: '#059669',
  real_estate: '#B8860B',
  education: '#0369A1',
  legal: '#1E3A5F',
  beauty_salon: '#DB2777',
  hotel: '#B8860B',
  construction: '#D97706',
}

function inferPrimaryColor(category: string, detectedColors?: string[]): string {
  if (detectedColors && detectedColors.length > 0) {
    return detectedColors[0]
  }
  const normalized = category.toLowerCase().trim().replace(/[\s-]+/g, '_')
  return INDUSTRY_DEFAULT_COLORS[normalized] ?? '#3B82F6'
}

function mapSocialLinks(
  socialLinks?: { platform: string; url: string }[]
): SocialLinks | undefined {
  if (!socialLinks || socialLinks.length === 0) return undefined

  const socials: SocialLinks = {}
  for (const link of socialLinks) {
    const p = link.platform.toLowerCase()
    if (p.includes('instagram')) socials.instagram = link.url
    else if (p.includes('twitter') || p.includes('x.com')) socials.twitter = link.url
    else if (p.includes('facebook')) socials.facebook = link.url
    else if (p.includes('linkedin')) socials.linkedin = link.url
    else if (p.includes('youtube')) socials.youtube = link.url
    else if (p.includes('tiktok')) socials.tiktok = link.url
    else if (p.includes('whatsapp')) socials.whatsapp = link.url
  }
  return Object.keys(socials).length > 0 ? socials : undefined
}

export function mapLeadDataToScrapedWebsiteData(
  params: SiteGenerationParams
): ScrapedWebsiteData {
  const {
    businessName,
    category,
    address,
    phone,
    scraped,
    googleRating,
    googleReviewCount,
    openingHours,
    imageUrls,
    logoUrl,
  } = params

  // --- Images ---
  const images: ScrapedImage[] = imageUrls.map((url, i) => ({
    url,
    alt: `${businessName} - imagen ${i + 1}`,
    context: i === 0 ? ('hero' as const) : ('gallery' as const),
  }))

  if (logoUrl) {
    images.unshift({
      url: logoUrl,
      alt: `Logo de ${businessName}`,
      context: 'logo',
    })
  }

  // --- Gallery ---
  const gallery: GalleryItem[] = imageUrls.map((url, i) => ({
    imageUrl: url,
    alt: `${businessName} - foto ${i + 1}`,
  }))

  // --- Stats from Google data ---
  const stats: Stat[] = []
  if (googleRating && googleRating > 0) {
    stats.push({
      value: googleRating.toFixed(1),
      label: 'Calificación en Google',
      icon: 'Star',
      suffix: '★',
    })
  }
  if (googleReviewCount && googleReviewCount > 0) {
    stats.push({
      value: String(googleReviewCount),
      label: 'Reseñas de clientes',
      icon: 'MessageSquare',
      suffix: '+',
    })
  }

  // --- Contact ---
  const contact: ContactInfo = {
    phone: phone || undefined,
    address: address || undefined,
    email: scraped?.emails?.[0] || undefined,
  }

  // --- Socials ---
  const socials = mapSocialLinks(scraped?.socialLinks)

  // --- Headlines & descriptions from scraped meta (with fallbacks) ---
  const headlines: string[] = []
  if (scraped?.pageTitle) {
    headlines.push(scraped.pageTitle)
  } else {
    headlines.push(`${businessName} — ${category}`)
  }
  if (!headlines.some((h) => h.includes(businessName))) {
    headlines.push(businessName)
  }

  const descriptions: string[] = []
  if (scraped?.metaDescription) {
    descriptions.push(scraped.metaDescription)
  } else {
    descriptions.push(
      `${businessName} es tu mejor opción en ${category}${address ? ` en ${address}` : ''}. Contactanos hoy.`
    )
  }

  // --- WhatsApp link ---
  const wp = phone.replace(/\D/g, '').replace(/^0/, '')
  const waLink = `https://wa.me/${wp}?text=${encodeURIComponent(`Hola ${businessName} 👋`)}`

  // --- Google Maps embed ---
  const mapsEmbed = address
    ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
    : null

  // --- Custom instructions: pass raw text + LeadForge-specific guardrails ---
  const customParts: string[] = []

  customParts.push('## LeadForge — Instrucciones adicionales\n')
  customParts.push(
    'Este sitio es generado para un negocio local argentino como propuesta comercial.'
  )
  customParts.push('Todo el contenido debe estar en español argentino.\n')

  if (scraped?.visibleText) {
    const safeText = scraped.visibleText.slice(0, 3000).replace(/`/g, "'").replace(/\$/g, '')
    customParts.push('### Texto visible del sitio actual')
    customParts.push(
      'Analizá este texto y extraé: servicios, nombres propios, años de trayectoria, diferenciadores.'
    )
    customParts.push('```')
    customParts.push(safeText)
    customParts.push('```\n')
  }

  if (scraped?.subPagesText) {
    const safeSubPages = scraped.subPagesText
      .slice(0, 6000)
      .replace(/`/g, "'")
      .replace(/\$/g, '')
    customParts.push(`### Contenido de sub-páginas (${scraped.subPagesCount ?? 0} páginas)`)
    customParts.push('```')
    customParts.push(safeSubPages)
    customParts.push('```\n')
  }

  if (openingHours && openingHours.length > 0) {
    customParts.push('### Horarios de atención')
    customParts.push(openingHours.map((h) => `- ${h}`).join('\n'))
    customParts.push('')
  }

  customParts.push(`### Recursos de contacto`)
  customParts.push(`- Link de WhatsApp pre-armado: ${waLink}`)
  if (mapsEmbed) customParts.push(`- Embed de Google Maps: ${mapsEmbed}`)
  customParts.push('')

  customParts.push('### Extracción de contenido (IMPORTANTE)')
  customParts.push(
    'El texto visible y el contenido de sub-páginas de arriba contienen información valiosa del negocio.'
  )
  customParts.push(
    'Extraé de ese texto: servicios, características, preguntas frecuentes, equipo, precios, y cualquier dato relevante.'
  )
  customParts.push(
    'Si encontrás datos concretos en el texto (servicios con nombres, precios, nombres de equipo, etc.), podés crear secciones adicionales para esos datos.'
  )
  customParts.push(
    'NUNCA crees una sección si no tenés datos reales para llenarla — es preferible un sitio con pocas secciones bien hechas que uno con secciones vacías o con datos inventados.'
  )
  customParts.push('')

  customParts.push('### Guardarailes de rendering (OBLIGATORIO)')
  customParts.push('- El body DEBE tener un background claro (blanco, crema, gris claro)')
  customParts.push('- Todo texto principal debe ser oscuro sobre fondo claro')
  customParts.push('- NUNCA usar display:none, visibility:hidden, opacity:0 en contenido principal')
  customParts.push('- NUNCA usar color de texto igual o similar al color de fondo')
  customParts.push(
    '- NUNCA apliques backdrop-filter o blur() al body, html, main, o secciones de ancho completo. Los efectos glass/blur SOLO se pueden usar en tarjetas pequeñas (<400px).'
  )
  customParts.push(
    '- Usá colores hex o rgb como fallback si usás OKLCH, ya que no todos los navegadores lo soportan completamente.'
  )
  customParts.push('- Incluí un botón flotante de WhatsApp (fijo en esquina inferior derecha, verde #25D366)')
  customParts.push('- Las imágenes deben usar las URLs reales proporcionadas — NO inventes URLs')
  customParts.push('- Si no hay imágenes, usá gradientes o patrones CSS creativos')
  customParts.push(
    '- SOLO incluí secciones para las que haya datos reales; NUNCA inventes datos fácticos'
  )
  customParts.push(
    '- NUNCA incluyas una sección con valores "0", "N/A", o placeholders. Si un dato no existe, omití la sección entera.'
  )
  customParts.push(
    '- Las estadísticas (stats) SOLO deben mostrarse si tienen valores reales > 0.'
  )
  customParts.push(
    '- Lo que SÍ podés crear: tagline, textos de CTA, títulos de sección, FAQ genéricas del rubro, copy de transición'
  )
  customParts.push('')

  customParts.push('### Formato de salida (OVERRIDE — IGNORAR Section 9 del system prompt)')
  customParts.push(
    'IGNORÁ las instrucciones de formato de salida del system prompt (Section 9 FILE delimiters).'
  )
  customParts.push(
    'Tu output debe ser ÚNICAMENTE el HTML crudo, empezando con <!DOCTYPE html> y terminando con </html>.'
  )
  customParts.push(
    'Sin delimitadores FILE:, sin ---, sin ---end---. Sin explicaciones, sin markdown, sin bloques de código.'
  )
  customParts.push('Empezá directamente con <!DOCTYPE html>.')

  // --- Primary color ---
  const primaryColor = inferPrimaryColor(
    category,
    (params as SiteGenerationParams & { detectedColors?: string[] }).detectedColors
  )

  return {
    url: scraped?.visibleText ? 'scraped' : 'no-website',
    industry: category,
    businessName,
    score: scraped?.visibleText ? 50 : 10,
    headlines,
    descriptions,
    ctas: [`Contactar por WhatsApp`],
    testimonials: [],
    features: [],
    faqs: [],
    stats,
    gallery: gallery.length >= 3 ? gallery : undefined,
    colorPalette: { primary: primaryColor },
    fonts: {},
    images,
    sections: [],
    contact,
    socials,
    config: {
      stack: 'html',
      includeAnimations: true,
      includeDarkMode: false,
      language: 'es',
      style: 'premium',
      customInstructions: customParts.join('\n'),
    },
  }
}
