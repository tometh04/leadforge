import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/verify-session'
import { stabilizeGeneratedSiteHtml } from '@/lib/claude/generated-site-stabilizer'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const rawHtml = body.site_html

    if (
      typeof rawHtml !== 'string' ||
      rawHtml.trim().length === 0 ||
      (!rawHtml.trimStart().startsWith('<!DOCTYPE') &&
        !rawHtml.trimStart().startsWith('<!doctype') &&
        !rawHtml.trimStart().startsWith('<html'))
    ) {
      return NextResponse.json(
        { error: 'HTML inválido: debe comenzar con <!DOCTYPE o <html' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('score_details')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    const stabilizedHtml = stabilizeGeneratedSiteHtml(rawHtml)

    const existingDetails = (lead.score_details as Record<string, unknown>) ?? {}
    const updatedDetails = { ...existingDetails, site_html: stabilizedHtml }

    const { error: updateError } = await supabase
      .from('leads')
      .update({ score_details: updatedDetails })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await supabase.from('lead_activity').insert({
      lead_id: id,
      action: 'sitio_editado',
      detail: 'Sitio editado manualmente en el editor visual',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
