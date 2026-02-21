import { NextRequest, NextResponse } from 'next/server'
import { checkSiteGeneratorHealth, getSiteGeneratorRuntimeInfo } from '@/lib/claude/site-generator'

export const maxDuration = 60

function parseTimeoutMs(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get('timeoutMs')
  if (!raw) return 15_000

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 15_000

  const normalized = Math.floor(parsed)
  if (normalized < 1_000) return 1_000
  if (normalized > 60_000) return 60_000
  return normalized
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Error desconocido'
}

export async function GET(req: NextRequest) {
  const timeoutMs = parseTimeoutMs(req)

  try {
    const result = await checkSiteGeneratorHealth(timeoutMs)
    return NextResponse.json({
      ...result,
      timeoutMs,
      checkedAt: new Date().toISOString(),
    })
  } catch (error) {
    let runtime: ReturnType<typeof getSiteGeneratorRuntimeInfo> | null = null
    try {
      runtime = getSiteGeneratorRuntimeInfo()
    } catch {
      runtime = null
    }

    return NextResponse.json(
      {
        ok: false,
        error: toErrorMessage(error),
        timeoutMs,
        ...(runtime ?? {}),
        checkedAt: new Date().toISOString(),
      },
      { status: 503 }
    )
  }
}
