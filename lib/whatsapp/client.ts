import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { useSupabaseAuthState } from './auth-state'
import { Boom } from '@hapi/boom'

export async function createWhatsAppSocket() {
  const { state, saveCreds } = await useSupabaseAuthState()
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  })

  sock.ev.on('creds.update', saveCreds)

  return { sock, saveCreds }
}

export function waitForConnection(
  sock: ReturnType<typeof makeWASocket>,
  timeout = 30000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout esperando conexión de WhatsApp'))
    }, timeout)

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update
      if (connection === 'open') {
        clearTimeout(timer)
        resolve()
      } else if (connection === 'close') {
        clearTimeout(timer)
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
        if (statusCode === DisconnectReason.loggedOut) {
          reject(new Error('WhatsApp desvinculado — escanear QR nuevamente'))
        } else {
          reject(new Error(`Conexión cerrada (código: ${statusCode})`))
        }
      }
    })
  })
}

/**
 * Convierte un número de teléfono argentino a JID de WhatsApp.
 * Acepta formatos: +54 9 11 1234-5678, 5491112345678, 011-1234-5678, etc.
 */
export function formatPhoneToJid(phone: string): string {
  // Limpiar todo excepto dígitos
  let digits = phone.replace(/\D/g, '')

  // Si empieza con 0 (número local argentino), quitar el 0 y agregar 549
  if (digits.startsWith('0')) {
    digits = '549' + digits.slice(1)
  }

  // Si empieza con 54 pero no con 549, insertar el 9 (celular)
  if (digits.startsWith('54') && !digits.startsWith('549')) {
    digits = '549' + digits.slice(2)
  }

  // Si no empieza con código de país, asumir Argentina
  if (!digits.startsWith('54')) {
    digits = '549' + digits
  }

  // Eliminar 15 del número local (ej: 11-15-1234-5678 → 11-1234-5678)
  const match = digits.match(/^549(\d{2,4})15(\d{4,8})$/)
  if (match) {
    digits = `549${match[1]}${match[2]}`
  }

  return `${digits}@s.whatsapp.net`
}
