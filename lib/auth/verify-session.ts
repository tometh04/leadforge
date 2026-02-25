import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { findUserByEmail, ensureSeedUser } from './users'

export interface SessionUser {
  id: string
  email: string
}

/**
 * Parses and validates the HMAC-SHA256 session token.
 * Token format: base64(userId:email:timestamp).hexSignature
 * Legacy format (2-part): base64(email:timestamp).hexSignature
 */
async function parseToken(token: string, secret: string): Promise<SessionUser | null> {
  try {
    if (!token || !secret) return null

    const dotIdx = token.lastIndexOf('.')
    if (dotIdx === -1) return null

    const payloadB64 = token.slice(0, dotIdx)
    const signatureHex = token.slice(dotIdx + 1)
    if (!payloadB64 || !signatureHex) return null

    // Verify HMAC first
    const keyData = new TextEncoder().encode(secret)
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const hexPairs = signatureHex.match(/.{1,2}/g)
    if (!hexPairs) return null
    const sigBytes = new Uint8Array(hexPairs.map((b) => parseInt(b, 16)))
    const valid = await crypto.subtle.verify('HMAC', cryptoKey, sigBytes, new TextEncoder().encode(payloadB64))
    if (!valid) return null

    // Decode payload
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8')
    const parts = payload.split(':')

    // Check timestamp (last part is always timestamp)
    const ts = parseInt(parts[parts.length - 1], 10)
    if (isNaN(ts)) return null
    if (Date.now() - ts > 7 * 24 * 60 * 60 * 1000) return null

    if (parts.length === 3) {
      // New format: userId:email:timestamp
      return { id: parts[0], email: parts[1] }
    } else if (parts.length === 2) {
      // Legacy format: email:timestamp — lookup user by email
      const email = parts[0]
      const user = await findUserByEmail(email)
      if (!user) {
        // Try auto-provisioning seed user
        const seed = await ensureSeedUser()
        if (seed && seed.email === email.toLowerCase()) {
          return { id: seed.id, email: seed.email }
        }
        return null
      }
      return { id: user.id, email: user.email }
    }

    return null
  } catch {
    return null
  }
}

/**
 * Returns the session user if the cookie is valid, or null.
 * Does NOT redirect — use this in API routes.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  // Development bypass
  if (process.env.NODE_ENV === 'development') {
    const seed = await ensureSeedUser()
    if (seed) return { id: seed.id, email: seed.email }
    // Fallback: return a placeholder for dev
    return { id: '00000000-0000-0000-0000-000000000000', email: 'dev@localhost' }
  }

  const cookieStore = await cookies()
  const token = cookieStore.get('leadforge_session')?.value ?? ''
  const secret = process.env.SESSION_SECRET ?? ''

  return parseToken(token, secret)
}

/**
 * Returns the session user or redirects to /login.
 * Use this in Server Components / layouts.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    redirect('/login')
  }
  return user
}

/**
 * Validates a token and returns user info (for middleware, which can't use cookies() directly).
 */
export async function validateToken(token: string): Promise<SessionUser | null> {
  const secret = process.env.SESSION_SECRET ?? ''
  return parseToken(token, secret)
}
