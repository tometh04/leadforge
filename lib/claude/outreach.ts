import { getAnthropicClient } from './client'
import { withAnthropicRateLimitRetry } from './retry'
import type { ScoreDetails } from '@/types'

const dimensionLabels: Record<string, string> = {
  design: 'diseño',
  responsive: 'adaptación móvil',
  speed: 'velocidad de carga',
  copy: 'textos y contenido',
  cta: 'llamadas a la acción',
  seo: 'SEO / visibilidad en Google',
  https: 'seguridad (HTTPS)',
  modernity: 'tecnología y modernidad',
}

function buildPainsContext(scoreDetails: ScoreDetails | null): string {
  if (!scoreDetails) return 'No tenemos datos del análisis de su sitio.'

  const details = scoreDetails as unknown as Record<string, number>
  const lowScores = Object.entries(dimensionLabels)
    .filter(([key]) => details[key] !== undefined)
    .filter(([key]) => details[key] <= 5)
    .map(([key, label]) => `${label}: ${details[key]}/10`)

  const lines: string[] = []
  if (scoreDetails.problems?.length) {
    lines.push(`Problemas encontrados: ${scoreDetails.problems.join(', ')}`)
  }
  if (lowScores.length) {
    lines.push(`Puntajes bajos: ${lowScores.join(', ')}`)
  }
  if (scoreDetails.summary) {
    lines.push(`Resumen: ${scoreDetails.summary}`)
  }
  return lines.join('\n') || 'No se encontraron problemas específicos.'
}

export async function generateWhatsAppMessage(
  businessName: string,
  category: string,
  address: string,
  scoreDetails: ScoreDetails | null
): Promise<string> {
  const anthropic = getAnthropicClient()

  const painsContext = buildPainsContext(scoreDetails)

  const prompt = `Escribí un mensaje de WhatsApp para contactar al dueño de "${businessName}", un negocio de ${category} en ${address}.

Estos son los problemas que encontramos al analizar su sitio web:
${painsContext}

El mensaje debe:
- Estar en español informal con voseo argentino
- No superar 3 párrafos cortos
- Primer párrafo: presentación breve (revisé tu sitio web)
- Segundo párrafo: mencionar 1-2 problemas concretos traducidos a impacto de negocio (ej: "tu sitio no se ve bien en celular, y hoy el 70% de la gente busca desde el celu")
- Tercer párrafo: cerrar con algo como "Me tomé el atrevimiento de armar una nueva web para vos, ya la tengo hecha. Si te interesa, en mi próximo mensaje te la envío, podés verla sin ningún tipo de compromiso."
- Tono: amigable, directo, sin sonar a spam
- NO incluir links ni URLs de ningún tipo
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
  scoreDetails: ScoreDetails | null
): string {
  let painText =
    'Hay oportunidades de mejora en diseño y visibilidad online que podrían ayudarte a conseguir más clientes.'

  if (scoreDetails?.problems?.length) {
    const topProblems = scoreDetails.problems.slice(0, 2).join('. ')
    painText = `Por ejemplo: ${topProblems}.`
  }

  return `Hola ${businessName} 👋

Estuve revisando tu página web y encontré algunas cosas que podrían estar afectando cómo te ven tus clientes potenciales.

${painText}

Me tomé el atrevimiento de armar una nueva web para vos, ya la tengo hecha. Si te interesa, en mi próximo mensaje te la envío, podés verla sin ningún tipo de compromiso.`
}
