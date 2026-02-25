import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const accountId = req.nextUrl.searchParams.get('accountId')
    const supabase = await createClient()

    if (accountId) {
      // Check specific account
      const { data } = await supabase
        .from('whatsapp_auth')
        .select('id')
        .eq('account_id', accountId)
        .eq('id', 'creds')
        .single()

      return NextResponse.json({ paired: !!data })
    }

    // Return all user's accounts with their status
    const { data: accounts } = await supabase
      .from('whatsapp_accounts')
      .select('id, label, phone_number, status')
      .eq('user_id', user.id)

    return NextResponse.json({ accounts: accounts ?? [] })
  } catch {
    return NextResponse.json({ paired: false })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const accountId = req.nextUrl.searchParams.get('accountId')
    const supabase = await createClient()

    if (accountId) {
      // Verify account belongs to user
      const { data: account } = await supabase
        .from('whatsapp_accounts')
        .select('id')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single()

      if (!account) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })

      // Delete auth rows for this account
      await supabase.from('whatsapp_auth').delete().eq('account_id', accountId)
      // Update status
      await supabase
        .from('whatsapp_accounts')
        .update({ status: 'disconnected', phone_number: null })
        .eq('id', accountId)

      return NextResponse.json({ ok: true })
    }

    // Legacy: delete all creds
    await supabase.from('whatsapp_auth').delete().neq('id', '')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Error' }, { status: 500 })
  }
}
