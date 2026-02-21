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

export type SiteGeneratorProvider = 'anthropic' | 'openai-compatible'

type RequestError = Error & {
  status?: number
  headers?: Headers
  response?: {
    status?: number
    headers?: Headers
    data?: unknown
  }
}

type OpenAICompatibleConfig = {
  model: string
  requestUrl: string
  headers: Record<string, string>
}

export interface SiteGeneratorRuntimeInfo {
  provider: SiteGeneratorProvider
  model: string
  endpoint: string
  hasApiKey: boolean
}

export interface SiteGeneratorHealthResult extends SiteGeneratorRuntimeInfo {
  ok: true
  latencyMs: number
  preview: string
}

function toObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function getSiteGeneratorProvider(): SiteGeneratorProvider {
  const raw = (process.env.SITE_GENERATOR_PROVIDER ?? 'openai-compatible').trim().toLowerCase()

  if (raw === 'anthropic') return 'anthropic'
  if (raw === 'openai-compatible' || raw === 'openrouter' || raw === 'openai') {
    return 'openai-compatible'
  }

  throw new Error(
    `SITE_GENERATOR_PROVIDER inválido: "${raw}". Usá "anthropic" o "openai-compatible".`
  )
}

function parseMaxTokens(defaultValue: number): number {
  const raw = process.env.SITE_GENERATOR_MAX_TOKENS?.trim()
  if (!raw) return defaultValue

  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue

  return Math.floor(parsed)
}

function openAICompatibleCompletionsUrl(baseUrlRaw: string): string {
  const baseUrl = baseUrlRaw.replace(/\/+$/, '')

  if (baseUrl.endsWith('/chat/completions')) return baseUrl
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/chat/completions`
  return `${baseUrl}/v1/chat/completions`
}

function getOpenAICompatibleModel(): string {
  return process.env.SITE_GENERATOR_MODEL?.trim() || 'qwen/qwen3-coder-30b-a3b-instruct'
}

function getOpenAICompatibleApiKey(): string {
  const apiKey =
    process.env.SITE_GENERATOR_API_KEY?.trim() ?? process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('SITE_GENERATOR_API_KEY u OPENROUTER_API_KEY no configurada')
  }
  return apiKey
}

function buildOpenAICompatibleConfig(): OpenAICompatibleConfig {
  const apiKey = getOpenAICompatibleApiKey()
  const model = getOpenAICompatibleModel()
  const baseUrl =
    process.env.SITE_GENERATOR_BASE_URL?.trim() ?? process.env.OPENROUTER_BASE_URL?.trim()
  const requestUrl = openAICompatibleCompletionsUrl(baseUrl || 'https://openrouter.ai/api/v1')
  const isOpenRouter = requestUrl.includes('openrouter.ai')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }

  if (isOpenRouter) {
    const referer = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (referer) headers['HTTP-Referer'] = referer
    headers['X-Title'] = process.env.OPENROUTER_APP_TITLE?.trim() || 'LeadForge'
  }

  return { model, requestUrl, headers }
}

function getAnthropicSiteGeneratorModel(): string {
  return process.env.SITE_GENERATOR_ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-6'
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(id),
  }
}

function extractOpenAIText(payload: unknown): string {
  const data = toObject(payload)
  const choices = data.choices
  if (!Array.isArray(choices) || choices.length === 0) return ''

  const firstChoice = toObject(choices[0])
  const message = toObject(firstChoice.message)
  const content = message.content

  if (typeof content === 'string') return content

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        const partObj = toObject(part)
        if (typeof partObj.text === 'string') return partObj.text
        if (typeof partObj.content === 'string') return partObj.content
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

async function generateWithAnthropic(prompt: string): Promise<string> {
  const anthropic = getAnthropicClient()
  const model = getAnthropicSiteGeneratorModel()
  const maxTokens = parseMaxTokens(32000)

  const message = await withAnthropicRateLimitRetry('generateSiteHTML', async () => {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    return stream.finalMessage()
  })

  if (message.stop_reason === 'max_tokens') {
    console.warn(
      `[site-generator] Output truncated (hit max_tokens). ` +
        `usage: input=${message.usage.input_tokens} output=${message.usage.output_tokens}`
    )
  }

  const block = message.content.find((part) => part.type === 'text')
  return block?.type === 'text' ? block.text : ''
}

async function generateWithOpenAICompatible(prompt: string): Promise<string> {
  const { model, requestUrl, headers } = buildOpenAICompatibleConfig()
  const maxTokens = parseMaxTokens(12_000)

  return withAnthropicRateLimitRetry('generateSiteHTML', async () => {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as unknown
    if (!response.ok) {
      const errorObj = toObject(toObject(payload).error)
      const errorMessage =
        (typeof errorObj.message === 'string' && errorObj.message) ||
        `Request failed with status ${response.status}`

      const err = new Error(`[site-generator] ${errorMessage}`) as RequestError
      err.status = response.status
      err.headers = response.headers
      err.response = { status: response.status, headers: response.headers, data: payload }
      throw err
    }

    const payloadObj = toObject(payload)
    const choices = Array.isArray(payloadObj.choices) ? payloadObj.choices : []
    const choice = choices.length > 0 ? toObject(choices[0]) : {}
    const finishReason = choice.finish_reason
    if (finishReason === 'length') {
      const usage = toObject(toObject(payload).usage)
      const input = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 'n/a'
      const output = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 'n/a'
      console.warn(
        `[site-generator] Output truncated (finish_reason=length). usage: input=${input} output=${output}`
      )
    }

    return extractOpenAIText(payload)
  })
}

async function generateSiteModelOutput(prompt: string): Promise<string> {
  const provider = getSiteGeneratorProvider()
  if (provider === 'anthropic') {
    return generateWithAnthropic(prompt)
  }
  return generateWithOpenAICompatible(prompt)
}

export function getSiteGeneratorRuntimeInfo(): SiteGeneratorRuntimeInfo {
  const provider = getSiteGeneratorProvider()
  if (provider === 'anthropic') {
    return {
      provider,
      model: getAnthropicSiteGeneratorModel(),
      endpoint: 'anthropic.messages',
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    }
  }

  const model = getOpenAICompatibleModel()
  const baseUrl =
    process.env.SITE_GENERATOR_BASE_URL?.trim() ?? process.env.OPENROUTER_BASE_URL?.trim()
  const endpoint = openAICompatibleCompletionsUrl(baseUrl || 'https://openrouter.ai/api/v1')

  return {
    provider,
    model,
    endpoint,
    hasApiKey: !!(process.env.SITE_GENERATOR_API_KEY ?? process.env.OPENROUTER_API_KEY),
  }
}

export async function checkSiteGeneratorHealth(timeoutMs = 15_000): Promise<SiteGeneratorHealthResult> {
  const provider = getSiteGeneratorProvider()
  const startedAt = Date.now()

  if (provider === 'anthropic') {
    const anthropic = getAnthropicClient()
    const model = getAnthropicSiteGeneratorModel()
    const message = await anthropic.messages.create({
      model,
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Respond only with: OK' }],
    })
    const block = message.content.find((part) => part.type === 'text')
    const preview = block?.type === 'text' ? block.text.trim().slice(0, 140) : ''
    if (!preview) {
      throw new Error('El modelo respondió sin contenido de texto')
    }

    return {
      ok: true,
      provider,
      model,
      endpoint: 'anthropic.messages',
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      latencyMs: Date.now() - startedAt,
      preview,
    }
  }

  const { model, requestUrl, headers } = buildOpenAICompatibleConfig()
  const { signal, cleanup } = createTimeoutSignal(timeoutMs)

  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        max_tokens: 32,
        temperature: 0,
        messages: [{ role: 'user', content: 'Respond only with: OK' }],
      }),
    })

    const payload = (await response.json().catch(() => ({}))) as unknown
    if (!response.ok) {
      const errorObj = toObject(toObject(payload).error)
      const errorMessage =
        (typeof errorObj.message === 'string' && errorObj.message) ||
        `Request failed with status ${response.status}`
      throw new Error(`[site-generator/health] ${errorMessage}`)
    }

    const preview = extractOpenAIText(payload).trim().slice(0, 140)
    if (!preview) {
      throw new Error('El modelo respondió sin contenido de texto')
    }

    return {
      ok: true,
      provider,
      model,
      endpoint: requestUrl,
      hasApiKey: true,
      latencyMs: Date.now() - startedAt,
      preview,
    }
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
    if (aborted) {
      throw new Error(`Health check timeout después de ${timeoutMs}ms`)
    }
    throw err
  } finally {
    cleanup()
  }
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

  const text = await generateSiteModelOutput(prompt)

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
    `El modelo no devolvió HTML válido para el sitio. Inicio de respuesta: ${text.slice(0, 200)}`
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
