import { NextResponse } from 'next/server'
import makeWASocket, { fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { useSupabaseAuthState } from '@/lib/whatsapp/auth-state'

export const dynamic = 'force-dynamic'

export async function GET() {
  const encoder = new TextEncoder()
  let socketRef: ReturnType<typeof makeWASocket> | null = null

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const { state, saveCreds } = await useSupabaseAuthState()
        const { version } = await fetchLatestBaileysVersion()

        const sock = makeWASocket({
          version,
          auth: state,
          printQRInTerminal: false,
          generateHighQualityLinkPreview: false,
        })
        socketRef = sock

        sock.ev.on('creds.update', saveCreds)

        sock.ev.on('connection.update', (update) => {
          const { connection, qr } = update

          if (qr) {
            send('qr', { qr })
          }

          if (connection === 'open') {
            send('connected', { success: true })
            sock.end(undefined)
            controller.close()
          }

          if (connection === 'close') {
            send('error', { error: 'Conexión cerrada' })
            controller.close()
          }
        })
      } catch (err) {
        send('error', {
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
        controller.close()
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
