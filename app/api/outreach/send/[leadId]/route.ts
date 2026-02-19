import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params

  try {
    const { message_body, template_used } = await req.json()
    const supabase = await createClient()

    // Registrar el mensaje
    await supabase.from('messages').insert({
      lead_id: leadId,
      channel: 'whatsapp',
      message_body,
      template_used: template_used ?? 'manual',
    })

    // Actualizar estado del lead
    await supabase
      .from('leads')
      .update({
        status: 'contactado',
        last_contacted_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    // Registrar actividad
    await supabase.from('lead_activity').insert({
      lead_id: leadId,
      action: 'contactado',
      detail: 'Mensaje enviado por WhatsApp',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
