import { NextRequest, NextResponse } from 'next/server'
import { listUsers, createUser } from '@/lib/auth/users'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const users = await listUsers()
    return NextResponse.json(users)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sessionUser = await getSessionUser()
    if (!sessionUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { email, name, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña son requeridos' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const user = await createUser({ email, name, password })
    return NextResponse.json(user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    if (message.includes('duplicate') || message.includes('unique')) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
