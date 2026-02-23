import { getAnthropicClient } from './client'
import { withAnthropicRateLimitRetry } from './retry'
import { buildPrompt, mapLeadDataToScrapedWebsiteData } from './website-generator'

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
  detectedColors?: string[]
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
  useResponsesApi: boolean
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

function openAIResponsesUrl(baseUrlRaw: string): string {
  const baseUrl = baseUrlRaw.replace(/\/+$/, '')

  if (baseUrl.endsWith('/responses')) return baseUrl
  if (baseUrl.endsWith('/v1')) return `${baseUrl}/responses`
  return `${baseUrl}/v1/responses`
}

function isResponsesApiModel(model: string): boolean {
  const lower = model.toLowerCase()
  return lower.startsWith('gpt-5') || lower.includes('codex')
}

function getOpenAICompatibleModel(): string {
  return process.env.SITE_GENERATOR_MODEL?.trim() || 'gpt-5-codex'
}

function getOpenAICompatibleApiKey(): string {
  const apiKey =
    process.env.SITE_GENERATOR_API_KEY?.trim() ??
    process.env.OPENAI_API_KEY?.trim() ??
    process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('SITE_GENERATOR_API_KEY, OPENAI_API_KEY u OPENROUTER_API_KEY no configurada')
  }
  return apiKey
}

function buildOpenAICompatibleConfig(): OpenAICompatibleConfig {
  const apiKey = getOpenAICompatibleApiKey()
  const model = getOpenAICompatibleModel()
  const baseUrl =
    process.env.SITE_GENERATOR_BASE_URL?.trim() ?? process.env.OPENROUTER_BASE_URL?.trim()
  const resolvedBase = baseUrl || 'https://api.openai.com/v1'
  const useResponsesApi = isResponsesApiModel(model)
  const requestUrl = useResponsesApi
    ? openAIResponsesUrl(resolvedBase)
    : openAICompatibleCompletionsUrl(resolvedBase)
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

  return { model, requestUrl, headers, useResponsesApi }
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

function extractResponsesApiText(payload: unknown): string {
  const data = toObject(payload)

  // Convenience field available on newer API versions
  if (typeof data.output_text === 'string' && data.output_text) return data.output_text

  // Fallback: traverse output[i].content[j].text
  const output = Array.isArray(data.output) ? data.output : []
  const parts: string[] = []
  for (const item of output) {
    const itemObj = toObject(item)
    const content = Array.isArray(itemObj.content) ? itemObj.content : []
    for (const block of content) {
      const blockObj = toObject(block)
      if (typeof blockObj.text === 'string') parts.push(blockObj.text)
    }
  }
  return parts.join('\n').trim()
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

async function generateWithAnthropic(prompt: { systemPrompt: string; userPrompt: string }): Promise<string> {
  const anthropic = getAnthropicClient()
  const model = getAnthropicSiteGeneratorModel()
  const maxTokens = parseMaxTokens(32000)

  const message = await withAnthropicRateLimitRetry('generateSiteHTML', async () => {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: prompt.systemPrompt,
      messages: [{ role: 'user', content: prompt.userPrompt }],
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

async function generateWithOpenAICompatible(prompt: { systemPrompt: string; userPrompt: string }): Promise<string> {
  const { model, requestUrl, headers, useResponsesApi } = buildOpenAICompatibleConfig()
  const maxTokens = parseMaxTokens(12_000)

  return withAnthropicRateLimitRetry('generateSiteHTML', async () => {
    const body = useResponsesApi
      ? { model, instructions: prompt.systemPrompt, input: prompt.userPrompt, max_output_tokens: maxTokens }
      : {
          model,
          max_tokens: maxTokens,
          temperature: 0.4,
          messages: [
            { role: 'system', content: prompt.systemPrompt },
            { role: 'user', content: prompt.userPrompt },
          ],
        }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
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

    if (useResponsesApi) {
      const data = toObject(payload)
      if (data.status === 'incomplete') {
        const details = toObject(data.incomplete_details)
        console.warn(
          `[site-generator] Output truncated (status=incomplete, reason=${details.reason ?? 'unknown'})`
        )
      }
      return extractResponsesApiText(payload)
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

async function generateSiteModelOutput(prompt: { systemPrompt: string; userPrompt: string }): Promise<string> {
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
  const resolvedBase = baseUrl || 'https://api.openai.com/v1'
  const endpoint = isResponsesApiModel(model)
    ? openAIResponsesUrl(resolvedBase)
    : openAICompatibleCompletionsUrl(resolvedBase)

  return {
    provider,
    model,
    endpoint,
    hasApiKey: !!(
      process.env.SITE_GENERATOR_API_KEY ?? process.env.OPENAI_API_KEY ?? process.env.OPENROUTER_API_KEY
    ),
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

  const { model, requestUrl, headers, useResponsesApi } = buildOpenAICompatibleConfig()
  const { signal, cleanup } = createTimeoutSignal(timeoutMs)

  try {
    const body = useResponsesApi
      ? { model, input: 'Respond only with: OK', max_output_tokens: 32 }
      : { model, max_tokens: 32, temperature: 0, messages: [{ role: 'user', content: 'Respond only with: OK' }] }

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify(body),
    })

    const payload = (await response.json().catch(() => ({}))) as unknown
    if (!response.ok) {
      const errorObj = toObject(toObject(payload).error)
      const errorMessage =
        (typeof errorObj.message === 'string' && errorObj.message) ||
        `Request failed with status ${response.status}`
      throw new Error(`[site-generator/health] ${errorMessage}`)
    }

    const preview = (useResponsesApi ? extractResponsesApiText(payload) : extractOpenAIText(payload))
      .trim()
      .slice(0, 140)
    if (!preview) {
      const raw = JSON.stringify(payload).slice(0, 500)
      throw new Error(`El modelo respondió sin contenido de texto. Raw: ${raw}`)
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
  const mapped = mapLeadDataToScrapedWebsiteData(params)
  const { systemPrompt, userPrompt } = buildPrompt(mapped)
  const text = await generateSiteModelOutput({ systemPrompt, userPrompt })

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
