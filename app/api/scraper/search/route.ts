import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces } from '@/lib/google-places/client'
import { createClient } from '@/lib/supabase/server'
import { quickLeadFilter } from '@/lib/claude/scoring'

export async function POST(req: NextRequest) {
  try {
    const { niche, city, maxResults = 20, filterFranchises = true } = await req.json()

    if (!niche || !city) {
      return NextResponse.json({ error: 'niche y city son requeridos' }, { status: 400 })
    }

    // 1. Buscar en Google Places — pedimos más de lo necesario para compensar los descartados
    const fetchCount = Math.min(maxResults * 2, 60)
    const places = await searchPlaces(niche, city, fetchCount)

    if (places.length === 0) {
      return NextResponse.json({ results: [], total: 0, new: 0 })
    }

    // 2. Chequear duplicados en CRM
    const supabase = await createClient()
    const placeIds = places.map((p) => p.place_id)
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('place_id')
      .in('place_id', placeIds)
    const existingIds = new Set(existingLeads?.map((l) => l.place_id) ?? [])

    // 3. Filtro de franquicias con Claude (en paralelo para todos los leads nuevos)
    let resultsWithFlags = places.map((place) => ({
      ...place,
      already_imported: existingIds.has(place.place_id),
      viable: true,
      discard_reason: null as string | null,
    }))

    if (filterFranchises) {
      // Solo filtrar los nuevos (los ya importados se muestran como están)
      const newLeads = resultsWithFlags.filter((r) => !r.already_imported)

      // Evaluar en paralelo (máx 5 simultáneos para no sobrecargar la API)
      const batchSize = 5
      for (let i = 0; i < newLeads.length; i += batchSize) {
        const batch = newLeads.slice(i, i + batchSize)
        const evaluations = await Promise.allSettled(
          batch.map((lead) =>
            quickLeadFilter(lead.business_name, lead.website, lead.category)
          )
        )
        evaluations.forEach((result, idx) => {
          const lead = batch[idx]
          if (result.status === 'fulfilled') {
            lead.viable = result.value.viable
            lead.discard_reason = result.value.viable ? null : result.value.reason
          }
        })
      }

      // Aplicar resultados de vuelta al array principal
      resultsWithFlags = resultsWithFlags.map((r) => {
        const evaluated = newLeads.find((n) => n.place_id === r.place_id)
        return evaluated ?? r
      })
    }

    // 4. Limitar a maxResults mostrando primero los viables
    const viable = resultsWithFlags.filter((r) => r.viable || r.already_imported)
    const discarded = resultsWithFlags.filter((r) => !r.viable && !r.already_imported)
    const finalResults = [...viable, ...discarded].slice(0, maxResults + discarded.length)

    return NextResponse.json({
      results: finalResults,
      total: finalResults.length,
      viable: viable.length,
      discarded: discarded.length,
      new: viable.filter((r) => !r.already_imported).length,
    })
  } catch (error) {
    console.error('[scraper/search]', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
