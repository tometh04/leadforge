const RATE_LIMIT_CODE = 'RATE_LIMIT' as const

type RetryDelayOptions = {
  attempt: number
  retryAfterMs?: number | null
}

export class AnthropicRateLimitError extends Error {
  readonly code = RATE_LIMIT_CODE
  readonly retryAfterMs: number | null
  override readonly cause: unknown

  constructor(message: string, cause: unknown, retryAfterMs: number | null = null) {
    super(message)
    this.name = 'AnthropicRateLimitError'
    this.cause = cause
    this.retryAfterMs = retryAfterMs
  }
}

function toErrorLike(err: unknown): Record<string, unknown> {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {}
}

function parseRetryAfterMs(err: unknown): number | null {
  const e = toErrorLike(err)
  const headers = e.headers ?? toErrorLike(e.response).headers

  if (!headers) return null

  let raw: string | null | undefined
  if (typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (name: string) => string | null }).get('retry-after')
  } else {
    const record = headers as Record<string, unknown>
    raw = (record['retry-after'] as string | undefined) ?? (record['Retry-After'] as string | undefined)
  }

  if (!raw) return null

  const numeric = Number(raw)
  if (!Number.isNaN(numeric) && Number.isFinite(numeric) && numeric >= 0) {
    return Math.round(numeric * 1000)
  }

  const parsedDate = Date.parse(raw)
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now())
  }

  return null
}

function computeDelayMs({ attempt, retryAfterMs }: RetryDelayOptions): number {
  const scheduled = [30_000, 90_000, 180_000][Math.max(0, Math.min(attempt - 1, 2))]
  const jitter = Math.floor(Math.random() * 5_000)
  return Math.max(retryAfterMs ?? 0, scheduled + jitter)
}

export function isAnthropicRateLimitError(err: unknown): boolean {
  if (err instanceof AnthropicRateLimitError) return true

  const e = toErrorLike(err)
  if (e.code === RATE_LIMIT_CODE) return true
  if (e.status === 429) return true

  const response = toErrorLike(e.response)
  if (response.status === 429) return true

  const nestedError = toErrorLike(e.error)
  if (nestedError.type === 'rate_limit_error') return true

  const message = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  return message.includes('rate limit') || message.includes('429')
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withAnthropicRateLimitRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!isAnthropicRateLimitError(err)) throw err

      const retryAfterMs = parseRetryAfterMs(err)
      if (attempt >= maxAttempts) {
        throw new AnthropicRateLimitError(
          `Anthropic rate limit in ${operation} after ${maxAttempts} attempts`,
          err,
          retryAfterMs
        )
      }

      const delayMs = computeDelayMs({ attempt, retryAfterMs })
      console.warn(
        `[anthropic/retry] ${operation} rate limited. attempt=${attempt}/${maxAttempts}, waiting ${Math.round(delayMs / 1000)}s`
      )
      await sleep(delayMs)
    }
  }

  throw new Error(`Retry loop exited unexpectedly for ${operation}`)
}
