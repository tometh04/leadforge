import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('whatsapp_auth')
      .select('id')
      .eq('id', 'creds')
      .single()

    return NextResponse.json({ paired: !!data })
  } catch {
    return NextResponse.json({ paired: false })
  }
}
