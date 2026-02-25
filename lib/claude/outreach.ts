import { getAnthropicClient } from './client'
import { withAnthropicRateLimitRetry } from './retry'

export async function generateWhatsAppMessage(
  businessName: string,
  category: string,
  address: string,
  generatedSiteUrl: string | null
): Promise<string> {
  const anthropic = getAnthropicClient()

  const siteText = generatedSiteUrl
    ? `Incluí este link al sitio que armé: ${generatedSiteUrl}`
    : 'No tenemos sitio generado aún, así que mencioná que podés armárselo.'

  const prompt = `Escribí un mensaje de WhatsApp para contactar al dueño de "${businessName}", un negocio de ${category} en ${address}.

El mensaje debe:
- Estar en español informal con voseo argentino
- No superar 3 párrafos cortos
- Mencionar que visite tu web y te tomaste el atrevimiento de revisar cómo está
- ${siteText}
- Terminar con una pregunta abierta para iniciar la conversación
- Tono: amigable, directo, sin sonar a spam
- Máximo 2 emojis en todo el mensaje

Respondé ÚNICAMENTE con el texto del mensaje, sin comillas, sin explicaciones.`

  const message = await withAnthropicRateLimitRetry('generateWhatsAppMessage', () =>
    anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 220,
      messages: [{ role: 'user', content: prompt }],
    })
  )

  return message.content[0].type === 'text' ? message.content[0].text.trim() : ''
}

export function buildDefaultMessage(
  businessName: string,
  generatedSiteUrl: string | null
): string {
  const siteText = generatedSiteUrl
    ? `\n\nMe tomé el atrevimiento de armar una nueva versión para ${businessName}, podés verla acá 👉 ${generatedSiteUrl}`
    : ''

  return `Hola ${businessName} 👋

Vi que tenés una página web y quería comentarte algunas cosas que se podrían mejorar para atraer más clientes.${siteText}

¿Te parece si lo charlamos un momento?`
}
