import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces } from '@/lib/google-places/client'
import { createClient } from '@/lib/supabase/server'
import { quickLeadFilterLocal } from '@/lib/claude/scoring'
import { getSessionUser } from '@/lib/auth/verify-session'

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
      .eq('user_id', user.id)
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
      // Filtro local instantáneo — sin llamadas a API
      resultsWithFlags = resultsWithFlags.map((r) => {
        if (r.already_imported) return r
        const { viable, reason } = quickLeadFilterLocal(r.business_name)
        return { ...r, viable, discard_reason: viable ? null : reason }
      })
    }

    // 4. Limitar a maxResults mostrando primero los viables
    const viable = resultsWithFlags.filter((r) => r.viable || r.already_imported)
    const discarded = resultsWithFlags.filter((r) => !r.viable && !r.already_imported)
    const finalResults = [...viable, ...discarded].slice(0, maxResults + discarded.length)

    const newCount = viable.filter((r) => !r.already_imported).length

    // Loguear búsqueda en historial
    await supabase.from('scraper_searches').insert({
      niche: niche.trim(),
      city: city.trim(),
      max_results: maxResults,
      total_found: finalResults.length,
      new_found: newCount,
      viable: viable.length,
      discarded: discarded.length,
      user_id: user.id,
    })

    return NextResponse.json({
      results: finalResults,
      total: finalResults.length,
      viable: viable.length,
      discarded: discarded.length,
      new: newCount,
    })
  } catch (error) {
    console.error('[scraper/search]', error)
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
