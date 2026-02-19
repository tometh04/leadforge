import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateWhatsAppMessage, buildDefaultMessage } from '@/lib/claude/outreach'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params

  try {
    const supabase = await createClient()

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (error || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    let message: string
    let usedAI = false

    try {
      message = await generateWhatsAppMessage(
        lead.business_name,
        lead.category ?? lead.niche,
        lead.address ?? '',
        lead.generated_site_url
      )
      usedAI = true
    } catch {
      // Si falla la IA (sin saldo, etc.), usar template por defecto
      message = buildDefaultMessage(lead.business_name, lead.generated_site_url)
      usedAI = false
    }

    return NextResponse.json({ message, usedAI, phone: lead.phone })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
