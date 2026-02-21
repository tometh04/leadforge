import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get('runId')

    if (!runId) {
      return NextResponse.json({ error: 'runId es requerido' }, { status: 400 })
    }

    const supabase = await createClient()
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
