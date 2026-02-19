import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'

function loadEnvKey(keyName: string): string {
  // 1. Intentar desde process.env (Next.js lo inyecta en route handlers)
  if (process.env[keyName]) return process.env[keyName]!

  // 2. Fallback: leer el .env.local directamente si process.env no lo tiene
  try {
    const envPath = join(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim()
      if (k === keyName && v) return v
    }
  } catch { /* ignorar si el archivo no existe */ }

  throw new Error(`${keyName} no encontrada. Verificá tu .env.local`)
}

export function getAnthropicClient() {
  const apiKey = loadEnvKey('ANTHROPIC_API_KEY')
  return new Anthropic({ apiKey })
}
