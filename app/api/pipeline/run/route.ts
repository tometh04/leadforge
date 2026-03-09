import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processStage } from './stages'
import { getSessionUser } from '@/lib/auth/verify-session'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const config = await req.json()

    if (!config.niche || !config.city) {
      return NextResponse.json({ error: 'niche y city son requeridos' }, { status: 400 })
    }

    const supabase = await createClient()

    // Guard: only one active run per WhatsApp account
    if (config.whatsappAccountId) {
      const { data: existing } = await supabase
        .from('pipeline_runs')
        .select('id')
        .eq('user_id', user.id)
        .eq('whatsapp_account_id', config.whatsappAccountId)
        .eq('status', 'running')
        .limit(1)

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: 'Ya hay un pipeline en ejecución para este número de WhatsApp.' },
          { status: 409 }
        )
      }
    }

    // Create run in DB (uses cookie-based client since we're still in request context)
    const { data: run, error } = await supabase
      .from('pipeline_runs')
      .insert({
        niche: config.niche,
        city: config.city,
        status: 'running',
        stage: 'searching',
        config,
        user_id: user.id,
        whatsapp_account_id: config.whatsappAccountId ?? null,
      })
      .select()
      .single()

    if (error || !run) {
      return NextResponse.json({ error: error?.message ?? 'Error creando run' }, { status: 500 })
    }

    // Fire-and-forget: first stage runs after response is sent
    after(async () => {
      await processStage(run.id, 'search')
    })

    return NextResponse.json({ id: run.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
