import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processStage } from './stages'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const config = await req.json()

    if (!config.niche || !config.city) {
      return NextResponse.json({ error: 'niche y city son requeridos' }, { status: 400 })
    }

    // Create run in DB (uses cookie-based client since we're still in request context)
    const supabase = await createClient()
    const { data: run, error } = await supabase
      .from('pipeline_runs')
      .insert({
        niche: config.niche,
        city: config.city,
        status: 'running',
        stage: 'searching',
        config,
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
