import { getAnthropicClient } from './client'
import { SITE_REFERENCE_HTML } from './site-reference'

export interface ScrapedBusinessData {
  visibleText?: string
  imageUrls?: string[]
  logoUrl?: string | null
  socialLinks?: { platform: string; url: string }[]
  siteType?: string
  googlePhotoUrl?: string | null
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
    scraped?.visibleText?.slice(0, 1500).replace(/`/g, "'").replace(/\$/g, '') ??
    'No disponible'

  const realDataContext = scraped
    ? `
Datos reales extraídos del sitio web actual:
- Texto visible actual: ${safeText}
- Tiene logo propio: ${scraped.logoUrl ? 'Sí' : 'No'}
- Tipo de web actual: ${scraped.siteType ?? 'desconocido'}
- Redes sociales: ${scraped.socialLinks?.map((s) => `${s.platform}: ${s.url}`).join(', ') || 'No detectadas'}
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
${realDataContext}${googleContext}${hoursContext}
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

REGLAS DE CONTENIDO:
- NO inventes servicios que no estén respaldados por el texto real del sitio
- Si no hay datos suficientes, usá solo el rubro como guía general
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

SECCIONES SUGERIDAS (pero podés reorganizar o renombrar como quieras):
- Hero/Header con CTA prominente a WhatsApp
- Servicios o lo que ofrece el negocio
- Sobre nosotros / historia
- Galería de fotos (si hay imágenes)
- Testimonial / social proof (si hay rating de Google)
- Horarios (si están disponibles)
- FAQ
- Contacto con mapa
- Footer

HTML DE REFERENCIA — Este es un ejemplo de la CALIDAD y ESTRUCTURA que espero. Tu output debe tener este nivel de calidad o superior, pero adaptado al negocio específico. NO copies este HTML textualmente, usalo como referencia de patrones correctos:

<reference>
${SITE_REFERENCE_HTML}
</reference>

Generá el HTML completo ahora. Sin explicaciones, sin markdown, sin bloques de código. Empezá directamente con <!DOCTYPE html>.`

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 24000,
    messages: [{ role: 'user', content: prompt }],
  })

  const message = await stream.finalMessage()
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
