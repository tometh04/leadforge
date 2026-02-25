import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWhatsAppSocket, waitForConnection } from '@/lib/whatsapp/client'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id: accountId } = await params

    // Verify account belongs to user
    const supabase = await createClient()
    const { data: account } = await supabase
      .from('whatsapp_accounts')
      .select('id, phone_number, status')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single()

    if (!account) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    }

    // Check if creds exist
    const { data: creds } = await supabase
      .from('whatsapp_auth')
      .select('id')
      .eq('account_id', accountId)
      .eq('id', 'creds')
      .single()

    if (!creds) {
      return NextResponse.json({ connected: false, error: 'Sin credenciales — escanear QR' })
    }

    // Try connecting
    try {
      const { sock } = await createWhatsAppSocket(accountId)
      await waitForConnection(sock, 10000)
      const phone = sock.user?.id?.split(':')[0] ?? account.phone_number
      sock.end(undefined)

      // Update status if needed
      if (account.status !== 'paired') {
        await supabase
          .from('whatsapp_accounts')
          .update({ status: 'paired', phone_number: phone })
          .eq('id', accountId)
      }

      return NextResponse.json({ connected: true, phone })
    } catch (err) {
      // Update status to disconnected
      await supabase
        .from('whatsapp_accounts')
        .update({ status: 'disconnected' })
        .eq('id', accountId)

      return NextResponse.json({
        connected: false,
        error: err instanceof Error ? err.message : 'Error de conexión',
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
