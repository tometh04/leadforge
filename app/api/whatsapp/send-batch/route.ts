import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createWhatsAppSocket, waitForConnection, formatPhoneToJid } from '@/lib/whatsapp/client'
import { getSessionUser } from '@/lib/auth/verify-session'

export const maxDuration = 300 // 5 min max para Vercel Pro

interface BatchLead {
  leadId: string
  phone: string
  message: string
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const encoder = new TextEncoder()
  let socketRef: Awaited<ReturnType<typeof createWhatsAppSocket>>['sock'] | null = null

  const { leads, accountId }: { leads: BatchLead[]; accountId?: string } = await req.json()

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'No hay leads para enviar' }, { status: 400 })
  }

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const { sock } = await createWhatsAppSocket(accountId)
        socketRef = sock

        await waitForConnection(sock, 15000)
        send({ type: 'connected' })

        const supabase = await createClient()

        for (let i = 0; i < leads.length; i++) {
          const lead = leads[i]

          try {
            const jid = formatPhoneToJid(lead.phone)
            await sock.sendMessage(jid, { text: lead.message })

            // Registrar mensaje en DB
            await supabase.from('messages').insert({
              lead_id: lead.leadId,
              channel: 'whatsapp',
              message_body: lead.message,
              template_used: 'autopilot',
            })

            // Actualizar lead
            await supabase
              .from('leads')
              .update({
                status: 'contactado',
                last_contacted_at: new Date().toISOString(),
              })
              .eq('id', lead.leadId)

            // Actividad
            await supabase.from('lead_activity').insert({
              lead_id: lead.leadId,
              action: 'contactado',
              detail: 'Mensaje enviado por WhatsApp (autopilot)',
            })

            send({ type: 'sent', leadId: lead.leadId })
          } catch (err) {
            send({
              type: 'error',
              leadId: lead.leadId,
              error: err instanceof Error ? err.message : 'Error al enviar',
            })
          }

          // Delay anti-ban (4s entre mensajes, excepto el último)
          if (i < leads.length - 1) {
            await new Promise((r) => setTimeout(r, 4000))
          }
        }

        send({ type: 'done' })
        sock.end(undefined)
        controller.close()
      } catch (err) {
        send({
          type: 'fatal',
          error: err instanceof Error ? err.message : 'Error de conexión',
        })
        if (socketRef) socketRef.end(undefined)
        controller.close()
      }
    },
    cancel() {
      if (socketRef) socketRef.end(undefined)
    },
  })

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
