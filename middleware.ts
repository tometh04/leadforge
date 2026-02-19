import { NextRequest, NextResponse } from 'next/server'

// Rutas que NO requieren autenticación
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/login',
  '/preview',
  '/_next',
  '/favicon.ico',
]

// Decodifica base64 usando Web API pura (sin Buffer — compatible con Edge Runtime)
function decodeBase64(b64: string): string {
  return atob(b64)
}

// Verifica token HMAC-SHA256 — solo Web Crypto API, compatible con Edge Runtime
async function isValidToken(token: string, secret: string): Promise<boolean> {
  try {
    // Token formato: "payloadB64.signatureHex"
    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return false

    const payloadB64 = token.slice(0, dotIdx)
    const signatureHex = token.slice(dotIdx + 1)

    // Decodificar payload y verificar expiración (7 días)
    const payload = decodeBase64(payloadB64)           // "email:timestamp"
    const colonIdx = payload.lastIndexOf(':')
    if (colonIdx === -1) return false
    const tsStr = payload.slice(colonIdx + 1)
    const ts = parseInt(tsStr, 10)
    if (isNaN(ts)) return false
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    if (Date.now() - ts > sevenDays) return false

    // Importar clave HMAC
    const keyData = new TextEncoder().encode(secret)
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    // Convertir signatureHex → Uint8Array
    const hexPairs = signatureHex.match(/.{1,2}/g)
    if (!hexPairs) return false
    const signatureBytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)))

    // Verificar HMAC contra el payload
    const valid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes,
      new TextEncoder().encode(payloadB64)
    )

    return valid
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Pasar rutas públicas sin verificar
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Obtener cookie de sesión
  const sessionToken = req.cookies.get('leadforge_session')?.value
  const secret = process.env.SESSION_SECRET ?? ''

  if (!sessionToken || !secret || !(await isValidToken(sessionToken, secret))) {
    // Redirigir al login conservando la URL original
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  // Interceptar todo excepto archivos estáticos de Next.js
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
