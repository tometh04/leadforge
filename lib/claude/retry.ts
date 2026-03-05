const AI_RATE_LIMIT_CODE = 'RATE_LIMIT' as const
const AI_QUOTA_EXCEEDED_CODE = 'QUOTA_EXCEEDED' as const

type RetryDelayOptions = {
  attempt: number
  retryAfterMs?: number | null
}

type ErrorDetails = {
  status: number | null
  message: string
  code: string
  type: string
}

export class AIRateLimitError extends Error {
  readonly code = AI_RATE_LIMIT_CODE
  readonly retryAfterMs: number | null
  override readonly cause: unknown

  constructor(message: string, cause: unknown, retryAfterMs: number | null = null) {
    super(message)
    this.name = 'AIRateLimitError'
    this.cause = cause
    this.retryAfterMs = retryAfterMs
  }
}

export class AIQuotaExceededError extends Error {
  readonly code = AI_QUOTA_EXCEEDED_CODE
  override readonly cause: unknown

  constructor(message: string, cause: unknown) {
    super(message)
    this.name = 'AIQuotaExceededError'
    this.cause = cause
  }
}

// Backward-compatible alias kept for older imports/usages.
export class AnthropicRateLimitError extends AIRateLimitError {
  constructor(message: string, cause: unknown, retryAfterMs: number | null = null) {
    super(message, cause, retryAfterMs)
    this.name = 'AnthropicRateLimitError'
  }
}

function toErrorLike(err: unknown): Record<string, unknown> {
  return typeof err === 'object' && err !== null ? (err as Record<string, unknown>) : {}
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readStatus(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function errorDetails(err: unknown): ErrorDetails {
  const e = toErrorLike(err)
  const response = toErrorLike(e.response)
  const responseData = toErrorLike(response.data)
  const payloadError = toErrorLike(responseData.error)
  const nestedError = toErrorLike(e.error)

  const status = readStatus(e.status) ?? readStatus(response.status)
  const message =
    readString(e.message) ||
    readString(payloadError.message) ||
    readString(nestedError.message)
  const code =
    readString(e.code) ||
    readString(payloadError.code) ||
    readString(nestedError.code)
  const type =
    readString(payloadError.type) ||
    readString(nestedError.type)

  return {
    status,
    message,
    code,
    type,
  }
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

export function isAIQuotaExceededError(err: unknown): boolean {
  if (err instanceof AIQuotaExceededError) return true

  const e = toErrorLike(err)
  if (readString(e.code).toUpperCase() === AI_QUOTA_EXCEEDED_CODE) return true

  const details = errorDetails(err)
  const code = details.code.toLowerCase()
  const type = details.type.toLowerCase()
  const message = details.message.toLowerCase()
  if (code === 'insufficient_quota') return true
  if (type === 'insufficient_quota') return true

  return (
    message.includes('exceeded your current quota') ||
    message.includes('insufficient_quota') ||
    message.includes('check your plan and billing details') ||
    message.includes('quota exceeded')
  )
}

export function isAIRateLimitError(err: unknown): boolean {
  if (err instanceof AIRateLimitError || err instanceof AnthropicRateLimitError) return true
  if (isAIQuotaExceededError(err)) return false

  const e = toErrorLike(err)
  if (readString(e.code).toUpperCase() === AI_RATE_LIMIT_CODE) return true

  const details = errorDetails(err)
  const type = details.type.toLowerCase()
  const message = details.message.toLowerCase()
  if (type === 'rate_limit_error') return true
  if (details.status === 429) return true

  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429')
  )
}

// Backward-compatible alias kept for older imports/usages.
export function isAnthropicRateLimitError(err: unknown): boolean {
  return isAIRateLimitError(err)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withAIRateLimitRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (isAIQuotaExceededError(err)) {
        const details = errorDetails(err)
        const message = details.message || `AI quota exceeded in ${operation}`
        throw new AIQuotaExceededError(message, err)
      }

      if (!isAIRateLimitError(err)) throw err

      const retryAfterMs = parseRetryAfterMs(err)
      if (attempt >= maxAttempts) {
        throw new AIRateLimitError(
          `AI rate limit in ${operation} after ${maxAttempts} attempts`,
          err,
          retryAfterMs
        )
      }

      const delayMs = computeDelayMs({ attempt, retryAfterMs })
      console.warn(
        `[ai/retry] ${operation} rate limited. attempt=${attempt}/${maxAttempts}, waiting ${Math.round(delayMs / 1000)}s`
      )
      await sleep(delayMs)
    }
  }

  throw new Error(`Retry loop exited unexpectedly for ${operation}`)
}

// Backward-compatible alias kept for older imports/usages.
export const withAnthropicRateLimitRetry = withAIRateLimitRetry
