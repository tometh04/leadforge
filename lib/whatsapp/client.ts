import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WAMessageKey,
  type proto,
} from '@whiskeysockets/baileys'
import { useSupabaseAuthState } from './auth-state'
import { createServiceClient } from '@/lib/supabase/service'
import { Boom } from '@hapi/boom'

/**
 * Looks up the original message text from the DB so Baileys can re-encrypt
 * it when the recipient requests a retry (Signal key update).
 */
async function getMessage(
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

export async function createWhatsAppSocket() {
  const { state, saveCreds } = await useSupabaseAuthState()
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
    getMessage,
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
        // Let Baileys finish pre-key sync before sending messages
        setTimeout(resolve, 3000)
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
 * Códigos de país conocidos (de mayor a menor longitud para matching correcto).
 * Cubre los principales mercados de LATAM + España.
 */
const COUNTRY_CODES = [
  '549', // Argentina móvil (54 + 9)
  '54',  // Argentina
  '55',  // Brasil
  '56',  // Chile
  '57',  // Colombia
  '58',  // Venezuela
  '52',  // México
  '51',  // Perú
  '53',  // Cuba
  '506', // Costa Rica
  '507', // Panamá
  '502', // Guatemala
  '503', // El Salvador
  '504', // Honduras
  '505', // Nicaragua
  '591', // Bolivia
  '593', // Ecuador
  '595', // Paraguay
  '598', // Uruguay
  '34',  // España
  '1',   // USA / Canadá
]

/**
 * Detecta si el número ya tiene un código de país conocido.
 */
function detectCountryCode(digits: string): string | null {
  // Revisar códigos de 3 dígitos primero, luego 2, luego 1
  for (const code of COUNTRY_CODES) {
    if (digits.startsWith(code)) return code
  }
  return null
}

/**
 * Convierte un número de teléfono a JID de WhatsApp.
 * Respeta el código de país si el número ya lo incluye (+34, +54, +52, etc.).
 * Si no tiene código de país, asume Argentina (+549) como fallback.
 */
export function formatPhoneToJid(phone: string): string {
  let digits = phone.replace(/\D/g, '')

  // Número local argentino (empieza con 0): quitar 0 y agregar 549
  if (digits.startsWith('0')) {
    digits = '549' + digits.slice(1)
  }

  const countryCode = detectCountryCode(digits)

  if (!countryCode) {
    // Sin código de país reconocido → asumir Argentina móvil
    digits = '549' + digits
  } else if (countryCode === '54' && !digits.startsWith('549')) {
    // Argentina fijo (54) → insertar 9 para móvil
    digits = '549' + digits.slice(2)
  }

  // Argentina: eliminar 15 del número local (ej: 549-11-15-1234-5678 → 549-11-1234-5678)
  if (digits.startsWith('549')) {
    const match = digits.match(/^549(\d{2,4})15(\d{4,8})$/)
    if (match) {
      digits = `549${match[1]}${match[2]}`
    }
  }

  return `${digits}@s.whatsapp.net`
}
