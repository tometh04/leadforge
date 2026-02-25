import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET() {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const supabase = await createClient()

    // Auto-fail runs stuck for more than 20 minutes (no updated_at progress)
    const sixMinAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const { data: staleRuns } = await supabase
      .from('pipeline_runs')
      .select('id, stage, errors')
      .eq('status', 'running')
      .eq('user_id', user.id)
      .lt('updated_at', sixMinAgo)

    if ((staleRuns ?? []).length > 0) {
      const nowIso = new Date().toISOString()
      for (const run of staleRuns ?? []) {
        const currentErrors = Array.isArray(run.errors) ? run.errors : []
        const nextErrors = [
          ...currentErrors,
          {
            at: nowIso,
            stage: typeof run.stage === 'string' ? run.stage : 'pipeline',
            step: 'stale_timeout',
            error: 'Run auto-marcado como fallido por inactividad (> 20 minutos).',
            code: 'stale_timeout',
          },
        ].slice(-80)

        await supabase
          .from('pipeline_runs')
          .update({
            status: 'failed',
            stage: 'error',
            errors: nextErrors,
            updated_at: nowIso,
          })
          .eq('id', run.id)
      }

      console.error(`[pipeline] Auto-failed ${(staleRuns ?? []).length} stale run(s)`)
    }

    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { niche, city, config } = await req.json()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('pipeline_runs')
      .insert({ niche, city, status: 'running', stage: 'searching', config: config ?? {}, user_id: user.id })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id, ...updates } = await req.json()
    const supabase = await createClient()

    const { error } = await supabase
      .from('pipeline_runs')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
