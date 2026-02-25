import { NextRequest, NextResponse } from 'next/server'
import { findUserByEmail, verifyPassword, ensureSeedUser } from '@/lib/auth/users'

// Genera token HMAC-SHA256: "payload.signature"
// payload = base64("userId:email:timestamp")
async function generateToken(userId: string, email: string, secret: string): Promise<string> {
  const payload = btoa(`${userId}:${email}:${Date.now()}`)

  const keyData = new TextEncoder().encode(secret)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(payload)
  )

  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `${payload}.${signatureHex}`
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    const secret = process.env.SESSION_SECRET

    if (!secret) {
      return NextResponse.json(
        { error: 'Configuración de autenticación incompleta' },
        { status: 500 }
      )
    }

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Auto-provision seed user if needed
    await ensureSeedUser()

    // Find user in DB
    const user = await findUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: 'Credenciales incorrectas' },
        { status: 401 }
      )
    }

    // Verify password with bcrypt
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json(
        { error: 'Credenciales incorrectas' },
        { status: 401 }
      )
    }

    // Generate signed token with userId
    const token = await generateToken(user.id, user.email, secret)

    const response = NextResponse.json({ ok: true })
    response.cookies.set('leadforge_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
