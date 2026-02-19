import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

async function isValidToken(token: string, secret: string): Promise<boolean> {
  try {
    if (!token || !secret) return false

    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return false

    const payloadB64 = token.slice(0, dotIdx)
    const signatureHex = token.slice(dotIdx + 1)
    if (!payloadB64 || !signatureHex) return false

    // Decodificar payload y verificar expiración
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8')
    const colonIdx = payload.lastIndexOf(':')
    if (colonIdx === -1) return false
    const ts = parseInt(payload.slice(colonIdx + 1), 10)
    if (isNaN(ts)) return false
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return false

    // Verificar HMAC
    const keyData = new TextEncoder().encode(secret)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const hexPairs = signatureHex.match(/.{1,2}/g)
    if (!hexPairs) return false
    const sigBytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)))
    return await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, new TextEncoder().encode(payloadB64))
  } catch {
    return false
  }
}

/** Llama desde Server Components/layouts para proteger rutas. Redirige a /login si no hay sesión válida. */
export async function requireAuth() {
  // Bypass: skip auth check in development
  if (process.env.NODE_ENV === 'development') return

  const cookieStore = await cookies()
  const token = cookieStore.get('leadforge_session')?.value ?? ''
  const secret = process.env.SESSION_SECRET ?? ''

  const valid = await isValidToken(token, secret)
  if (!valid) {
    redirect('/login')
  }
}
