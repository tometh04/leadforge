import { NextResponse } from 'next/server'
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WAMessageKey,
  type proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { useSupabaseAuthState } from '@/lib/whatsapp/auth-state'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

async function getMessageForRetry(
  key: WAMessageKey
): Promise<proto.IMessage | undefined> {
  try {
    if (!key.remoteJid) return undefined
    const digits = key.remoteJid.replace(/\D/g, '')
    if (!digits) return undefined

    const supabase = createServiceClient()
    const { data } = await supabase
      .from('messages')
      .select('message_body, leads!inner(phone)')
      .eq('channel', 'whatsapp')
      .order('sent_at', { ascending: false })
      .limit(20)

    if (!data?.length) return undefined

    const match = data.find((m: Record<string, unknown>) => {
      const lead = m.leads as Record<string, unknown> | null
      const phone = (lead?.phone as string) ?? ''
      const phoneDigits = phone.replace(/\D/g, '')
      return phoneDigits && digits.includes(phoneDigits.slice(-10))
    })

    if (!match?.message_body) return undefined
    return { conversation: match.message_body as string }
  } catch {
    return undefined
  }
}

export async function GET() {
  const encoder = new TextEncoder()
  let socketRef: ReturnType<typeof makeWASocket> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false
      function send(event: string, data: unknown) {
        if (closed) return
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }
      function close() {
        if (closed) return
        closed = true
        controller.close()
      }

      try {
        // Clear stale credentials so Baileys generates a fresh QR
        const supabase = await createClient()
        await supabase.from('whatsapp_auth').delete().neq('id', '')

        const { version } = await fetchLatestBaileysVersion()

        async function connectSocket() {
          // Re-read auth state each time (picks up creds saved after QR scan)
          const { state, saveCreds } = await useSupabaseAuthState()

          const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            generateHighQualityLinkPreview: false,
            getMessage: getMessageForRetry,
          })
          socketRef = sock

          sock.ev.on('creds.update', saveCreds)

          sock.ev.on('connection.update', async (update) => {
            const { connection, qr, lastDisconnect } = update

            if (qr) {
              send('qr', { qr })
            }

            if (connection === 'open') {
              send('connected', { success: true })
              // Let Baileys finish initial sync (pre-keys, history) before closing
              setTimeout(() => {
                sock.end(undefined)
                close()
              }, 15000)
            }

            if (connection === 'close') {
              const statusCode = (lastDisconnect?.error as Boom)?.output
                ?.statusCode

              if (
                statusCode === DisconnectReason.loggedOut ||
                statusCode === DisconnectReason.forbidden
              ) {
                send('error', {
                  error: 'Sesión rechazada — intentar de nuevo',
                })
                close()
              } else if (
                statusCode === DisconnectReason.restartRequired ||
                statusCode === DisconnectReason.timedOut
              ) {
                // After QR scan, Baileys requires a reconnect with saved creds
                sock.end(undefined)
                await connectSocket()
              } else {
                send('error', {
                  error: `Conexión cerrada (código: ${statusCode})`,
                })
                close()
              }
            }
          })
        }

        await connectSocket()
      } catch (err) {
        send('error', {
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
        close()
      }
    },
    cancel() {
      if (socketRef) {
        socketRef.end(undefined)
      }
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
