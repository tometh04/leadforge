import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateSiteContent, slugify, ScrapedBusinessData } from '@/lib/claude/site-generator'
import { buildSiteHTML } from '@/lib/site-builder/template'
import { fetchPlaceDetails } from '@/lib/google-places/client'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params

  try {
    const supabase = await createClient()

    // 1. Obtener el lead
    const { data: lead, error: fetchError } = await supabase
      .from('leads')
      .select('id, business_name, category, niche, address, phone, website, place_id, rating, google_photo_url, score_details')
      .eq('id', leadId)
      .single()

    if (fetchError || !lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
    }

    // 2. Reconstruir datos scrapeados desde score_details (si existen de un análisis previo)
    const existingDetails = (lead.score_details ?? {}) as Record<string, unknown>
    const rawLogoUrl = (existingDetails.logo_url as string | null) ?? null
    const rawImages = (existingDetails.scraped_images as string[]) ?? []

    // Filtrar imágenes: excluir el logo y cualquier URL que contenga palabras de ícono
    const ICON_URL_KEYWORDS = ['logo', 'icon', 'favicon', 'sprite', 'whatsapp', 'facebook',
      'instagram', 'twitter', 'badge', 'btn', 'arrow', 'close', 'menu']
    const filteredImages = rawImages.filter((url: string) => {
      const u = url.toLowerCase()
      if (rawLogoUrl && u === rawLogoUrl.toLowerCase()) return false
      if (ICON_URL_KEYWORDS.some(kw => u.includes(kw))) return false
      return true
    })

    const scrapedData: ScrapedBusinessData | undefined = existingDetails.visible_text
      ? {
          visibleText: existingDetails.visible_text as string,
          imageUrls: filteredImages,
          logoUrl: rawLogoUrl,
          socialLinks: (existingDetails.social_links as { platform: string; url: string }[]) ?? [],
          siteType: (existingDetails.site_type as string) ?? undefined,
          // Google photo from lead row (set during Places scraping)
          googlePhotoUrl: lead.google_photo_url ?? null,
        }
      : lead.google_photo_url
        ? { googlePhotoUrl: lead.google_photo_url }
        : undefined

    // 3. Obtener horarios reales + review count de Google Places API
    let openingHours: string[] | null = null
    let googleRating: number | null = lead.rating ?? null
    let googleReviewCount: number | null = null

    // Chequeamos si ya tenemos horarios cacheados en score_details
    if (existingDetails.opening_hours) {
      openingHours = existingDetails.opening_hours as string[]
    }
    // Si tenemos place_id, fetcheamos horarios y review count frescos
    if (lead.place_id) {
      try {
        const details = await fetchPlaceDetails(lead.place_id)
        if (details.openingHours) openingHours = details.openingHours
        if (details.rating) googleRating = details.rating
        if (details.userRatingCount) googleReviewCount = details.userRatingCount
      } catch (e) {
        console.warn('[generate-site] fetchPlaceDetails falló:', e)
      }
    }

    // 4. Generar contenido con Claude, enriquecido con datos reales del sitio
    const content = await generateSiteContent(
      lead.business_name,
      lead.category ?? lead.niche,
      lead.address ?? '',
      lead.phone ?? '',
      scrapedData
    )

    // 5. Construir el HTML
    const html = buildSiteHTML({
      businessName: lead.business_name,
      category: lead.category ?? lead.niche,
      address: lead.address ?? '',
      phone: lead.phone ?? '',
      website: lead.website ?? '',
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.address ?? lead.business_name)}`,
      googleRating,
      googleReviews: googleReviewCount,
      openingHours,
      content,
    })

    // 6. Generar slug único
    const slug = `${slugify(lead.business_name)}-${leadId.slice(0, 6)}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const previewUrl = `${appUrl}/preview/${slug}`

    // 7. Guardar HTML + slug + horarios en score_details
    const { site_html: _old, site_slug: _oldSlug, ...scoreOnly } = existingDetails

    await supabase
      .from('leads')
      .update({
        generated_site_url: previewUrl,
        status: 'sitio_generado',
        score_details: {
          ...scoreOnly,
          site_html: html,
          site_slug: slug,
          ...(openingHours ? { opening_hours: openingHours } : {}),
        },
      })
      .eq('id', leadId)

    // 8. Registrar actividad
    await supabase.from('lead_activity').insert({
      lead_id: leadId,
      action: 'sitio_generado',
      detail: `Sitio generado: ${previewUrl}`,
    })

    return NextResponse.json({
      preview_url: previewUrl,
      slug,
      content,
    })
  } catch (error) {
    console.error('[generate-site]', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
