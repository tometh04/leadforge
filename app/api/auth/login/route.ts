import { NextRequest, NextResponse } from 'next/server'

// Genera token HMAC-SHA256: "payload.signature"
// payload = base64url("email:timestamp") — usando btoa (Web API, sin Buffer)
async function generateToken(email: string, secret: string): Promise<string> {
  const payload = btoa(`${email}:${Date.now()}`)

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

  // Convertir signature a hex string
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `${payload}.${signatureHex}`
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    const adminEmail = process.env.ADMIN_EMAIL
    const adminPassword = process.env.ADMIN_PASSWORD
    const secret = process.env.SESSION_SECRET

    if (!adminEmail || !adminPassword || !secret) {
      return NextResponse.json(
        { error: 'Configuración de autenticación incompleta' },
        { status: 500 }
      )
    }

    // Validar credenciales (case-insensitive para el email)
    if (
      email?.toLowerCase() !== adminEmail.toLowerCase() ||
      password !== adminPassword
    ) {
      return NextResponse.json(
        { error: 'Credenciales incorrectas' },
        { status: 401 }
      )
    }

    // Generar token firmado
    const token = await generateToken(email, secret)

    // Crear respuesta con cookie httpOnly
    const response = NextResponse.json({ ok: true })
    response.cookies.set('leadforge_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // 7 días en segundos
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
