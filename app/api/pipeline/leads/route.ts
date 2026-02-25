import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const runId = req.nextUrl.searchParams.get('runId')

    if (!runId) {
      return NextResponse.json({ error: 'runId es requerido' }, { status: 400 })
    }

    // Verify the run belongs to this user
    const supabase = await createClient()
    const { data: run } = await supabase
      .from('pipeline_runs')
      .select('id')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single()

    if (!run) {
      return NextResponse.json({ error: 'Run no encontrado' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('pipeline_leads')
      .select('*')
      .eq('run_id', runId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ leads: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
