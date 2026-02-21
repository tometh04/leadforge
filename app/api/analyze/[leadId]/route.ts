export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { analyzeWebsite } from '@/lib/claude/scoring'
import { scrapeSite } from '@/lib/scraper/site-scraper'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params

  try {
    const supabase = await createClient()

    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, website, business_name, status, score_details')
      .eq('id', leadId)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    if (!lead.website) {
      return NextResponse.json({ error: 'El lead no tiene website' }, { status: 400 })
    }

    // 1. Scraping real con Puppeteer — navega el sitio como un browser
    const scraped = await scrapeSite(lead.website)

    // 2. Análisis con Claude usando los datos reales extraídos
    const { score, details } = await analyzeWebsite(lead.website, scraped)

    // 3. Determinar nuevo estado
    const newStatus = score < 6 ? 'candidato' : 'analizado'

    // 4. Preservar site_html y site_slug si ya tiene sitio generado
    const existingDetails = (lead.score_details ?? {}) as Record<string, unknown>
    const { site_html, site_slug } = existingDetails

    // 5. Guardar en DB con todos los datos del scraping
    const { error: updateError } = await supabase
      .from('leads')
      .update({
        score,
        score_summary: details.summary,
        score_details: {
          ...details,
          ...(site_html ? { site_html, site_slug } : {}),
          // screenshot_b64 omitido: demasiado pesado para JSONB (~200KB base64)
          site_type: scraped.siteType,
          scraped_images: scraped.imageUrls.slice(0, 8),
          logo_url: scraped.logoUrl,
          social_links: scraped.socialLinks,
          visible_text: scraped.visibleText.slice(0, 2000),
          emails: scraped.emails,
          page_title: scraped.title,
          meta_description: scraped.description,
          sub_pages_text: scraped.subPagesText.slice(0, 6000),
          sub_pages_count: scraped.subPagesCount,
        },
        status: newStatus,
      })
      .eq('id', leadId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 6. Registrar actividad
    await supabase.from('lead_activity').insert({
      lead_id: leadId,
      action: 'analizado',
      detail: `Score: ${score}/10 — Tipo: ${scraped.siteType} — ${newStatus === 'candidato' ? 'Candidato' : 'Analizado'}`,
    })

    return NextResponse.json({
      score,
      details,
      status: newStatus,
      site_type: scraped.siteType,
    })
  } catch (error) {
    console.error('[analyze]', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
