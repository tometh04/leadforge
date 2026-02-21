import { getAnthropicClient } from './client'
import { SITE_REFERENCE_HTML } from './site-reference'
import { withAnthropicRateLimitRetry } from './retry'

export interface ScrapedBusinessData {
  visibleText?: string
  imageUrls?: string[]
  logoUrl?: string | null
  socialLinks?: { platform: string; url: string }[]
  siteType?: string
  googlePhotoUrl?: string | null
  emails?: string[]
  pageTitle?: string
  metaDescription?: string
  subPagesText?: string
  subPagesCount?: number
}

export interface SiteGenerationParams {
  businessName: string
  category: string
  address: string
  phone: string
  scraped?: ScrapedBusinessData
  googleRating?: number | null
  googleReviewCount?: number | null
  openingHours?: string[] | null
  imageUrls: string[]
  logoUrl: string | null
}

export async function generateSiteHTML(params: SiteGenerationParams): Promise<string> {
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

  const anthropic = getAnthropicClient()

  const wp = phone.replace(/\D/g, '').replace(/^0/, '')
  const waLink = `https://wa.me/${wp}?text=${encodeURIComponent(`Hola ${businessName} 👋`)}`
  const mapsEmbed = address
    ? `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
    : null

  const safeText =
    scraped?.visibleText?.slice(0, 3000).replace(/`/g, "'").replace(/\$/g, '') ??
    'No disponible'

  const realDataContext = scraped
    ? `
Datos reales extraídos del sitio web actual:
- Título del sitio actual: ${scraped.pageTitle || 'No disponible'}
- Meta description: ${scraped.metaDescription || 'No disponible'}
- Texto visible actual: ${safeText}
- Tiene logo propio: ${scraped.logoUrl ? 'Sí' : 'No'}
- Tipo de web actual: ${scraped.siteType ?? 'desconocido'}
- Emails de contacto: ${scraped.emails?.length ? scraped.emails.join(', ') : 'No detectados'}
- Redes sociales: ${scraped.socialLinks?.map((s) => `${s.platform}: ${s.url}`).join(', ') || 'No detectadas'}
`
    : ''

  const subPagesContext =
    scraped?.subPagesText && scraped.subPagesCount
      ? `
Contenido adicional de sub-páginas del sitio (${scraped.subPagesCount} páginas internas):
${scraped.subPagesText.slice(0, 6000).replace(/`/g, "'").replace(/\$/g, '')}
`
      : ''

  const googleContext =
    googleRating || googleReviewCount
      ? `
Datos de Google Maps:
- Rating: ${googleRating ? googleRating.toFixed(1) + ' estrellas' : 'No disponible'}
- Cantidad de reseñas: ${googleReviewCount ?? 'No disponible'}
`
      : ''

  const hoursContext =
    openingHours && openingHours.length > 0
      ? `
Horarios de atención (de Google):
${openingHours.map((h) => `- ${h}`).join('\n')}
`
      : ''

  const imagesContext =
    imageUrls.length > 0
      ? `
URLs de imágenes reales del negocio (úsalas directamente con <img>):
${imageUrls.map((url, i) => `- Imagen ${i + 1}: ${url}`).join('\n')}
`
      : ''

  const logoContext = logoUrl ? `URL del logo del negocio: ${logoUrl}` : ''

  const prompt = `Sos un diseñador web de élite. Generá el HTML COMPLETO de un sitio de una página para este negocio local argentino.

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Rubro: ${category}
- Dirección: ${address || 'No disponible'}
- Teléfono: ${phone || 'No disponible'}
${realDataContext}${subPagesContext}${googleContext}${hoursContext}
RECURSOS DISPONIBLES:
${logoContext}
${imagesContext}
Link de WhatsApp pre-armado: ${waLink}
${mapsEmbed ? `Embed de Google Maps: ${mapsEmbed}` : ''}

INSTRUCCIONES TÉCNICAS:
- Generá un HTML completo y autocontenido (<!DOCTYPE html> hasta </html>)
- Todo el CSS debe ser inline en un <style> dentro del <head> (no archivos externos de CSS)
- Podés usar Google Fonts (link en el head)
- No uses frameworks JS externos (no React, no Vue, no Bootstrap)
- JS vanilla mínimo es aceptable (scroll reveal, nav sticky, FAQ accordion, etc.)
- El sitio debe ser 100% responsive (mobile-first)
- Las imágenes deben usar las URLs reales proporcionadas arriba — NO inventes URLs de imágenes
- Si no hay imágenes disponibles, usá fondos con gradientes o patrones CSS creativos en su lugar
- Incluí un botón flotante de WhatsApp (fijo en esquina inferior derecha, verde #25D366)
- Embebé el mapa de Google Maps si la URL está disponible
- Lang="es" en el <html>

EXTRACCIÓN DE INFORMACIÓN — Antes de diseñar, analizá TODO el texto proporcionado (homepage + sub-páginas) y extraé:
- Nombres propios (dueño, equipo, marca) — usalos en "Sobre nosotros" en vez de texto genérico
- Servicios/productos específicos mencionados — desarrollá cada uno con descripción real y detallada, no genérica
- Menciones de prensa, premios, certificaciones — si hay, creá una sección "En los medios" o "Prensa"
- Años de trayectoria, historia, hitos — usalos en "Sobre nosotros"
- Diferenciadores y propuestas de valor únicas del negocio

REGLAS ESTRICTAS DE CONTENIDO (OBLIGATORIO):
- SOLO incluí secciones para las que haya datos reales en el texto proporcionado
- Si NO encontrás servicios/productos específicos en el texto → NO incluyas sección de servicios. Usá solo el Hero + Contacto + CTA
- Si NO encontrás nombres del dueño/equipo → NO incluyas "Sobre nosotros" con info inventada. Podés poner una breve línea genérica en el hero, nada más
- Si NO encontrás menciones de prensa → NO incluyas sección de prensa
- Si NO hay imágenes reales → NO incluyas galería. Usá gradientes/patrones CSS
- Si NO hay horarios → NO incluyas sección de horarios
- NUNCA inventes: platos de menú, especialidades, nombres de servicios, nombres de personas, premios, o cualquier dato fáctico que no esté en el texto
- Lo único que podés crear libremente: tagline, textos de CTA, títulos de sección, FAQ genéricas del rubro, y copy de transición entre secciones
- Integrá las redes sociales con íconos SVG en el footer y, si son relevantes, como sección
- Si hay emails de contacto, incluirlos en la sección de contacto
- Los testimonios deben sonar como reseñas reales (sin inventar nombres, usá "Cliente verificado")
- Todo el texto debe estar en español argentino
- El tagline debe ser memorable y con personalidad, no genérico

GUARDARAILES DE RENDERING (OBLIGATORIO — si violás alguno, el sitio se descarta):
- El body DEBE tener un background claro (blanco, crema, gris claro, etc.) — NUNCA fondo negro u oscuro como default
- Todo el texto principal debe ser oscuro sobre fondo claro para máximo contraste y legibilidad
- NUNCA uses display:none, visibility:hidden, opacity:0 en contenido principal
- NUNCA uses color de texto igual o similar al color de fondo (ej: texto blanco sobre fondo blanco)
- El hero y todas las secciones deben ser visibles sin interacción del usuario
- Probá mentalmente: si alguien abre este HTML en un navegador, ¿se ve todo el contenido inmediatamente? Si no, corregilo

DISEÑO — CREATIVO PERO SEGURO:
- Elegí colores que reflejen la identidad del rubro — paleta coherente con buen contraste
- Usá tipografía con carácter y jerarquía visual clara
- Pensá en composición editorial: asimetría, espaciado generoso, ritmo visual
- Animaciones CSS sutiles (transitions, hover effects) son bienvenidas
- Cada sitio debe sentirse único y artesanal
- Diseñá como si fuera tu portfolio — este sitio tiene que impresionar al dueño del negocio
- Podés usar secciones con fondo de color (no oscuro al 100%) para dar ritmo visual, pero el contenido siempre debe ser legible

SECCIONES — incluí SOLO las que tienen datos reales que las respalden:
- Hero/Header con CTA a WhatsApp (SIEMPRE)
- Servicios detallados (SOLO si el texto menciona servicios/productos específicos)
- Sobre nosotros / historia (SOLO si hay info real: nombres, años, historia)
- Galería de fotos (SOLO si hay imágenes reales)
- Prensa / En los medios (SOLO si hay menciones reales)
- Testimonial / social proof (SOLO si hay rating de Google)
- Redes sociales con íconos SVG (SOLO si se detectaron redes)
- Horarios (SOLO si están disponibles)
- FAQ (podés incluir preguntas genéricas del rubro)
- Contacto con mapa, email y teléfono (SIEMPRE)
- Footer (SIEMPRE)

HTML DE REFERENCIA — Este es un ejemplo de la CALIDAD y ESTRUCTURA que espero. Tu output debe tener este nivel de calidad o superior, pero adaptado al negocio específico. NO copies este HTML textualmente, usalo como referencia de patrones correctos:

<reference>
${SITE_REFERENCE_HTML}
</reference>

Generá el HTML completo ahora. Sin explicaciones, sin markdown, sin bloques de código. Empezá directamente con <!DOCTYPE html>.`

  const message = await withAnthropicRateLimitRetry('generateSiteHTML', async () => {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    })
    return stream.finalMessage()
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extraer el HTML de la respuesta
  const htmlMatch = text.match(/<!DOCTYPE\s+html[\s\S]*<\/html>/i)
  if (htmlMatch) return htmlMatch[0]

  const htmlTagMatch = text.match(/<html[\s\S]*<\/html>/i)
  if (htmlTagMatch) return `<!DOCTYPE html>\n${htmlTagMatch[0]}`

  // Si la respuesta ya parece ser HTML puro
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    return text.trim()
  }

  throw new Error(
    `Claude no devolvió HTML válido para el sitio. Inicio de respuesta: ${text.slice(0, 200)}`
  )
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
