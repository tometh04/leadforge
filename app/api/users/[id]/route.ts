import { NextRequest, NextResponse } from 'next/server'
import { findUserById, updateUser, deleteUser, listUsers } from '@/lib/auth/users'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser()
    if (!sessionUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const user = await findUserById(id)
    if (!user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

    return NextResponse.json(user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser()
    if (!sessionUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    const updates: { email?: string; name?: string; password?: string } = {}
    if (body.email) updates.email = body.email
    if (body.name !== undefined) updates.name = body.name
    if (body.password) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
      }
      updates.password = body.password
    }

    const user = await updateUser(id, updates)
    return NextResponse.json(user)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    if (message.includes('duplicate') || message.includes('unique')) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUser = await getSessionUser()
    if (!sessionUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await params

    // Can't delete self
    if (id === sessionUser.id) {
      return NextResponse.json({ error: 'No podés eliminar tu propia cuenta' }, { status: 400 })
    }

    // Can't delete last user
    const allUsers = await listUsers()
    if (allUsers.length <= 1) {
      return NextResponse.json({ error: 'No se puede eliminar el último usuario' }, { status: 400 })
    }

    await deleteUser(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
