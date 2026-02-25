import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/site-generator/health',
]

const PUBLIC_PREFIXES = [
  '/preview/',
  '/_next/',
  '/favicon',
]

async function isValidToken(token: string, secret: string): Promise<{ valid: boolean }> {
  try {
    if (!token || !secret) return { valid: false }

    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return { valid: false }

    const payloadB64 = token.slice(0, dotIdx)
    const signatureHex = token.slice(dotIdx + 1)
    if (!payloadB64 || !signatureHex) return { valid: false }

    // Decode payload and check timestamp
    const payload = atob(payloadB64)
    const parts = payload.split(':')
    const ts = parseInt(parts[parts.length - 1], 10)
    if (isNaN(ts)) return { valid: false }
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return { valid: false }

    // Verify HMAC using Web Crypto API (available in Edge Runtime)
    const keyData = new TextEncoder().encode(secret)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const hexPairs = signatureHex.match(/.{1,2}/g)
    if (!hexPairs) return { valid: false }
    const sigBytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)))
    const valid = await crypto.subtle.verify(
      'HMAC', cryptoKey, sigBytes, new TextEncoder().encode(payloadB64)
    )

    return { valid }
  } catch {
    return { valid: false }
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next()
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Allow static files
  if (pathname.includes('.')) return NextResponse.next()

  const token = req.cookies.get('leadforge_session')?.value ?? ''
  const secret = process.env.SESSION_SECRET ?? ''

  const { valid } = await isValidToken(token, secret)

  if (!valid) {
    // API routes → 401 JSON
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    // Page routes → redirect to login
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files.
     * Next.js middleware matcher syntax.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
