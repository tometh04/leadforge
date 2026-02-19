import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const supabase = await createClient()

  // Buscar el lead que tenga este slug en score_details
  const { data: leads } = await supabase
    .from('leads')
    .select('score_details, business_name')
    .not('score_details', 'is', null)

  const lead = leads?.find(
    (l) => (l.score_details as Record<string, unknown>)?.site_slug === slug
  )

  if (!lead) {
    return new NextResponse('<h1>Sitio no encontrado</h1>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const html = (lead.score_details as Record<string, unknown>)?.site_html as string | undefined

  if (!html) {
    return new NextResponse('<h1>Sitio no disponible</h1>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
